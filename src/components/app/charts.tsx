import { cn, formatINR } from "@/lib/utils";

/**
 * Small hand-built SVG charts. No charting dependency: the shapes needed here
 * are simple, and this keeps the bundle small and the colours bound to the same
 * theme tokens as the rest of the product.
 */

export function TrendChart({
  data,
  className,
}: {
  data: { month: string; documents: number; variancePct: number; savings: number }[];
  className?: string;
}) {
  const width = 660;
  const height = 220;
  const padX = 34;
  const padTop = 16;
  const padBottom = 28;

  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const maxDocs = Math.max(...data.map((d) => d.documents)) * 1.15;
  const maxPct = Math.max(...data.map((d) => d.variancePct)) * 1.25;

  const slot = plotW / data.length;
  const barW = Math.min(28, slot * 0.46);

  const points = data.map((d, i) => {
    const x = padX + slot * i + slot / 2;
    const y = padTop + plotH - (d.variancePct / maxPct) * plotH;
    return { x, y, ...d };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  const areaPath =
    `M${points[0].x.toFixed(1)},${(padTop + plotH).toFixed(1)} ` +
    points.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
    ` L${points[points.length - 1].x.toFixed(1)},${(padTop + plotH).toFixed(1)} Z`;

  return (
    <div className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Documents processed and average variance by month"
      >
        <defs>
          <linearGradient id="fs-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padTop + plotH * t;
          return (
            <line
              key={t}
              x1={padX}
              x2={width - padX}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
            />
          );
        })}

        {/* document bars */}
        {data.map((d, i) => {
          const h = (d.documents / maxDocs) * plotH;
          const x = padX + slot * i + slot / 2 - barW / 2;
          const y = padTop + plotH - h;
          return (
            <rect
              key={d.month}
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, 2)}
              rx="3"
              fill="var(--brand)"
              opacity="0.16"
            />
          );
        })}

        {/* variance line */}
        <path d={areaPath} fill="url(#fs-area)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--brand)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((p) => (
          <circle
            key={p.month}
            cx={p.x}
            cy={p.y}
            r="3.2"
            fill="var(--surface)"
            stroke="var(--brand)"
            strokeWidth="2"
          />
        ))}

        {/* month labels */}
        {data.map((d, i) => (
          <text
            key={d.month}
            x={padX + slot * i + slot / 2}
            y={height - 8}
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted-foreground)"
          >
            {d.month}
          </text>
        ))}

        {/* y-axis hint */}
        <text x={4} y={padTop + 4} fontSize="10" fill="var(--muted-foreground)">
          {maxPct.toFixed(0)}%
        </text>
        <text x={4} y={padTop + plotH} fontSize="10" fill="var(--muted-foreground)">
          0%
        </text>
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-4 px-1 text-[11.5px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand opacity-25" />
          Documents processed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-brand" />
          Average variance
        </span>
      </div>
    </div>
  );
}

export function FlagDonut({
  over,
  par,
  under,
  unmatched = 0,
  className,
}: {
  over: number;
  par: number;
  under: number;
  unmatched?: number;
  className?: string;
}) {
  const total = over + par + under + unmatched || 1;
  const segments = [
    { value: over, color: "var(--over)", label: "Over-priced" },
    { value: par, color: "var(--par)", label: "At par" },
    { value: under, color: "var(--under)", label: "Under-priced" },
    { value: unmatched, color: "var(--border-strong)", label: "Unmatched" },
  ].filter((s) => s.value > 0);

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={cn("flex flex-col items-center gap-5", className)}>
      <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="var(--surface-sunken)" strokeWidth="16" />
        {segments.map((segment) => {
          const length = (segment.value / total) * circumference;
          const dash = `${length} ${circumference - length}`;
          const el = (
            <circle
              key={segment.label}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth="16"
              strokeDasharray={dash}
              strokeDashoffset={-offset}
            />
          );
          offset += length;
          return el;
        })}
      </svg>

      <ul className="w-full space-y-2">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2.5 text-[13px]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: segment.color }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{segment.label}</span>
            <span className="tnum font-semibold text-foreground">{segment.value}</span>
            <span className="tnum w-10 text-right text-muted-foreground">
              {((segment.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars for vendor / category roll-ups. */
export function BarList({
  items,
  className,
}: {
  items: { label: string; value: number; hint?: string }[];
  className?: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);

  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item) => (
        <li key={item.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[13px] font-medium text-foreground">{item.label}</span>
            <span className="tnum shrink-0 text-[13px] font-semibold text-over">
              {formatINR(item.value, { compact: true })}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-over"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          {item.hint && <p className="mt-1 text-[11.5px] text-muted-foreground">{item.hint}</p>}
        </li>
      ))}
    </ul>
  );
}
