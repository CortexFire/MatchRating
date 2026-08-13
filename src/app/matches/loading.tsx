import { AppLoadingShell, SectionSkeleton } from "@/components/app/loading-shell";

export default function MatchesLoading() {
  return (
    <AppLoadingShell active="Home" label="Loading matches">
      <SectionSkeleton rows={4} />
    </AppLoadingShell>
  );
}
