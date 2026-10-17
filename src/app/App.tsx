import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Layout } from "../components/Layout.tsx";
import { Modal } from "../components/Modal.tsx";
import { EventForm } from "../components/EventForm.tsx";
import { Discover } from "../pages/Discover.tsx";
import { MyPlans } from "../pages/MyPlans.tsx";
import { HostDesk } from "../pages/HostDesk.tsx";
import { Circle } from "../pages/Circle.tsx";
import { Profile } from "../pages/Profile.tsx";
import { Auth } from "../pages/Auth.tsx";
import { useSession } from "../hooks/useSession.ts";
import { useLiveCommunity } from "../hooks/useLiveCommunity.ts";
import { supabase } from "../lib/supabase.ts";
import * as api from "../lib/community-api.ts";
import {
  approve,
  decline,
  initialState,
  loadState,
  requestToJoin,
  saveState,
  themes,
  withdraw,
} from "../lib/demo-store.ts";
import { EventDetails } from "../features/events/EventDetails.tsx";
import { RequestManager } from "../features/events/RequestManager.tsx";
import type {
  AuthMode,
  CommunityEvent,
  DemoState,
  EventInput,
  Page,
  Profile as MemberProfile,
  Registration,
  StorageLike,
} from "../features/events/types.ts";

type Dialog =
  | { kind: "details" | "manage" | "edit" | "report" | "moderate"; id: string }
  | { kind: "create" | "setup" };
function browserStorage(): StorageLike | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

