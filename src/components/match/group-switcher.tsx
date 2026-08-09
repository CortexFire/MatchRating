"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { type AppGroup } from "@/lib/app-data";

export type GroupOption = Pick<AppGroup, "id" | "name">;

export function GroupSwitcher({
  groups,
  currentGroupId,
}: {
  groups: GroupOption[];
  currentGroupId: string;
}) {
  const router = useRouter();
  const currentGroup = groups.find((group) => group.id === currentGroupId);

  function switchGroup(nextGroupId: string) {
    if (nextGroupId === currentGroupId) {
      return;
    }

    if (window.confirm("Switch groups? Your current match setup will be discarded.")) {
      router.push(`/groups/${nextGroupId}/matches/new`);
    }
  }

  return (
    <div className="relative inline-flex min-h-11 items-center rounded-full bg-victory text-sm font-bold text-ink">
      <select
        aria-label={`Current group ${currentGroup?.name ?? "Group"}`}
        className="min-h-11 appearance-none bg-transparent py-2 pl-4 pr-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:cursor-default"
        value={currentGroupId}
        disabled={groups.length <= 1}
        onChange={(event) => switchGroup(event.target.value)}
      >
        {groups.map((group) => (
          <option key={group.id} value={group.id}>{group.name}</option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-4 size-4 stroke-[3]" />
    </div>
  );
}
