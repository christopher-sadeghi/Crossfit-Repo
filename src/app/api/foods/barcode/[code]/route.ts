import { lookupBarcode } from "@/lib/food-db/providers";
import { getViewer } from "@/lib/viewer";

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const viewer = await getViewer();
  if (viewer?.kind !== "coach" && viewer?.kind !== "athlete") return Response.json({ error: "Please sign in to look up foods." }, { status: 401 });
  const { code } = await params;
  if (!/^\d{8,14}$/.test(code)) return Response.json({ error: "Enter a barcode with 8–14 digits." }, { status: 400 });
  const result = await lookupBarcode(code);
  if (!result.ok) return Response.json({ error: result.reason === "rate_limit" ? "Barcode search is busy — please try again shortly or enter the food manually." : "Barcode search isn't available right now — you can enter the food manually." }, { status: 503 });
  if (!result.items.length) return Response.json({ error: "This barcode wasn't found. Try searching by name or enter the food manually." }, { status: 404 });
  return Response.json({ item: result.items[0] });
}
