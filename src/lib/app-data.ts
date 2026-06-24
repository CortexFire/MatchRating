import { createSupabaseServiceClient, requireUserId } from "@/lib/supabase/server";

export type AppGroup = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
};

export type AppProfile = {
  id: string;
  name: string;
  initials: string;
};

export type AppPlayer = {
  id: string;
  name: string;
  initials: string;
  role: "Owner" | "Admin" | "Member";
  rating: number;
  rd: number;
  rank: number;
  gamesPlayed: number;
  status: "Active" | "Pending review";
};

type GroupRow = {
  id: string;
  name: string;
  description: string;
};

type MembershipRow = {
  group_id: string;
  role: "owner" | "admin" | "member";
  user_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
};

type RatingRow = {
  user_id: string;
  rating: number | string;
  rd: number | string;
  rank: number | null;
  games_played: number;
};

export async function getCurrentProfile(): Promise<AppProfile> {
  const userId = await requireUserId();
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("id, display_name")
    .eq("id", userId)
    .single();

  if (error) {
    throw error;
  }

  return toProfile(data as ProfileRow);
}

export async function listCurrentUserGroups(): Promise<AppGroup[]> {
  const userId = await requireUserId();
  const service = createSupabaseServiceClient();
  const { data: memberships, error } = await service
    .from("group_memberships")
    .select("group_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("left_at", null);

  if (error) {
    throw error;
  }

  const groupIds = [...new Set((memberships ?? []).map((row: { group_id: string }) => row.group_id))];
  if (!groupIds.length) {
    return [];
  }

  const [{ data: groups, error: groupsError }, { data: memberRows, error: membersError }] = await Promise.all([
    service.from("groups").select("id, name, description").in("id", groupIds).is("archived_at", null),
    service
      .from("group_memberships")
      .select("group_id")
      .in("group_id", groupIds)
      .eq("status", "active")
      .is("left_at", null),
  ]);

  if (groupsError) {
    throw groupsError;
  }

  if (membersError) {
    throw membersError;
  }

  const memberCounts = countBy(memberRows ?? [], "group_id");
  return (groups ?? []).map((group: GroupRow) => ({
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: memberCounts.get(group.id) ?? 0,
  }));
}

export async function getGroup(groupId: string): Promise<AppGroup | null> {
  await ensureCurrentUserCanReadGroup(groupId);
  const service = createSupabaseServiceClient();
  const [{ data: group, error }, { data: members, error: membersError }] = await Promise.all([
    service.from("groups").select("id, name, description").eq("id", groupId).is("archived_at", null).maybeSingle(),
    service
      .from("group_memberships")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("status", "active")
      .is("left_at", null),
  ]);

  if (error) {
    throw error;
  }

  if (membersError) {
    throw membersError;
  }

  if (!group) {
    return null;
  }

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: members?.length ?? 0,
  };
}

export async function listGroupPlayers(groupId: string): Promise<AppPlayer[]> {
  await ensureCurrentUserCanReadGroup(groupId);
  const service = createSupabaseServiceClient();
  const { data: memberships, error } = await service
    .from("group_memberships")
    .select("user_id, role")
    .eq("group_id", groupId)
    .eq("status", "active")
    .is("left_at", null);

  if (error) {
    throw error;
  }

  const memberRows = (memberships ?? []) as MembershipRow[];
  const userIds = memberRows.map((membership) => membership.user_id);
  if (!userIds.length) {
    return [];
  }

  const [{ data: profiles, error: profilesError }, { data: ratings, error: ratingsError }] = await Promise.all([
    service.from("profiles").select("id, display_name").in("id", userIds),
    service
      .from("group_rating_states")
      .select("user_id, rating, rd, rank, games_played")
      .eq("group_id", groupId)
      .in("user_id", userIds),
  ]);

  if (profilesError) {
    throw profilesError;
  }

  if (ratingsError) {
    throw ratingsError;
  }

  const profilesById = new Map((profiles ?? []).map((profile: ProfileRow) => [profile.id, profile]));
  const ratingsByUserId = new Map((ratings ?? []).map((rating: RatingRow) => [rating.user_id, rating]));

  return memberRows
    .map((membership, index) => {
      const profile = profilesById.get(membership.user_id);
      const rating = ratingsByUserId.get(membership.user_id);
      const name = profile?.display_name ?? "Unknown player";

      return {
        id: membership.user_id,
        name,
        initials: initialsFor(name),
        role: displayRole(membership.role),
        rating: Math.round(Number(rating?.rating ?? 1500)),
        rd: Math.round(Number(rating?.rd ?? 350)),
        rank: rating?.rank ?? index + 1,
        gamesPlayed: rating?.games_played ?? 0,
        status: "Active",
      } satisfies AppPlayer;
    })
    .sort((a, b) => a.rank - b.rank || b.rating - a.rating || a.name.localeCompare(b.name));
}

async function ensureCurrentUserCanReadGroup(groupId: string) {
  const userId = await requireUserId();
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("group_memberships")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .eq("status", "active")
    .is("left_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("You are not an active member of this group.");
  }
}

function toProfile(row: ProfileRow): AppProfile {
  return {
    id: row.id,
    name: row.display_name,
    initials: initialsFor(row.display_name),
  };
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function displayRole(role: MembershipRow["role"]): AppPlayer["role"] {
  if (role === "owner") {
    return "Owner";
  }

  if (role === "admin") {
    return "Admin";
  }

  return "Member";
}

function countBy<T extends Record<string, string>>(rows: T[], key: keyof T) {
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row[key], (counts.get(row[key]) ?? 0) + 1));
  return counts;
}



