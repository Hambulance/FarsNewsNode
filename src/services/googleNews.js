const Parser = require("rss-parser");
const he = require("he");
const crypto = require("crypto");

const { insertNewsItem, getNewsItemsNeedingFarsiRefresh, updateNewsTranslations } = require("../db");
const { translateToEnglish } = require("./translator");

const parser = new Parser({
  customFields: {
    item: [["source", "source", { keepArray: false }]]
  }
});

const RSS_FEED_URL = "https://news.google.com/rss/search?q=Iran&hl=en-US&gl=US&ceid=US:en";
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

function normalizeSummary(contentSnippet) {
  if (!contentSnippet) {
    return "";
  }

  return he.decode(contentSnippet).replace(/\s+/g, " ").trim();
}

function extractSourceName(item) {
  const source = item.source;

  if (!source) {
    return "Google News";
  }

  if (typeof source === "string") {
    return he.decode(source).trim();
  }

  if (typeof source === "object" && typeof source._ === "string") {
    return he.decode(source._).trim();
  }

  return "Google News";
}

function cleanTitle(rawTitle, sourceName) {
  const decodedTitle = he.decode(rawTitle || "").trim();
  const suffix = ` - ${sourceName}`;

  if (decodedTitle.endsWith(suffix)) {
    return decodedTitle.slice(0, -suffix.length).trim();
  }

  return decodedTitle;
}

function createFingerprint(title, sourceName) {
  const normalized = `${title}|${sourceName}`.toLowerCase().replace(/\s+/g, " ").trim();
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

async function fetchLatestIranNews() {
  const feed = await parser.parseURL(RSS_FEED_URL);
  const items = [];

  for (const item of feed.items || []) {
    const sourceName = extractSourceName(item);
    const originalTitle = cleanTitle(item.title, sourceName);
    const originalSummary = normalizeSummary(item.contentSnippet);

    const translatedTitle = await translateToEnglish(originalTitle);
    const translatedSummary = await translateToEnglish(originalSummary);

    items.push({
      source_guid: item.guid || item.link,
      content_fingerprint: createFingerprint(originalTitle, sourceName),
      source_url: item.link || "",
      google_news_url: item.link || "",
      source_name: sourceName,
      original_title: originalTitle,
      translated_title: translatedTitle,
      original_summary: originalSummary,
      translated_summary: translatedSummary,
      published_at: item.isoDate || new Date().toISOString()
    });
  }

  return items;
}

async function syncNews(onNewsSaved) {
  const fetchedItems = await fetchLatestIranNews();
  const insertedItems = [];

  for (const item of fetchedItems) {
    const inserted = insertNewsItem(item);
    if (inserted) {
      insertedItems.push(item);
    }
  }

  if (insertedItems.length > 0 && typeof onNewsSaved === "function") {
    onNewsSaved(insertedItems);
  }
}

async function refreshStoredTranslations(onNewsSaved) {
  const staleItems = getNewsItemsNeedingFarsiRefresh(150);
  if (staleItems.length === 0) {
    return;
  }

  for (const item of staleItems) {
    const translatedTitle = await translateToEnglish(item.originalTitle);
    const translatedSummary = await translateToEnglish(item.originalSummary || "");

    updateNewsTranslations({
      id: item.id,
      translatedTitle,
      translatedSummary
    });
  }

  if (typeof onNewsSaved === "function") {
    onNewsSaved([]);
  }
}

async function startNewsSync({ onNewsSaved }) {
  await refreshStoredTranslations(onNewsSaved);
  await syncNews(onNewsSaved);

  setInterval(() => {
    refreshStoredTranslations(onNewsSaved)
      .then(() => syncNews(onNewsSaved))
      .catch((error) => {
      console.error("Scheduled sync failed.", error);
      });
  }, SYNC_INTERVAL_MS);
}

module.exports = {
  startNewsSync
};
