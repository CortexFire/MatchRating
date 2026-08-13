import { cacheLife, cacheTag } from "next/cache";
import {
  canCurrentUserReadGroup,
  type AppProfile,
} from "@/lib/app-data";
import { createSupabaseServiceClient, requireUserId } from "@/lib/supabase/server";

export type AppGroupMetadata = {
  id: string;
  name: string;
  description: string;
};

const PRIVATE_METADATA_LIFETIME = {
  stale: 300,
  revalidate: 900,
  expire: 3600,
} as const;

export function profileCacheTag(userId: string) {
  return `profile:${userId}`;
}

export function groupMetadataCacheTag(groupId: string) {
  return `group-metadata:${groupId}`;
}

export async function getPrivateCurrentProfile(): Promise<AppProfile> {
  const userId = await requireUserId();
  return readPrivateProfile(userId);
}

async function readPrivateProfile(userId: string): Promise<AppProfile> {
  "use cache: private";

  cacheLife(PRIVATE_METADATA_LIFETIME);
  cacheTag(profileCacheTag(userId));

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("id, display_name")
    .eq("id", userId)
    .single();

  if (error) throw error;
  const name = data.display_name;
  return {
    id: data.id,
    name,
    initials: initialsFor(name),
  };
}

export async function getPrivateGroupMetadata(groupId: string): Promise<AppGroupMetadata | null> {
  if (!(await canCurrentUserReadGroup(groupId))) return null;
  return readPrivateGroupMetadata(groupId);
}

async function readPrivateGroupMetadata(groupId: string): Promise<AppGroupMetadata | null> {
  "use cache: private";

  cacheLife(PRIVATE_METADATA_LIFETIME);
  cacheTag(groupMetadataCacheTag(groupId));

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("groups")
    .select("id, name, description")
    .eq("id", groupId)
    .is("archived_at", null)
    .maybeSingle();

  if (error) throw error;
  return data as AppGroupMetadata | null;
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}
