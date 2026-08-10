export const DEFAULT_AUTH_NEXT_PATH = "/onboarding";

function hasEncodedPathDelimiter(pathname: string) {
  let decodedPathname = pathname.replaceAll("/", "");

  while (true) {
    try {
      decodedPathname = decodeURIComponent(decodedPathname);
    } catch {
      return false;
    }

    if (/[\\/]/.test(decodedPathname)) {
      return true;
    }

    if (!decodedPathname.includes("%")) {
      return false;
    }
  }
}

export function getSafeAuthNextPath(value: string | string[] | null | undefined): string {
  const nextPath = Array.isArray(value) ? value[0] : value;

  if (!nextPath || !nextPath.startsWith("/") || nextPath.startsWith("//") || nextPath.includes("\\")) {
    return DEFAULT_AUTH_NEXT_PATH;
  }

  const pathEnd = nextPath.search(/[?#]/);
  const pathname = pathEnd === -1 ? nextPath : nextPath.slice(0, pathEnd);
  if (hasEncodedPathDelimiter(pathname)) {
    return DEFAULT_AUTH_NEXT_PATH;
  }

  const url = new URL(nextPath, "https://matchrating.local");
  if (!url.pathname.startsWith("/") || url.pathname.startsWith("//") || url.pathname.includes("\\") || hasEncodedPathDelimiter(url.pathname)) {
    return DEFAULT_AUTH_NEXT_PATH;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
