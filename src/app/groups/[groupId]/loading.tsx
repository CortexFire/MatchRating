import { AppLoadingShell, SectionSkeleton } from "@/components/app/loading-shell";

export default function GroupLoading() {
  return (
    <AppLoadingShell active="Groups" label="Loading group">
      <SectionSkeleton rows={4} />
    </AppLoadingShell>
  );
}
