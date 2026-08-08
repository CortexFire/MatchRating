export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "NOT_GROUP_MEMBER"
  | "NOT_GROUP_ADMIN"
  | "INVALID_INPUT"
  | "STALE_REVISION"
  | "NOT_OPPOSING_REVIEWER"
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
  STALE_REVISION: "This match changed before your revision could be saved. Refresh and try again.",
  NOT_OPPOSING_REVIEWER: "One player from the opposing team must confirm or dispute.",
  COMMAND_CONFLICT: "This request ID was already used for a different action.",
};

const databaseCodeMap: Record<string, DomainErrorCode> = {
  MR401: "UNAUTHENTICATED",
  MR403: "NOT_GROUP_MEMBER",
  MRADM: "NOT_GROUP_ADMIN",
  MRVAL: "INVALID_INPUT",
  MR409: "STALE_REVISION",
  MRREV: "NOT_OPPOSING_REVIEWER",
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
