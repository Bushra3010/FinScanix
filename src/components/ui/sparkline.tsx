import type { VarianceFlag } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Tiny trend line shown beside each invoice line.
 *
 * The series is derived from a seed string rather than random, so the same line
 * item always draws the same shape — server and client render identically, and
 * screenshots stay reproducible.
 */

function hash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function seriesFor(seed: string, count = 8): number[] {
  let a = hash(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, () => next());
}

const TONE: Record<VarianceFlag, string> = {
  over: "var(--over)",
  under: "var(--under)",
  par: "var(--par)",
};

export function Sparkline({
  seed,
  flag,
  className,
}: {
  seed: string;
  flag: VarianceFlag;
  className?: string;
}) {
  const values = seriesFor(seed);
  const width = 92;
  const height = 30;
  const pad = 4;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (width - pad * 2) / (values.length - 1);

  const points = values.map((v, i) => ({
    x: pad + i * step,
    y: pad + (1 - (v - min) / span) * (height - pad * 2),
  }));

  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("h-7 w-[92px]", className)}
      aria-hidden
    >
      <path
        d={d}
        fill="none"
        stroke={TONE[flag]}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1.6" fill={TONE[flag]} />
      ))}
    </svg>
  );
}
