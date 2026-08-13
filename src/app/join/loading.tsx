import { AppLoadingShell, SectionSkeleton } from "@/components/app/loading-shell";

export default function JoinLoading() {
  return (
    <AppLoadingShell label="Loading invitation" showNav={false}>
      <SectionSkeleton rows={2} />
    </AppLoadingShell>
  );
}
