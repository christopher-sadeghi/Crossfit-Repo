import { createClient } from "@/lib/supabase/server";
import { PUSH_CATEGORIES } from "@/lib/push/payload";
import { pushConfig } from "@/lib/push/config";
import { PushToggle } from "./push-toggle";

export async function PushSettings({ role }: { role: "coach" | "athlete" }) {
  const config = pushConfig();
  if (!config) return null;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (typeof userId !== "string") return null;
  const { data, error } = await supabase.from("notification_settings").select("push_categories").eq("user_id", userId).maybeSingle();
  return <PushToggle publicKey={config.publicKey} role={role} initialCategories={data?.push_categories ?? [...PUSH_CATEGORIES]} loadError={!!error} />;
}
