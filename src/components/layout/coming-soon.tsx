import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({ ticket }: { ticket: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground">
        This page is coming in ticket {ticket}.
      </CardContent>
    </Card>
  );
}
