import type { Page, Route } from "@playwright/test";
import type { ProfileRow } from "../../../src/features/events/types.ts";
import { authMock, origin, storedSession, userId } from "./auth.ts";
export const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNw0bT+DwADBQGotRVSxwAAAABJRU5ErkJggg==",
  "base64",
);
export const interests = [
  "Coffee",
  "Brunch",
  "Fitness",
  "Hiking",
  "Books",
  "Art",
  "Fashion",
  "Cultural experiences",
  "Wellness",
  "Networking",
  "Seasonal activities",
  "Pottery",
  "Cooking",
  "Music",
].map((name, index) => ({ id: `interest-${index}`, name }));
interface Flags {
  catalogFailure: boolean;
  saveFailure: boolean;
  linkFailure: boolean;
  linkResponseFailure: boolean;
  uploadFailure: boolean;
  deleteFailure: boolean;
}
export async function profileMock(page: Page, withPhoto = false) {
  // WebKit's interception protocol can omit Blob bytes from multipart postData.
  // Retain the actual Blob passed to fetch for the mocked Storage service.
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = String(input instanceof Request ? input.url : input);
      if (
        url.includes("/storage/v1/object/profile-photos/") &&
        options?.body instanceof FormData
      ) {
        const blob = [...options.body.values()].find(
          (value) => value instanceof Blob,
        );
        if (blob instanceof Blob) {
          (
            window as typeof window & {
              __profileTestUpload?: { bytes: number[]; type: string };
            }
          ).__profileTestUpload = {
            bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
            type: blob.type,
          };
        }
      }
      return originalFetch(input, options);
    };
  });
  const flags: Flags = {
    catalogFailure: false,
    saveFailure: false,
    linkFailure: false,
    linkResponseFailure: false,
    uploadFailure: false,
    deleteFailure: false,
  };
  const member: ProfileRow = {
    id: userId,
    display_name: "Profile member",
    bio: "An existing bio.",
    interests: ["Books"],
    city: "Richmond",
    neighborhood: "West End",
    avatar_path: withPhoto ? `${userId}/original.png` : null,
  };
  const files = new Map<string, { bytes: Buffer; type: string }>();
  if (member.avatar_path)
    files.set(member.avatar_path, { bytes: pixel, type: "image/png" });
  const calls: {
    action: string;
    path?: string;
    values?: Record<string, unknown>;
    upsert?: string;
    authorized?: boolean;
  }[] = [];
  async function handler(route: Route) {
    const request = route.request(),
      url = new URL(request.url());
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname === "/rest/v1/interests") {
      await json(
        flags.catalogFailure ? { message: "Catalogue unavailable" } : interests,
        flags.catalogFailure ? 500 : 200,
      );
      return true;
    }
    if (url.pathname === "/rest/v1/profiles") {
      if (request.method() === "GET") {
        await json(member);
        return true;
      }
      const values = request.postDataJSON() as Partial<ProfileRow>;
      calls.push({ action: "profile", values });
      if (flags.saveFailure || ("avatar_path" in values && flags.linkFailure)) {
        await json({ message: "Profile write rejected", code: "42501" }, 403);
        return true;
      }
      if ("avatar_path" in values) {
        const expected = member.avatar_path
          ? `eq.${member.avatar_path}`
          : "is.null";
        if (url.searchParams.get("avatar_path") !== expected) {
          await json({ message: "Conflict", code: "PGRST116" }, 406);
          return true;
        }
      }
      Object.assign(member, values);
      if ("avatar_path" in values && flags.linkResponseFailure) {
        await json({ message: "Response interrupted" }, 503);
        return true;
      }
      await json({ id: userId, avatar_path: member.avatar_path });
      return true;
    }
    const prefix = "/storage/v1/object/profile-photos/";
    if (url.pathname.startsWith(prefix)) {
      const path = decodeURIComponent(url.pathname.slice(prefix.length));
      if (request.method() === "POST") {
        calls.push({
          action: "upload",
          path,
          upsert: request.headers()["x-upsert"],
        });
        if (flags.uploadFailure) {
          await json(
            {
              message: "Storage unavailable",
              statusCode: "503",
              error: "Unavailable",
            },
            503,
          );
          return true;
        }
        const buffer = request.postDataBuffer()!,
          text = buffer.toString("latin1");
        const header = /Content-Type: (image\/[a-z]+)\r\n/i.exec(text);
        if (!header) throw Error("Expected a raster image in the upload");
        const start = text.indexOf("\r\n\r\n", header.index) + 4;
        const contentType = request.headers()["content-type"];
        const boundary = contentType.split("boundary=")[1];
        const end = buffer.indexOf(Buffer.from(`\r\n--${boundary}`), start);
        let bytes = buffer.subarray(start, end);
        if (!bytes.length) {
          const upload = await page.evaluate(
            () =>
              (
                window as typeof window & {
                  __profileTestUpload?: { bytes: number[]; type: string };
                }
              ).__profileTestUpload,
          );
          if (!upload?.bytes.length || upload.type !== header[1])
            throw Error("Missing image bytes in mocked upload");
          bytes = Buffer.from(upload.bytes);
        }
        files.set(path, { bytes, type: header[1] });
        await json({ Key: `profile-photos/${path}`, Id: "test-object" });
        return true;
      }
      if (request.method() === "GET") {
        calls.push({
          action: "download",
          path,
          authorized: Boolean(
            request.headers()["authorization"]?.startsWith("Bearer "),
          ),
        });
        const file = files.get(path);
        if (file)
          await route.fulfill({
            status: 200,
            contentType: file.type,
            body: file.bytes,
          });
        else
          await json(
            { message: "Not found", statusCode: "404", error: "Not found" },
            404,
          );
        return true;
      }
    }
    if (
      url.pathname === "/storage/v1/object/profile-photos" &&
      request.method() === "DELETE"
    ) {
      const paths = request.postDataJSON().prefixes as string[];
      for (const path of paths) calls.push({ action: "delete", path });
      if (flags.deleteFailure)
        await json(
          {
            message: "Delete unavailable",
            statusCode: "503",
            error: "Unavailable",
          },
          503,
        );
      else {
        for (const path of paths) files.delete(path);
        await json(paths.map((name) => ({ name })));
      }
      return true;
    }
    return false;
  }
  await authMock(page, handler);
  await storedSession(page);
  return { flags, member, files, calls };
}
export async function openProfile(page: Page) {
  await page.goto(origin);
  await page.getByRole("button", { name: "My profile", exact: true }).click();
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
}
export const photoFile = {
  name: "profile.png",
  mimeType: "image/png",
  buffer: pixel,
};
