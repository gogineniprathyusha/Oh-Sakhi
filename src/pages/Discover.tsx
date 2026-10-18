import { categories } from "../features/events/catalog.ts";
import type { CommunityEvent } from "../features/events/types.ts";
import { EventCard } from "../components/EventCard.tsx";
import { Empty } from "../components/Empty.tsx";
import { Bloom } from "../components/Bloom.tsx";
export function Discover({
  events,
  filter,
  setFilter,
  open,
  create,
  loading = false,
  error = "",
  retry,
}: {
  events: CommunityEvent[];
  filter: string;
  setFilter: (filter: string) => void;
  open: (id: string) => void;
  create: () => void;
  loading?: boolean;
  error?: string;
  retry?: () => void;
}) {
  const shown = events
    .filter(
      (event) =>
        (filter === "All" || event.category === filter) &&
        (!event.status || event.status === "published") &&
        Date.parse(event.starts_at ?? "") > Date.now(),
    )
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    );
  return (
    <div className="content discover-content">
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">HOBBIES ♥ FRIENDSHIPS ♥ A BRIGHTER YOU</div>
          <h1>
            A Beautiful Space
            <br />
            <i>for Her ♡</i>
          </h1>
          <p>
            Her Hobby Hour — Oh Sakhi! is a women’s lifestyle and social
            community where hobbies spark friendships, creativity meets
            conversation, and every woman finds her happy hour.
          </p>
          <button className="btn hero-cta" onClick={create}>
            Host your first experience →
          </button>
          <div className="hero-benefits">
            <span>♡ Real connections</span>
            <span>✿ Meaningful experiences</span>
            <span>♥ A happier, more you</span>
          </div>
        </div>
        <img
          className="hero-logo"
          src="/brand/hh-artwork.webp"
          alt="Her Hobby Hour artwork: a woman enjoying coffee beside the HH clock monogram"
          width="1254"
          height="1254"
          fetchPriority="high"
        />
      </section>
      <div className="heading-row">
        <div>
          <span className="eyebrow">UPCOMING EXPERIENCES · RICHMOND, VA</span>
          <h2>Create, Connect, Celebrate</h2>
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
      {error ? (
        <div className="box" role="alert">
          <p>{error}</p>
          {retry && (
            <button className="btn btn-outline" onClick={retry}>
              Try again
            </button>
          )}
        </div>
      ) : loading ? (
        <p role="status">Loading experiences…</p>
      ) : shown.length ? (
        <div className="grid">
          {shown.map((event) => (
            <EventCard key={event.id} event={event} open={open} />
          ))}
        </div>
      ) : (
        <Empty
          title="Nothing here just yet"
          description="Try a different interest, or host the first plan yourself."
          icon={<Bloom />}
        />
      )}
      <div className="box box-centered">
        <h3>Come as you are. Leave with your people.</h3>
        <p className="section-intro">
          Her Hobby Hour — Oh Sakhi! is Indian-inspired and open to women of all
          backgrounds. We’re about friendship, fresh experiences, and genuine,
          in-person connections—not dating.
        </p>
      </div>
    </div>
  );
}
