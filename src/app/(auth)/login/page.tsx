import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to FinScanix to verify vendor invoices and quotations.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  // Resolved here rather than in middleware: only this side can tell a live
  // session from a cookie that outlived it, and guessing wrong loops.
  if (await getSessionUser()) redirect("/app/dashboard");

  const { expired } = await searchParams;
  return <AuthForm mode="login" expired={expired === "1"} />;
}
