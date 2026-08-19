export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_GROUP_MEMBER"
  | "NOT_GROUP_ADMIN"
  | "NOT_MATCH_EDITOR"
  | "INVALID_INPUT"
  | "STALE_REVISION"
  | "CORRECTION_EXPIRED"
  | "COMMAND_CONFLICT"
  | "UNKNOWN";

export type CommandResult<T> =
  | { ok: true; data: T; message?: string }
  | { ok: false; code: DomainErrorCode; message: string };

type DatabaseError = { code?: string | null; message?: string | null } | null | undefined;

const errorMessages: Partial<Record<DomainErrorCode, string>> = {
  UNAUTHENTICATED: "Please sign in to continue.",
  NOT_GROUP_MEMBER: "You are not an active member of this group.",
  NOT_GROUP_ADMIN: "Only group admins can do that.",
  NOT_MATCH_EDITOR: "Only match participants or group admins can do that.",
  STALE_REVISION: "This match changed before your revision could be saved. Refresh and try again.",
  CORRECTION_EXPIRED: "The 30-day correction window has expired.",
  COMMAND_CONFLICT: "This request ID was already used for a different action.",
};

const databaseCodeMap: Record<string, DomainErrorCode> = {
  MR401: "UNAUTHENTICATED",
  MR403: "NOT_GROUP_MEMBER",
  MRADM: "NOT_GROUP_ADMIN",
  MRMAT: "NOT_MATCH_EDITOR",
  MRVAL: "INVALID_INPUT",
  MR409: "STALE_REVISION",
  MREXP: "CORRECTION_EXPIRED",
  MRCMD: "COMMAND_CONFLICT",
};

export function toCommandError(error: DatabaseError, fallback: string): CommandResult<never> {
  const code = error?.code ? databaseCodeMap[error.code] : undefined;

  if (!code) {
    return { ok: false, code: "UNKNOWN", message: fallback };
  }

  return {
    ok: false,
    code,
    message: errorMessages[code] ?? error?.message ?? fallback,
  };
}
