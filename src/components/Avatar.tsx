import { useState } from "react";
export function Avatar({
  name,
  url,
  id,
  label,
  className = "",
}: {
  name: string;
  url?: string;
  id?: string;
  label?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState<string>();
  return (
    <span
      className={`avatar ${className}`}
      id={id}
      role="img"
      aria-label={label ?? `${name}'s profile photo`}
    >
      {url && failed !== url ? (
        <img src={url} alt="" onError={() => setFailed(url)} />
      ) : (
        name.trim().charAt(0).toUpperCase() || "S"
      )}
    </span>
  );
}
