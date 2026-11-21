import { Dumbbell } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/40 p-8">
      <div className="flex items-center gap-2 text-xl font-semibold">
        <Dumbbell className="size-6" />
        FitCoach AI
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
