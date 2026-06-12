import { MobileShell } from "@/components/app/mobile-shell";
import { ScreenHeader } from "@/components/app/screen-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewPanel } from "@/components/match/review-panel";
import { getDemoMatch } from "@/lib/demo-data";

export default async function MatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const match = getDemoMatch(matchId);

  return (
    <MobileShell active="History">
      <ScreenHeader title="Confirm result" subtitle="One opposing-team player can confirm or dispute this revision." backHref="/groups/demo/history" />
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="capitalize">{match.format} match</CardTitle>
            <Badge tone={match.status === "Confirmed" ? "victory" : "neutral"}>
              {match.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <TeamBlock label="Team A" players={match.teamA} active={match.winnerTeam === "A"} />
            <TeamBlock label="Team B" players={match.teamB} active={match.winnerTeam === "B"} />
          </div>
          <div className="rounded-lg border border-stroke bg-app-bg p-3 text-center text-xl font-bold tabular-nums">
            {match.scores.join("  ·  ")}
          </div>
          <ReviewPanel />
        </CardContent>
      </Card>
    </MobileShell>
  );
}

function TeamBlock({
  label,
  players,
  active,
}: {
  label: string;
  players: string[];
  active: boolean;
}) {
  return (
    <div className={active ? "rounded-lg border border-victory-stroke bg-victory p-3" : "rounded-lg border border-stroke bg-surface p-3"}>
      <p className="text-xs font-semibold uppercase text-muted">{label}</p>
      <p className="mt-2 text-sm font-bold text-ink">{players.join(" / ")}</p>
    </div>
  );
}
