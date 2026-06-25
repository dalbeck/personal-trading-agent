"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  formatCountdown,
  formatCountdownVerbose,
  formatEtDateLong,
  formatEtTime,
  sameEtDay,
} from "@/lib/market-status";

/**
 * Header market-status pill. Shows whether the US equity market is open and the
 * time to the next boundary (next close when open, next open when closed). The
 * countdown ticks **locally** off the boundary timestamps the server resolved
 * from Alpaca's calendar, so it's accurate regardless of the machine's clock.
 *
 * The prop shape is declared locally on purpose: this is a client component and
 * must not import the `server-only` market module (it would throw at build).
 */
export interface MarketStatusView {
  isOpen: boolean;
  nextOpen: string | null;
  nextClose: string | null;
  sessionOpen: string | null;
  sessionClose: string | null;
  isHalfDay: boolean;
  holidayName: string | null;
  /** True when the regular-hours fallback stands in (no Alpaca creds). */
  approx: boolean;
}

// A clock store: notifies on a 30s cadence and buckets `now` so the snapshot is
// stable between ticks (a fresh value every render would loop). The server
// snapshot is null so SSR renders no countdown and hydration can't mismatch —
// useSyncExternalStore reconciles to the live value right after mount.
function subscribeClock(onChange: () => void) {
  const id = setInterval(onChange, 30_000);
  return () => clearInterval(id);
}
function clockBucket(): number {
  return Math.floor(Date.now() / 30_000);
}
function clockServerSnapshot(): number | null {
  return null;
}

export function MarketStatusPill({ initial }: { initial: MarketStatusView }) {
  const [status, setStatus] = useState<MarketStatusView>(initial);
  const bucket = useSyncExternalStore(
    subscribeClock,
    clockBucket,
    clockServerSnapshot,
  );
  const mounted = bucket !== null;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/market/status", { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as MarketStatusView);
    } catch {
      /* keep the last good snapshot on a transient failure */
    }
  }, []);

  const boundaryIso = status.isOpen ? status.nextClose : status.nextOpen;
  const boundaryMs = boundaryIso ? new Date(boundaryIso).getTime() : null;

  // Periodic safety refresh (calendar rollover, next-day boundaries) plus an
  // immediate refresh once the active boundary elapses so the pill flips.
  // setState happens inside the interval/promise callbacks, never in render.
  useEffect(() => {
    const id = setInterval(() => {
      if (boundaryMs !== null && Date.now() >= boundaryMs) refresh();
    }, 30_000);
    const safety = setInterval(refresh, 5 * 60_000);
    return () => {
      clearInterval(id);
      clearInterval(safety);
    };
  }, [boundaryMs, refresh]);

  // Drive all clock-dependent display off the store bucket (a pure render
  // input), not Date.now() — and only once mounted, so SSR/hydration agree.
  const nowMs = mounted ? bucket * 30_000 : null;
  const remainingMs =
    nowMs !== null && boundaryMs !== null ? boundaryMs - nowMs : null;
  const countdown = remainingMs !== null ? formatCountdown(remainingMs) : null;
  const countdownVerbose =
    remainingMs !== null ? formatCountdownVerbose(remainingMs) : null;

  // Visible secondary clause: "closes 4:00 PM" / "opens 9:30 AM" / "opens Mon 9:30 AM".
  let clause = "";
  if (nowMs !== null && status.isOpen && status.nextClose) {
    clause = `closes ${formatEtTime(status.nextClose)}`;
  } else if (nowMs !== null && !status.isOpen && status.nextOpen) {
    const sameDay = sameEtDay(status.nextOpen, new Date(nowMs));
    const time = formatEtTime(status.nextOpen);
    clause = sameDay
      ? `opens ${time}`
      : `opens ${formatEtDateLong(status.nextOpen)} ${time}`;
  }

  const ariaLabel = buildAriaLabel(status, countdownVerbose);
  const title = status.approx
    ? "Regular hours only — Alpaca calendar unavailable, so holidays and half-days aren't reflected."
    : status.holidayName
      ? `Market holiday: ${status.holidayName}`
      : status.isHalfDay && status.isOpen
        ? "Half day — early close"
        : undefined;

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-pill border border-line px-2.5 py-1 text-xs font-medium text-fg-muted"
    >
      <span
        aria-hidden
        className={`size-1.5 shrink-0 rounded-pill ${
          status.isOpen ? "bg-gain" : "bg-loss"
        }`}
      />
      <span aria-hidden className="font-semibold text-fg">
        {status.isOpen ? "Open" : "Closed"}
      </span>
      {clause && (
        <span aria-hidden className="hidden sm:inline">
          · {clause}
        </span>
      )}
      {countdown && (
        <span aria-hidden className="tabular-nums text-fg">
          · {countdown}
        </span>
      )}
      {status.approx && (
        <span
          aria-hidden
          className="ml-0.5 text-[10px] font-semibold uppercase tracking-wide text-fg-muted/70"
        >
          approx
        </span>
      )}
    </span>
  );
}

function buildAriaLabel(
  status: MarketStatusView,
  countdownVerbose: string | null,
): string {
  const tail = countdownVerbose
    ? status.isOpen
      ? `, closes in ${countdownVerbose}`
      : `, opens in ${countdownVerbose}`
    : "";
  const head = status.isOpen
    ? "Market open"
    : status.holidayName
      ? `Market closed for ${status.holidayName}`
      : "Market closed";
  const approx = status.approx ? " (approximate, regular hours only)" : "";
  return `${head}${tail}${approx}`;
}
