import { AppLoadingShell, SectionSkeleton } from "@/components/app/loading-shell";

export default function ProfileLoading() {
  return (
    <AppLoadingShell active="Profile" label="Loading profile">
      <SectionSkeleton rows={3} />
    </AppLoadingShell>
  );
}
