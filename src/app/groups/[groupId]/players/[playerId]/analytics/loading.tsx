import { AppLoadingShell, SectionSkeleton } from "@/components/app/loading-shell";

export default function AnalyticsLoading() {
  return (
    <AppLoadingShell active="Groups" label="Loading player analytics">
      <SectionSkeleton rows={5} />
    </AppLoadingShell>
  );
}
