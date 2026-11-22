import { createClient } from "@/lib/supabase/server";
import { PUSH_CATEGORIES } from "@/lib/push/payload";
import { PushToggle } from "./push-toggle";

export async function PushSettings({ role }: { role: "coach" | "athlete" }) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (typeof userId !== "string") return null;
  const { data, error } = await supabase.from("notification_settings").select("push_categories").eq("user_id", userId).maybeSingle();
  return <PushToggle publicKey={publicKey} role={role} initialCategories={data?.push_categories ?? [...PUSH_CATEGORIES]} loadError={!!error} />;
}
