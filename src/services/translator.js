const { rewriteHeadlineToFarsi, rewriteSummaryToFarsi } = require("./openRouter");

function normalizeForTranslation(text) {
  return text
    .replace(/[â€˜â€™]/g, "'")
    .replace(/[â€œâ€]/g, '"')
    .replace(/â€¦/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

function looksWeakTranslation(text) {
  if (!text) {
    return true;
  }

  return /[A-Za-z]{4,}/.test(text) || text.length < 8;
}

async function translateHeadlineToFarsi(text) {
  if (!text) {
    return "";
  }

  const normalizedText = normalizeForTranslation(text);

  try {
    const translated = await rewriteHeadlineToFarsi(normalizedText);
    return looksWeakTranslation(translated) ? normalizedText : translated;
  } catch (error) {
    console.error("OpenRouter headline translation failed, using original text.", error.message);
    return normalizedText;
  }
}

async function translateSummaryToFarsi(text) {
  if (!text) {
    return "";
  }

  const normalizedText = normalizeForTranslation(text);

  try {
    const translated = await rewriteSummaryToFarsi(normalizedText);
    return looksWeakTranslation(translated) ? normalizedText : translated;
  } catch (error) {
    console.error("OpenRouter summary translation failed, using original text.", error.message);
    return normalizedText;
  }
}

async function generateNewsSummaryToFarsi({ title, summary }) {
  const mergedInput = [title, summary].filter(Boolean).join("\n");
  if (!mergedInput) {
    return "";
  }

  return translateSummaryToFarsi(mergedInput);
}

module.exports = {
  translateHeadlineToFarsi,
  translateSummaryToFarsi,
  generateNewsSummaryToFarsi
};
