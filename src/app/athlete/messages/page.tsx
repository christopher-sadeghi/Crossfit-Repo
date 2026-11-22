import { MessageThread } from "@/components/messages/thread";

export default async function AthleteMessagesPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  return <MessageThread requestedLink={link} />;
}
