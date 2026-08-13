import { AppLoadingShell, SectionSkeleton } from "@/components/app/loading-shell";

export default function OnboardingLoading() {
  return (
    <AppLoadingShell label="Loading profile setup" showNav={false}>
      <SectionSkeleton rows={2} />
    </AppLoadingShell>
  );
}
