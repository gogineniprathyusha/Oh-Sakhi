import type { CommunityEvent } from "../features/events/types.ts";
import { status } from "../lib/demo-store.ts";
import { EventCard } from "../components/EventCard.tsx";
import { Empty } from "../components/Empty.tsx";
export function MyPlans({
  events,
  open,
  explore,
  demo,
}: {
  events: CommunityEvent[];
  open: (id: string) => void;
  explore: () => void;
  demo: boolean;
}) {
  const plans = events
    .filter((event) => status(event) !== "none")
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <div className="content">
      <div className="eyebrow">YOUR HER HOUR — OH SAKHI! JOURNEY</div>
      <h1 className="page-title">My plans</h1>
      <p className="section-intro">
        Your upcoming experiences and join requests in one place.
      </p>
      {demo && (
        <p className="small muted">
          This is your demo itinerary. No real spots are reserved.
        </p>
      )}
      <div className="statrow">
        {[
          ["going", "Going"],
          ["pending", "Requests pending"],
          ["hosting", "Hosting"],
        ].map(([value, label]) => (
          <div className="stat" key={value}>
            <strong>
              {plans.filter((event) => status(event) === value).length}
            </strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {plans.length ? (
        <div className="grid">
          {plans.map((event) => (
            <EventCard key={event.id} event={event} open={open} />
          ))}
        </div>
      ) : (
        <Empty
          title="The best plans are still ahead"
          description="Discover an experience that sounds like you."
          emoji="☕"
        />
      )}
      <button className="btn explore-button" onClick={explore}>
        Explore experiences
      </button>
    </div>
  );
}
