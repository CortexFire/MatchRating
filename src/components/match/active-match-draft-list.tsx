import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { type AppActiveMatchDraft } from "@/lib/app-data";

export function ActiveMatchDraftList({ drafts }: { drafts: AppActiveMatchDraft[] }) {
  if (!drafts.length) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-ink">Active matches</h2>
      <div className="flex flex-col gap-2">
        {drafts.map((draft) => (
          <Link
            key={draft.id}
            href={`/groups/${draft.groupId}/matches/new?draftId=${draft.id}`}
            className="block rounded-lg border border-stroke bg-surface p-3 transition hover:border-selection-stroke focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold capitalize text-ink">{draft.format}</p>
                  <Badge tone={draft.role === "Creator" ? "selected" : "neutral"}>{draft.role}</Badge>
                </div>
                <p className="mt-1 truncate text-sm font-semibold text-ink">
                  {draft.teamA.join(" / ")} vs {draft.teamB.join(" / ")}
                </p>
                <p className="mt-1 truncate text-xs text-muted">{draft.groupName}</p>
              </div>
              <p className="shrink-0 text-right text-sm font-bold text-ink">{draft.scores.join(", ")}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}