"use client";

import { useMemo, useState } from "react";
import {
  formatCurrency,
  formatPercent,
  formatQty,
  toneForValue,
} from "@/lib/format";
import { TickerLink } from "@/components/ticker-link";
import type { Position } from "@/lib/types";

type SortKey =
  | "symbol"
  | "qty"
  | "avgCost"
  | "lastPrice"
  | "marketValue"
  | "unrealizedPl"
  | "unrealizedPlPct";

type Column = {
  key: SortKey;
  label: string;
  numeric: boolean;
};

const COLUMNS: Column[] = [
  { key: "symbol", label: "Symbol", numeric: false },
  { key: "qty", label: "Qty", numeric: true },
  { key: "avgCost", label: "Avg cost", numeric: true },
  { key: "lastPrice", label: "Last", numeric: true },
  { key: "marketValue", label: "Mkt value", numeric: true },
  { key: "unrealizedPl", label: "Unreal. P&L", numeric: true },
  { key: "unrealizedPlPct", label: "Unreal. %", numeric: true },
];

export function PositionsTable({ positions }: { positions: Position[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const rows = [...positions];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [positions, sortKey, dir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir(key === "symbol" ? "asc" : "desc");
    }
  }

  return (
    <div className="overflow-x-auto rounded-card border border-line">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-raised">
            {COLUMNS.map((col) => {
              const active = col.key === sortKey;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={
                    active
                      ? dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  className={`px-4 py-2.5 font-medium text-fg-muted ${
                    col.numeric ? "text-right" : "text-left"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={`inline-flex items-center gap-1 rounded transition-colors hover:text-fg ${
                      col.numeric ? "flex-row-reverse" : ""
                    } ${active ? "text-fg" : ""}`}
                  >
                    {col.label}
                    <span aria-hidden className="text-[0.65rem]">
                      {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const tone = toneForValue(p.unrealizedPl);
            const toneClass =
              tone === "gain"
                ? "text-gain"
                : tone === "loss"
                  ? "text-loss"
                  : "text-fg";
            return (
              <tr
                key={p.symbol}
                className="border-b border-line last:border-0 hover:bg-surface-overlay"
              >
                <td className="px-4 py-3 font-medium text-fg">
                  <TickerLink symbol={p.symbol} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">
                  {formatQty(p.qty)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">
                  {formatCurrency(p.avgCost)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">
                  {formatCurrency(p.lastPrice)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg">
                  {formatCurrency(p.marketValue)}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums ${toneClass}`}>
                  {formatCurrency(p.unrealizedPl, { signed: true })}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums ${toneClass}`}>
                  {formatPercent(p.unrealizedPlPct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
