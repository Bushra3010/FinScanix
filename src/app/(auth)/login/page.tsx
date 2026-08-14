import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to FinScanix to verify vendor invoices and quotations.",
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
