import { PageTitle, Placeholder } from "@/components/page-shell";

export default function JournalPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle
        title="Decision Journal"
        subtitle="Reverse-chronological log of trades and rejections with thesis and review dates."
      />
      <Placeholder note="The decision feed ships in M3, reading journal fixtures via the lib layer." />
    </div>
  );
}
