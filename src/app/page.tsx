import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function getSupabaseStatus() {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`,
      {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
        cache: "no-store",
      },
    );
    return res.ok ? "connected" : "error";
  } catch {
    return "error";
  }
}

export default async function Home() {
  const status = await getSupabaseStatus();

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-8">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">FitCoach AI</CardTitle>
          <CardDescription>
            Manage athletes, program WODs, track nutrition and goals, and review
            AI suggestions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Database:{" "}
            <span
              className={
                status === "connected" ? "text-green-600" : "text-red-600"
              }
            >
              {status === "connected" ? "Connected" : "Not connected"}
            </span>
          </p>
          <Button disabled>Coach login coming soon</Button>
        </CardContent>
      </Card>
    </main>
  );
}
