const translate = require("translate-google");

function normalizeForTranslation(text) {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

async function translateToEnglish(text) {
  if (!text) {
    return "";
  }

  const normalizedText = normalizeForTranslation(text);

  try {
    return await translate(normalizedText, { to: "fa" });
  } catch (error) {
    console.error("Translation failed, using original text.", error.message);
    return normalizedText;
  }
}

module.exports = { translateToEnglish };
