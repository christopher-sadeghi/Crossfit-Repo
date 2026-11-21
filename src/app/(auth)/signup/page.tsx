import Link from "next/link";

import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { signup } from "../actions";

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your coach account</CardTitle>
        <CardDescription>Manage your athletes, programs and nutrition in one place.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <AuthForm
          action={signup}
          submitLabel="Create account"
          fields={[
            { name: "full_name", label: "Your name", autoComplete: "name" },
            { name: "email", label: "Email", type: "email", autoComplete: "email" },
            { name: "password", label: "Password (8+ characters)", type: "password", autoComplete: "new-password" },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
