import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { localPostgres } from "./local-postgres.ts";
import pg from "pg";

// Real PostgreSQL, separate TCP connections and real RLS. No .env or remote URL is read.
// Only Supabase's auth/storage table interfaces are represented by local fixtures.
const ids = Object.fromEntries(
  ["admin", "host", "alice", "bea", "outsider", "suspended", "host2"].map(
    (name) => [name, randomUUID()],
  ),
);
const clients = new Set<pg.Client>();
let cluster: Awaited<ReturnType<typeof localPostgres>>,
  owner: pg.Client,
  port: number;
const logs: string[] = [];
const migrationDir = new URL("../../supabase/migrations/", import.meta.url);
const schemaFixture = `
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}',
    email_confirmed_at timestamptz, created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
  $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
    name text not null, owner_id text, metadata jsonb, unique(bucket_id,name));
  alter table storage.objects enable row level security;
  grant usage on schema auth, storage, public to anon, authenticated, service_role;
  grant select,insert,update,delete on storage.objects to anon, authenticated;
  grant all on all tables in schema storage to service_role;
`;

async function connection(database = "stage_a") {
  const client = new pg.Client({
    host: "127.0.0.1",
    port,
    database,
    user: "postgres",
    password: "local-tests-only",
  });
  await client.connect();
  clients.add(client);
  return client;
}
async function close(client: pg.Client) {
  clients.delete(client);
  await client.end();
}

async function as<T>(
  name: string,
  operation: (client: pg.Client) => Promise<T>,
  database = "stage_a",
) {
  const client = await connection(database);
  try {
    await client.query("begin");
    await client.query(
      name === "guest" ? "set local role anon" : "set local role authenticated",
    );
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [
      ids[name] || "",
    ]);
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await close(client);
  }
}
const queryAs = (name: string, sql: string, values: unknown[] = []) =>
  as(name, (client) => client.query(sql, values));
const denied = (
  operation: () => Promise<unknown>,
  pattern = /permission|access|required|policy|publish|another member|closed|full|request|RSVP|inactive|cannot|supported|constraint|organiser/i,
) =>
  assert.rejects(
    operation,
    (error) => error instanceof Error && pattern.test(error.message),
    "Operation must be rejected by the database",
  );
const rpc = (actor: string, fn: string, args: unknown[]) =>
  queryAs(
    actor,
    `select public.${fn}(${args.map((_, index) => `$${index + 1}`).join(",")})`,
    args,
  );

async function createEvent(
  overrides: Partial<{
    title: string;
    category: string;
    event_date: string;
    event_time: string;
    place: string;
    capacity: number;
    description: string;
  }> = {},
  host = "host",
) {
  const input = {
    title: "A community coffee",
    category: "Coffee",
    event_date: "2099-10-17",
    event_time: "10:30",
    place: "Richmond public café",
    capacity: 4,
    description: "An easy conversation over coffee in a public venue.",
    ...overrides,
  };
  // Test fixtures should not exhaust the intentional member submission rate limit.
  await owner.query(
    "delete from private.rate_limits where operation='submit_meetup'",
  );
  const result = await queryAs(
    host,
    `insert into public.meetups(host_id,title,category,event_date,event_time,place,capacity,description)
     values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,
    [
      ids[host],
      input.title,
      input.category,
      input.event_date,
      input.event_time,
      input.place,
      input.capacity,
      input.description,
    ],
  );
  return result.rows[0];
}
async function publishedEvent(
  overrides: Parameters<typeof createEvent>[0] = {},
  host = "host",
) {
  const event = await createEvent(overrides, host);
  await rpc("admin", "set_meetup_status", [event.id, "published"]);
  return event;
}
async function contendOnEvent(
  id: string,
  firstActor: string,
  firstOperation: (client: pg.Client) => Promise<unknown>,
  secondActor: string,
  secondOperation: (client: pg.Client) => Promise<unknown>,
  lockUsingOperation = false,
) {
  let release!: () => void, locked!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const acquired = new Promise<void>((resolve) => {
    locked = resolve;
  });
  let secondPid: number | undefined;
  const first = as(firstActor, async (client) => {
    if (lockUsingOperation) {
      // Members cannot lock somebody else's event through raw table RLS.
      // Their RSVP RPC takes the lock and keeps it until this transaction ends.
      const result = await firstOperation(client);
      locked();
      await gate;
      return result;
    }
    await client.query("select id from public.meetups where id=$1 for update", [
      id,
    ]);
    locked();
    await gate;
    return firstOperation(client);
  });
  await acquired;
  const second = as(secondActor, async (client) => {
    secondPid = (await client.query("select pg_backend_pid() pid")).rows[0].pid;
    return secondOperation(client);
  });
  // Attach rejection handlers immediately, then prove PostgreSQL observed lock contention.
  const results = Promise.allSettled([first, second]);
  let blocked = false;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (secondPid)
        blocked = (
          await owner.query(
            "select cardinality(pg_blocking_pids($1)) > 0 blocked",
            [secondPid],
          )
        ).rows[0].blocked;
      if (blocked) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(
      blocked,
      true,
      "The second connection must actually wait for the event lock",
    );
  } finally {
    release();
  }
  return results;
}
async function migrate(client: pg.Client, files: string[]) {
  for (const file of files) {
    try {
      await client.query(await readFile(new URL(file, migrationDir), "utf8"));
    } catch (error) {
      throw new Error(
        `${file}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }
}

before(
  async () => {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    port = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const directory = await mkdtemp(join(tmpdir(), "her-hour-db-tests-"));
    cluster = await localPostgres(directory, port, (message) =>
      logs.push(String(message)),
    );
    try {
      await cluster.initialise();
      await cluster.start();
      const setup = await connection("postgres");
      await setup.query(
        "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls",
      );
      await close(setup);
      await cluster.createDatabase("stage_a");
      owner = await connection();
      await owner.query(schemaFixture);
      const files = (await readdir(migrationDir))
        .filter((name) => name.endsWith(".sql") && name < "202610170004")
        .sort();
      await migrate(owner, files);
      for (const [name, id] of Object.entries(ids)) {
        await owner.query(
          `insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
        values($1,$2,now(),$3)`,
          [
            id,
            `${name}@example.test`,
            JSON.stringify({
              display_name: name,
              role: "admin",
              is_admin: true,
              status: "active",
            }),
          ],
        );
      }
      await owner.query("insert into private.admin_roles(user_id) values($1)", [
        ids.admin,
      ]);
      await rpc("admin", "set_member_access", [
        ids.suspended,
        "suspended",
        "Test fixture",
      ]);
      console.log(
        `PostgreSQL ${(await owner.query("show server_version")).rows[0].server_version}; disposable loopback cluster`,
      );
    } catch (error) {
      console.error(logs.slice(-8).join("\n"));
      throw error;
    }
  },
  { timeout: 60000 },
);

after(async () => {
  await Promise.allSettled([...clients].map(close));
  if (cluster) await cluster.stop();
});

