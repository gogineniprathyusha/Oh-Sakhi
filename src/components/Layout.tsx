import type { ReactNode } from "react";
import type { Page } from "../features/events/types.ts";
interface Props {
  demo: boolean;
  page: Page;
  name: string;
  navigate: (page: Page) => void;
  create: () => void;
  login: () => void;
  children: ReactNode;
  modalOpen: boolean;
}
const items: [Page, string, string][] = [
  ["discover", "⌕", "Discover"],
  ["myplans", "♡", "My plans"],
  ["host", "▦", "Host desk"],
  ["circle", "✧", "My circle"],
  ["profile", "◯", "My profile"],
];
export function Layout({
  demo,
  page,
  name,
  navigate,
  create,
  login,
  children,
  modalOpen,
}: Props) {
  const navigation = (mobile = false) =>
    items
      .filter(([key]) => !demo || key !== "host")
      .map(([key, icon, label]) => (
        <button
          key={key}
          className={`${mobile ? "" : "nav "}${page === key ? "active" : ""}`}
          data-page={key}
          aria-current={page === key ? "page" : undefined}
          onClick={() => navigate(key)}
        >
          {icon}
          {mobile ? (
            <small>{label}</small>
          ) : (
            <>
              {" "}
              <span>{label}</span>
            </>
          )}
        </button>
      ));
  const home = (event: React.MouseEvent) => {
    event.preventDefault();
    navigate("discover");
  };
  return (
    <>
      {demo && (
        <div className="demo-banner" role="status" inert={modalOpen}>
          ✳ DEMO MODE — sample meetups only; changes stay in this browser. No
          real accounts or bookings.{" "}
          <button className="demo-login" onClick={login}>
            Log in / Join
          </button>
        </div>
      )}
      <div className="app-shell" inert={modalOpen}>
        <aside className="sidebar">
          <a className="brand" href="#discover" onClick={home}>
            <span className="brand-flower">✳</span>
            <span>
              her <i>hour</i>
              <small>oh sakhi! · your time, your circle</small>
            </span>
          </a>
          <div className="menu-title">YOUR COMMUNITY</div>
          <nav aria-label="Community">{navigation()}</nav>
          <div className="side-bottom">
            <div className="location">📍 Richmond, Virginia</div>
            <div className="side-note">
              Your time.
              <br />
              Your people.
              <br />
              <em>Your kind of magic.</em>
            </div>
          </div>
        </aside>
        <div className="main">
          <header className="topbar">
            <a className="mobile-brand" href="#discover" onClick={home}>
              ✳ her <i>hour</i>
            </a>
            <span className="top-location">📍 Richmond, VA</span>
            <div className="top-actions">
              <span
                className="avatar"
                id="top-avatar"
                aria-label={demo ? "Demo profile" : "My profile"}
              >
                {name.trim().charAt(0).toUpperCase() || "S"}
              </span>
              <button
                className="btn btn-small"
                id="header-create"
                onClick={create}
              >
                + Host a plan
              </button>
            </div>
          </header>
          <main id="view" aria-live="polite">
            {children}
          </main>
        </div>
        <nav className="mobile-nav" aria-label="Community">
          {navigation(true)}
        </nav>
      </div>
    </>
  );
}
