import { AppLoadingShell, SectionSkeleton } from "@/components/app/loading-shell";

export default function HomeLoading() {
  return (
    <AppLoadingShell active="Home" label="Loading home">
      <SectionSkeleton rows={4} />
    </AppLoadingShell>
  );
}
