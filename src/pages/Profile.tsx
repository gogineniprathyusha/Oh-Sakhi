import { useState, type FormEvent } from "react";
import type { Profile as MemberProfile } from "../features/events/types.ts";
export function Profile({
  profile,
  demo,
  busy,
  save,
  reset,
  login,
  logout,
  email,
}: {
  profile: MemberProfile;
  demo: boolean;
  busy: boolean;
  save: (profile: MemberProfile) => void;
  reset: () => void;
  login: () => void;
  logout: () => void;
  email?: string;
}) {
  const [error, setError] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      name = String(data.get("name")).trim();
    if (!name) {
      setError("Please enter a display name.");
      return;
    }
    save({
      name,
      bio: String(data.get("bio")).trim(),
      interests: String(data.get("interests"))
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 12),
      city: String(data.get("city") ?? "Richmond"),
      neighborhood: profile.neighborhood ?? "",
    });
  };
  return (
    <div className="content">
      <div className="eyebrow">THE PERSON BEHIND THE PROFILE</div>
      <h1 className="page-title">My profile</h1>
      <p className="section-intro">Let the community get to know you.</p>
      <div className="box">
        <div className="friend-row demo-profile-heading">
          <span className="avatar">{profile.name.charAt(0).toUpperCase()}</span>
          <div>
            <strong>{profile.name}</strong>
            <small>
              {demo ? "📍 Richmond, VA · Demo community profile" : email}
            </small>
          </div>
        </div>
        <form key={`${profile.name}:${profile.bio}`} onSubmit={submit}>
          <div className="field">
            <label htmlFor="profile-name">
              Your first name or display name
            </label>
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
          {!demo && (
            <>
              <p className="small muted">
                Use supported interests such as Coffee, Brunch, Fitness, Hiking,
                Books, Art, Fashion, Cultural experiences, Wellness, Networking
                and Seasonal activities.
              </p>
              <div className="field">
                <label htmlFor="profile-city">City</label>
                <input
                  id="profile-city"
                  name="city"
                  maxLength={80}
                  defaultValue={profile.city ?? "Richmond"}
                />
              </div>
            </>
          )}
          {error && <p role="alert">{error}</p>}
          <button className="btn" type="submit" disabled={busy}>
            Save profile
          </button>
        </form>
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
        <button className="btn btn-outline" onClick={logout}>
          Log out
        </button>
      )}
    </div>
  );
}
