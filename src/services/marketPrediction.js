const dayjs = require("dayjs");

const {
  getPredictionNewsContext,
  getAppCache,
  setAppCache
} = require("../db");
const { generateMarketPredictionFarsi } = require("./aiClient");

const CACHE_KEY = "market_prediction_fa_v1";
const CACHE_TTL_HOURS = 24;

function isFresh(updatedAt) {
  if (!updatedAt) {
    return false;
  }

  return dayjs().diff(dayjs(updatedAt), "hour", true) < CACHE_TTL_HOURS;
}

function formatPredictionRecord(record) {
  if (!record) {
    return null;
  }

  return {
    text: record.cacheValue,
    updatedAt: record.updatedAt,
    updatedAtFormatted: dayjs(record.updatedAt).format("YYYY/MM/DD HH:mm")
  };
}

async function refreshMarketPrediction() {
  const newsItems = await getPredictionNewsContext(24);
  if (newsItems.length === 0) {
    return null;
  }

  const predictionText = await generateMarketPredictionFarsi(newsItems);
  await setAppCache(CACHE_KEY, predictionText);
  const saved = await getAppCache(CACHE_KEY);
  return formatPredictionRecord(saved);
}

async function getMarketPrediction() {
  const cached = await getAppCache(CACHE_KEY);
  if (cached && isFresh(cached.updatedAt)) {
    return formatPredictionRecord(cached);
  }

  try {
    return await refreshMarketPrediction();
  } catch (error) {
    console.error("Market prediction refresh failed.", error);
    return formatPredictionRecord(cached);
  }
}

module.exports = {
  getMarketPrediction,
  refreshMarketPrediction
};
