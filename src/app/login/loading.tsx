import { AppLoadingShell, SectionSkeleton } from "@/components/app/loading-shell";

export default function LoginLoading() {
  return (
    <AppLoadingShell label="Loading sign in" showNav={false}>
      <SectionSkeleton rows={2} />
    </AppLoadingShell>
  );
}
