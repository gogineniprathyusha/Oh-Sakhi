import { spawn, type ChildProcess } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
import { once } from "node:events";
import { join } from "node:path";
import pg from "pg";

// Use the bundled native binaries directly: their wrapper installs a beforeExit
// handler that can mask failed/pending node:test hooks with a successful exit.
export async function localPostgres(
  directory: string,
  port: number,
  onLog: (message: unknown) => void,
) {
  const binaries = await import(
    `@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`
  );
  const databaseDir = join(directory, "postgres");
  const passwordFile = join(directory, "test-password");
  let server: ChildProcess | undefined;
  async function run(binary: string, args: string[]) {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.stderr.on("data", (data) => {
      output += data;
    });
    const [code] = await once(child, "exit");
    if (code !== 0)
      throw Error(`PostgreSQL command failed (${code}): ${output}`);
  }
  return {
    async initialise() {
      await writeFile(passwordFile, "local-tests-only\n", { mode: 0o600 });
      try {
        await run(binaries.initdb, [
          "-D",
          databaseDir,
          "--username=postgres",
          "--auth-host=scram-sha-256",
          "--auth-local=trust",
          `--pwfile=${passwordFile}`,
          "--no-locale",
          "--encoding=UTF8",
        ]);
      } finally {
        await rm(passwordFile, { force: true });
      }
    },
    async start() {
      server = spawn(
        binaries.postgres,
        [
          "-D",
          databaseDir,
          "-h",
          "127.0.0.1",
          "-p",
          String(port),
          "-k",
          directory,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      const running = server;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Local PostgreSQL startup timed out")),
          15000,
        );
        const log = (data: Buffer) => {
          onLog(data);
          if (
            String(data).includes(
              "database system is ready to accept connections",
            )
          ) {
            clearTimeout(timer);
            resolve();
          }
        };
        running.stdout?.on("data", log);
        running.stderr?.on("data", log);
        running.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        running.once("exit", (code) => {
          clearTimeout(timer);
          reject(Error(`Local PostgreSQL exited during startup (${code})`));
        });
      });
    },
    async createDatabase(name: string) {
      if (!/^[a-z_]+$/.test(name)) throw Error("Invalid test database name");
      const client = new pg.Client({
        host: "127.0.0.1",
        port,
        user: "postgres",
        database: "postgres",
        password: "local-tests-only",
      });
      await client.connect();
      try {
        await client.query(`create database ${name}`);
      } finally {
        await client.end();
      }
    },
    async stop() {
      if (server && server.exitCode === null && server.signalCode === null) {
        const exited = once(server, "exit");
        server.kill("SIGTERM");
        await exited;
      }
      // Only this run's mkdtemp directory is removed; existing databases are never used.
      await rm(directory, { recursive: true, force: true });
    },
  };
}
