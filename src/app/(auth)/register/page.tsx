import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import type { TierId } from "@/lib/types";

export const metadata: Metadata = {
  title: "Create account",
  description: "Start a 14-day FinScanix trial — no card required.",
};

const VALID_PLANS: TierId[] = ["starter", "professional", "enterprise"];

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  const selected = VALID_PLANS.includes(plan as TierId) ? (plan as TierId) : undefined;

  return <AuthForm mode="register" plan={selected} />;
}
