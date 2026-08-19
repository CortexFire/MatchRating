"use client";

import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useNavigationSync } from "@/components/app/navigation-sync";
import { type AppGroup } from "@/lib/app-data";
import styles from "./group-switcher.module.css";

export type GroupOption = Pick<AppGroup, "id" | "name">;

export function GroupSwitcher({
  groups,
  currentGroupId,
  disabled = false,
}: {
  groups: GroupOption[];
  currentGroupId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const syncBeforeNavigation = useNavigationSync();
  const currentGroup = groups.find((group) => group.id === currentGroupId);

  async function switchGroup(nextGroupId: string) {
    if (nextGroupId === currentGroupId) {
      return;
    }

    if (!window.confirm("Switch groups? Your current draft will be saved before switching.")) return;

    try {
      await syncBeforeNavigation();
    } catch {
      // Leaving after a failed sync is the selected product behavior.
    } finally {
      router.push(`/groups/${nextGroupId}/matches/new`);
    }
  }

  return (
    <div className={styles.container}>
      <select
        aria-label={`Current group ${currentGroup?.name ?? "Group"}`}
        className={clsx(styles.select, groups.length > 1 ? styles.selectWithIndicator : styles.selectWithoutIndicator)}
        value={currentGroupId}
        disabled={disabled || groups.length <= 1}
        onChange={(event) => switchGroup(event.target.value)}
      >
        {groups.map((group) => (
          <option key={group.id} value={group.id}>{group.name}</option>
        ))}
      </select>
      {groups.length > 1 ? <ChevronDown aria-hidden className={styles.indicator} /> : null}
    </div>
  );
}
