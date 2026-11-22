import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card className="mx-auto mt-8 max-w-md">
      <CardHeader>
        <h1 className="text-lg font-semibold">Page not found</h1>
        <p className="text-muted-foreground">This item may have been removed, or you may not have access.</p>
      </CardHeader>
      <CardContent><Button asChild><Link href="/">Back to home</Link></Button></CardContent>
    </Card>
  );
}
