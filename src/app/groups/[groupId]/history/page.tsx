export const unstable_instant = {
  prefetch: "static",
  samples: [{ params: { groupId: "00000000-0000-0000-0000-000000000000" } }],
};

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { MatchHistoryList } from "@/components/match/match-history-list";
import { listMatchHistoryPage } from "@/lib/app-data";
import { MatchHistoryInputError, type MatchHistoryPage } from "@/lib/matches/history-pagination";
import GroupLoading from "../loading";

type GroupHistoryPageProps = {
  params: Promise<{ groupId: string }>;
};

export default function HistoryPage(props: GroupHistoryPageProps) {
  return (
    <Suspense fallback={<GroupLoading />}>
      <GroupHistoryContent {...props} />
    </Suspense>
  );
}

export async function GroupHistoryContent({ params }: GroupHistoryPageProps) {
  const { groupId } = await params;
  let initialPage: MatchHistoryPage;
  try {
    initialPage = await listMatchHistoryPage({ groupId });
  } catch (error) {
    if (error instanceof MatchHistoryInputError || errorCode(error) === "MR403") notFound();
    throw error;
  }

  return (
    <MobileShell active="History" recordHref={`/groups/${groupId}/matches/new`}>
      <ScreenHeader title="Match history" backHref={`/groups/${groupId}`} />
      <MatchHistoryList initialPage={initialPage} groupId={groupId} />
    </MobileShell>
  );
}

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null;
}
