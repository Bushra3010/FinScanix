import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("h-8 w-8", className)}
      role="img"
      aria-label="FinScanix"
    >
      <defs>
        <linearGradient id="fs-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--brand)" />
          <stop offset="100%" stopColor="var(--brand-hover)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8.5" fill="url(#fs-mark)" />
      {/* document */}
      <path
        d="M10 8.5h8.2L23 13.2V23a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 9 23V10a1.5 1.5 0 0 1 1-1.5Z"
        fill="var(--brand-foreground)"
        opacity="0.16"
      />
      <path
        d="M10.5 8.5h7.7L23 13.3V23a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 9 23V10a1.5 1.5 0 0 1 1.5-1.5Z"
        stroke="var(--brand-foreground)"
        strokeWidth="1.5"
        fill="none"
        strokeLinejoin="round"
      />
      {/* line items */}
      <path
        d="M12.2 15.4h5.1M12.2 18.1h7.5M12.2 20.8h3.4"
        stroke="var(--brand-foreground)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.9"
      />
      {/* scan bar */}
      <rect x="7" y="16.6" width="18" height="1.9" rx="0.95" fill="var(--brand-foreground)" />
    </svg>
  );
}

export function Logo({
  className,
  markClassName,
  showWord = true,
}: {
  className?: string;
  markClassName?: string;
  showWord?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      {showWord && (
        <span className="text-[17px] font-semibold tracking-tight text-foreground">
          Fin<span className="text-brand">Scanix</span>
        </span>
      )}
    </span>
  );
}
