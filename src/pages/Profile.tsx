import { useState, type FormEvent } from "react";
import type { Profile as MemberProfile } from "../features/events/types.ts";
import { Avatar } from "../components/Avatar.tsx";
import { InterestPicker } from "../features/profile/InterestPicker.tsx";
import { PhotoEditor } from "../features/profile/PhotoEditor.tsx";
interface Props {
  profile: MemberProfile;
  demo: boolean;
  busy: boolean;
  save: (profile: MemberProfile) => void;
  reset: () => void;
  login: () => void;
  logout: () => void;
  email?: string;
  photoUrl?: string;
  photoLoading: boolean;
  photoError: string;
  retryPhoto: () => void;
  changePhoto: (image: Blob | null) => Promise<void>;
  cleanupPending: boolean;
  cleanup: () => void;
}
function ProfileFields({
  profile,
  demo,
  busy,
  save,
}: Pick<Props, "profile" | "demo" | "busy" | "save">) {
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
    const chosen = demo
      ? String(data.get("interests") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : interests;
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
        {demo ? (
          <div className="field">
            <label htmlFor="profile-interests">
              Interests (separate with commas)
            </label>
            <input
              id="profile-interests"
              name="interests"
              maxLength={250}
              defaultValue={profile.interests.join(", ")}
            />
          </div>
        ) : (
          <InterestPicker
            selected={interests}
            change={setInterests}
            disabled={busy}
          />
        )}
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
  demo,
  busy,
  save,
  reset,
  login,
  logout,
  email,
  photoUrl,
  photoLoading,
  photoError,
  retryPhoto,
  changePhoto,
  cleanupPending,
  cleanup,
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
        <div className="friend-row demo-profile-heading">
          <Avatar name={profile.name} url={photoUrl} />
          <div>
            <strong>{profile.name}</strong>
            <small>
              {demo ? "📍 Richmond, VA · Demo community profile" : email}
            </small>
          </div>
        </div>
        {!demo ? (
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
        ) : (
          <p className="small muted">
            Photo uploads are available after you log in to a real account.
          </p>
        )}
        <ProfileFields
          key={fieldsKey}
          profile={profile}
          demo={demo}
          busy={busy}
          save={save}
        />
      </div>
      {demo ? (
        <>
          <p className="small muted">
            Demo only. Changes stay in this browser. Real profiles, hosting and
            RSVPs require Supabase and a signed-in account. Demo data is never
            copied into a real account.
          </p>
          <div className="detail-actions">
            <button className="link-btn" onClick={reset}>
              Reset demo data
            </button>
            <button className="link-btn" onClick={login}>
              Log in / Create a real account
            </button>
          </div>
        </>
      ) : (
        <button className="btn btn-outline" onClick={logout} disabled={busy}>
          Log out
        </button>
      )}
    </div>
  );
}
