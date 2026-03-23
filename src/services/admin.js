const crypto = require("crypto");

const { getAppCache, setAppCache } = require("../db");

const ADMIN_SETTINGS_KEY = "admin_settings_v1";
const ADMIN_COOKIE_NAME = "fnn_admin_session";
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "admin123";
const DEFAULT_PROVIDER = "openrouter";
const DEFAULT_OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET || "fnn-local-admin-secret";

function createPasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return {
    salt,
    hash
  };
}

function sanitizeProvider(value) {
  return value === "local" ? "local" : "openrouter";
}

async function ensureAdminSettings() {
  const existing = await getAppCache(ADMIN_SETTINGS_KEY);
  if (existing?.cacheValue) {
    try {
      const parsed = JSON.parse(existing.cacheValue);
      if (parsed.username && parsed.passwordHash && parsed.passwordSalt) {
        return {
          username: parsed.username,
          passwordHash: parsed.passwordHash,
          passwordSalt: parsed.passwordSalt,
          aiProvider: sanitizeProvider(parsed.aiProvider),
          openrouterApiKey: typeof parsed.openrouterApiKey === "string" ? parsed.openrouterApiKey : DEFAULT_OPENROUTER_API_KEY
        };
      }
    } catch (error) {
      // Recreate invalid settings payload below.
    }
  }

  const passwordState = createPasswordHash(DEFAULT_PASSWORD);
  const defaults = {
    username: DEFAULT_USERNAME,
    passwordHash: passwordState.hash,
    passwordSalt: passwordState.salt,
    aiProvider: DEFAULT_PROVIDER,
    openrouterApiKey: DEFAULT_OPENROUTER_API_KEY
  };
  await setAppCache(ADMIN_SETTINGS_KEY, JSON.stringify(defaults));
  return defaults;
}

async function getAdminSettings() {
  return ensureAdminSettings();
}

async function saveAdminSettings(settings) {
  const nextSettings = {
    username: settings.username,
    passwordHash: settings.passwordHash,
    passwordSalt: settings.passwordSalt,
    aiProvider: sanitizeProvider(settings.aiProvider),
    openrouterApiKey: typeof settings.openrouterApiKey === "string" ? settings.openrouterApiKey : ""
  };

  await setAppCache(ADMIN_SETTINGS_KEY, JSON.stringify(nextSettings));
  return nextSettings;
}

async function verifyAdminCredentials(username, password) {
  const settings = await getAdminSettings();
  if (username !== settings.username || !password) {
    return false;
  }

  const attemptedHash = crypto.scryptSync(password, settings.passwordSalt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(attemptedHash, "hex"), Buffer.from(settings.passwordHash, "hex"));
}

async function updateAdminCredentials({ username, password }) {
  const settings = await getAdminSettings();
  const nextUsername = String(username || "").trim() || settings.username;
  const nextPassword = String(password || "").trim();

  if (!nextUsername) {
    throw new Error("Username is required.");
  }

  if (nextPassword.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }

  const passwordState = createPasswordHash(nextPassword);
  return saveAdminSettings({
    ...settings,
    username: nextUsername,
    passwordHash: passwordState.hash,
    passwordSalt: passwordState.salt
  });
}

async function updateAiProvider(provider) {
  const settings = await getAdminSettings();
  return saveAdminSettings({
    ...settings,
    aiProvider: sanitizeProvider(provider)
  });
}

async function updateOpenRouterApiKey(apiKey) {
  const settings = await getAdminSettings();
  return saveAdminSettings({
    ...settings,
    openrouterApiKey: String(apiKey || "").trim()
  });
}

function createSessionSignature({ username, passwordHash, expiresAt }) {
  return crypto
    .createHmac("sha256", SESSION_SECRET)
    .update(`${username}:${passwordHash}:${expiresAt}`)
    .digest("base64url");
}

function encodeSessionCookie(settings) {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = {
    username: settings.username,
    expiresAt,
    signature: createSessionSignature({
      username: settings.username,
      passwordHash: settings.passwordHash,
      expiresAt
    })
  };

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function parseCookies(cookieHeader = "") {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((accumulator, item) => {
      const separatorIndex = item.indexOf("=");
      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = item.slice(0, separatorIndex);
      const value = item.slice(separatorIndex + 1);
      accumulator[key] = value;
      return accumulator;
    }, {});
}

function createCookieHeader(value, maxAgeSeconds) {
  const parts = [
    `${ADMIN_COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ];

  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function setAdminSessionCookie(res, settings) {
  res.setHeader("Set-Cookie", createCookieHeader(encodeSessionCookie(settings), Math.floor(SESSION_TTL_MS / 1000)));
}

function clearAdminSessionCookie(res) {
  res.setHeader("Set-Cookie", createCookieHeader("", 0));
}

async function getAuthenticatedAdmin(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const raw = cookies[ADMIN_COOKIE_NAME];
  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!payload.username || !payload.expiresAt || !payload.signature) {
      return null;
    }

    if (Date.now() > Number(payload.expiresAt)) {
      return null;
    }

    const settings = await getAdminSettings();
    if (payload.username !== settings.username) {
      return null;
    }

    const expectedSignature = createSessionSignature({
      username: settings.username,
      passwordHash: settings.passwordHash,
      expiresAt: Number(payload.expiresAt)
    });

    if (payload.signature.length !== expectedSignature.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(Buffer.from(payload.signature), Buffer.from(expectedSignature))) {
      return null;
    }

    return {
      username: settings.username
    };
  } catch (error) {
    return null;
  }
}

module.exports = {
  DEFAULT_PASSWORD,
  DEFAULT_PROVIDER,
  DEFAULT_USERNAME,
  clearAdminSessionCookie,
  getAdminSettings,
  getAuthenticatedAdmin,
  setAdminSessionCookie,
  updateAdminCredentials,
  updateAiProvider,
  updateOpenRouterApiKey,
  verifyAdminCredentials
};
