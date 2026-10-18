import {
  useCallback,
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type FormEvent,
} from "react";
import { Layout } from "../components/Layout.tsx";
import { Modal } from "../components/Modal.tsx";
import { Discover } from "../pages/Discover.tsx";
import { MyPlans } from "../pages/MyPlans.tsx";
import { HostDesk } from "../pages/HostDesk.tsx";
import { Circle } from "../pages/Circle.tsx";
import { Auth } from "../pages/Auth.tsx";
import { DeleteAccount } from "../features/account/DeleteAccount.tsx";
import { LegalLinks } from "../components/LegalLinks.tsx";
import { useProfilePhoto } from "../hooks/useProfilePhoto.ts";
import {
  changePhoto,
  PhotoChangeError,
  removeUnusedPhoto,
} from "../features/profile/profile-api.ts";
import { useSession } from "../hooks/useSession.ts";
import { useLiveCommunity } from "../hooks/useLiveCommunity.ts";
import { authCallback, supabase } from "../lib/supabase.ts";
import { withoutAuthCallback } from "../lib/auth-callback.ts";
import * as api from "../lib/community-api.ts";
import { usePublicEvents } from "../hooks/usePublicEvents.ts";
import { EventDetails } from "../features/events/EventDetails.tsx";
import { RequestManager } from "../features/events/RequestManager.tsx";
import type {
  AuthMode,
  CommunityEvent,
  EventInput,
  Page,
  Profile as MemberProfile,
  Registration,
} from "../features/events/types.ts";

const Profile = lazy(() =>
  import("../pages/Profile.tsx").then((module) => ({
    default: module.Profile,
  })),
);
const Admin = lazy(() =>
  import("../pages/Admin.tsx").then((module) => ({ default: module.Admin })),
);
const EventForm = lazy(() =>
  import("../components/EventForm.tsx").then((module) => ({
    default: module.EventForm,
  })),
);
const CoverEditor = lazy(() =>
  import("../features/events/CoverEditor.tsx").then((module) => ({
    default: module.CoverEditor,
  })),
);

type Dialog =
  | { kind: "details" | "manage" | "edit" | "report" | "moderate"; id: string }
  | { kind: "create" | "setup" };
