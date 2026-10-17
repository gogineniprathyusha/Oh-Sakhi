import { supabase } from "../../lib/supabase.ts";
import { isOwnedPhoto, MAX_AVATAR_BYTES } from "./photo-file.ts";
export interface Interest {
  id: string;
  name: string;
}
const bucket = "profile-photos";
function client() {
  if (!supabase) throw Error("Log in to manage your profile.");
  return supabase;
}
export async function loadInterests(): Promise<Interest[]> {
  const { data, error } = await client()
    .from("interests")
    .select("id,name")
    .order("name");
  if (error)
    throw Error("Your interests could not be loaded. Please try again.");
  return data ?? [];
}
export async function downloadPhoto(userId: string, path: string) {
  if (!isOwnedPhoto(userId, path))
    throw Error("This photo is not part of your profile.");
  const { data, error } = await client().storage.from(bucket).download(path);
  if (error || !data)
    throw Error("Your photo could not be loaded. Please try again.");
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(data.type) ||
    data.size > MAX_AVATAR_BYTES
  )
    throw Error(
      "This stored photo could not be displayed. Replace it with another photo.",
    );
  return data;
}
export async function removeUnusedPhoto(userId: string, path: string) {
  if (!isOwnedPhoto(userId, path))
    throw Error("This photo is not part of your profile.");
  const db = client();
  const current = await db
    .from("profiles")
    .select("avatar_path")
    .eq("id", userId)
    .single();
  if (current.error)
    throw Error("The unused photo could not be checked. Please try again.");
  if (current.data.avatar_path === path)
    throw Error("This photo is still in use. Reload your profile first.");
  const { error } = await db.storage.from(bucket).remove([path]);
  if (error)
    throw Error("The unused photo could not be removed. Please try again.");
}
export class PhotoChangeError extends Error {
  cleanupPath?: string;
  constructor(message: string, cleanupPath?: string) {
    super(message);
    this.name = "PhotoChangeError";
    this.cleanupPath = cleanupPath;
  }
}

/** Link the new object first. Delete only a known superseded or unlinked object. */
export async function changePhoto(
  userId: string,
  previous: string | null,
  image: Blob | null,
) {
  const db = client();
  let next: string | null = null;
  if (image) {
    if (
      !["image/webp", "image/png", "image/jpeg"].includes(image.type) ||
      !image.size ||
      image.size > MAX_AVATAR_BYTES
    )
      throw Error("Choose a supported photo smaller than 2 MiB.");
    const extension =
      image.type === "image/webp"
        ? "webp"
        : image.type === "image/png"
          ? "png"
          : "jpg";
    next = `${userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await db.storage.from(bucket).upload(next, image, {
      contentType: image.type,
      upsert: false,
      cacheControl: "0",
    });
    if (error)
      throw Error(
        "Your photo could not be uploaded. Your current photo is unchanged.",
      );
  }
  let update = db
    .from("profiles")
    .update({ avatar_path: next })
    .eq("id", userId);
  update = previous
    ? update.eq("avatar_path", previous)
    : update.is("avatar_path", null);
  const { error } = await update.select("id,avatar_path").single();
  if (error) {
    // A lost response does not prove the write failed. Read the reference before
    // cleaning up an upload that might already be the member's active photo.
    const current = await db
      .from("profiles")
      .select("avatar_path")
      .eq("id", userId)
      .single();
    if (!current.error && current.data.avatar_path === next) {
      let cleanupPath: string | undefined;
      if (previous && previous !== next) {
        try {
          await removeUnusedPhoto(userId, previous);
        } catch {
          cleanupPath = previous;
        }
      }
      return { path: next, cleanupPath };
    }
    let cleanupPath: string | undefined;
    if (next) {
      try {
        await removeUnusedPhoto(userId, next);
      } catch {
        cleanupPath = next;
      }
    }
    throw new PhotoChangeError(
      "Your photo could not be saved. Your profile may have changed; reload and try again.",
      cleanupPath,
    );
  }
  let cleanupPath: string | undefined;
  if (previous && previous !== next) {
    try {
      await removeUnusedPhoto(userId, previous);
    } catch {
      cleanupPath = previous;
    }
  }
  return { path: next, cleanupPath };
}
