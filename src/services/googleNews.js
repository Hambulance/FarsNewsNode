const Parser = require("rss-parser");
const he = require("he");
const crypto = require("crypto");

const {
  insertNewsItem,
  getExistingContentFingerprints
} = require("../db");
const { translateHeadlineToFarsi, generateNewsSummaryToFarsi } = require("./translator");

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
  const rawItems = (feed.items || []).map((item) => {
    const sourceName = extractSourceName(item);
    const originalTitle = cleanTitle(item.title, sourceName);
    const originalSummary = normalizeSummary(item.contentSnippet);
    return {
      source_guid: item.guid || item.link,
      content_fingerprint: createFingerprint(originalTitle, sourceName),
      source_url: item.link || "",
      google_news_url: item.link || "",
      source_name: sourceName,
      original_title: originalTitle,
      translated_title: "",
      original_summary: originalSummary,
      translated_summary: "",
      published_at: item.isoDate || new Date().toISOString()
    };
  });

  const existingFingerprints = await getExistingContentFingerprints(
    rawItems.map((item) => item.content_fingerprint)
  );
  const newItems = [];

  for (const item of rawItems) {
    if (existingFingerprints.has(item.content_fingerprint)) {
      continue;
    }

    item.translated_title = await translateHeadlineToFarsi(item.original_title);
    item.translated_summary = await generateNewsSummaryToFarsi({
      title: item.original_title,
      summary: item.original_summary
    });
    newItems.push(item);
  }

  return newItems;
}

async function syncNews(onNewsSaved) {
  const fetchedItems = await fetchLatestIranNews();
  const insertedItems = [];

  for (const item of fetchedItems) {
    const inserted = await insertNewsItem(item);
    if (inserted) {
      insertedItems.push(item);
    }
  }

  if (insertedItems.length > 0 && typeof onNewsSaved === "function") {
    onNewsSaved(insertedItems);
  }
}

async function startNewsSync({ onNewsSaved }) {
  await syncNews(onNewsSaved);

  setInterval(() => {
    syncNews(onNewsSaved)
      .catch((error) => {
        console.error("Scheduled sync failed.", error);
      });
  }, SYNC_INTERVAL_MS);
}

module.exports = {
  startNewsSync
};
