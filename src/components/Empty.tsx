import type { ReactNode } from "react";

export function Empty({
  title,
  description,
  emoji = "♡",
  icon,
}: {
  title: string;
  description: string;
  emoji?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="big" aria-hidden="true">
        {icon ?? emoji}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
