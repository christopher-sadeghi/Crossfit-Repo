import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { requestPasswordReset } from "../actions";

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>We&apos;ll email you a link to choose a new password.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <AuthForm
          action={requestPasswordReset}
          submitLabel="Send reset link"
          fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
        />
        <Link href="/login" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Back to log in
        </Link>
      </CardContent>
    </Card>
  );
}
