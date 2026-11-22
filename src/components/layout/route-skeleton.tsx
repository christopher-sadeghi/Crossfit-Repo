import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function RouteSkeleton() {
  return (
    <div className="mx-auto grid max-w-6xl gap-5" role="status">
      <span className="sr-only">Loading page…</span>
      <div className="grid gap-2 motion-safe:animate-pulse" aria-hidden="true">
        <div className="h-8 w-48 max-w-full rounded-md bg-muted" />
        <div className="h-4 w-64 max-w-full rounded-md bg-muted" />
      </div>
      <div className="grid gap-5 lg:grid-cols-2" aria-hidden="true">
        {[0, 1].map((item) => (
          <Card className="motion-safe:animate-pulse" key={item}>
            <CardHeader><div className="h-5 w-36 rounded-md bg-muted" /></CardHeader>
            <CardContent className="grid gap-3">
              <div className="h-4 w-full rounded-md bg-muted" />
              <div className="h-4 w-3/4 rounded-md bg-muted" />
              <div className="h-4 w-1/2 rounded-md bg-muted" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
