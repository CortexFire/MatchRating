"use client";

import { useRouter } from "next/navigation";
import { correctMatch, reviseMatch } from "@/app/actions";
import { MatchRecorder, type InitialMatchRecording } from "@/components/match/match-recorder";
import { type AppPlayer } from "@/lib/app-data";
import { type MatchSubmissionInput } from "@/lib/matches/validation";

export function MatchRevisionRecorder({
  groupId,
  groupName,
  matchId,
  expectedRevisionId,
  mode,
  players,
  initialMatch,
}: {
  groupId: string;
  groupName: string;
  matchId: string;
  expectedRevisionId: string;
  mode: "correct" | "revise";
  players: AppPlayer[];
  initialMatch: InitialMatchRecording;
}) {
  const router = useRouter();

  async function submit(input: MatchSubmissionInput & { commandId: string }) {
    const payload = {
      commandId: input.commandId,
      groupId,
      matchId,
      expectedRevisionId,
      format: input.format,
      teamAUserIds: input.teamAUserIds,
      teamBUserIds: input.teamBUserIds,
      games: input.games,
    };
    const result = mode === "correct"
      ? await correctMatch(payload)
      : await reviseMatch(payload);
    if (result.ok) {
      router.push(`/groups/${groupId}/matches/${matchId}`);
    }
    return result;
  }

  return (
    <MatchRecorder
      groupId={groupId}
      groupName={groupName}
      players={players}
      initialMatch={initialMatch}
      submitMatchAction={submit}
    />
  );
}
