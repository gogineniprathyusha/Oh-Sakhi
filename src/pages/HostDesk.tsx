import type { CommunityEvent } from "../features/events/types.ts";
import { EventCard } from "../components/EventCard.tsx";
import { Empty } from "../components/Empty.tsx";
export function HostDesk({
  events,
  open,
  create,
}: {
  events: CommunityEvent[];
  open: (id: string) => void;
  create: () => void;
}) {
  const hosted = events.filter((event) => event.is_host);
  return (
    <div className="content">
      <span className="eyebrow">YOUR HOSTING SPACE</span>
      <h1 className="page-title">Host dashboard</h1>
      <p className="section-intro">
        Publish and edit your own events, see confirmed attendees.
      </p>
      <div className="heading-row">
        <h2>Your experiences</h2>
        <button className="btn" onClick={create}>
          + Host an experience
        </button>
      </div>
      {hosted.length ? (
        <div className="grid">
          {hosted.map((event) => (
            <EventCard key={event.id} event={event} open={open} />
          ))}
        </div>
      ) : (
        <Empty
          title="Your first gathering starts here"
          description="Create an experience to start welcoming attendees."
          emoji="☕"
        />
      )}
      <div className="box">
        <h3>Before you host</h3>
        <p className="section-intro">
          Meet in public venues and keep attendees informed of changes. RSVPs
          are confirmed automatically; administrators can remove events for
          community violations.
        </p>
      </div>
    </div>
  );
}
