import { AppLoadingShell, SectionSkeleton } from "@/components/app/loading-shell";

export default function GroupsLoading() {
  return (
    <AppLoadingShell active="Groups" label="Loading groups">
      <SectionSkeleton rows={3} />
    </AppLoadingShell>
  );
}
