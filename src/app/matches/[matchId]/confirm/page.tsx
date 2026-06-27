import { redirect } from "next/navigation";
import { getGroup, getMatchGroupId } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function MatchResultConfirmationPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const groupId = await getMatchGroupId(matchId);

  if (!groupId) {
    redirect("/groups");
  }

  const group = await getGroup(groupId);
  if (!group) {
    redirect("/groups");
  }

  redirect(`/groups/${groupId}/matches/${matchId}`);
}
