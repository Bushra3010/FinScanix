import clsx, { type ClassValue } from "clsx";

/** Merge conditional class names. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  SAR: "﷼",
  AED: "د.إ",
  KWD: "د.ك",
  BHD: "د.ب",
  OMR: "ر.ع.",
};

const CURRENCY_LOCALES: Record<string, string> = {
  INR: "en-IN",
  SAR: "ar-SA",
  AED: "en-AE",
  KWD: "en-KW",
  BHD: "en-BH",
  OMR: "en-OM",
};

/** Format a numeric value in the given currency. */
export function formatCurrency(
  value: number,
  currency: string = "INR",
  opts?: { compact?: boolean; decimals?: number },
): string {
  if (opts?.compact && currency === "INR") {
    const abs = Math.abs(value);
    if (abs >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)} Cr`;
    if (abs >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)} L`;
    if (abs >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  }

  return new Intl.NumberFormat(CURRENCY_LOCALES[currency] ?? "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: opts?.decimals ?? 2,
    maximumFractionDigits: opts?.decimals ?? 2,
  }).format(value);
}

/** Backward-compatible alias — all existing call sites continue to work. */
export function formatINR(value: number, opts?: { compact?: boolean; decimals?: number }) {
  return formatCurrency(value, "INR", opts);
}

export function formatNumber(value: number, decimals = 0) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number, decimals = 1) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatDate(iso: string, style: "short" | "long" | "datetime" = "short") {
  const d = new Date(iso);
  if (style === "long") {
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
  }
  if (style === "datetime") {
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** "3 hours ago" style stamps for activity feeds and price freshness. */
export function relativeTime(iso: string, now: Date = new Date()) {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
