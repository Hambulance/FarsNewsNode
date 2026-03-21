const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
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

function initializeDatabase() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL;");

  db.exec(`
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

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_news_items_published_at
    ON news_items (published_at DESC, id DESC);
  `);

  ensureColumn("content_fingerprint", "TEXT");
  backfillContentFingerprints();
  removeDuplicateFingerprints();

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_news_items_content_fingerprint
    ON news_items (content_fingerprint);
  `);
}

function getDatabase() {
  if (!db) {
    throw new Error("Database not initialized.");
  }

  return db;
}

function ensureColumn(columnName, typeDefinition) {
  const columns = getDatabase().prepare("PRAGMA table_info(news_items)").all();
  const exists = columns.some((column) => column.name === columnName);

  if (!exists) {
    getDatabase().exec(`ALTER TABLE news_items ADD COLUMN ${columnName} ${typeDefinition}`);
  }
}

function backfillContentFingerprints() {
  const rows = getDatabase()
    .prepare(`
      SELECT id, original_title AS originalTitle, source_name AS sourceName, content_fingerprint AS contentFingerprint
      FROM news_items
    `)
    .all();

  const updateStatement = getDatabase().prepare(`
    UPDATE news_items
    SET content_fingerprint = :contentFingerprint
    WHERE id = :id
  `);

  for (const row of rows) {
    if (row.contentFingerprint) {
      continue;
    }

    const normalized = `${row.originalTitle}|${row.sourceName}`.toLowerCase().replace(/\s+/g, " ").trim();
    const contentFingerprint = crypto.createHash("sha256").update(normalized).digest("hex");
    updateStatement.run({ id: row.id, contentFingerprint });
  }
}

function removeDuplicateFingerprints() {
  getDatabase().exec(`
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

function insertNewsItem(item) {
  const statement = getDatabase().prepare(`
    INSERT INTO news_items (
      source_guid,
      content_fingerprint,
      source_url,
      google_news_url,
      source_name,
      original_title,
      translated_title,
      original_summary,
      translated_summary,
      published_at
    ) VALUES (
      @source_guid,
      @content_fingerprint,
      @source_url,
      @google_news_url,
      @source_name,
      @original_title,
      @translated_title,
      @original_summary,
      @translated_summary,
      @published_at
    )
    ON CONFLICT DO NOTHING
  `);

  const result = statement.run(item);
  return result.changes > 0;
}

function getNewsItemsNeedingFarsiRefresh(limit = 100) {
  return getDatabase()
    .prepare(`
      SELECT
        id,
        original_title AS originalTitle,
        original_summary AS originalSummary,
        translated_title AS translatedTitle,
        translated_summary AS translatedSummary
      FROM news_items
      ORDER BY datetime(published_at) DESC, id DESC
      LIMIT ?
    `)
    .all(limit)
    .filter((item) => needsFarsiRefresh(item.translatedTitle) || needsFarsiRefresh(item.translatedSummary));
}

function updateNewsTranslations({ id, translatedTitle, translatedSummary }) {
  getDatabase()
    .prepare(`
      UPDATE news_items
      SET translated_title = :translatedTitle,
          translated_summary = :translatedSummary
      WHERE id = :id
    `)
    .run({
      id,
      translatedTitle,
      translatedSummary
    });
}

function needsFarsiRefresh(text) {
  if (!text) {
    return false;
  }

  return !/[\u0600-\u06FF]/.test(text);
}

function getNewsPage(page, pageSize) {
  const offset = (page - 1) * pageSize;
  const items = getDatabase()
    .prepare(`
      SELECT
        id,
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
      ORDER BY datetime(published_at) DESC, id DESC
      LIMIT ? OFFSET ?
    `)
    .all(pageSize, offset);

  const newestVisibleIds = new Set(
    getDatabase()
      .prepare(`
        SELECT id
        FROM news_items
        ORDER BY datetime(published_at) DESC, id DESC
        LIMIT 10
      `)
      .all()
      .map((item) => item.id)
  );

  return items.map((item) => ({
    ...item,
    originalTitle: stripSourceSuffix(item.originalTitle, item.sourceName),
    translatedTitle: stripSourceSuffix(item.translatedTitle, item.sourceName),
    isNew: newestVisibleIds.has(item.id),
    publishedAtFormatted: dayjs(item.publishedAt).format("YYYY/MM/DD HH:mm"),
    createdAtFormatted: dayjs(item.createdAt).format("YYYY/MM/DD HH:mm")
  }));
}

function getNewsCount() {
  const row = getDatabase().prepare("SELECT COUNT(*) AS total FROM news_items").get();
  return row.total;
}

function getTopTickerItems(limit) {
  return getDatabase()
    .prepare(`
      SELECT
        id,
        source_name AS sourceName,
        translated_title AS translatedTitle
      FROM news_items
      ORDER BY datetime(published_at) DESC, id DESC
      LIMIT ?
    `)
    .all(limit)
    .map((item) => ({
      ...item,
      translatedTitle: stripSourceSuffix(item.translatedTitle, item.sourceName)
    }));
}

module.exports = {
  initializeDatabase,
  insertNewsItem,
  getNewsPage,
  getNewsCount,
  getTopTickerItems,
  getNewsItemsNeedingFarsiRefresh,
  updateNewsTranslations
};
