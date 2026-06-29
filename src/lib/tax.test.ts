import { describe, expect, it } from "vitest";
import {
  daysHeld,
  isLongTerm,
  nearLongTermSellNote,
  splitUnrealizedByTerm,
  washSaleWarning,
  type WashSaleEntry,
} from "./tax";

const ASOF = "2026-06-28T16:00:00-04:00";

describe("holding period", () => {
  it("counts calendar days held (never negative)", () => {
    expect(daysHeld("2026-06-18T16:00:00-04:00", ASOF)).toBe(10);
    expect(daysHeld("2026-07-01T16:00:00-04:00", ASOF)).toBe(0); // future open
  });

  it("marks a lot long-term only past 365 days", () => {
    expect(isLongTerm("2025-06-01T00:00:00-04:00", ASOF)).toBe(true); // ~392d
    expect(isLongTerm("2026-01-01T00:00:00-04:00", ASOF)).toBe(false); // ~178d
  });
});

describe("splitUnrealizedByTerm", () => {
  it("buckets unrealized P&L into long- vs short-term", () => {
    const split = splitUnrealizedByTerm(
      [
        { openedAt: "2024-06-01T00:00:00-04:00", unrealizedPl: 1200 }, // LT gain
        { openedAt: "2026-05-01T00:00:00-04:00", unrealizedPl: -300 }, // ST loss
        { openedAt: "2026-06-01T00:00:00-04:00", unrealizedPl: 150 }, // ST gain
      ],
      ASOF,
    );
    expect(split.longTermUnrealizedUsd).toBe(1200);
    expect(split.longTermPositions).toBe(1);
    expect(split.shortTermUnrealizedUsd).toBe(-150);
    expect(split.shortTermPositions).toBe(2);
  });
});

describe("washSaleWarning", () => {
  const journal: WashSaleEntry[] = [
    { symbol: "AAPL", action: "buy", timestamp: "2026-06-20T10:00:00-04:00" },
    { symbol: "MSFT", action: "sell", timestamp: "2026-06-15T10:00:00-04:00", realizedLoss: true },
    { symbol: "KO", action: "buy", timestamp: "2026-03-01T10:00:00-04:00" }, // >30d ago
  ];

  it("warns on a loss sale with a same-symbol buy within 30 days", () => {
    const w = washSaleWarning({ symbol: "AAPL", action: "sell", realizesLoss: true, asOf: ASOF, journal });
    expect(w?.reason).toMatch(/wash sale/i);
  });

  it("does NOT warn when the sell is at a gain", () => {
    expect(
      washSaleWarning({ symbol: "AAPL", action: "sell", realizesLoss: false, asOf: ASOF, journal }),
    ).toBeNull();
  });

  it("warns on a buy when there was a loss sale of the symbol within 30 days", () => {
    const w = washSaleWarning({ symbol: "MSFT", action: "buy", realizesLoss: false, asOf: ASOF, journal });
    expect(w?.reason).toMatch(/wash-sale rule/i);
  });

  it("does NOT warn when the prior buy/sale is older than 30 days", () => {
    expect(
      washSaleWarning({ symbol: "KO", action: "sell", realizesLoss: true, asOf: ASOF, journal }),
    ).toBeNull();
  });

  it("flags a buy when a recent sale's loss status is unknown (advisory 'may')", () => {
    const j: WashSaleEntry[] = [
      { symbol: "T", action: "sell", timestamp: "2026-06-18T10:00:00-04:00" }, // realizedLoss undefined
    ];
    expect(
      washSaleWarning({ symbol: "T", action: "buy", realizesLoss: false, asOf: ASOF, journal: j })
        ?.reason,
    ).toMatch(/wash-sale rule/i);
  });

  it("does NOT flag a buy when the recent sale was a known gain", () => {
    const j: WashSaleEntry[] = [
      { symbol: "T", action: "sell", timestamp: "2026-06-18T10:00:00-04:00", realizedLoss: false },
    ];
    expect(
      washSaleWarning({ symbol: "T", action: "buy", realizesLoss: false, asOf: ASOF, journal: j }),
    ).toBeNull();
  });
});

describe("nearLongTermSellNote", () => {
  it("flags a gain lot within ~a month of the long-term line", () => {
    // Opened ~350 days ago → ~16 days short of long-term.
    const note = nearLongTermSellNote({
      openedAt: "2025-07-13T16:00:00-04:00",
      asOf: ASOF,
      hasGain: true,
    });
    expect(note).toMatch(/short of long-term/i);
  });

  it("does not flag a loss lot, or one far from the line", () => {
    expect(
      nearLongTermSellNote({ openedAt: "2025-07-13T16:00:00-04:00", asOf: ASOF, hasGain: false }),
    ).toBeNull();
    expect(
      nearLongTermSellNote({ openedAt: "2026-06-01T16:00:00-04:00", asOf: ASOF, hasGain: true }),
    ).toBeNull(); // only ~27 days held, far from 365
  });

  it("does not flag a lot already long-term", () => {
    expect(
      nearLongTermSellNote({ openedAt: "2024-01-01T16:00:00-04:00", asOf: ASOF, hasGain: true }),
    ).toBeNull();
  });
});
