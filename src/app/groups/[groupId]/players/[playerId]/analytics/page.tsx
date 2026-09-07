export const unstable_instant = {
  prefetch: "static",
  samples: [{
    params: {
      groupId: "00000000-0000-0000-0000-000000000000",
      playerId: "00000000-0000-0000-0000-000000000000",
    },
  }],
};

import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PlayerAnalyticsView } from "@/components/analytics/player-analytics-view";
import { getPlayerAnalyticsData } from "@/lib/analytics/analytics-read-model";
import AnalyticsLoading from "./loading";

type AnalyticsPageProps = {
  params: Promise<{ groupId: string; playerId: string }>;
};

export default function AnalyticsPage(props: AnalyticsPageProps) {
  return (
    <Suspense fallback={<AnalyticsLoading />}>
      <AnalyticsPageContent {...props} />
    </Suspense>
  );
}

export async function AnalyticsPageContent({ params }: AnalyticsPageProps) {
  const { groupId, playerId } = await params;
  const model = await getPlayerAnalyticsData(groupId, playerId);
  if (!model) notFound();
  return <PlayerAnalyticsView model={model} />;
}
