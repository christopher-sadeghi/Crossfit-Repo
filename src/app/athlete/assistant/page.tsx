import { redirect } from "next/navigation";

export default function AthleteAssistantPage() {
  redirect("/athlete?assistant=open");
}
