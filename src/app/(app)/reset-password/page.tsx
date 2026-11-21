import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { updatePassword } from "../../(auth)/actions";

export default function ResetPasswordPage() {
  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
        <CardDescription>You&apos;ll stay logged in after saving.</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm
          action={updatePassword}
          submitLabel="Save password"
          fields={[
            { name: "password", label: "New password", type: "password", autoComplete: "new-password" },
            { name: "confirm", label: "Confirm new password", type: "password", autoComplete: "new-password" },
          ]}
        />
      </CardContent>
    </Card>
  );
}
