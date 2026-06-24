import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const DEMO_GROUP_ID = "11111111-1111-4111-8111-111111111111";

const DEFAULT_DEMO_EMAIL_DOMAIN = "demo.matchrating.app";
const DEMO_LOGIN_FLAG = "true";
const DEMO_GROUP = {
  name: "Wednesday Club Ladder",
  description: "Friendly competitive badminton ladder for weekly club nights.",
};

const demoPlayers = [
  { id: "alice", name: "Alice Tan", role: "Owner", rating: 1684, rd: 61, rank: 1, gamesPlayed: 26 },
  { id: "bea", name: "Bea Rivera", role: "Admin", rating: 1629, rd: 74, rank: 2, gamesPlayed: 21 },
  { id: "cory", name: "Cory Shah", role: "Member", rating: 1588, rd: 83, rank: 3, gamesPlayed: 18 },
  { id: "dev", name: "Dev Okafor", role: "Member", rating: 1547, rd: 92, rank: 4, gamesPlayed: 16 },
  { id: "emi", name: "Emi Wilson", role: "Member", rating: 1502, rd: 111, rank: 5, gamesPlayed: 11 },
  { id: "finn", name: "Finn Liu", role: "Member", rating: 1466, rd: 126, rank: 6, gamesPlayed: 9 },
  { id: "gia", name: "Gia Patel", role: "Member", rating: 1420, rd: 148, rank: 7, gamesPlayed: 5 },
  { id: "henry", name: "Henry Park", role: "Member", rating: 1394, rd: 170, rank: 8, gamesPlayed: 3 },
] as const;

type DemoPlayer = (typeof demoPlayers)[number];

type DemoAuthUser = {
  player: DemoPlayer;
  email: string;
  userId: string;
  tokenHash?: string;
};

export function isDemoLoginEnabled() {
  return process.env.DEMO_LOGIN_ENABLED === DEMO_LOGIN_FLAG;
}

export function getDemoPostLoginPath() {
  return `/groups/${DEMO_GROUP_ID}`;
}

export function getDemoPlayerByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return demoPlayers.find((player) => getDemoEmail(player.id) === normalizedEmail);
}

export async function ensureDemoFixtures(loginEmail: string, redirectTo: string) {
  const service = createSupabaseServiceClient();
  const users = await Promise.all(
    demoPlayers.map(async (player) => {
      const email = getDemoEmail(player.id);
      const { data, error } = await service.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });

      if (error) {
        throw error;
      }

      if (!data.user?.id) {
        throw new Error(`Could not create demo user for ${email}.`);
      }

      return {
        player,
        email,
        userId: data.user.id,
        tokenHash: data.properties?.hashed_token,
      } satisfies DemoAuthUser;
    }),
  );

  await upsertDemoRows(service, users);

  const selected = users.find((user) => user.email === loginEmail.trim().toLowerCase());
  if (!selected?.tokenHash) {
    throw new Error("Could not create demo sign-in token.");
  }

  return {
    email: selected.email,
    player: selected.player,
    tokenHash: selected.tokenHash,
    redirectTo: getDemoPostLoginPath(),
  };
}

function getDemoEmail(playerId: string) {
  return `${playerId}@${getDemoEmailDomain()}`;
}

function getDemoEmailDomain() {
  return (process.env.DEMO_EMAIL_DOMAIN ?? DEFAULT_DEMO_EMAIL_DOMAIN).trim().toLowerCase();
}

async function upsertDemoRows(
  service: ReturnType<typeof createSupabaseServiceClient>,
  users: DemoAuthUser[],
) {
  const owner = users.find((user) => user.player.role === "Owner") ?? users[0];

  await checked(
    service.from("profiles").upsert(
      users.map(({ player, userId }) => ({
        id: userId,
        display_name: player.name,
        avatar_url: null,
      })),
      { onConflict: "id" },
    ),
  );

  await checked(
    service.from("groups").upsert(
      {
        id: DEMO_GROUP_ID,
        owner_user_id: owner.userId,
        name: DEMO_GROUP.name,
        description: DEMO_GROUP.description,
        archived_at: null,
      },
      { onConflict: "id" },
    ),
  );

  await checked(
    service.from("group_memberships").upsert(
      users.map(({ player, userId }) => ({
        group_id: DEMO_GROUP_ID,
        user_id: userId,
        role: player.role.toLowerCase(),
        status: "active",
        left_at: null,
      })),
      { onConflict: "group_id,user_id" },
    ),
  );

  await checked(
    service.from("group_rating_states").upsert(
      users.map(({ player, userId }) => ({
        group_id: DEMO_GROUP_ID,
        user_id: userId,
        rating: player.rating,
        rd: player.rd,
        volatility: 0.06,
        games_played: player.gamesPlayed,
        rank: player.rank,
      })),
      { onConflict: "group_id,user_id" },
    ),
  );
}

async function checked(result: PromiseLike<{ error: unknown }>) {
  const { error } = await result;

  if (error) {
    throw error;
  }
}