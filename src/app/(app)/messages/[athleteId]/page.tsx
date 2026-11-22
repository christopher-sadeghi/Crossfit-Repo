import { MessageThread } from "@/components/messages/thread";

export default async function CoachMessagePage({ params, searchParams }: { params: Promise<{ athleteId: string }>; searchParams: Promise<{ link?: string }> }) {
  const [{ athleteId }, { link }] = await Promise.all([params, searchParams]);
  return <MessageThread athleteId={athleteId} requestedLink={link} />;
}
