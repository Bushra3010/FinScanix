import { AppShell } from "@/components/app/app-shell";
import { PrototypeProvider } from "@/components/app/prototype-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrototypeProvider>
      <AppShell>{children}</AppShell>
    </PrototypeProvider>
  );
}
