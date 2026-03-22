const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sqlite3 = require("sqlite3");
const dayjs = require("dayjs");

const dataDirectory = path.join(__dirname, "..", "data");
const databasePath = path.join(dataDirectory, "news.db");

let db;

function stripSourceSuffix(title, sourceName) {
  if (!title) {
    return "";
  }

  const suffix = ` - ${sourceName}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

function normalizeSourceName(sourceName) {
  if (sourceName === "The Washington Post") {
    return "TWP";
  }

  return sourceName;
}

function getDatabase() {
  if (!db) {
    throw new Error("Database not initialized.");
  }

  return db;
}

function exec(sql) {
  return new Promise((resolve, reject) => {
    getDatabase().exec(sql, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }

      resolve({
        changes: this.changes,
        lastID: this.lastID
      });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row || null);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    getDatabase().all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows || []);
    });
  });
}

async function initializeDatabase() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  db = await new Promise((resolve, reject) => {
    const connection = new sqlite3.Database(databasePath, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(connection);
    });
  });

  await exec("PRAGMA journal_mode = WAL;");

  await exec(`
    CREATE TABLE IF NOT EXISTS news_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_guid TEXT NOT NULL UNIQUE,
      content_fingerprint TEXT NOT NULL UNIQUE,
      source_url TEXT NOT NULL,
      google_news_url TEXT NOT NULL,
      source_name TEXT NOT NULL,
      original_title TEXT NOT NULL,
      translated_title TEXT NOT NULL,
      original_summary TEXT,
      translated_summary TEXT,
      published_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await exec(`
    CREATE INDEX IF NOT EXISTS idx_news_items_published_at
    ON news_items (published_at DESC, id DESC);
  `);

  await ensureColumn("content_fingerprint", "TEXT");
  await ensureColumn("is_new", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("image_url", "TEXT");
  await ensureColumn("full_article_source_url", "TEXT");
  await ensureColumn("full_article_original", "TEXT");
  await ensureColumn("full_article_farsi", "TEXT");
  await ensureColumn("full_article_translated_at", "TEXT");
  await backfillContentFingerprints();
  await removeDuplicateFingerprints();

  await exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_content_fingerprint
    ON news_items (content_fingerprint);
  `);

  await exec(`
    CREATE TABLE IF NOT EXISTS app_cache (
      cache_key TEXT PRIMARY KEY,
      cache_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function ensureColumn(columnName, typeDefinition) {
  const columns = await all("PRAGMA table_info(news_items)");
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    await exec(`ALTER TABLE news_items ADD COLUMN ${columnName} ${typeDefinition}`);
  }
}

async function backfillContentFingerprints() {
  const rows = await all(`
    SELECT id, original_title AS originalTitle, source_name AS sourceName, content_fingerprint AS contentFingerprint
    FROM news_items
  `);

  for (const row of rows) {
    if (row.contentFingerprint) {
      continue;
    }

    const normalized = `${row.originalTitle}|${row.sourceName}`.toLowerCase().replace(/\s+/g, " ").trim();
    const contentFingerprint = crypto.createHash("sha256").update(normalized).digest("hex");
    await run("UPDATE news_items SET content_fingerprint = ? WHERE id = ?", [contentFingerprint, row.id]);
  }
}

async function removeDuplicateFingerprints() {
  await exec(`
    DELETE FROM news_items
    WHERE id NOT IN (
      SELECT MAX(id)
      FROM news_items
      WHERE content_fingerprint IS NOT NULL
      GROUP BY content_fingerprint
    )
    AND content_fingerprint IS NOT NULL
  `);
}

async function insertNewsItem(item) {
  const result = await run(
    `
      INSERT INTO news_items (
        source_guid,
        content_fingerprint,
        is_new,
        image_url,
        source_url,
        google_news_url,
        source_name,
        original_title,
        translated_title,
        original_summary,
        translated_summary,
        published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT DO NOTHING
    `,
    [
      item.source_guid,
      item.content_fingerprint,
      item.is_new ? 1 : 0,
      item.image_url || "",
      item.source_url,
      item.google_news_url,
      item.source_name,
      item.original_title,
      item.translated_title,
      item.original_summary,
      item.translated_summary,
      item.published_at
    ]
  );

  return {
    inserted: result.changes > 0,
    id: result.lastID || null
  };
}

async function getExistingContentFingerprints(fingerprints) {
  if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
    return new Set();
  }

  const placeholders = fingerprints.map(() => "?").join(", ");
  const rows = await all(
    `
      SELECT content_fingerprint AS contentFingerprint
      FROM news_items
      WHERE content_fingerprint IN (${placeholders})
    `,
    fingerprints
  );

  return new Set(rows.map((row) => row.contentFingerprint));
}

async function getNewsItemsNeedingFarsiRefresh(limit = 100) {
  return (await all(
    `
      SELECT
        id,
        original_title AS originalTitle,
        original_summary AS originalSummary,
        translated_title AS translatedTitle,
        translated_summary AS translatedSummary
      FROM news_items
      ORDER BY datetime(published_at) DESC, id DESC
      LIMIT ?
    `,
    [limit]
  )).filter((item) => needsFarsiRefresh(item.translatedTitle) || needsFarsiRefresh(item.translatedSummary));
}

async function updateNewsTranslations({ id, translatedTitle, translatedSummary }) {
  const updates = [];
  const params = [];

  if (typeof translatedTitle === "string") {
    updates.push("translated_title = ?");
    params.push(translatedTitle);
  }

  if (typeof translatedSummary === "string") {
    updates.push("translated_summary = ?");
    params.push(translatedSummary);
  }

  if (updates.length === 0) {
    return;
  }

  params.push(id);

  await run(
    `
      UPDATE news_items
      SET ${updates.join(", ")}
      WHERE id = ?
    `,
    params
  );
}

async function getNewsItemsMissingImages(limit = 24) {
  return all(
    `
      SELECT
        id,
        source_url AS sourceUrl
      FROM news_items
      WHERE COALESCE(image_url, '') = ''
      ORDER BY datetime(published_at) DESC, id DESC
      LIMIT ?
    `,
    [limit]
  );
}

async function updateNewsImage({ id, imageUrl, sourceUrl }) {
  await run(
    `
      UPDATE news_items
      SET image_url = ?,
          source_url = ?
      WHERE id = ?
    `,
    [imageUrl || "", sourceUrl || "", id]
  );
}

async function markOnlyItemsAsNew(ids) {
  await run("UPDATE news_items SET is_new = 0");

  if (!Array.isArray(ids) || ids.length === 0) {
    return;
  }

  const placeholders = ids.map(() => "?").join(", ");
  await run(`UPDATE news_items SET is_new = 1 WHERE id IN (${placeholders})`, ids);
}

async function getNewsItemById(id) {
  const item = await get(
    `
      SELECT
        id,
        is_new AS isNew,
        source_url AS sourceUrl,
        google_news_url AS googleNewsUrl,
        source_name AS sourceName,
        original_title AS originalTitle,
        translated_title AS translatedTitle,
        original_summary AS originalSummary,
        translated_summary AS translatedSummary,
        full_article_source_url AS fullArticleSourceUrl,
        full_article_original AS fullArticleOriginal,
        full_article_farsi AS fullArticleFarsi,
        full_article_translated_at AS fullArticleTranslatedAt,
        published_at AS publishedAt
      FROM news_items
      WHERE id = ?
    `,
    [id]
  );

  if (!item) {
    return null;
  }

  return {
    ...item,
    sourceName: normalizeSourceName(item.sourceName),
    originalTitle: stripSourceSuffix(item.originalTitle, normalizeSourceName(item.sourceName)),
    translatedTitle: stripSourceSuffix(item.translatedTitle, normalizeSourceName(item.sourceName))
  };
}

async function getPredictionNewsContext(limit = 24) {
  return all(
    `
      SELECT
        id,
        source_name AS sourceName,
        translated_title AS translatedTitle,
        translated_summary AS translatedSummary,
        published_at AS publishedAt
      FROM news_items
      ORDER BY datetime(published_at) DESC, id DESC
      LIMIT ?
    `,
    [limit]
  );
}

async function getAppCache(key) {
  return get(
    `
      SELECT
        cache_key AS cacheKey,
        cache_value AS cacheValue,
        updated_at AS updatedAt
      FROM app_cache
      WHERE cache_key = ?
    `,
    [key]
  );
}

async function setAppCache(key, value) {
  await run(
    `
      INSERT INTO app_cache (cache_key, cache_value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(cache_key) DO UPDATE SET
        cache_value = excluded.cache_value,
        updated_at = CURRENT_TIMESTAMP
    `,
    [key, value]
  );
}

async function updateFullArticleTranslation({ id, fullArticleSourceUrl, fullArticleOriginal, fullArticleFarsi }) {
  await run(
    `
      UPDATE news_items
      SET full_article_source_url = ?,
          full_article_original = ?,
          full_article_farsi = ?,
          full_article_translated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [fullArticleSourceUrl, fullArticleOriginal, fullArticleFarsi, id]
  );
}

function needsFarsiRefresh(text) {
  if (!text) {
    return true;
  }

  return /[A-Za-z]{4,}/.test(text) || !/[\u0600-\u06FF]/.test(text);
}

async function getNewsPage(page, pageSize) {
  const offset = (page - 1) * pageSize;
  const items = await all(
    `
      SELECT
        id,
        CASE
          WHEN is_new = 1 AND datetime(created_at) >= datetime('now', '-5 minutes') THEN 1
          ELSE 0
        END AS isNew,
        image_url AS imageUrl,
        source_url AS sourceUrl,
        google_news_url AS googleNewsUrl,
        source_name AS sourceName,
        original_title AS originalTitle,
        translated_title AS translatedTitle,
        original_summary AS originalSummary,
        translated_summary AS translatedSummary,
        published_at AS publishedAt,
        created_at AS createdAt
      FROM news_items
      ORDER BY
        CASE
          WHEN is_new = 1 AND datetime(created_at) >= datetime('now', '-5 minutes') THEN 1
          ELSE 0
        END DESC,
        datetime(published_at) DESC,
        id DESC
      LIMIT ? OFFSET ?
    `,
    [pageSize, offset]
  );

  return items.map((item) => ({
    ...item,
    sourceName: normalizeSourceName(item.sourceName),
    originalTitle: stripSourceSuffix(item.originalTitle, normalizeSourceName(item.sourceName)),
    translatedTitle: stripSourceSuffix(item.translatedTitle, normalizeSourceName(item.sourceName)),
    isNew: Boolean(item.isNew),
    publishedAtFormatted: dayjs(item.publishedAt).format("YYYY/MM/DD HH:mm"),
    createdAtFormatted: dayjs(item.createdAt).format("YYYY/MM/DD HH:mm")
  }));
}

async function getNewsCount() {
  const row = await get("SELECT COUNT(*) AS total FROM news_items");
  return row?.total || 0;
}

async function getTopTickerItems(limit) {
  return (await all(
    `
      SELECT
        id,
        source_name AS sourceName,
        image_url AS imageUrl,
        translated_title AS translatedTitle
      FROM news_items
      ORDER BY
        CASE
          WHEN is_new = 1 AND datetime(created_at) >= datetime('now', '-5 minutes') THEN 1
          ELSE 0
        END DESC,
        datetime(published_at) DESC,
        id DESC
      LIMIT ?
    `,
    [limit]
  )).map((item) => ({
    ...item,
    sourceName: normalizeSourceName(item.sourceName),
    translatedTitle: stripSourceSuffix(item.translatedTitle, normalizeSourceName(item.sourceName))
  }));
}

module.exports = {
  initializeDatabase,
  insertNewsItem,
  getExistingContentFingerprints,
  getNewsItemsNeedingFarsiRefresh,
  getNewsItemsMissingImages,
  getPredictionNewsContext,
  getAppCache,
  getNewsPage,
  getNewsCount,
  getTopTickerItems,
  getNewsItemById,
  markOnlyItemsAsNew,
  setAppCache,
  updateNewsImage,
  updateNewsTranslations,
  updateFullArticleTranslation
};
