export function Empty({
  title,
  description,
  emoji = "♡",
}: {
  title: string;
  description: string;
  emoji?: string;
}) {
  return (
    <div className="empty">
      <div className="big" aria-hidden="true">
        {emoji}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
