import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { ReportPreview } from "@/components/marketing/report-preview";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <div className="flex items-center justify-between">
          <Link href="/">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} FinScanix ·{" "}
          <Link href="/security" className="hover:text-foreground">
            Security
          </Link>
        </p>
      </div>

      <div className="relative hidden overflow-hidden border-l border-border bg-surface lg:flex lg:flex-col lg:justify-center">
        <div className="surface-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <div className="relative px-12 py-16">
          <h2 className="max-w-md text-2xl font-semibold tracking-tight text-balance text-foreground">
            Every line item, benchmarked against the rate book and the market.
          </h2>
          <p className="mt-3 max-w-md text-[14px] leading-relaxed text-muted-foreground">
            Over-priced, under-priced or at par — with the SoR code, the city index and the
            live quotes that produced the verdict.
          </p>
          <div className="mt-8 max-w-lg">
            <ReportPreview />
          </div>
        </div>
      </div>
    </div>
  );
}
