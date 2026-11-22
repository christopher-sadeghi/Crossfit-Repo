import type { Json } from "@/lib/supabase/database.types";

export function threadSourceMessageId(input: Json | undefined) {
  return input && typeof input === "object" && !Array.isArray(input) && typeof input.source_message_id === "string"
    ? input.source_message_id : null;
}
