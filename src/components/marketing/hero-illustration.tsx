import { cn } from "@/lib/utils";

/**
 * Flat construction scene beneath the hero copy: a building under a crane, an
 * invoice with a rupee marker, and a verification shield.
 *
 * Inline SVG rather than an image asset so it inherits the theme tokens and
 * flips correctly in dark mode, and costs no extra request.
 */
export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 460 260"
      className={cn("h-auto w-full", className)}
      role="img"
      aria-label="A building under construction beside a verified invoice"
    >
      <defs>
        <linearGradient id="fs-shield" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="var(--brand)" />
          <stop offset="100%" stopColor="var(--brand-hover)" />
        </linearGradient>
        <linearGradient id="fs-ground" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {/* ground */}
      <path d="M0 214 C 96 196, 190 226, 292 210 S 420 196, 460 206 L460 260 L0 260 Z" fill="url(#fs-ground)" />

      {/* distant skyline */}
      <g fill="var(--brand)" opacity="0.1">
        <rect x="18" y="150" width="26" height="62" rx="2" />
        <rect x="50" y="132" width="20" height="80" rx="2" />
        <rect x="392" y="146" width="24" height="66" rx="2" />
        <rect x="420" y="164" width="18" height="48" rx="2" />
      </g>

      {/* crane */}
      <g stroke="var(--brand)" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M74 212 L74 66" opacity="0.85" />
        <path d="M74 66 L246 66" opacity="0.85" />
        <path d="M74 66 L36 66" opacity="0.85" />
        <path d="M60 212 L88 212" />
        {/* lattice */}
        <g opacity="0.4" strokeWidth="2">
          <path d="M74 90 L88 78 M74 114 L88 102 M74 138 L88 126 M74 162 L88 150 M74 186 L88 174" />
          <path d="M88 78 L88 212" />
        </g>
        {/* jib ties */}
        <g opacity="0.45" strokeWidth="2">
          <path d="M74 48 L160 66 M74 48 L36 66 M74 48 L74 66" />
        </g>
        {/* hook */}
        <path d="M186 66 L186 104" strokeWidth="2" opacity="0.7" />
      </g>
      <rect x="28" y="60" width="14" height="14" rx="2" fill="var(--brand)" opacity="0.75" />
      <rect x="176" y="104" width="20" height="12" rx="2" fill="var(--brand)" opacity="0.6" />

      {/* building under construction */}
      <g>
        <rect x="122" y="118" width="118" height="94" rx="4" fill="var(--brand)" opacity="0.16" />
        <rect x="122" y="118" width="118" height="94" rx="4" fill="none" stroke="var(--brand)" strokeWidth="2" opacity="0.5" />
        <g stroke="var(--brand)" strokeWidth="1.5" opacity="0.35">
          <path d="M122 142 H240 M122 166 H240 M122 190 H240" />
          <path d="M152 118 V212 M182 118 V212 M212 118 V212" />
        </g>
        {/* lit windows */}
        <g fill="var(--brand)" opacity="0.55">
          <rect x="128" y="146" width="18" height="14" rx="1.5" />
          <rect x="188" y="170" width="18" height="14" rx="1.5" />
          <rect x="158" y="194" width="18" height="14" rx="1.5" />
        </g>
      </g>

      {/* invoice card */}
      <g>
        <rect x="256" y="112" width="128" height="104" rx="8" fill="var(--surface)" stroke="var(--border-strong)" strokeWidth="1.5" />
        <text x="272" y="136" fontSize="12" fontWeight="700" letterSpacing="0.08em" fill="var(--muted-foreground)">
          INVOICE
        </text>
        <g stroke="var(--border-strong)" strokeWidth="4" strokeLinecap="round" opacity="0.55">
          <path d="M272 152 H352" />
          <path d="M272 166 H336" />
          <path d="M272 180 H344" />
          <path d="M272 194 H312" />
        </g>
      </g>

      {/* rupee marker */}
      <g>
        <circle cx="384" cy="126" r="19" fill="var(--over)" />
        <text
          x="384"
          y="133"
          textAnchor="middle"
          fontSize="19"
          fontWeight="700"
          fill="#ffffff"
        >
          ₹
        </text>
      </g>

      {/* verification shield */}
      <g>
        <path
          d="M282 168 L308 176 L308 200 C308 214, 296 224, 282 228 C268 224, 256 214, 256 200 L256 176 Z"
          fill="url(#fs-shield)"
        />
        <path
          d="M271 197 L279 205 L295 189"
          stroke="#ffffff"
          strokeWidth="4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {/* tree */}
      <g>
        <path d="M404 212 L404 196" stroke="var(--par)" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
        <circle cx="404" cy="184" r="14" fill="var(--par)" opacity="0.3" />
        <circle cx="404" cy="184" r="9" fill="var(--par)" opacity="0.55" />
      </g>
    </svg>
  );
}
