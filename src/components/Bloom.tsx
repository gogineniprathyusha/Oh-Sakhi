/** Brand artwork stays a vector instead of depending on a device's emoji font. */
export function Bloom({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`bloom ${className}`.trim()}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width="1em"
      height="1em"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M50 4v92M4 50h92M17.5 17.5l65 65M17.5 82.5l65-65"
        stroke="currentColor"
        strokeWidth="9"
      />
    </svg>
  );
}
