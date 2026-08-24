export interface BasicAuth {
  username: string;
  password: string;
}

export function parseBasicAuth(req: Request): BasicAuth | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return null;
  }
  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length));
  } catch {
    return null;
  }
  const separator = decoded.indexOf(":");
  if (separator === -1) {
    return null;
  }
  return {
    username: decoded.slice(0, separator),
    password: decoded.slice(separator + 1),
  };
}

export function clientIp(req: Request): string | null {
  const direct = req.headers.get("x-real-ip");
  if (direct) {
    return direct.trim();
  }
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return null;
}

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIPv4(address: string): boolean {
  const match = IPV4_PATTERN.exec(address);
  if (!match) return false;
  return match.slice(1).every((octet) => Number(octet) <= 255);
}

export function isIPv6(address: string): boolean {
  return address.includes(":");
}

export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const bytesA = new Uint8Array(digestA);
  const bytesB = new Uint8Array(digestB);
  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) {
    diff |= bytesA[i] ^ bytesB[i];
  }
  return diff === 0;
}
