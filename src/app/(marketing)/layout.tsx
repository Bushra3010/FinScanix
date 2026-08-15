import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonStyles } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

const navLinks: { href: string; label: string; badge?: string }[] = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
  { href: "/resources", label: "Resources", badge: "NEW" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="marketing-canvas min-h-screen px-3 py-4 sm:px-5 sm:py-6">
      {/* Everything sits on one card floating over the tinted canvas. */}
      <div className="mx-auto w-full max-w-[94rem] overflow-hidden rounded-3xl border border-border bg-surface shadow-raised">
        <header className="sticky top-0 z-40 border-b border-border bg-surface/85 backdrop-blur-md">
          <div className="flex h-18 items-center justify-between gap-6 px-5 sm:px-8 lg:px-10">
            <Link href="/" className="shrink-0">
              <Logo />
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[14px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                  {link.badge && (
                    <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[9.5px] font-bold tracking-wider text-brand-soft-foreground uppercase">
                      {link.badge}
                    </span>
                  )}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-2.5">
              <ThemeToggle className="rounded-full" />
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-[14px] text-foreground transition-colors hover:bg-muted"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className={buttonStyles({
                  size: "lg",
                  className: "hidden rounded-xl sm:inline-flex",
                })}
              >
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </header>

        <main>{children}</main>

        <footer className="border-t border-border bg-surface-sunken/40">
          <div className="w-full px-5 py-12 sm:px-8 lg:px-10">
            <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
              <div>
                <Logo />
                <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                  Evidence-backed verification of construction and facilities-management
                  invoices, benchmarked against government Schedule of Rates and live
                  market pricing.
                </p>
              </div>

              <FooterCol
                title="Product"
                links={[
                  { href: "/#how-it-works", label: "How it works" },
                  { href: "/#features", label: "Features" },
                  { href: "/pricing", label: "Pricing" },
                  { href: "/app/dashboard", label: "Open the app" },
                ]}
              />
              <FooterCol
                title="Company"
                links={[
                  { href: "/security", label: "Security" },
                  { href: "/security#privacy", label: "Privacy policy" },
                  { href: "/security#retention", label: "Data retention" },
                  { href: "/security#complaints", label: "Complaints" },
                ]}
              />
              <FooterCol
                title="Account"
                links={[
                  { href: "/login", label: "Sign in" },
                  { href: "/register", label: "Create account" },
                  { href: "/app/settings/billing", label: "Billing" },
                ]}
              />
            </div>

            <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>© {new Date().getFullYear()} FinScanix. All rights reserved.</p>
              <p>
                Advisory decision-support. Variance output is not a legally binding
                valuation.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { href: string; label: string }[];
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-foreground">{title}</p>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href + link.label}>
            <Link
              href={link.href}
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
