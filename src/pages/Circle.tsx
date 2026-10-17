import { Empty } from "../components/Empty.tsx";
export function Circle() {
  return (
    <div className="content">
      <div className="eyebrow">PEOPLE MAKE THE PLACE</div>
      <h1 className="page-title">My circle</h1>
      <p className="section-intro">
        Meaningful friendships start with shared experiences. After attending a
        meetup, you can add people you connected with.
      </p>
      <div className="box">
        <h3>Building friendships, not followers.</h3>
        <p className="section-intro">
          Connection requests and private messaging are not implemented yet.
          They need verified accounts, real event attendance and moderation
          tools. Your privacy comes first.
        </p>
        <Empty
          title="Your circle starts here"
          description="Join an experience and start making memories together."
        />
      </div>
    </div>
  );
}
