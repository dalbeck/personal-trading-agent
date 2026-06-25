import Link from "next/link";

/**
 * A one-line pointer shown on an empty surface so an *unstarted* desk doesn't
 * read as broken. The dashboard is event-driven — News/Proposals/Coaching only
 * fill in once the scout and routines run — so an empty panel says so and points
 * at where to start things.
 */
export function RunHint({
  message,
  href,
  cta,
}: {
  message: string;
  href?: string;
  cta?: string;
}) {
  return (
    <p className="mt-3 text-pretty text-xs text-fg-muted">
      {message}
      {href && cta ? (
        <>
          {" "}
          <Link
            href={href}
            className="font-medium text-fg underline-offset-2 hover:underline"
          >
            {cta}
          </Link>
        </>
      ) : null}
    </p>
  );
}
