import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "FinScanix — Vendor invoice & quotation verification",
    template: "%s · FinScanix",
  },
  description:
    "FinScanix verifies construction and facilities-management invoices against CPWD Schedule of Rates and live market pricing, flagging every line item as over-priced, under-priced or at par.",
  applicationName: "FinScanix",
  keywords: [
    "invoice verification",
    "quotation audit",
    "schedule of rates",
    "CPWD DSR",
    "construction cost audit",
    "facilities management",
  ],
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#080c14" },
  ],
};

/** Applies the stored theme before first paint to avoid a flash. */
const themeScript = `(function(){try{var t=localStorage.getItem('finscanix-theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
