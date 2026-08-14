import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonStyles } from "@/components/ui/button";

const navLinks = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  { href: "/security", label: "Security" },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-6 px-5 lg:px-8">
          <Link href="/" className="shrink-0">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/login" className={buttonStyles({ variant: "ghost", size: "sm" })}>
              Sign in
            </Link>
            <Link
              href="/register"
              className={buttonStyles({ size: "sm", className: "hidden sm:inline-flex" })}
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-7xl px-5 py-12 lg:px-8">
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
