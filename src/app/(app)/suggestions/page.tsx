import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export default function Page() {
  return (
    <>
      <PageHeader title="AI Suggestions" description="Review, edit, approve or reject AI suggestions." />
      <ComingSoon ticket="11 (AI suggestions)" />
    </>
  );
}
