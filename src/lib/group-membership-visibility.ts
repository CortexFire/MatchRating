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

export async function listVisibleGroupMemberships(
  groupIds: string[],
  service: SupabaseService,
): Promise<VisibleGroupMembership[]> {
  const uniqueGroupIds = [...new Set(groupIds)];
  if (!uniqueGroupIds.length) return [];

  const { data, error } = await service.rpc("list_visible_group_memberships_v2", {
    p_group_ids: uniqueGroupIds,
  });
  if (error) throw error;

  return ((data ?? []) as Array<MembershipRow & Omit<ProfileRow, "id">>).map((membership) => {
    const hasProfile = membership.display_name !== null && membership.display_name !== undefined;
    return {
      groupId: membership.group_id,
      userId: membership.user_id,
      role: membership.role,
      profile: hasProfile
        ? {
            id: membership.user_id,
            displayName: membership.display_name,
            isGuest: membership.is_guest,
            activeUntil: membership.active_until,
          }
        : null,
    } satisfies VisibleGroupMembership;
  });
}
