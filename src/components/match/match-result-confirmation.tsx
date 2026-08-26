import { ArrowLeft, ArrowRight, ChevronDown, Medal } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { RatingValue } from "@/components/ratings/rating-value";
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
  hasOtherGroups,
  canCorrect,
  canRevise,
  match,
}: {
  groupId: string;
  groupName: string;
  hasOtherGroups: boolean;
  canCorrect: boolean;
  canRevise: boolean;
  match: MatchResultConfirmationData;
}) {
  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerTitleWrap}>
          <h1 className={styles.title}>Match Result</h1>
        </div>
        <button
          type="button"
          className={styles.groupButton}
          aria-label={`Current group ${groupName}`}
        >
          {groupName}
          {hasOtherGroups ? <ChevronDown aria-hidden="true" className={styles.groupIcon} /> : null}
        </button>
      </div>

      <article className={styles.card}>
        <div className={styles.metaRow}>
          <h2 className={styles.clubName}>{match.clubName}</h2>
          <p className={styles.submittedAt}>{match.submittedAt}</p>
        </div>

        <div className={styles.teams}>
          <TeamSummary team={match.teamA} winner={match.winnerTeam === "A"} />
          <TeamSummary team={match.teamB} winner={match.winnerTeam === "B"} />
        </div>

        <div className={styles.setList}>
          {match.sets.map((set) => (
            <SetScoreRow key={set.label} set={set} />
          ))}
        </div>

        {canCorrect || (match.status === "disputed" && canRevise) ? (
          <div className={styles.reviewSection}>
            <div className={styles.statusRow}>
              <p className={styles.disputeUntil}>Correct until {match.correctionUntil}</p>
            </div>
            <Link
              href={`/groups/${groupId}/matches/${match.id}/revise`}
              className={styles.reviseLink}
            >
              Correct result
            </Link>
          </div>
        ) : null}
      </article>
    </section>
  );
}

function TeamSummary({ team, winner }: { team: Team; winner: boolean }) {
  return (
    <div className={styles.teamSummary}>
      <div
        className={clsx(styles.teamHeading, winner ? styles.teamHeadingWinner : styles.teamHeadingOther)}
      >
        {winner ? <Medal aria-hidden="true" className={styles.medal} /> : null}
        <h3>{team.label}</h3>
      </div>
      <div
        className={clsx(styles.teamCard, winner ? styles.winningTeamCard : styles.otherTeamCard)}
      >
        {team.players.map((player, index) => (
          <div key={`${team.label}-${player.name}-${index}`} className={styles.playerRow}>
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
      <RatingValue rating={previous.rating} rd={previous.rd} />
      <span aria-hidden="true"> → </span>
      {ratingChange ? <RatingValue rating={ratingChange.next.rating} rd={ratingChange.next.rd} /> : <span aria-label="pending rating">…</span>}
    </p>
  );
}

function SetScoreRow({ set }: { set: SetScore }) {
  return (
    <div>
      <div className={styles.setHeading}>
        <h3>{set.label}</h3>
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
      <Icon aria-hidden="true" className={styles.setArrowIcon} />
      <span className={styles.srOnly}>Winner: Team {winner}</span>
    </div>
  );
}

function ScoreTile({ score, result }: { score: number; result: "Win" | "Loss" }) {
  const won = result === "Win";

  return (
    <div
      className={clsx(styles.scoreTile, won ? styles.winningScore : styles.losingScore)}
    >
      <p className={styles.score}>{score}</p>
      <p className={styles.result}>{result}</p>
    </div>
  );
}
