import { AppLoadingShell, SectionSkeleton } from "@/components/app/loading-shell";

export default function GroupMatchLoading() {
  return (
    <AppLoadingShell active="Record" label="Loading match">
      <SectionSkeleton rows={5} />
    </AppLoadingShell>
  );
}
