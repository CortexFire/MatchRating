import { type createSupabaseServiceClient } from "@/lib/supabase/server";

type SupabaseService = ReturnType<typeof createSupabaseServiceClient>;

export type GroupMembershipRole = "owner" | "admin" | "member";

export type VisibleGroupMembership = {
  groupId: string;
  userId: string;
  role: GroupMembershipRole;
  profile: {
    id: string;
    displayName: string;
    isGuest: boolean;
    activeUntil: string | null;
  } | null;
};

type MembershipRow = {
  group_id: string;
  user_id: string;
  role: GroupMembershipRole;
};

type ProfileRow = {
  id: string;
  display_name: string;
  is_guest: boolean;
  active_until: string | null;
};

type MatchParticipantRow = {
  revision_id: string;
  user_id: string;
};

type MatchRevisionRow = {
  id: string;
  match_id: string;
};

type MatchRow = {
  id: string;
  group_id: string;
};

type ActiveDraftRow = {
  group_id: string;
  team_a_user_ids: string[];
  team_b_user_ids: string[];
};

export async function listVisibleGroupMemberships(
  groupIds: string[],
  service: SupabaseService,
): Promise<VisibleGroupMembership[]> {
  const uniqueGroupIds = [...new Set(groupIds)];
  if (!uniqueGroupIds.length) return [];

  const { data: memberships, error: membershipError } = await service
    .from("group_memberships")
    .select("group_id, user_id, role")
    .in("group_id", uniqueGroupIds)
    .eq("status", "active")
    .is("left_at", null);

  if (membershipError) throw membershipError;

  const membershipRows = (memberships ?? []) as MembershipRow[];
  const userIds = [...new Set(membershipRows.map((membership) => membership.user_id))];
  if (!userIds.length) return [];

  const { data: profiles, error: profileError } = await service
    .from("profiles")
    .select("id, display_name, is_guest, active_until")
    .in("id", userIds);

  if (profileError) throw profileError;

  const profilesById = new Map((profiles ?? []).map((profile: ProfileRow) => [profile.id, profile]));
  const hydratedMemberships = membershipRows.map((membership) => {
    const profile = profilesById.get(membership.user_id);
    return {
      groupId: membership.group_id,
      userId: membership.user_id,
      role: membership.role,
      profile: profile
        ? {
            id: profile.id,
            displayName: profile.display_name,
            isGuest: profile.is_guest,
            activeUntil: profile.active_until,
          }
        : null,
    } satisfies VisibleGroupMembership;
  });
  const guestIds = [...new Set(
    hydratedMemberships.filter((membership) => membership.profile?.isGuest).map((membership) => membership.userId),
  )];
  if (!guestIds.length) return hydratedMemberships;

  const [{ data: participants, error: participantError }, { data: drafts, error: draftError }] = await Promise.all([
    service.from("match_participants").select("revision_id, user_id").in("user_id", guestIds),
    service
      .from("active_match_drafts")
      .select("group_id, team_a_user_ids, team_b_user_ids")
      .in("group_id", uniqueGroupIds)
      .is("submitted_match_id", null)
      .gt("expires_at", new Date().toISOString()),
  ]);

  if (participantError) throw participantError;
  if (draftError) throw draftError;

  const guestMembershipKeys = new Set(
    hydratedMemberships
      .filter((membership) => membership.profile?.isGuest)
      .map((membership) => membershipKey(membership.groupId, membership.userId)),
  );
  const associatedGuestKeys = new Set<string>();

  for (const draft of (drafts ?? []) as ActiveDraftRow[]) {
    for (const userId of [...draft.team_a_user_ids, ...draft.team_b_user_ids]) {
      const key = membershipKey(draft.group_id, userId);
      if (guestMembershipKeys.has(key)) associatedGuestKeys.add(key);
    }
  }

  const participantRows = (participants ?? []) as MatchParticipantRow[];
  const revisionIds = [...new Set(participantRows.map((participant) => participant.revision_id))];
  if (revisionIds.length) {
    const { data: revisions, error: revisionError } = await service
      .from("match_revisions")
      .select("id, match_id")
      .in("id", revisionIds);
    if (revisionError) throw revisionError;

    const revisionRows = (revisions ?? []) as MatchRevisionRow[];
    const matchIds = [...new Set(revisionRows.map((revision) => revision.match_id))];
    if (matchIds.length) {
      const { data: matches, error: matchError } = await service
        .from("matches")
        .select("id, group_id")
        .in("id", matchIds)
        .in("group_id", uniqueGroupIds);
      if (matchError) throw matchError;

      const matchGroupById = new Map(((matches ?? []) as MatchRow[]).map((match) => [match.id, match.group_id]));
      const matchIdByRevisionId = new Map(revisionRows.map((revision) => [revision.id, revision.match_id]));
      for (const participant of participantRows) {
        const matchId = matchIdByRevisionId.get(participant.revision_id);
        const groupId = matchId ? matchGroupById.get(matchId) : undefined;
        if (!groupId) continue;
        const key = membershipKey(groupId, participant.user_id);
        if (guestMembershipKeys.has(key)) associatedGuestKeys.add(key);
      }
    }
  }

  return hydratedMemberships.filter(
    (membership) =>
      !membership.profile?.isGuest || associatedGuestKeys.has(membershipKey(membership.groupId, membership.userId)),
  );
}

function membershipKey(groupId: string, userId: string) {
  return `${groupId}:${userId}`;
}
