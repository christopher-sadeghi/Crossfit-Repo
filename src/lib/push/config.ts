import "server-only";

export function pushConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject?.startsWith("mailto:") && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? { publicKey, privateKey, subject } : null;
}
