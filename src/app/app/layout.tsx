import { AppShell } from "@/components/app/app-shell";
import { SessionProvider } from "@/components/app/session-context";
import { requireUser } from "@/lib/auth/guard";
import { listCities } from "@/lib/db/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // The real access check for everything under /app. Middleware only checks
  // that a cookie exists; this verifies the session actually resolves.
  const user = await requireUser();
  const cities = await listCities();

  return (
    <SessionProvider user={user}>
      <AppShell cities={cities}>{children}</AppShell>
    </SessionProvider>
  );
}
