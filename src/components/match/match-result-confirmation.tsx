import { ArrowLeft, ArrowRight, ChevronDown, Medal } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_RATING } from "@/lib/ratings/glicko2";
import styles from "./match-result-confirmation.module.css";

type TeamKey = "A" | "B";

type Player = {
  id: string;
  initials: string;
  name: string;
  ratingChange?: {
    previous: { rating: number; rd: number };
    next: { rating: number; rd: number };
  };
};

type Team = {
  label: string;
  players: Player[];
};

type SetScore = {
  label: string;
  teamAScore: number;
  teamBScore: number;
  winner: TeamKey;
};

export type MatchResultConfirmationData = {
  id: string;
  revisionId: string;
  status: "pending_confirmation" | "confirmed" | "disputed";
  winnerTeam: TeamKey;
  clubName: string;
  submittedAt: string;
  correctionUntil: string;
  teamA: Team;
  teamB: Team;
  sets: SetScore[];
};

export function MatchResultConfirmation({
  groupId,
  groupName,
  canCorrect,
  canRevise,
  match,
}: {
  groupId: string;
  groupName: string;
  canCorrect: boolean;
  canRevise: boolean;
  match: MatchResultConfirmationData;
}) {
  return (
    <section className={styles.screen}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <h1 className={styles.title}>Match Result</h1>
        </div>
        <button
          type="button"
          className={styles.groupButton}
          aria-label={`Current group ${groupName}`}
        >
          {groupName}
          <ChevronDown aria-hidden="true" className={styles.groupIcon} />
        </button>
      </div>

      <article className={styles.card}>
        <div className={styles.matchMeta}>
          <h2 className={styles.clubName}>{match.clubName}</h2>
          <p className={styles.submittedAt}>{match.submittedAt}</p>
        </div>

        <div className={styles.teams}>
          <TeamSummary team={match.teamA} winner={match.winnerTeam === "A"} />
          <TeamSummary team={match.teamB} winner={match.winnerTeam === "B"} />
        </div>

        <div className={styles.sets}>
          {match.sets.map((set) => (
            <SetScoreRow key={set.label} set={set} />
          ))}
        </div>

        <div className={styles.reviewSection}>
          <div className={styles.reviewMeta}>
            {match.status !== "pending_confirmation" ? <Badge tone={match.status === "confirmed" ? "victory" : "neutral"}>{displayStatus(match.status)}</Badge> : null}
            {canCorrect || canRevise ? <p className={styles.deadline}>Correct until {match.correctionUntil}</p> : null}
          </div>
          {canCorrect || (match.status === "disputed" && canRevise) ? (
            <Link
              href={`/groups/${groupId}/matches/${match.id}/revise`}
              className={styles.reviseLink}
            >
              Correct result
            </Link>
          ) : null}
        </div>
      </article>
    </section>
  );
}

function displayStatus(status: MatchResultConfirmationData["status"]) {
  if (status === "confirmed") return "Accepted";
  if (status === "disputed") return "Disputed";
  return null;
}

function TeamSummary({ team, winner }: { team: Team; winner: boolean }) {
  return (
    <div className={styles.teamSummary}>
      <div
        className={clsx(styles.teamLabel, winner ? styles.winningText : styles.mutedText)}
      >
        {winner ? <Medal aria-hidden="true" className={styles.medal} /> : null}
        <h3>{team.label}</h3>
      </div>
      <div
        className={clsx(styles.teamCard, winner ? styles.winningSurface : styles.neutralSurface)}
      >
        {team.players.map((player, index) => (
          <div key={`${team.label}-${player.name}-${index}`} className={styles.player}>
            <span className={styles.avatar}>
              {player.initials}
            </span>
            <div className={styles.playerDetails}>
              <p className={styles.playerName}>{player.name}</p>
              <RatingChange ratingChange={player.ratingChange} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RatingChange({ ratingChange }: { ratingChange?: Player["ratingChange"] }) {
  const previous = ratingChange?.previous ?? DEFAULT_RATING;

  return (
    <p className={styles.ratingChange}>
      {previous.rating} → {ratingChange ? ratingChange.next.rating : "…"}
    </p>
  );
}

function SetScoreRow({ set }: { set: SetScore }) {
  return (
    <div>
      <div className={styles.setHeader}>
        <h3 className={styles.setTitle}>{set.label}</h3>
      </div>
      <div className={styles.scoreRow}>
        <ScoreTile score={set.teamAScore} result={set.winner === "A" ? "Win" : "Loss"} />
        <SetArrow winner={set.winner} />
        <ScoreTile score={set.teamBScore} result={set.winner === "B" ? "Win" : "Loss"} />
      </div>
    </div>
  );
}

function SetArrow({ winner }: { winner: TeamKey }) {
  const Icon = winner === "A" ? ArrowLeft : ArrowRight;

  return (
    <div className={styles.setArrow}>
      <Icon aria-hidden="true" className={styles.arrowIcon} />
      <span className={styles.visuallyHidden}>Winner: Team {winner}</span>
    </div>
  );
}

function ScoreTile({ score, result }: { score: number; result: "Win" | "Loss" }) {
  const won = result === "Win";

  return (
    <div
      className={clsx(styles.scoreTile, won ? styles.winningSurface : styles.neutralSurface)}
    >
      <p className={styles.scoreValue}>{score}</p>
      <p className={styles.scoreResult}>{result}</p>
    </div>
  );
}