test("historical foundation: fresh migrations create private defaults and ignore administrator signup metadata", async () => {
  const own = await queryAs(
    "alice",
    "select id,display_name from public.profiles",
  );
  assert.deepEqual(own.rows, [{ id: ids.alice, display_name: "alice" }]);
  assert.equal(
    (await rpc("alice", "get_my_access", [])).rows[0].get_my_access.is_admin,
    false,
  );
  await denied(() =>
    queryAs("alice", "insert into private.admin_roles(user_id) values($1)", [
      ids.alice,
    ]),
  );
  await denied(() =>
    queryAs(
      "alice",
      "update private.member_access set status='active' where user_id=$1",
      [ids.suspended],
    ),
  );
  await denied(() => rpc("alice", "admin_statistics", []));
  await denied(() => queryAs("guest", "select * from public.profiles"));
  const tables = (
    await owner.query(`select schemaname,tablename,rowsecurity from pg_tables where schemaname in ('public','private')
    and tablename in ('profiles','meetups','meetup_requests','reports','interests','member_interests','registration_history','admin_roles','member_access','admin_audit_log','rate_limits')`)
  ).rows;
  assert.equal(tables.length, 11);
  assert.ok(tables.every((table) => table.rowsecurity));
});

test("historical foundation: profile and interest privacy is enforced by RLS and column grants", async () => {
  assert.equal(
    (
      await queryAs("alice", "select * from public.profiles where id=$1", [
        ids.bea,
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await queryAs(
        "alice",
        "update public.profiles set bio='spoofed' where id=$1",
        [ids.bea],
      )
    ).rowCount,
    0,
  );
  await queryAs(
    "alice",
    "update public.profiles set bio='Coffee and books', neighborhood='West End' where id=$1",
    [ids.alice],
  );
  await rpc("alice", "set_member_interests", [["coffee", "books"]]);
  assert.deepEqual(
    (
      await queryAs(
        "alice",
        "select interest_id from public.member_interests order by interest_id",
      )
    ).rows.map((row) => row.interest_id),
    ["books", "coffee"],
  );
  assert.equal(
    (
      await queryAs(
        "bea",
        "select * from public.member_interests where member_id=$1",
        [ids.alice],
      )
    ).rowCount,
    0,
  );
  await denied(() =>
    rpc("alice", "set_member_interests", [["does-not-exist"]]),
  );
  await denied(() =>
    queryAs("alice", "update public.profiles set avatar_path=$1 where id=$2", [
      `${ids.bea}/photo.png`,
      ids.alice,
    ]),
  );
});

test("historical foundation: members submit drafts; only administrators publish; public listing hides private profiles", async () => {
  const event = await createEvent();
  assert.equal(event.status, "draft");
  assert.equal(event.starts_at.toISOString(), "2099-10-17T14:30:00.000Z");
  assert.equal(
    (
      await queryAs(
        "guest",
        "select * from public.meetup_directory where id=$1",
        [event.id],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await queryAs(
        "outsider",
        "select * from public.meetup_directory where id=$1",
        [event.id],
      )
    ).rowCount,
    0,
  );
  await denied(() => rpc("host", "set_meetup_status", [event.id, "published"]));
  await denied(() =>
    queryAs(
      "host",
      "update public.meetups set status='published' where id=$1",
      [event.id],
    ),
  );
  await denied(() =>
    queryAs("host", "update public.meetups set approved_count=1 where id=$1", [
      event.id,
    ]),
  );
  await rpc("admin", "set_meetup_status", [event.id, "published"]);
  const published = (
    await queryAs(
      "guest",
      "select host_name,approved_count from public.meetup_directory where id=$1",
      [event.id],
    )
  ).rows[0];
  assert.deepEqual(published, {
    host_name: "Her Hour host",
    approved_count: 0,
  });
  await queryAs(
    "host",
    "update public.meetups set description='An updated gathering description that needs review.' where id=$1",
    [event.id],
  );
  assert.equal(
    (
      await queryAs("guest", "select * from public.meetups where id=$1", [
        event.id,
      ])
    ).rowCount,
    0,
  );
});

test("historical foundation: drafts, anonymous users, self-requests and raw registration writes are rejected", async () => {
  const event = await createEvent();
  await denied(() => rpc("alice", "request_meetup", [event.id]));
  await rpc("admin", "set_meetup_status", [event.id, "published"]);
  await denied(() => rpc("guest", "request_meetup", [event.id]));
  await denied(() => rpc("host", "request_meetup", [event.id]));
  await denied(() =>
    queryAs(
      "alice",
      "insert into public.meetup_requests(meetup_id,user_id,status) values($1,$2,'approved')",
      [event.id, ids.alice],
    ),
  );
  await rpc("alice", "request_meetup", [event.id]);
  await rpc("alice", "request_meetup", [event.id]);
  assert.equal(
    (
      await owner.query(
        "select * from public.meetup_requests where meetup_id=$1",
        [event.id],
      )
    ).rowCount,
    1,
  );
  await denied(() =>
    queryAs(
      "alice",
      "update public.meetup_requests set status='approved' where meetup_id=$1",
      [event.id],
    ),
  );
  await denied(() =>
    queryAs("alice", "delete from public.meetup_requests where meetup_id=$1", [
      event.id,
    ]),
  );
  await denied(() =>
    rpc("alice", "decide_meetup_request", [event.id, ids.alice, "approved"]),
  );
  await denied(() =>
    rpc("outsider", "decide_meetup_request", [event.id, ids.alice, "approved"]),
  );
});

test("historical foundation: host approvals, aggregate counts, attendee privacy, cancellation and rejoining stay consistent", async () => {
  const event = await publishedEvent();
  await rpc("alice", "request_meetup", [event.id]);
  await rpc("host", "decide_meetup_request", [event.id, ids.alice, "approved"]);
  await rpc("host", "decide_meetup_request", [event.id, ids.alice, "approved"]);
  assert.equal(
    (
      await queryAs(
        "bea",
        "select * from public.meetup_requests where meetup_id=$1",
        [event.id],
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await queryAs(
        "bea",
        "select approved_count from public.meetup_directory where id=$1",
        [event.id],
      )
    ).rows[0].approved_count,
    1,
  );
  await denied(() => rpc("bea", "get_meetup_attendees", [event.id]));
  const attendees = (
    await queryAs("host", "select * from public.get_meetup_attendees($1)", [
      event.id,
    ])
  ).rows;
  assert.deepEqual(Object.keys(attendees[0]).sort(), [
    "created_at",
    "display_name",
    "status",
    "user_id",
  ]);
  await rpc("alice", "withdraw_meetup_request", [event.id]);
  await rpc("alice", "withdraw_meetup_request", [event.id]);
  assert.equal(
    (
      await owner.query(
        "select approved_count from public.meetups where id=$1",
        [event.id],
      )
    ).rows[0].approved_count,
    0,
  );
  assert.deepEqual(
    (
      await queryAs(
        "alice",
        "select status from public.registration_history where meetup_id=$1 order by id",
        [event.id],
      )
    ).rows.map((row) => row.status),
    ["pending", "approved", "cancelled"],
  );
  await rpc("alice", "request_meetup", [event.id]);
  assert.equal(
    (
      await owner.query(
        "select * from public.meetup_requests where meetup_id=$1",
        [event.id],
      )
    ).rowCount,
    1,
  );
});

test("historical foundation: deadlines and past starts are checked in the backend, including during approval", async () => {
  const event = await publishedEvent();
  await rpc("alice", "request_meetup", [event.id]);
  await owner.query(
    "update public.meetups set registration_deadline=clock_timestamp()-interval '1 minute' where id=$1",
    [event.id],
  );
  await denied(() => rpc("bea", "request_meetup", [event.id]));
  await denied(() =>
    rpc("host", "decide_meetup_request", [event.id, ids.alice, "approved"]),
  );
  const past = await createEvent();
  await owner.query(
    "update public.meetups set starts_at=now()-interval '1 day',registration_deadline=now()-interval '1 day' where id=$1",
    [past.id],
  );
  await denied(() => rpc("admin", "set_meetup_status", [past.id, "published"]));
  await denied(() =>
    queryAs(
      "host",
      "update public.meetups set registration_deadline=starts_at+interval '1 hour' where id=$1",
      [event.id],
    ),
  );
});

test("historical foundation: suspension is enforced even with an existing authenticated session", async () => {
  const event = await publishedEvent();
  await denied(() => rpc("suspended", "request_meetup", [event.id]));
  assert.equal(
    (await queryAs("suspended", "select * from public.profiles")).rowCount,
    0,
  );
  assert.equal(
    (await queryAs("suspended", "select * from public.meetups")).rowCount,
    0,
  );
  await denied(() =>
    rpc("alice", "set_member_access", [ids.bea, "suspended", "spoofed"]),
  );
  await rpc("alice", "request_meetup", [event.id]);
  await rpc("admin", "set_member_access", [
    ids.alice,
    "suspended",
    "Temporary test",
  ]);
  await denied(() =>
    rpc("host", "decide_meetup_request", [event.id, ids.alice, "approved"]),
  );
  await denied(() => rpc("alice", "withdraw_meetup_request", [event.id]));
  await rpc("admin", "set_member_access", [ids.alice, "active", "Restored"]);
  await denied(() =>
    rpc("admin", "set_member_access", [ids.admin, "suspended", "self"]),
  );
  await rpc("admin", "set_member_access", [ids.host, "suspended", "Host test"]);
  assert.equal(
    (
      await queryAs("guest", "select * from public.meetups where id=$1", [
        event.id,
      ])
    ).rowCount,
    0,
  );
  await denied(() =>
    rpc("admin", "decide_meetup_request", [event.id, ids.alice, "approved"]),
  );
  await rpc("admin", "set_member_access", [ids.host, "active", "Restored"]);
});

test("historical foundation: cancelling an event preserves history, releases seats, and prevents reopening", async () => {
  const event = await publishedEvent();
  await rpc("alice", "request_meetup", [event.id]);
  await rpc("host", "decide_meetup_request", [event.id, ids.alice, "approved"]);
  await rpc("bea", "request_meetup", [event.id]);
  await denied(() =>
    queryAs("host", "delete from public.meetups where id=$1", [event.id]),
  );
  await rpc("admin", "set_meetup_status", [event.id, "cancelled"]);
  assert.equal(
    (
      await owner.query(
        "select approved_count from public.meetups where id=$1",
        [event.id],
      )
    ).rows[0].approved_count,
    0,
  );
  assert.equal(
    (
      await owner.query(
        "select * from public.meetup_requests where meetup_id=$1 and status='cancelled'",
        [event.id],
      )
    ).rowCount,
    2,
  );
  await denied(() => rpc("alice", "request_meetup", [event.id]));
  await denied(() =>
    rpc("admin", "set_meetup_status", [event.id, "published"]),
  );
});

test("historical foundation: reports are private and only administrators can resolve them", async () => {
  const event = await publishedEvent();
  await queryAs(
    "alice",
    "insert into public.reports(reporter_id,meetup_id,category,details) values($1,$2,'Safety','A test concern requiring private review.')",
    [ids.alice, event.id],
  );
  const report = (
    await owner.query("select * from public.reports where meetup_id=$1", [
      event.id,
    ])
  ).rows[0];
  assert.equal(
    (await queryAs("alice", "select * from public.reports")).rowCount,
    0,
  );
  assert.equal(
    (await queryAs("host", "select * from public.reports")).rowCount,
    0,
  );
  await denied(() =>
    rpc("alice", "review_report", [report.id, "resolved", "Spoofed"]),
  );
  await denied(() =>
    queryAs(
      "alice",
      "insert into public.reports(reporter_id,meetup_id,category,details,status) values($1,$2,'Safety','Spoofed review status','resolved')",
      [ids.alice, event.id],
    ),
  );
  await rpc("admin", "review_report", [
    report.id,
    "resolved",
    "Reviewed in local test",
  ]);
  assert.equal(
    (
      await queryAs("admin", "select * from public.reports where id=$1", [
        report.id,
      ])
    ).rows[0].reviewed_by,
    ids.admin,
  );
});

test("historical foundation: storage ownership and publication rules protect images", async () => {
  const event = await createEvent();
  const ownAvatar = `${ids.alice}/photo.png`,
    otherAvatar = `${ids.bea}/photo.png`;
  await queryAs(
    "alice",
    "insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',$1,$2)",
    [ownAvatar, ids.alice],
  );
  await denied(() =>
    queryAs(
      "alice",
      "insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',$1,$2)",
      [otherAvatar, ids.alice],
    ),
  );
  await denied(() =>
    queryAs(
      "alice",
      "insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',$1,$2)",
      [`${ids.alice}/unsafe.svg`, ids.alice],
    ),
  );
  assert.equal(
    (
      await queryAs("bea", "select * from storage.objects where name=$1", [
        ownAvatar,
      ])
    ).rowCount,
    0,
  );
  assert.equal(
    (
      await queryAs(
        "alice",
        "update storage.objects set metadata='{}' where name=$1",
        [ownAvatar],
      )
    ).rowCount,
    0,
  );
  const cover = `${event.id}/cover.webp`;
  await queryAs(
    "host",
    "insert into storage.objects(bucket_id,name,owner_id) values('event-covers',$1,$2)",
    [cover, ids.host],
  );
  await denied(() =>
    queryAs(
      "bea",
      "insert into storage.objects(bucket_id,name,owner_id) values('event-covers',$1,$2)",
      [`${event.id}/other.png`, ids.bea],
    ),
  );
  await queryAs("host", "update public.meetups set cover_path=$1 where id=$2", [
    cover,
    event.id,
  ]);
  assert.equal(
    (
      await queryAs("guest", "select * from storage.objects where name=$1", [
        cover,
      ])
    ).rowCount,
    0,
  );
  await rpc("admin", "set_meetup_status", [event.id, "published"]);
  assert.equal(
    (
      await queryAs("guest", "select * from storage.objects where name=$1", [
        cover,
      ])
    ).rowCount,
    1,
  );
  assert.equal(
    (
      await queryAs("host", "delete from storage.objects where name=$1", [
        cover,
      ])
    ).rowCount,
    0,
  );
  await rpc("admin", "set_meetup_status", [event.id, "draft"]);
  assert.equal(
    (
      await queryAs("guest", "select * from storage.objects where name=$1", [
        cover,
      ])
    ).rowCount,
    0,
  );
  const buckets = (
    await owner.query("select * from storage.buckets order by id")
  ).rows;
  assert.ok(
    buckets.every(
      (bucket) =>
        bucket.public === false &&
        bucket.file_size_limit > 0 &&
        !bucket.allowed_mime_types.includes("image/svg+xml"),
    ),
  );
});

test("historical foundation: simultaneous approvals compete for one final seat using separate database connections", async () => {
  const event = await publishedEvent({ capacity: 2 });
  await rpc("alice", "request_meetup", [event.id]);
  await rpc("bea", "request_meetup", [event.id]);
  await rpc("outsider", "request_meetup", [event.id]);
  await rpc("host", "decide_meetup_request", [
    event.id,
    ids.outsider,
    "approved",
  ]);
  const results = await contendOnEvent(
    event.id,
    "host",
    (client) =>
      client.query("select public.decide_meetup_request($1,$2,'approved')", [
        event.id,
        ids.alice,
      ]),
    "host",
    (client) =>
      client.query("select public.decide_meetup_request($1,$2,'approved')", [
        event.id,
        ids.bea,
      ]),
  );
  assert.equal(
    results.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "rejected").length,
    1,
  );
  assert.match(
    results.find((result) => result.status === "rejected")?.reason.message,
    /full/,
  );
  assert.equal(
    (
      await owner.query(
        "select approved_count from public.meetups where id=$1",
        [event.id],
      )
    ).rows[0].approved_count,
    2,
  );
  assert.equal(
    (
      await owner.query(
        "select * from public.meetup_requests where meetup_id=$1 and status='approved'",
        [event.id],
      )
    ).rowCount,
    2,
  );
  await denied(() =>
    queryAs("host", "update public.meetups set capacity=1 where id=$1", [
      event.id,
    ]),
  );
});

test("historical foundation: capacity changes racing an approval cannot violate the count constraint", async () => {
  const event = await publishedEvent({ capacity: 4 });
  for (const member of ["alice", "bea", "outsider"])
    await rpc(member, "request_meetup", [event.id]);
  for (const member of ["alice", "bea"])
    await rpc("host", "decide_meetup_request", [
      event.id,
      ids[member],
      "approved",
    ]);
  const results = await contendOnEvent(
    event.id,
    "admin",
    // Admin edit avoids changing the publication status while testing just the seat invariant.
    (client) =>
      client.query("update public.meetups set capacity=2 where id=$1", [
        event.id,
      ]),
    "host",
    (client) =>
      client.query("select public.decide_meetup_request($1,$2,'approved')", [
        event.id,
        ids.outsider,
      ]),
  );
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  const row = (
    await owner.query(
      "select capacity,approved_count from public.meetups where id=$1",
      [event.id],
    )
  ).rows[0];
  assert.ok(row.approved_count <= row.capacity);
  assert.equal(
    row.approved_count,
    (
      await owner.query(
        "select count(*)::integer count from public.meetup_requests where meetup_id=$1 and status='approved'",
        [event.id],
      )
    ).rows[0].count,
  );
});

test("historical foundation: event cancellation serializes with an in-flight approval", async () => {
  const event = await publishedEvent();
  await rpc("alice", "request_meetup", [event.id]);
  const results = await contendOnEvent(
    event.id,
    "admin",
    (client) =>
      client.query("select public.set_meetup_status($1,'cancelled')", [
        event.id,
      ]),
    "host",
    (client) =>
      client.query("select public.decide_meetup_request($1,$2,'approved')", [
        event.id,
        ids.alice,
      ]),
  );
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(
    (
      await owner.query(
        "select approved_count from public.meetups where id=$1",
        [event.id],
      )
    ).rows[0].approved_count,
    0,
  );
});

test("historical foundation: capacity reductions also fail when the competing approval commits first", async () => {
  const event = await publishedEvent({ capacity: 4 });
  for (const member of ["alice", "bea", "outsider"])
    await rpc(member, "request_meetup", [event.id]);
  for (const member of ["alice", "bea"])
    await rpc("host", "decide_meetup_request", [
      event.id,
      ids[member],
      "approved",
    ]);
  const results = await contendOnEvent(
    event.id,
    "host",
    (client) =>
      client.query("select public.decide_meetup_request($1,$2,'approved')", [
        event.id,
        ids.outsider,
      ]),
    "admin",
    (client) =>
      client.query("update public.meetups set capacity=2 where id=$1", [
        event.id,
      ]),
  );
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason.constraint, "meetup_capacity_count");
  const row = (
    await owner.query(
      "select capacity,approved_count from public.meetups where id=$1",
      [event.id],
    )
  ).rows[0];
  assert.deepEqual(row, { capacity: 4, approved_count: 3 });
});

test("historical foundation: trusted account cleanup updates counts for deleted registrations", async () => {
  const event = await publishedEvent();
  await rpc("alice", "request_meetup", [event.id]);
  await rpc("host", "decide_meetup_request", [event.id, ids.alice, "approved"]);
  await owner.query(
    "delete from public.meetup_requests where meetup_id=$1 and user_id=$2",
    [event.id, ids.alice],
  );
  assert.equal(
    (
      await owner.query(
        "select approved_count from public.meetups where id=$1",
        [event.id],
      )
    ).rows[0].approved_count,
    0,
  );
});

test("historical foundation: existing permissive Storage policies cannot bypass the Her Hour bucket boundaries", async () => {
  await owner.query(`create policy legacy_open_read on storage.objects for select to anon,authenticated using(true);
    create policy legacy_open_insert on storage.objects for insert to anon,authenticated with check(true);
    create policy legacy_open_update on storage.objects for update to anon,authenticated using(true) with check(true);
    create policy legacy_open_delete on storage.objects for delete to anon,authenticated using(true);`);
  try {
    const name = `${ids.alice}/photo.png`;
    assert.equal(
      (
        await queryAs("guest", "select * from storage.objects where name=$1", [
          name,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await queryAs("bea", "delete from storage.objects where name=$1", [
          name,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (
        await queryAs(
          "alice",
          "update storage.objects set name=$1 where name=$2",
          [`${ids.bea}/stolen.png`, name],
        )
      ).rowCount,
      0,
    );
    await denied(() =>
      queryAs(
        "bea",
        "insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',$1,$2)",
        [`${ids.alice}/another.png`, ids.bea],
      ),
    );
    await owner.query(
      "insert into storage.buckets(id,name) values('unrelated','unrelated')",
    );
    await queryAs(
      "guest",
      "insert into storage.objects(bucket_id,name) values('unrelated','unaffected.txt')",
    );
    assert.equal(
      (
        await queryAs(
          "guest",
          "select * from storage.objects where bucket_id='unrelated'",
        )
      ).rowCount,
      1,
    );
  } finally {
    await owner.query(
      "drop policy legacy_open_read on storage.objects; drop policy legacy_open_insert on storage.objects; drop policy legacy_open_update on storage.objects; drop policy legacy_open_delete on storage.objects",
    );
  }
});

test("historical foundation: privileged function grants are explicit and all security-definer functions pin their search path", async () => {
  const unsafe =
    await owner.query(`select n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'],false)`);
  assert.deepEqual(unsafe.rows, []);
  await denied(() =>
    queryAs("alice", "select private.consume_limit('report',100000,0)"),
  );
  await denied(() => queryAs("guest", "select public.get_my_access()"));
});

test("historical foundation: member report rate limits are enforced in the database", async () => {
  const event = await publishedEvent();
  await owner.query(
    "delete from private.rate_limits where user_id=$1 and operation='report'",
    [ids.bea],
  );
  for (let index = 0; index < 5; index++)
    await queryAs(
      "bea",
      "insert into public.reports(reporter_id,meetup_id,category,details) values($1,$2,'Other','A sample report for rate-limit verification.')",
      [ids.bea, event.id],
    );
  await denied(
    () =>
      queryAs(
        "bea",
        "insert into public.reports(reporter_id,meetup_id,category,details) values($1,$2,'Other','A sample report for rate-limit verification.')",
        [ids.bea, event.id],
      ),
    /Too many/,
  );
});

test("historical foundation: existing populated databases upgrade without losing profiles, interests, requests or reports", async () => {
  await cluster.createDatabase("stage_a_upgrade");
  const client = await connection("stage_a_upgrade");
  await client.query(schemaFixture);
  const files = (await readdir(migrationDir))
    .filter((name) => name.endsWith(".sql") && name < "202610170004")
    .sort();
  await migrate(client, files.slice(0, 2));
  await client.query(
    "insert into auth.users(id,raw_user_meta_data) values($1,$2),($3,$4)",
    [
      ids.host,
      JSON.stringify({ display_name: "Legacy host" }),
      ids.alice,
      JSON.stringify({ display_name: "Legacy member" }),
    ],
  );
  await client.query(
    "update public.profiles set interests=array['Coffee','A custom legacy hobby'] where id=$1",
    [ids.alice],
  );
  const meetup = (
    await client.query(
      `insert into public.meetups(host_id,title,category,event_date,event_time,place,capacity,description)
    values($1,'Legacy gathering','Coffee','2099-10-17','10:30','Richmond',4,'An existing community gathering.') returning id`,
      [ids.host],
    )
  ).rows[0].id;
  await client.query(
    "insert into public.meetup_requests(meetup_id,user_id,status) values($1,$2,'approved')",
    [meetup, ids.alice],
  );
  await client.query(
    "insert into public.reports(reporter_id,meetup_id,category,details) values($1,$2,'Other','An existing private concern.')",
    [ids.alice, meetup],
  );
  await migrate(client, files.slice(2));
  assert.equal(
    (await client.query("select count(*)::integer count from public.profiles"))
      .rows[0].count,
    2,
  );
  assert.deepEqual(
    (
      await client.query(
        "select status,approved_count,starts_at from public.meetups where id=$1",
        [meetup],
      )
    ).rows[0],
    {
      status: "draft",
      approved_count: 1,
      starts_at: new Date("2099-10-17T14:30:00Z"),
    },
  );
  assert.equal(
    (
      await client.query(
        "select * from public.member_interests where member_id=$1",
        [ids.alice],
      )
    ).rowCount,
    2,
  );
  assert.equal(
    (await client.query("select * from public.meetup_requests")).rowCount,
    1,
  );
  assert.equal(
    (await client.query("select * from public.registration_history")).rowCount,
    1,
  );
  assert.equal(
    (await client.query("select * from public.reports")).rowCount,
    1,
  );
  assert.equal(
    (await client.query("select * from private.admin_roles")).rowCount,
    0,
  );
  await close(client);
});

test("historical foundation: an invalid legacy capacity aborts the new migration atomically without deleting data", async () => {
  await cluster.createDatabase("stage_a_invalid_upgrade");
  const client = await connection("stage_a_invalid_upgrade");
  await client.query(schemaFixture);
  const files = (await readdir(migrationDir))
    .filter((name) => name.endsWith(".sql") && name < "202610170004")
    .sort();
  await migrate(client, files.slice(0, 2));
  for (const name of ["host", "alice", "bea", "outsider"])
    await client.query("insert into auth.users(id) values($1)", [ids[name]]);
  const event = (
    await client.query(
      `insert into public.meetups(host_id,title,category,event_date,event_time,place,capacity,description)
    values($1,'Legacy overbooking','Coffee','2099-10-17','10:30','Richmond',2,'Legacy inconsistent event data for migration testing.') returning id`,
      [ids.host],
    )
  ).rows[0].id;
  await client.query(
    "alter table public.meetup_requests disable trigger check_meetup_capacity",
  );
  for (const name of ["alice", "bea", "outsider"])
    await client.query(
      "insert into public.meetup_requests(meetup_id,user_id,status) values($1,$2,'approved')",
      [event, ids[name]],
    );
  await client.query(
    "alter table public.meetup_requests enable trigger check_meetup_capacity",
  );
  await assert.rejects(
    () => migrate(client, [files[2]]),
    /Existing meetup exceeds capacity/,
  );
  await client.query("rollback");
  assert.equal(
    (
      await client.query(
        "select * from public.meetup_requests where meetup_id=$1",
        [event],
      )
    ).rowCount,
    3,
  );
  assert.equal(
    (
      await client.query(
        "select * from information_schema.columns where table_schema='public' and table_name='meetups' and column_name='starts_at'",
      )
    ).rowCount,
    0,
  );
  assert.equal(
    (await client.query("select * from pg_namespace where nspname='private'"))
      .rowCount,
    0,
  );
  await close(client);
});

test("organiser workflow migration upgrades the foundation and enforces the revised product rules", async (t) => {
  const preserved = await publishedEvent();
  await rpc("alice", "request_meetup", [preserved.id]);
  await rpc("host", "decide_meetup_request", [
    preserved.id,
    ids.alice,
    "approved",
  ]);
  const draft = await createEvent();
  await migrate(owner, ["202610170004_organizer_workflow.sql"]);

  await t.test(
    "migration preserves publications, saved drafts, requests and counts",
    async () => {
      assert.deepEqual(
        (
          await owner.query(
            "select status,approved_count from public.meetups where id=$1",
            [preserved.id],
          )
        ).rows[0],
        { status: "published", approved_count: 1 },
      );
      assert.equal(
        (
          await owner.query("select status from public.meetups where id=$1", [
            draft.id,
          ])
        ).rows[0].status,
        "draft",
      );
      await rpc("host", "set_meetup_status", [draft.id, "published"]);
      assert.equal(
        (
          await queryAs(
            "guest",
            "select * from public.meetup_directory where id=$1",
            [draft.id],
          )
        ).rowCount,
        1,
      );
    },
  );
  await t.test(
    "members publish immediately and edits preserve publication, requests and capacity",
    async () => {
      const event = await createEvent();
      assert.equal(event.status, "published");
      assert.equal(
        (
          await queryAs(
            "guest",
            "select * from public.meetup_directory where id=$1",
            [event.id],
          )
        ).rowCount,
        1,
      );
      await rpc("alice", "request_meetup", [event.id]);
      await rpc("host", "decide_meetup_request", [
        event.id,
        ids.alice,
        "approved",
      ]);
      await queryAs(
        "host",
        "update public.meetups set title='Coffee in a new venue',place='A different public café',event_time='11:00' where id=$1",
        [event.id],
      );
      const edited = (
        await queryAs(
          "guest",
          "select * from public.meetup_directory where id=$1",
          [event.id],
        )
      ).rows[0];
      assert.equal(edited.status, "published");
      assert.equal(edited.approved_count, 1);
      assert.ok(edited.details_updated_at);
      assert.equal(edited.starts_at.toISOString(), "2099-10-17T15:00:00.000Z");
      assert.equal(
        (
          await queryAs(
            "alice",
            "select status from public.meetup_requests where meetup_id=$1",
            [event.id],
          )
        ).rows[0].status,
        "approved",
      );
      await denied(() =>
        queryAs("host", "update public.meetups set host_id=$1 where id=$2", [
          ids.host2,
          event.id,
        ]),
      );
      assert.equal(
        (
          await queryAs(
            "outsider",
            "update public.meetups set title='Attempted hijack' where id=$1",
            [event.id],
          )
        ).rowCount,
        0,
      );
      await denied(() =>
        rpc("admin", "set_meetup_status", [event.id, "draft"]),
      );
    },
  );
  await t.test(
    "organiser alone decides seats, can reconsider and revoke, and cannot undo withdrawal",
    async () => {
      const event = await createEvent();
      await rpc("alice", "request_meetup", [event.id]);
      await denied(() =>
        rpc("admin", "decide_meetup_request", [
          event.id,
          ids.alice,
          "approved",
        ]),
      );
      await rpc("host", "decide_meetup_request", [
        event.id,
        ids.alice,
        "declined",
      ]);
      await rpc("host", "decide_meetup_request", [
        event.id,
        ids.alice,
        "approved",
      ]);
      await rpc("host", "decide_meetup_request", [
        event.id,
        ids.alice,
        "approved",
      ]);
      assert.equal(
        (
          await owner.query(
            "select approved_count from public.meetups where id=$1",
            [event.id],
          )
        ).rows[0].approved_count,
        1,
      );
      await rpc("host", "decide_meetup_request", [
        event.id,
        ids.alice,
        "declined",
      ]);
      assert.equal(
        (
          await owner.query(
            "select approved_count from public.meetups where id=$1",
            [event.id],
          )
        ).rows[0].approved_count,
        0,
      );
      await rpc("host", "decide_meetup_request", [
        event.id,
        ids.alice,
        "approved",
      ]);
      await rpc("alice", "withdraw_meetup_request", [event.id]);
      await denied(() =>
        rpc("host", "decide_meetup_request", [event.id, ids.alice, "approved"]),
      );
      await rpc("alice", "request_meetup", [event.id]);
      await rpc("host", "decide_meetup_request", [
        event.id,
        ids.alice,
        "approved",
      ]);
      const adminEvent = await createEvent({}, "admin");
      await rpc("bea", "request_meetup", [adminEvent.id]);
      await rpc("admin", "decide_meetup_request", [
        adminEvent.id,
        ids.bea,
        "approved",
      ]);
    },
  );
  await t.test(
    "organiser may decide an existing request after its submission deadline, before event start",
    async () => {
      const event = await createEvent();
      await rpc("alice", "request_meetup", [event.id]);
      await owner.query(
        "update public.meetups set registration_deadline=clock_timestamp()-interval '1 minute' where id=$1",
        [event.id],
      );
      await denied(() => rpc("bea", "request_meetup", [event.id]));
      await rpc("host", "decide_meetup_request", [
        event.id,
        ids.alice,
        "approved",
      ]);
      await owner.query(
        "update public.meetups set starts_at=clock_timestamp()-interval '1 minute',registration_deadline=clock_timestamp()-interval '2 minutes' where id=$1",
        [event.id],
      );
      await denied(() =>
        rpc("host", "decide_meetup_request", [event.id, ids.alice, "declined"]),
      );
    },
  );
  await t.test(
    "organiser cancellation retains history and releases seats; another admin cannot cancel",
    async () => {
      const event = await createEvent();
      await rpc("alice", "request_meetup", [event.id]);
      await rpc("host", "decide_meetup_request", [
        event.id,
        ids.alice,
        "approved",
      ]);
      await denied(() =>
        rpc("admin", "set_meetup_status", [event.id, "cancelled"]),
      );
      await rpc("host", "set_meetup_status", [event.id, "cancelled"]);
      assert.deepEqual(
        (
          await owner.query(
            "select status,approved_count from public.meetups where id=$1",
            [event.id],
          )
        ).rows[0],
        { status: "cancelled", approved_count: 0 },
      );
      assert.equal(
        (
          await owner.query(
            "select * from public.registration_history where meetup_id=$1",
            [event.id],
          )
        ).rowCount,
        3,
      );
      await denied(() =>
        rpc("host", "set_meetup_status", [event.id, "published"]),
      );
    },
  );
  await t.test(
    "admin removal requires a reason, hides the event and cannot be reversed by its organiser",
    async () => {
      const event = await createEvent();
      for (const member of ["alice", "bea"])
        await rpc(member, "request_meetup", [event.id]);
      await rpc("host", "decide_meetup_request", [
        event.id,
        ids.alice,
        "approved",
      ]);
      await denied(() =>
        rpc("host", "moderate_meetup", [
          event.id,
          "A documented community violation.",
        ]),
      );
      await denied(
        () => rpc("admin", "moderate_meetup", [event.id, "short"]),
        /reason/,
      );
      await rpc("admin", "moderate_meetup", [
        event.id,
        "A documented community violation.",
      ]);
      assert.deepEqual(
        (
          await owner.query(
            "select status,approved_count from public.meetups where id=$1",
            [event.id],
          )
        ).rows[0],
        { status: "removed", approved_count: 0 },
      );
      for (const actor of ["guest", "alice", "outsider"])
        assert.equal(
          (
            await queryAs(
              actor,
              "select * from public.meetup_directory where id=$1",
              [event.id],
            )
          ).rowCount,
          0,
        );
      assert.equal(
        (
          await queryAs(
            "host",
            "select * from public.meetup_directory where id=$1",
            [event.id],
          )
        ).rowCount,
        1,
      );
      assert.equal(
        (
          await queryAs(
            "alice",
            "select * from public.registration_history where meetup_id=$1",
            [event.id],
          )
        ).rowCount,
        3,
      );
      assert.equal(
        (
          await owner.query(
            "select details->>'reason' reason from private.admin_audit_log where action='event_removed' and target_id=$1",
            [event.id],
          )
        ).rows[0].reason,
        "A documented community violation.",
      );
      await denied(() =>
        rpc("host", "set_meetup_status", [event.id, "published"]),
      );
      await denied(() =>
        queryAs(
          "host",
          "update public.meetups set title='Restored by host' where id=$1",
          [event.id],
        ),
      );
      await denied(() =>
        rpc("host", "decide_meetup_request", [event.id, ids.bea, "approved"]),
      );
      await denied(() =>
        queryAs("admin", "delete from public.meetups where id=$1", [event.id]),
      );
    },
  );
  await t.test(
    "published covers can be replaced through a new path; removed covers cannot be edited",
    async () => {
      const event = await createEvent(),
        name = `${event.id}/new-photo.png`;
      await queryAs(
        "host",
        "insert into storage.objects(bucket_id,name,owner_id) values('event-covers',$1,$2)",
        [name, ids.host],
      );
      await queryAs(
        "host",
        "update public.meetups set cover_path=$1 where id=$2",
        [name, event.id],
      );
      assert.equal(
        (
          await queryAs(
            "guest",
            "select * from storage.objects where name=$1",
            [name],
          )
        ).rowCount,
        1,
      );
      assert.equal(
        (
          await queryAs(
            "host",
            "update storage.objects set metadata='{}' where name=$1",
            [name],
          )
        ).rowCount,
        0,
      );
      await rpc("admin", "moderate_meetup", [
        event.id,
        "A documented community violation.",
      ]);
      assert.equal(
        (
          await queryAs(
            "guest",
            "select * from storage.objects where name=$1",
            [name],
          )
        ).rowCount,
        0,
      );
      await denied(() =>
        queryAs(
          "host",
          "insert into storage.objects(bucket_id,name,owner_id) values('event-covers',$1,$2)",
          [`${event.id}/replacement.png`, ids.host],
        ),
      );
    },
  );
  await t.test(
    "competing organiser approvals still serialize on the final seat",
    async () => {
      const event = await createEvent({ capacity: 2 });
      for (const member of ["alice", "bea", "outsider"])
        await rpc(member, "request_meetup", [event.id]);
      await rpc("host", "decide_meetup_request", [
        event.id,
        ids.outsider,
        "approved",
      ]);
      const results = await contendOnEvent(
        event.id,
        "host",
        (client) =>
          client.query(
            "select public.decide_meetup_request($1,$2,'approved')",
            [event.id, ids.alice],
          ),
        "host",
        (client) =>
          client.query(
            "select public.decide_meetup_request($1,$2,'approved')",
            [event.id, ids.bea],
          ),
      );
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        (
          await owner.query(
            "select approved_count from public.meetups where id=$1",
            [event.id],
          )
        ).rows[0].approved_count,
        2,
      );
    },
  );
});

test("Stage C restricts cover writes to the validated server path while preserving existing events", async () => {
  const event = await createEvent();
  await rpc("alice", "request_meetup", [event.id]);
  await rpc("host", "decide_meetup_request", [event.id, ids.alice, "approved"]);
  const original = `${event.id}/original.webp`,
    next = `${event.id}/replacement.webp`;
  await owner.query(
    "insert into storage.objects(bucket_id,name,owner_id) values('event-covers',$1,$3),('event-covers',$2,$3)",
    [original, next, ids.host],
  );
  await queryAs("host", "update public.meetups set cover_path=$1 where id=$2", [
    original,
    event.id,
  ]);
  await migrate(owner, ["202610170005_event_images.sql"]);
  await denied(() =>
    queryAs("host", "update public.meetups set cover_path=$1 where id=$2", [
      next,
      event.id,
    ]),
  );
  await denied(() =>
    queryAs(
      "host",
      "insert into storage.objects(bucket_id,name,owner_id) values('event-covers',$1,$2)",
      [`${event.id}/bypass.webp`, ids.host],
    ),
  );
  assert.equal(
    (
      await queryAs(
        "host",
        "delete from storage.objects where bucket_id='event-covers' and name=$1",
        [original],
      )
    ).rowCount,
    0,
  );
  await denied(() =>
    rpc("host", "commit_event_image", [ids.host, event.id, original, next]),
  );
  await denied(() =>
    rpc("admin", "authorize_event_image", [ids.host, event.id]),
  );
  async function service(fn: string, args: unknown[]) {
    const client = await connection();
    try {
      await client.query("begin");
      await client.query("set local role service_role");
      await client.query("select set_config('request.jwt.claim.sub','',true)");
      const result = await client.query(
        `select to_jsonb(public.${fn}(${args.map((_, i) => `$${i + 1}`).join(",")})) as result`,
        args,
      );
      await client.query("commit");
      return result.rows[0].result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      await close(client);
    }
  }
  await denied(() => service("authorize_event_image", [ids.alice, event.id]));
  assert.equal(
    (await service("authorize_event_image", [ids.host, event.id])).cover_path,
    original,
  );
  const result = await service("commit_event_image", [
    ids.host,
    event.id,
    original,
    next,
  ]);
  assert.equal(result.cover_path, next);
  assert.equal(result.status, "published");
  assert.equal(result.approved_count, 1);
  await denied(
    () => service("commit_event_image", [ids.host, event.id, original, null]),
    /another window/,
  );
  await denied(
    () =>
      service("commit_event_image", [
        ids.host,
        event.id,
        next,
        `${event.id}/missing.webp`,
      ]),
    /validated/,
  );
  assert.equal(
    (
      await queryAs("guest", "select * from storage.objects where name=$1", [
        next,
      ])
    ).rowCount,
    1,
  );
  await rpc("host", "set_meetup_status", [event.id, "cancelled"]);
  await denied(
    () => service("commit_event_image", [ids.host, event.id, next, null]),
    /closed/,
  );
  assert.equal(
    (
      await owner.query(
        "select status from public.meetup_requests where meetup_id=$1 and user_id=$2",
        [event.id, ids.alice],
      )
    ).rows[0].status,
    "cancelled",
  );
  // Profile uploads keep the earlier own-member policy and workflow.
  assert.equal(
    (
      await queryAs(
        "alice",
        "insert into storage.objects(bucket_id,name,owner_id) values('profile-photos',$1,$2) returning id",
        [`${ids.alice}/stage-c-profile.png`, ids.alice],
      )
    ).rowCount,
    1,
  );
});

test("instant RSVP migration preserves seats, resolves legacy queues and enforces immediate race-safe reservations", async (t) => {
  await owner.query(
    "delete from private.rate_limits where operation='request_meetup'",
  );
  const legacy = await createEvent({ capacity: 2 });
  await rpc("alice", "request_meetup", [legacy.id]);
  await rpc("host", "decide_meetup_request", [
    legacy.id,
    ids.alice,
    "approved",
  ]);
  await rpc("bea", "request_meetup", [legacy.id]);
  await rpc("outsider", "request_meetup", [legacy.id]);
  await owner.query(
    "update public.meetup_requests set created_at=now()-interval '2 hours' where meetup_id=$1 and user_id=$2",
    [legacy.id, ids.bea],
  );
  const declined = await createEvent();
  await rpc("alice", "request_meetup", [declined.id]);
  await rpc("host", "decide_meetup_request", [
    declined.id,
    ids.alice,
    "declined",
  ]);
  const closedQueue = await createEvent();
  await rpc("bea", "request_meetup", [closedQueue.id]);
  await owner.query(
    "update public.meetups set starts_at=now()-interval '1 day',registration_deadline=now()-interval '2 days' where id=$1",
    [closedQueue.id],
  );
  await migrate(owner, ["202610170006_instant_rsvps.sql"]);
  await t.test(
    "legacy confirmed seats survive and pending requests resolve within capacity",
    async () => {
      const rows = (
        await owner.query(
          "select user_id,status from public.meetup_requests where meetup_id=$1",
          [legacy.id],
        )
      ).rows;
      assert.equal(
        rows.find((r) => r.user_id === ids.alice).status,
        "approved",
      );
      assert.equal(rows.find((r) => r.user_id === ids.bea).status, "approved");
      assert.equal(
        rows.find((r) => r.user_id === ids.outsider).status,
        "cancelled",
      );
      assert.equal(
        (
          await owner.query(
            "select approved_count from public.meetups where id=$1",
            [legacy.id],
          )
        ).rows[0].approved_count,
        2,
      );
      assert.equal(
        (
          await owner.query(
            "select count(*)::integer n from public.meetup_requests where status='pending'",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await owner.query(
            "select status from public.meetup_requests where meetup_id=$1",
            [closedQueue.id],
          )
        ).rows[0].status,
        "cancelled",
      );
      assert.equal(
        (
          await owner.query(
            "select status from public.meetup_requests where meetup_id=$1",
            [declined.id],
          )
        ).rows[0].status,
        "declined",
      );
    },
  );
  await t.test(
    "counter follow-up repairs the first instant-RSVP upsert behavior without changing reservations",
    async () => {
      const event = await createEvent({ capacity: 3 });
      await rpc("alice", "request_meetup", [event.id]);
      await rpc("alice", "withdraw_meetup_request", [event.id]);
      await rpc("alice", "request_meetup", [event.id]);
      assert.equal(
        (
          await owner.query(
            "select approved_count from public.meetups where id=$1",
            [event.id],
          )
        ).rows[0].approved_count,
        2,
      );
      await migrate(owner, ["202610170007_rsvp_counter_fix.sql"]);
      assert.equal(
        (
          await owner.query(
            "select approved_count from public.meetups where id=$1",
            [event.id],
          )
        ).rows[0].approved_count,
        1,
      );
      assert.equal(
        (
          await owner.query(
            "select count(*)::integer n from public.meetup_requests where meetup_id=$1 and status='approved'",
            [event.id],
          )
        ).rows[0].n,
        1,
      );
    },
  );
  await t.test(
    "RSVP confirms immediately, duplicates consume no extra seat, and cancellation/rejoin preserve history",
    async () => {
      const event = await createEvent({ capacity: 2 });
      for (let i = 0; i < 2; i++)
        await rpc("alice", "request_meetup", [event.id]);
      assert.equal(
        (
          await owner.query(
            "select approved_count from public.meetups where id=$1",
            [event.id],
          )
        ).rows[0].approved_count,
        1,
      );
      assert.equal(
        (
          await queryAs(
            "alice",
            "select status,decided_by from public.meetup_requests where meetup_id=$1 and user_id=$2",
            [event.id, ids.alice],
          )
        ).rows[0].status,
        "approved",
      );
      await rpc("alice", "withdraw_meetup_request", [event.id]);
      assert.equal(
        (
          await owner.query(
            "select approved_count from public.meetups where id=$1",
            [event.id],
          )
        ).rows[0].approved_count,
        0,
      );
      await rpc("alice", "request_meetup", [event.id]);
      assert.equal(
        (
          await owner.query(
            "select approved_count from public.meetups where id=$1",
            [event.id],
          )
        ).rows[0].approved_count,
        1,
      );
      assert.deepEqual(
        (
          await owner.query(
            "select status from public.registration_history where meetup_id=$1 and user_id=$2 order by id",
            [event.id, ids.alice],
          )
        ).rows.map((r) => r.status),
        ["approved", "cancelled", "approved"],
      );
      await rpc("alice", "request_meetup", [declined.id]);
      assert.equal(
        (
          await owner.query(
            "select status from public.meetup_requests where meetup_id=$1",
            [declined.id],
          )
        ).rows[0].status,
        "approved",
      );
    },
  );
  await t.test(
    "approval RPC is retired and raw/self-spoofed writes remain blocked",
    async () => {
      await denied(() =>
        rpc("host", "decide_meetup_request", [legacy.id, ids.bea, "declined"]),
      );
      await denied(() =>
        rpc("admin", "decide_meetup_request", [legacy.id, ids.bea, "approved"]),
      );
      await denied(() =>
        queryAs(
          "alice",
          "insert into public.meetup_requests(meetup_id,user_id) values($1,$2)",
          [legacy.id, ids.outsider],
        ),
      );
      await denied(() => rpc("host", "request_meetup", [legacy.id]));
      await denied(() => rpc("guest", "request_meetup", [legacy.id]));
      await denied(() => rpc("suspended", "request_meetup", [legacy.id]));
    },
  );
  await t.test(
    "simultaneous members compete for one last seat on the event lock",
    async () => {
      const event = await createEvent({ capacity: 2 });
      await rpc("alice", "request_meetup", [event.id]);
      const results = await contendOnEvent(
        event.id,
        "bea",
        (client) =>
          client.query("select public.request_meetup($1)", [event.id]),
        "outsider",
        (client) =>
          client.query("select public.request_meetup($1)", [event.id]),
        true,
      );
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(results.filter((r) => r.status === "rejected").length, 1);
      assert.equal(
        (
          await owner.query(
            "select approved_count from public.meetups where id=$1",
            [event.id],
          )
        ).rows[0].approved_count,
        2,
      );
      assert.equal(
        (
          await owner.query(
            "select count(*)::integer n from public.meetup_requests where meetup_id=$1 and status='approved'",
            [event.id],
          )
        ).rows[0].n,
        2,
      );
    },
  );
  await t.test(
    "capacity edits and event cancellation serialize with instant RSVPs",
    async () => {
      const event = await createEvent({ capacity: 3 });
      await rpc("alice", "request_meetup", [event.id]);
      await rpc("bea", "request_meetup", [event.id]);
      const results = await contendOnEvent(
        event.id,
        "outsider",
        (client) =>
          client.query("select public.request_meetup($1)", [event.id]),
        "host",
        (client) =>
          client.query("update public.meetups set capacity=2 where id=$1", [
            event.id,
          ]),
        true,
      );
      assert.equal(results[0].status, "fulfilled");
      assert.equal(results[1].status, "rejected");
      const other = await createEvent({ capacity: 2 });
      const closure = await contendOnEvent(
        other.id,
        "alice",
        (client) =>
          client.query("select public.request_meetup($1)", [other.id]),
        "host",
        (client) =>
          client.query("select public.set_meetup_status($1,'cancelled')", [
            other.id,
          ]),
        true,
      );
      assert.ok(closure.every((r) => r.status === "fulfilled"));
      assert.deepEqual(
        (
          await owner.query(
            "select status,approved_count from public.meetups where id=$1",
            [other.id],
          )
        ).rows[0],
        { status: "cancelled", approved_count: 0 },
      );
    },
  );
  await t.test(
    "deadlines, inactive hosts, drafts and closed events reject RSVPs",
    async () => {
      const event = await createEvent();
      await queryAs(
        "host",
        "update public.meetups set registration_deadline=now()-interval '1 hour' where id=$1",
        [event.id],
      );
      await denied(() => rpc("alice", "request_meetup", [event.id]), /closed/);
      const draft = await createEvent();
      await rpc("host", "set_meetup_status", [draft.id, "draft"]);
      await denied(() => rpc("alice", "request_meetup", [draft.id]));
      const inactive = await createEvent({}, "host2");
      await owner.query(
        "update private.member_access set status='suspended' where user_id=$1",
        [ids.host2],
      );
      try {
        await denied(() => rpc("alice", "request_meetup", [inactive.id]));
      } finally {
        await owner.query(
          "update private.member_access set status='active' where user_id=$1",
          [ids.host2],
        );
      }
    },
  );
  await t.test(
    "one transaction can switch member/organiser roles, rejoin and cancel without a stale counter",
    async () => {
      await owner.query("begin");
      try {
        await owner.query(`do $$
      declare event_id uuid; count_now integer; r public.meetups;
      begin
        perform set_config('request.jwt.claim.sub','${ids.host}',true);
        execute 'set local role authenticated';
        insert into public.meetups(host_id,title,category,event_date,event_time,place,capacity,description)
          values('${ids.host}','Transactional RSVP check','Coffee','2099-10-17','10:30','Richmond',2,'A temporary transactional reservation check.') returning id into event_id;
        perform set_config('request.jwt.claim.sub','${ids.alice}',true);
        perform public.request_meetup(event_id);perform public.request_meetup(event_id);
        perform public.withdraw_meetup_request(event_id);perform public.request_meetup(event_id);
        perform set_config('request.jwt.claim.sub','${ids.host}',true);
        select * into r from public.set_meetup_status(event_id,'cancelled');
        select approved_count into count_now from public.meetups where id=event_id;
        if count_now<>0 then raise exception 'Stale cancellation counter: %, returned %',count_now,r.approved_count;end if;
        execute 'reset role';
      end $$;`);
      } finally {
        await owner.query("rollback");
      }
    },
  );
});

test("all migrations also apply to an empty project with immediate member publication", async () => {
  await cluster.createDatabase("current_fresh");
  const client = await connection("current_fresh");
  await client.query(schemaFixture);
  const files = (await readdir(migrationDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  await migrate(client, files);
  await client.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
    [
      ids.host,
      "host@example.test",
      JSON.stringify({ display_name: "Fresh organiser", is_admin: true }),
    ],
  );
  const result = await as(
    "host",
    (db) =>
      db.query(
        `insert into public.meetups(host_id,title,category,event_date,event_time,place,capacity,description)
    values($1,'Fresh project coffee','Coffee','2099-10-17','10:30','Richmond public café',4,'A friendly gathering over coffee in a public venue.') returning id,status,approved_count`,
        [ids.host],
      ),
    "current_fresh",
  );
  assert.equal(result.rows[0].status, "published");
  assert.equal(result.rows[0].approved_count, 0);
  const visible = await as(
    "guest",
    (db) =>
      db.query("select * from public.meetup_directory where id=$1", [
        result.rows[0].id,
      ]),
    "current_fresh",
  );
  assert.equal(visible.rowCount, 1);
  assert.ok("details_updated_at" in visible.rows[0]);
  assert.equal(
    (await client.query("select * from private.admin_roles")).rowCount,
    0,
  );
  const unsafe =
    await client.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.prosecdef and not coalesce(p.proconfig @> array['search_path=""'],false)`);
  assert.deepEqual(unsafe.rows, []);
  await close(client);
});
