import { categories } from "../lib/demo-store.ts";
import type { CommunityEvent } from "../features/events/types.ts";
import { EventCard } from "../components/EventCard.tsx";
import { Empty } from "../components/Empty.tsx";
export function Discover({
  events,
  filter,
  setFilter,
  open,
  create,
  demo,
}: {
  events: CommunityEvent[];
  filter: string;
  setFilter: (filter: string) => void;
  open: (id: string) => void;
  create: () => void;
  demo: boolean;
}) {
  const shown = events
    .filter(
      (event) =>
        (filter === "All" || event.category === filter) &&
        (!event.status || event.status === "published"),
    )
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    );
  return (
    <div className="content">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">A COMMUNITY FOR WOMEN · RICHMOND, VA</div>
          <h1>
            Good things happen
            <br />
            when women <i>connect.</i>
          </h1>
          <p>
            Less scrolling, more living. Discover small-group experiences, make
            meaningful connections, and find your kind of people.
          </p>
        </div>
      </section>
      <div className="heading-row">
        <div>
          <span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span>
          <h2>Find your next plan</h2>
        </div>
        <button className="btn btn-outline" onClick={create}>
          + Create a plan
        </button>
      </div>
      <div className="filters" role="group" aria-label="Filter experiences">
        {["All", ...categories].map((category) => (
          <button
            key={category}
            className={`chip ${filter === category ? "active" : ""}`}
            aria-pressed={filter === category}
            onClick={() => setFilter(category)}
          >
            {category === "All" ? "All experiences" : category}
          </button>
        ))}
      </div>
      {shown.length ? (
        <div className="grid">
          {shown.map((event) => (
            <EventCard key={event.id} event={event} open={open} />
          ))}
        </div>
      ) : (
        <Empty
          title="Nothing here just yet"
          description="Try a different interest, or host the first plan yourself."
          emoji="✳"
        />
      )}
      <div className="box">
        <h3>Come as you are. Leave with your people.</h3>
        <p className="section-intro">
          Her Hour — Oh Sakhi! is Indian-inspired and open to women of all
          backgrounds. We’re about friendship, fresh experiences, and genuine,
          in-person connections—not dating.
        </p>
      </div>
      {demo && (
        <p className="small muted">
          Sample dates, hosts and availability are illustrative. These meetups
          are not confirmed events.
        </p>
      )}
    </div>
  );
}
