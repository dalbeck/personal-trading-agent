"use client";

import { formatCompactNumber } from "@/lib/format";
import {
  researchNote,
  useSymbolResearch,
} from "@/components/symbol/research-context";

/**
 * Right-rail company profile. The symbol is always known; every other field is
 * **Perplexity** (`finance_search`) and shows "—" until the auto-loaded research
 * resolves, or a short note when it's off / capped. Profile / context only.
 */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-fg-muted">
        {label}
      </dt>
      <dd className="text-right text-sm tabular-nums text-fg">{value}</dd>
    </div>
  );
}

export function CompanyProfileRail({ symbol }: { symbol: string }) {
  const research = useSymbolResearch();
  const loading = research.status === "loading";
  const profile = research.status === "loaded" ? research.result.profile : null;
  const note = researchNote(research);

  const v = (s: string | null) => (loading ? "…" : (s ?? "—"));
  const employees =
    profile?.employees != null ? formatCompactNumber(profile.employees) : null;

  return (
    <aside
      aria-labelledby="profile-heading"
      className="rounded-card border border-line bg-surface-raised p-5"
    >
      <h2 id="profile-heading" className="text-sm font-semibold text-fg">
        Company profile
      </h2>

      <dl className="mt-3 divide-y divide-line">
        <Row label="Symbol" value={symbol} />
        <Row label="Exchange" value={v(profile?.exchange ?? null)} />
        <Row label="Sector" value={v(profile?.sector ?? null)} />
        <Row label="Industry" value={v(profile?.industry ?? null)} />
        <Row label="CEO" value={v(profile?.ceo ?? null)} />
        <Row label="Employees" value={loading ? "…" : (employees ?? "—")} />
        <Row label="Country" value={v(profile?.country ?? null)} />
        <Row label="IPO date" value={v(profile?.ipoDate ?? null)} />
      </dl>

      {profile?.description ? (
        <p className="mt-3 border-t border-line pt-3 text-pretty text-sm leading-relaxed text-fg-muted">
          {profile.description}
        </p>
      ) : null}

      {note ? <p className="mt-3 text-xs text-fg-muted">{note}</p> : null}

      <p className="mt-3 border-t border-line pt-3 text-xs text-fg-muted">
        Profile via <span className="font-medium">Perplexity</span> finance_search
        — context only.
      </p>
    </aside>
  );
}
