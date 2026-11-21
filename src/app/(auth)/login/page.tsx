import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeNextPath } from "@/lib/auth/redirect";

import { login } from "../actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in</CardTitle>
        <CardDescription>Welcome back, coach.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error === "link_invalid" && (
          <p role="alert" className="text-sm text-destructive">
            That link is invalid or has expired. Please try again.
          </p>
        )}
        <AuthForm
          action={login}
          submitLabel="Log in"
          hidden={{ next: safeNextPath(next) }}
          fields={[
            { name: "email", label: "Email", type: "email", autoComplete: "email" },
            { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
          ]}
        />
        <div className="flex justify-between text-sm">
          <Link href="/forgot-password" className="text-muted-foreground underline-offset-4 hover:underline">
            Forgot password?
          </Link>
          <Link href="/signup" className="underline-offset-4 hover:underline">
            Create an account
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
