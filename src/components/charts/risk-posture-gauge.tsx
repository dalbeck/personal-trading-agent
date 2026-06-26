import type { PostureLevel } from "@/lib/risk-posture";

/**
 * Risk-posture gauge (M6): a single gradient arc (teal → amber → red) that
 * fills to the score via `stroke-dasharray` on a `pathLength={100}` path, a
 * glowing indicator dot riding the arc at the reading, and the score + level
 * read out in the center well. Driven entirely by `score` (0–100), so the same
 * component renders the full and compact variants. Pure SVG + an HTML overlay;
 * the headline score is the **serif** display voice (Fraunces), the level label
 * stays sans (see `.agents/design-system.md` → Type).
 *
 * Accessible: `role="img"` with a full text-equivalent label; the visible
 * readout repeats it. The fill has a ≤200ms transition that reduced-motion
 * disables (global rule).
 */
const CX = 110;
const CY = 110;
const R = 92;
const ARC = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;

const levelVar: Record<PostureLevel, string> = {
  Conservative: "var(--gauge-low)",
  Moderate: "var(--gauge-mid)",
  Aggressive: "var(--gauge-high)",
};

export function RiskPostureGauge({
  score,
  level,
  summary,
  compact = false,
}: {
  score: number;
  level: PostureLevel;
  summary?: string;
  compact?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const theta = (Math.PI / 180) * 180 * (1 - clamped / 100);
  const dotX = CX + R * Math.cos(theta);
  const dotY = CY - R * Math.sin(theta);
  const color = levelVar[level];
  const stroke = compact ? 12 : 15;
  const label = `Risk posture: ${level}, ${score} of 100.${
    summary ? ` ${summary}` : ""
  }`;

  return (
    <div
      className={`relative mx-auto ${compact ? "w-[132px]" : "w-full max-w-[300px]"}`}
    >
      <svg viewBox="0 0 220 126" className="w-full" role="img" aria-label={label}>
        <defs>
          <linearGradient
            id="posture-grad"
            gradientUnits="userSpaceOnUse"
            x1={CX - R}
            y1="0"
            x2={CX + R}
            y2="0"
          >
            <stop offset="0%" stopColor="var(--gauge-low)" />
            <stop offset="50%" stopColor="var(--gauge-mid)" />
            <stop offset="100%" stopColor="var(--gauge-high)" />
          </linearGradient>
          <filter
            id="posture-glow"
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
          >
            <feGaussianBlur stdDeviation="3.4" />
          </filter>
        </defs>

        <path
          d={ARC}
          pathLength={100}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d={ARC}
          pathLength={100}
          fill="none"
          stroke="url(#posture-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${clamped} 100`}
          className="[transition:stroke-dasharray_200ms_ease-out]"
        />

        {/* glow + indicator dot riding the arc at the reading */}
        <circle cx={dotX} cy={dotY} r={9} fill={color} opacity={0.45} filter="url(#posture-glow)" />
        <circle
          cx={dotX}
          cy={dotY}
          r={compact ? 5 : 6}
          fill="var(--color-surface-raised)"
          stroke={color}
          strokeWidth={3}
        />
      </svg>

      <div
        className={`pointer-events-none absolute inset-x-0 flex flex-col items-center ${
          compact ? "bottom-[6%]" : "bottom-[12%]"
        }`}
      >
        <span
          className={`font-serif font-semibold leading-none tabular-nums text-fg ${
            compact ? "text-2xl" : "text-[2.75rem]"
          }`}
        >
          {score}
        </span>
        <span
          className={`font-medium ${compact ? "mt-0.5 text-[0.7rem]" : "mt-1.5 text-sm"}`}
          style={{ color }}
        >
          {level}
        </span>
      </div>
    </div>
  );
}