export function App() {
  const [demoState, setDemoState] = useState(() => loadState(browserStorage()));
  const [page, setPage] = useState<Page>("discover"),
    [filter, setFilter] = useState("All");
  const [auth, setAuth] = useState<AuthMode | null>(null),
    [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [registrations, setRegistrations] = useState<Registration[]>([]),
    [attendeeError, setAttendeeError] = useState("");
  const opener = useRef<HTMLElement | null>(null),
    locked = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onRecovery = useCallback(() => setAuth("update"), []);
  const user = useSession(onRecovery),
    live = useLiveCommunity(user?.id),
    demo = !user;
  const data = demo ? demoState : live.data;
  const notify = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(""), 6500);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    document.body.dataset.mode = demo && !auth ? "demo" : "member";
  }, [demo, auth]);
  useEffect(() => {
    document.title = `Her Hour — Oh Sakhi! | ${page === "discover" ? "Your time. Your circle." : page === "myplans" ? "My plans" : page === "host" ? "Host desk" : page === "circle" ? "My circle" : "My profile"}`;
  }, [page]);
  const open = (next: Dialog) => {
    if (!dialog) opener.current = document.activeElement as HTMLElement | null;
    setDialog(next);
  };
  const close = () => setDialog(null);
  function navigate(destination: Page) {
    close();
    setPage(destination);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function login() {
    if (supabase) {
      close();
      setAuth("login");
    } else open({ kind: "setup" });
  }
  function store(next: DemoState) {
    setDemoState(next);
    const saved = saveState(browserStorage(), next);
    if (!saved)
      notify(
        "Browser storage is unavailable. Changes last only until you reload.",
      );
    return saved;
  }
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Unable to complete this action. Please try again.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function updateDemo(id: string, change: (event: CommunityEvent) => void) {
    const next = structuredClone(demoState),
      event = next.events.find((event) => event.id === id);
    if (!event) throw Error("This plan is no longer available.");
    change(event);
    store(next);
  }
  const current =
    dialog && "id" in dialog
      ? data?.events.find((event) => event.id === dialog.id)
      : undefined;
  const manageId = dialog?.kind === "manage" ? dialog.id : undefined;
  useEffect(() => {
    if (demo || !manageId) return;
    let active = true;
    setRegistrations([]);
    setAttendeeError("");
    void api
      .attendees(manageId)
      .then((rows) => {
        if (active) setRegistrations(rows);
      })
      .catch((error: unknown) => {
        if (active)
          setAttendeeError(
            error instanceof Error ? error.message : "Unable to load requests.",
          );
      });
    return () => {
      active = false;
    };
  }, [demo, manageId]);
  async function reloadRequests(id: string) {
    setRegistrations(await api.attendees(id));
  }
  const saveEvent = (input: EventInput) =>
    void run(async () => {
      if (demo) {
        const next = structuredClone(demoState);
        if (current && dialog?.kind === "edit") {
          const event = next.events.find((item) => item.id === current.id)!;
          Object.assign(event, input, {
            details_updated_at: new Date().toISOString(),
          });
        } else {
          const [emoji, ...colors] = themes[input.category] ?? themes.Social;
          next.events.push({
            ...input,
            id: crypto.randomUUID(),
            host: "You",
            emoji,
            colors,
            attendees: 0,
            approved: [],
            pending: [],
            declined: [],
            status: "published",
          });
        }
        store(next);
      } else {
        await api.saveEvent(
          dialog?.kind === "edit" ? current?.id : undefined,
          user!.id,
          input,
        );
        await live.refresh();
      }
      close();
      setPage("myplans");
      notify(
        current
          ? "Plan updated — existing requests are preserved."
          : demo
            ? "Demo plan saved"
            : "Your event is published",
      );
    });
  const saveProfile = (profile: MemberProfile) =>
    void run(async () => {
      if (demo) {
        if (store({ ...demoState, profile })) notify("Profile saved");
      } else {
        await api.saveProfile(user!.id, profile);
        await live.refresh();
        notify("Profile saved");
      }
    });
  const request = (event: CommunityEvent) =>
    void run(async () => {
      if (demo)
        updateDemo(event.id, (item) => {
          if (!requestToJoin(item))
            throw Error("This plan is full or you already have a request.");
        });
      else {
        await api.requestEvent(event.id);
        await live.refresh();
      }
      notify(
        demo
          ? "Demo request saved. No host has been contacted."
          : "Request sent to the organiser",
      );
    });
  const withdrawRequest = (event: CommunityEvent) =>
    void run(async () => {
      if (demo) updateDemo(event.id, withdraw);
      else {
        await api.withdrawEvent(event.id);
        await live.refresh();
      }
      notify("Request withdrawn");
    });
  const decide = (
    event: CommunityEvent,
    member: string,
    decision: "approved" | "declined",
  ) =>
    void run(async () => {
      if (demo)
        updateDemo(event.id, (item) => {
          if (
            !(decision === "approved"
              ? approve(item, member)
              : decline(item, member))
          )
            throw Error(
              "Unable to change this request. Check available seats.",
            );
        });
      else {
        await api.decideRequest(event.id, member, decision);
        await live.refresh();
        await reloadRequests(event.id);
      }
      notify(
        decision === "approved"
          ? "Seat approved"
          : "Request declined; any approved seat has been released",
      );
    });
  const cancel = (event: CommunityEvent) => {
    if (
      !window.confirm(
        "Cancel this plan? Pending requests and approved seats will be cancelled. Its history will be kept.",
      )
    )
      return;
    void run(async () => {
      if (demo)
        updateDemo(event.id, (item) => {
          item.status = "cancelled";
          item.approved = [];
          item.pending = [];
        });
      else {
        await api.setEventStatus(event.id, "cancelled");
        await live.refresh();
      }
      close();
      notify("Plan cancelled");
    });
  };
  const reset = () => {
    if (window.confirm("Reset your demo profile, plans and requests?")) {
      store(initialState());
      notify("Demo data reset");
    }
  };
  const logout = () =>
    void run(async () => {
      const { error } = await supabase!.auth.signOut();
      if (error) throw error;
      close();
      setPage("discover");
      notify("Logged out");
    });
  function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current || !user) return;
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await api.reportEvent(
        current.id,
        user.id,
        String(form.get("category")),
        String(form.get("details")).trim(),
      );
      close();
      notify("Report sent for review");
    });
  }
  function submitModeration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!current) return;
    const form = new FormData(event.currentTarget);
    void run(async () => {
      await api.removeEvent(current.id, String(form.get("reason")).trim());
      await live.refresh();
      close();
      notify(
        "Event removed. Registration and moderation history have been preserved.",
      );
    });
  }
  const toast = (
    <div
      id="toast"
      className={`toast ${message ? "" : "hidden"}`}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
  if (auth)
    return (
      <>
        <Auth
          mode={auth}
          setMode={setAuth}
          back={() => {
            setAuth(null);
            setPage("discover");
          }}
          notify={notify}
        />
        {toast}
      </>
    );
  if (!data || (!demo && live.error))
    return (
      <div className="content">
        <h1 className="page-title">Your community</h1>
        <p role="status">
          {live.error || "Loading your member profile and experiences…"}
        </p>
        {live.error && (
          <>
            <button className="btn" onClick={() => void live.refresh()}>
              Try again
            </button>{" "}
            <button className="btn btn-outline" onClick={logout}>
              Log out
            </button>
          </>
        )}
        {toast}
      </div>
    );
  const rows: Registration[] =
    current && demo
      ? [
          ...current.pending.map((user_id) => ({
            user_id,
            status: "pending" as const,
          })),
          ...current.approved.map((user_id) => ({
            user_id,
            status: "approved" as const,
          })),
          ...(current.declined ?? []).map((user_id) => ({
            user_id,
            status: "declined" as const,
          })),
        ]
      : registrations;
  return (
    <>
      <Layout
        demo={demo}
        page={page}
        name={data.profile.name}
        navigate={navigate}
        create={() => open({ kind: "create" })}
        login={login}
        modalOpen={Boolean(dialog)}
      >
        {page === "discover" && (
          <Discover
            events={data.events}
            filter={filter}
            setFilter={setFilter}
            open={(id) => open({ kind: "details", id })}
            create={() => open({ kind: "create" })}
            demo={demo}
          />
        )}
        {page === "myplans" && (
          <MyPlans
            events={data.events}
            open={(id) => open({ kind: "details", id })}
            explore={() => navigate("discover")}
            demo={demo}
          />
        )}
        {page === "host" && (
          <HostDesk
            events={data.events}
            open={(id) => open({ kind: "details", id })}
            create={() => open({ kind: "create" })}
          />
        )}
        {page === "circle" && <Circle />}
        {page === "profile" && (
          <Profile
            profile={data.profile}
            demo={demo}
            busy={busy}
            save={saveProfile}
            reset={reset}
            login={login}
            logout={logout}
            email={user?.email}
          />
        )}
      </Layout>
      {dialog && (
        <Modal
          opener={opener.current}
          title={
            dialog.kind === "setup"
              ? "Real accounts need Supabase"
              : dialog.kind === "create"
                ? "Host a plan"
                : dialog.kind === "edit"
                  ? "Edit your plan"
                  : dialog.kind === "manage"
                    ? "Manage requests"
                    : dialog.kind === "report"
                      ? "Report this event"
                      : dialog.kind === "moderate"
                        ? "Remove an event"
                        : (current?.title ?? "Plan unavailable")
          }
          close={close}
        >
          {dialog.kind === "setup" ? (
            <>
              <p>
                Explore the sample website now. Real authentication, member
                profiles, events and RSVPs need a connected Supabase project.
              </p>
              <ol className="setup-steps">
                <li>
                  Apply the migrations in <code>supabase/migrations</code> in
                  order.
                </li>
                <li>
                  Copy <code>.env.example</code> to <code>.env.local</code>.
                </li>
                <li>
                  Set <code>VITE_SUPABASE_URL</code> and{" "}
                  <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> using your project
                  URL and public browser key, then restart Vite.
                </li>
              </ol>
              <button className="btn" onClick={close}>
                Keep exploring
              </button>
            </>
          ) : dialog.kind === "create" || dialog.kind === "edit" ? (
            <EventForm
              key={dialog.kind === "edit" ? current?.id : "new"}
              event={dialog.kind === "edit" ? current : undefined}
              demo={demo}
              busy={busy}
              save={saveEvent}
            />
          ) : dialog.kind === "details" ? (
            current && (
              <EventDetails
                close={close}
                event={current}
                demo={demo}
                busy={busy}
                isAdmin={Boolean(live.data?.isAdmin)}
                manage={() => open({ kind: "manage", id: current.id })}
                edit={() => open({ kind: "edit", id: current.id })}
                report={() => open({ kind: "report", id: current.id })}
                moderate={() => open({ kind: "moderate", id: current.id })}
                publish={() =>
                  void run(async () => {
                    await api.setEventStatus(current.id, "published");
                    await live.refresh();
                    notify("Your event is published");
                  })
                }
                request={request}
                withdrawRequest={withdrawRequest}
              />
            )
          ) : dialog.kind === "manage" ? (
            current && (
              <RequestManager
                event={current}
                demo={demo}
                busy={busy}
                rows={rows}
                attendeeError={attendeeError}
                decide={decide}
                edit={() => open({ kind: "edit", id: current.id })}
                cancel={cancel}
                addSample={() =>
                  updateDemo(current.id, (item) => {
                    let n = 1;
                    const ids = [
                      ...item.pending,
                      ...item.approved,
                      ...(item.declined ?? []),
                    ];
                    while (ids.includes(`Sample member ${n}`)) n++;
                    item.pending.push(`Sample member ${n}`);
                  })
                }
              />
            )
          ) : dialog.kind === "report" ? (
            <form onSubmit={submitReport}>
              <div className="field">
                <label htmlFor="report-category">Reason</label>
                <select id="report-category" name="category">
                  {["Safety", "Harassment", "Spam", "Other"].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="report-details">Details</label>
                <textarea
                  id="report-details"
                  name="details"
                  minLength={10}
                  maxLength={1000}
                  required
                />
              </div>
              <button className="btn" disabled={busy}>
                Send report
              </button>
            </form>
          ) : (
            <form onSubmit={submitModeration}>
              <p>
                Remove this event from discovery and cancel outstanding requests
                and seats. Its history will be preserved, and its organiser
                cannot republish it.
              </p>
              <div className="field">
                <label htmlFor="removal-reason">
                  Violation and reason for removal
                </label>
                <textarea
                  id="removal-reason"
                  name="reason"
                  minLength={10}
                  maxLength={1000}
                  required
                />
              </div>
              <button className="btn" disabled={busy}>
                Remove event
              </button>
            </form>
          )}
        </Modal>
      )}
      {toast}
    </>
  );
}
