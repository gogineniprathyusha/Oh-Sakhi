import { useState, type FormEvent } from "react";
import type { Profile as MemberProfile } from "../features/events/types.ts";
import { Avatar } from "../components/Avatar.tsx";
import { InterestPicker } from "../features/profile/InterestPicker.tsx";
import { PhotoEditor } from "../features/profile/PhotoEditor.tsx";
import { DeleteAccount } from "../features/account/DeleteAccount.tsx";
interface Props {
  profile: MemberProfile;
  busy: boolean;
  save: (profile: MemberProfile) => void;
  logout: () => void;
  email?: string;
  photoUrl?: string;
  photoLoading: boolean;
  photoError: string;
  retryPhoto: () => void;
  changePhoto: (image: Blob | null) => Promise<void>;
  cleanupPending: boolean;
  cleanup: () => void;
  deleted: () => Promise<void>;
}
function ProfileFields({
  profile,
  busy,
  save,
}: Pick<Props, "profile" | "busy" | "save">) {
  const [error, setError] = useState(""),
    [interests, setInterests] = useState(profile.interests);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget),
      name = String(data.get("name") ?? "").trim(),
      city = String(data.get("city") ?? "").trim();
    if (!name) {
      setError("Please enter a display name.");
      return;
    }
    if (!city) {
      setError("Please enter a city.");
      return;
    }
    const chosen = interests;
    if (chosen.length > 12) {
      setError("Choose up to 12 interests.");
      return;
    }
    save({
      ...profile,
      name,
      bio: String(data.get("bio") ?? "").trim(),
      interests: chosen,
      city,
      neighborhood: String(data.get("neighborhood") ?? "").trim(),
    });
  }
  return (
    <form onSubmit={submit}>
      <fieldset className="profile-fields" disabled={busy}>
        <div className="field">
          <label htmlFor="profile-name">Your first name or display name</label>
          <input
            id="profile-name"
            name="name"
            maxLength={60}
            required
            defaultValue={profile.name}
            autoComplete="nickname"
          />
        </div>
        <div className="field">
          <label htmlFor="profile-bio">A little about you</label>
          <textarea
            id="profile-bio"
            name="bio"
            maxLength={350}
            defaultValue={profile.bio}
          />
        </div>
        <InterestPicker
          selected={interests}
          change={setInterests}
          disabled={busy}
        />
        <div className="form-grid">
          <div className="field">
            <label htmlFor="profile-city">City</label>
            <input
              id="profile-city"
              name="city"
              required
              maxLength={80}
              defaultValue={profile.city ?? "Richmond"}
              autoComplete="address-level2"
            />
          </div>
          <div className="field">
            <label htmlFor="profile-neighborhood">
              Neighborhood (optional)
            </label>
            <input
              id="profile-neighborhood"
              name="neighborhood"
              maxLength={80}
              defaultValue={profile.neighborhood ?? ""}
              placeholder="e.g. West End"
              autoComplete="off"
            />
          </div>
        </div>
        <p className="small muted">
          Share your general area. Your profile details are private by default;
          you do not need to provide a street address.
        </p>
        {error && <p role="alert">{error}</p>}
        <button className="btn" type="submit">
          {busy ? "Saving…" : "Save profile"}
        </button>
      </fieldset>
    </form>
  );
}
export function Profile({
  profile,
  busy,
  save,
  logout,
  email,
  photoUrl,
  photoLoading,
  photoError,
  retryPhoto,
  changePhoto,
  cleanupPending,
  cleanup,
  deleted,
}: Props) {
  const fieldsKey = JSON.stringify([
    profile.name,
    profile.bio,
    profile.interests,
    profile.city,
    profile.neighborhood,
  ]);
  return (
    <div className="content">
      <div className="eyebrow">THE PERSON BEHIND THE PROFILE</div>
      <h1 className="page-title">My profile</h1>
      <p className="section-intro">Let the community get to know you.</p>
      <div className="box">
        <div className="friend-row profile-heading">
          <Avatar name={profile.name} url={photoUrl} />
          <div>
            <strong>{profile.name}</strong>
            <small>{email}</small>
          </div>
        </div>
        <PhotoEditor
          hasPhoto={Boolean(profile.avatar_path)}
          busy={busy}
          loading={photoLoading}
          previewError={photoError}
          retry={retryPhoto}
          change={changePhoto}
          cleanupPending={cleanupPending}
          cleanup={cleanup}
        />
        <ProfileFields
          key={fieldsKey}
          profile={profile}
          busy={busy}
          save={save}
        />
      </div>
      <button className="btn btn-outline" onClick={logout} disabled={busy}>
        Log out
      </button>
      <DeleteAccount deleted={deleted} busy={busy} />
    </div>
  );
}
