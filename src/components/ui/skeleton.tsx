/**
 * A loading skeleton block (M7). A calm pulse on the overlay tint; the caller
 * supplies size/shape/display via `className` (e.g. `h-4 w-16 rounded`). The
 * pulse is `aria-hidden` and the global reduced-motion rule stills it.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`animate-pulse bg-surface-overlay ${className}`}
    />
  );
}
