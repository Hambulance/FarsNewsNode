import crypto from "crypto";

const transferSecret =
  process.env.TENSORRT_CHAT_TRANSFER_SECRET ||
  process.env.ADMIN_SESSION_SECRET ||
  process.env.SESSION_SECRET ||
  "fnn-tensorrt-chat-transfer-secret";

export const chatAccessCookieName = "tensorrt_chat_access";

type SignedTokenPayload = {
  expiresAt: number;
  signature: string;
};

function createSignature(expiresAt: number) {
  return crypto.createHmac("sha256", transferSecret).update(`${expiresAt}`).digest("base64url");
}

function parseSignedToken(value: string | undefined | null): SignedTokenPayload | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as SignedTokenPayload;
    if (!parsed.expiresAt || !parsed.signature) {
      return null;
    }

    return parsed;
  } catch (error) {
    return null;
  }
}

export function isValidAccessToken(value: string | undefined | null) {
  const parsed = parseSignedToken(value);
  if (!parsed) {
    return false;
  }

  if (Date.now() > Number(parsed.expiresAt)) {
    return false;
  }

  const expectedSignature = createSignature(Number(parsed.expiresAt));
  if (parsed.signature.length !== expectedSignature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(parsed.signature), Buffer.from(expectedSignature));
}

export function createAccessCookieValue() {
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;
  const signature = createSignature(expiresAt);
  return Buffer.from(JSON.stringify({ expiresAt, signature }), "utf8").toString("base64url");
}
