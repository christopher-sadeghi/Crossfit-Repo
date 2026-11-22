import Link from "next/link";
import { notFound } from "next/navigation";

import { DemoVariationLink, HowTo } from "@/components/movements/how-to";

import { getAthleteMovementDemo } from "../actions";

export default async function AthleteMovementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const demo = await getAthleteMovementDemo(id);
  if (!demo) notFound();
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <Link href="/athlete" className="text-sm underline">← Today&apos;s WOD</Link>
      <h1 className="text-2xl font-semibold">How to {demo.name}</h1>
      <HowTo demo={demo} renderVariation={(movement) => <DemoVariationLink movement={movement} basePath="/athlete/movements" />} />
    </div>
  );
}