export function App() {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  const [page, setPage] = useState<Page>("discover"),
    [filter, setFilter] = useState("All");
  const [auth, setAuth] = useState<AuthMode | null>(() =>
      authCallback.recovery && supabase ? "update" : null,
    ),
    [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [registrations, setRegistrations] = useState<Registration[]>([]),
    [attendeeError, setAttendeeError] = useState("");
  const opener = useRef<HTMLElement | null>(null),
    locked = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onRecovery = useCallback(() => setAuth("update"), []);
  const session = useSession(onRecovery),
    user = session.user,
    live = useLiveCommunity(user?.id);
  const publicEvents = usePublicEvents(
    !user && !session.loading && !auth && !session.error,
  );
  const data = live.data;
  const events = user ? (data?.events ?? []) : publicEvents.events;
  const photo = useProfilePhoto(user?.id, live.data?.profile.avatar_path);
  const [photoCleanup, setPhotoCleanup] = useState<{
    userId: string;
    path: string;
  } | null>(null);
  const notify = useCallback((text: string) => {
    clearTimeout(timer.current);
    setMessage(text);
    timer.current = setTimeout(() => setMessage(""), 6500);
  }, []);
  // Email links survive the login screen; only already-authorised event data is used.
  const linkedEvent = useRef(new URLSearchParams(location.search).get("event"));
  const handledLink = useRef<string | null>(null);
  useEffect(() => {
    const id = linkedEvent.current;
    if (!id || auth || session.loading || live.loading || publicEvents.loading)
      return;
    if (user && !data) return;
    if (!user && !publicEvents.loaded) return;
    const identity = user?.id ?? "guest";
    if (handledLink.current === identity) return;
    handledLink.current = identity;
    if (events.some((event) => event.id === id)) {
      setDialog({ kind: "details", id });
      if (user) {
        setPage("myplans");
        linkedEvent.current = null;
      }
    } else if (user) {
      setPage("myplans");
      notify(
        "This event is no longer available. Your RSVP history is in My plans.",
      );
      linkedEvent.current = null;
    } else {
      notify(
        "Sign in with your RSVP account to view this event and your plans.",
      );
    }
  }, [
    auth,
    session.loading,
    live.loading,
    publicEvents.loading,
    publicEvents.loaded,
    user,
    data,
    events,
    notify,
  ]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    document.title = `Her Hobby Hour — Oh Sakhi! | ${page === "discover" ? "Your time. Your circle." : page === "myplans" ? "My plans" : page === "host" ? "My hosted events" : page === "circle" ? "My circle" : page === "admin" ? "Admin dashboard" : "My profile"}`;
  }, [page]);
  const open = (next: Dialog) => {
    if (!dialog) opener.current = document.activeElement as HTMLElement | null;
    setDialog(next);
  };
  const close = () => setDialog(null);
  function navigate(destination: Page) {
    if (!user && destination !== "discover") {
      login();
      return;
    }
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
  async function run(action: () => Promise<void>, rethrow = false) {
    if (locked.current) {
      if (rethrow)
        throw Error("Please wait for your current change to finish.");
      return;
    }
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
      if (rethrow) throw error;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const current =
    dialog && "id" in dialog
      ? events.find((event) => event.id === dialog.id)
      : undefined;
  const showDialog = Boolean(
    dialog && (user || dialog.kind === "details" || dialog.kind === "setup"),
  );
  const manageId = dialog?.kind === "manage" ? dialog.id : undefined;
  useEffect(() => {
    if (!user || !manageId) return;
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
            error instanceof Error
              ? error.message
              : "Unable to load attendees.",
          );
      });
    return () => {
      active = false;
    };
  }, [user, manageId]);
  const saveEvent = (input: EventInput) =>
    void run(async () => {
      if (!user) {
        login();
        return;
      }
      await api.saveEvent(
        dialog?.kind === "edit" ? current?.id : undefined,
        user.id,
        input,
      );
      await live.refresh();
      close();
      setPage("host");
      notify(
        current
          ? "Plan updated — existing RSVPs are preserved."
          : input.status === "draft"
            ? "Draft saved — only you and administrators can view it"
            : "Your event is published",
      );
    });
  const saveProfile = (profile: MemberProfile) =>
    void run(async () => {
      if (!user) {
        login();
        return;
      }
      await api.saveProfile(user.id, profile);
      await live.refresh();
      notify("Profile saved");
    });
  const changeProfilePhoto = async (image: Blob | null) => {
    if (!user || !live.data)
      throw Error("Log in to manage your profile photo.");
    const userId = user.id;
    await run(async () => {
      try {
        const changed = await changePhoto(
          userId,
          live.data!.profile.avatar_path ?? null,
          image,
        );
        setPhotoCleanup(
          changed.cleanupPath ? { userId, path: changed.cleanupPath } : null,
        );
        live.setAvatarPath(changed.path);
        notify(image ? "Profile photo saved" : "Profile photo removed");
      } catch (error) {
        if (error instanceof PhotoChangeError && error.cleanupPath)
          setPhotoCleanup({ userId, path: error.cleanupPath });
        throw error;
      }
    }, true);
  };
  const cleanupPhoto = () =>
    void run(async () => {
      if (!user || photoCleanup?.userId !== user.id) return;
      await removeUnusedPhoto(user.id, photoCleanup.path);
      setPhotoCleanup(null);
      notify("Unused photo removed");
    });
  const request = (event: CommunityEvent) => {
    if (!user) {
      login();
      return;
    }
    void run(async () => {
      await api.requestEvent(event.id);
      await live.refresh();
      notify("Your spot is confirmed");
    });
  };
  const withdrawRequest = (event: CommunityEvent) =>
    void run(async () => {
      if (!user) return;
      await api.withdrawEvent(event.id);
      await live.refresh();
      notify("RSVP cancelled; your seat has been released");
    });
  const cancel = (event: CommunityEvent) => {
    if (
      !window.confirm(
        "Cancel this plan? All RSVPs will be cancelled. Its history will be kept.",
      )
    )
      return;
    void run(async () => {
      if (!user) return;
      await api.setEventStatus(event.id, "cancelled");
      await live.refresh();
      close();
      notify("Plan cancelled");
    });
  };
  const logout = () =>
    void run(async () => {
      const { error } = await supabase!.auth.signOut();
      if (error) throw error;
      close();
      setPage("discover");
      notify("Logged out");
    });
  const accountDeleted = async () => {
    close();
    setAuth(null);
    setPage("discover");
    const { error } = await supabase!.auth.signOut({ scope: "local" });
    if (error)
      throw Error(
        "Your account was deleted. Refresh this page to clear the expired session.",
      );
    notify("Your account and associated community data have been deleted.");
  };
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
  if (session.loading)
    return (
      <div className="content" role="status">
        <h1 className="page-title">Her Hobby Hour — Oh Sakhi!</h1>
        <p>Checking your session…</p>
      </div>
    );
  if (auth || session.error)
    return (
      <>
        <Auth
          mode={
            session.error
              ? authCallback.recovery
                ? "reset"
                : "login"
              : (auth ?? "login")
          }
          initialError={session.error}
          setMode={(next) => {
            session.clearError();
            history.replaceState(
              null,
              "",
              withoutAuthCallback(new URL(location.href)),
            );
            setAuth(next);
          }}
          back={() => {
            session.clearError();
            history.replaceState(
              null,
              "",
              withoutAuthCallback(new URL(location.href)),
            );
            setAuth(null);
            setPage("discover");
          }}
          notify={notify}
        />
        {toast}
      </>
    );
  if (user && (!data || live.error))
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
        {live.error && user && <DeleteAccount deleted={accountDeleted} />}
        <LegalLinks />
        {toast}
      </div>
    );
  const create = () => (user ? open({ kind: "create" }) : login());
  return (
    <>
      <Layout
        signedIn={Boolean(user)}
        isAdmin={Boolean(user && data?.isAdmin)}
        page={user ? page : "discover"}
        name={data?.profile.name ?? ""}
        photoUrl={photo.url}
        navigate={navigate}
        create={create}
        login={login}
        modalOpen={showDialog}
      >
        {user && ["discover", "myplans", "host"].includes(page) && (
          <div className="member-refresh">
            <button
              className="link-btn"
              disabled={busy || live.loading}
              onClick={() => void live.refresh()}
            >
              {live.loading ? "Refreshing…" : "Refresh plans"}
            </button>
          </div>
        )}
        {(page === "discover" || !user) && (
          <Discover
            events={events}
            filter={filter}
            setFilter={setFilter}
            open={(id) => open({ kind: "details", id })}
            create={create}
            loading={!user && publicEvents.loading}
            error={!user ? publicEvents.error : undefined}
            retry={
              !user && supabase ? () => void publicEvents.refresh() : undefined
            }
          />
        )}
        {user && page === "myplans" && (
          <MyPlans
            events={events}
            open={(id) => open({ kind: "details", id })}
            explore={() => navigate("discover")}
          />
        )}
        {user && page === "host" && (
          <HostDesk
            events={events}
            open={(id) => open({ kind: "details", id })}
            create={create}
          />
        )}
        {user && page === "circle" && <Circle />}
        {page === "admin" &&
          (data?.isAdmin && user ? (
            <Suspense
              fallback={
                <p className="content" role="status">
                  Loading admin dashboard…
                </p>
              }
            >
              <Admin
                key={user.id}
                userId={user.id}
                communityChanged={live.refresh}
                openEvent={(id) => open({ kind: "details", id })}
              />
            </Suspense>
          ) : (
            <div className="content">
              <h1 className="page-title">Administrator access required</h1>
              <p>
                Sign in with an active administrator account to use these tools.
              </p>
              <button className="btn" onClick={() => navigate("discover")}>
                Explore events
              </button>
            </div>
          ))}
        {user && data && page === "profile" && (
          <Suspense
            fallback={
              <p className="content" role="status">
                Loading your profile…
              </p>
            }
          >
            <Profile
              profile={data.profile}
              photoUrl={photo.url}
              photoLoading={photo.loading}
              photoError={photo.error}
              retryPhoto={photo.retry}
              changePhoto={changeProfilePhoto}
              cleanupPending={Boolean(user && photoCleanup?.userId === user.id)}
              cleanup={cleanupPhoto}
              busy={busy}
              save={saveProfile}
              logout={logout}
              deleted={accountDeleted}
              email={user?.email}
            />
          </Suspense>
        )}
      </Layout>
      {dialog && showDialog && (
        <Modal
          opener={opener.current}
          title={
            dialog.kind === "setup"
              ? "Community temporarily unavailable"
              : dialog.kind === "create"
                ? "Host a plan"
                : dialog.kind === "edit"
                  ? "Edit your plan"
                  : dialog.kind === "manage"
                    ? "Attendees"
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
                Account services are temporarily unavailable. Please try again
                later or contact us.
              </p>
              <button className="btn" onClick={close}>
                Keep exploring
              </button>
            </>
          ) : dialog.kind === "create" || dialog.kind === "edit" ? (
            <Suspense fallback={<p role="status">Loading event editor…</p>}>
              <EventForm
                key={dialog.kind === "edit" ? current?.id : "new"}
                event={dialog.kind === "edit" ? current : undefined}
                busy={busy}
                save={saveEvent}
              />
              {user && dialog.kind === "edit" && current && current.is_host && (
                <CoverEditor
                  key={current.id}
                  event={current}
                  saved={(path) => live.setCoverPath(current.id, path)}
                />
              )}
            </Suspense>
          ) : dialog.kind === "details" ? (
            current && (
              <EventDetails
                signedIn={Boolean(user)}
                login={login}
                close={close}
                event={current}
                busy={busy}
                isAdmin={Boolean(live.data?.isAdmin)}
                isOrganizer={Boolean(user && current.host_id === user.id)}
                cancel={cancel}
                manage={() => open({ kind: "manage", id: current.id })}
                edit={() => open({ kind: "edit", id: current.id })}
                report={() => open({ kind: "report", id: current.id })}
                moderate={() => open({ kind: "moderate", id: current.id })}
                publish={() =>
                  void run(async () => {
                    if (!user) return;
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
                rows={registrations}
                attendeeError={attendeeError}
                edit={() => open({ kind: "edit", id: current.id })}
                back={() => open({ kind: "details", id: current.id })}
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
                Remove this event from discovery and cancel outstanding RSVPs.
                Its history will be preserved, and its organiser cannot
                republish it.
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
