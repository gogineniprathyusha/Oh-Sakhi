import { Avatar } from "./Avatar.tsx";
import { LegalLinks } from "./LegalLinks.tsx";
import type { ReactNode } from "react";
import type { Page } from "../features/events/types.ts";
interface Props {
  signedIn: boolean;
  isAdmin?: boolean;
  page: Page;
  name: string;
  photoUrl?: string;
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
  ["admin", "⚑", "Admin"],
];
export function Layout({
  signedIn,
  isAdmin = false,
  page,
  name,
  photoUrl,
  navigate,
  create,
  login,
  children,
  modalOpen,
}: Props) {
  const navigation = (mobile = false) =>
    items
      .filter(([key]) => key !== "admin" || (signedIn && isAdmin))
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
      <a className="skip-link" href="#view" inert={modalOpen}>
        Skip to content
      </a>
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
              {signedIn ? (
                <Avatar
                  name={name}
                  url={photoUrl}
                  id="top-avatar"
                  label="My profile"
                />
              ) : (
                <button className="link-btn" onClick={login}>
                  Log in / Join
                </button>
              )}
              <button
                className="btn btn-small"
                id="header-create"
                onClick={create}
              >
                + Host a plan
              </button>
            </div>
          </header>
          <main id="view" tabIndex={-1}>
            {children}
          </main>
          <footer className="community-footer">
            <LegalLinks />
            <p className="small muted">
              Her Hour — Oh Sakhi! · Richmond, Virginia
            </p>
          </footer>
        </div>
        <nav className="mobile-nav" aria-label="Community">
          {navigation(true)}
        </nav>
      </div>
    </>
  );
}
