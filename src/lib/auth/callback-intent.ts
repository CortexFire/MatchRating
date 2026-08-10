import { randomBytes, timingSafeEqual } from "node:crypto";

const AUTH_CALLBACK_INTENT_BYTES = 32;
const AUTH_CALLBACK_INTENT_LENGTH = 43;
const AUTH_CALLBACK_INTENT_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type CookieDefinition = {
  name: string;
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: 3600;
  secure: boolean;
};

export function createAuthCallbackIntent(): string {
  return randomBytes(AUTH_CALLBACK_INTENT_BYTES).toString("base64url");
}

export function matchesAuthCallbackIntent(expected: string, received: string): boolean {
  if (!isAuthCallbackIntent(expected) || !isAuthCallbackIntent(received)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(received, "utf8"));
}

export function getAuthCallbackIntentCookie(secure: boolean): CookieDefinition {
  return {
    name: secure ? "__Host-matchrating-auth-intent" : "matchrating-auth-intent",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
    secure,
  };
}

function isAuthCallbackIntent(value: string): boolean {
  return value.length === AUTH_CALLBACK_INTENT_LENGTH && AUTH_CALLBACK_INTENT_PATTERN.test(value);
}
