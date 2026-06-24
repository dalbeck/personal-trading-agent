/** Non-blocking banner shown when seed/sample data stands in for live data. */
export function DataSourceNotice({ notice }: { notice: string | null }) {
  if (!notice) return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-card border border-line bg-surface-raised px-4 py-2.5 text-sm text-fg-muted"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-pill bg-fg-muted/60" />
      {notice}
    </div>
  );
}
