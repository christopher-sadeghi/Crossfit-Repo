import { MessageThread } from "@/components/messages/thread";
import { NotificationSettings } from "@/components/notifications/email-settings";
import { PushSettings } from "@/components/notifications/push-settings";
import { ReminderSettings } from "@/components/notifications/reminder-settings";
import { OpenAthleteChatButton } from "./open-athlete-chat-button";

export default async function AthleteMessagesPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  const { link } = await searchParams;
  return <div className="grid gap-6"><header className="flex justify-end"><OpenAthleteChatButton /></header><MessageThread requestedLink={link} /><NotificationSettings /><PushSettings role="athlete" /><ReminderSettings /></div>;
}
