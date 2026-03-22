const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const GoogleNewsDecoder = require("google-news-decoder");

const decoder = new GoogleNewsDecoder();

function sanitizeArticleText(text) {
  return (text || "")
    .replace(/\[(photo|image|video)[^\]]*\]/gi, " ")
    .replace(/photo[:\s].*/gi, " ")
    .replace(/image credit[:\s].*/gi, " ")
    .replace(/credit[:\s].*/gi, " ")
    .replace(/\b(getty images|associated press|ap photo|reuters)\b/gi, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function getAbsoluteUrl(candidate, baseUrl) {
  if (!candidate) {
    return "";
  }

  try {
    return new URL(candidate, baseUrl).toString();
  } catch (error) {
    return "";
  }
}

function extractLeadImageUrl(document, baseUrl) {
  const selectors = [
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="og:image:url"]',
    'meta[name="twitter:image:src"]'
  ];

  for (const selector of selectors) {
    const value = document.querySelector(selector)?.getAttribute("content") || "";
    const absoluteUrl = getAbsoluteUrl(value, baseUrl);
    if (absoluteUrl) {
      return absoluteUrl;
    }
  }

  const firstImage = document.querySelector("article img, main img, img");
  return getAbsoluteUrl(firstImage?.getAttribute("src") || "", baseUrl);
}

async function fetchArticleContent(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const decodedResult = url.includes("news.google.com")
      ? await decoder.decodeGoogleNewsUrl(url).catch(() => null)
      : null;
    const decodedUrl = decodedResult?.decodedUrl || url;

    const response = await fetch(decodedUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch article: ${response.status}`);
    }

    const html = await response.text();
    const finalUrl = response.url;
    const dom = new JSDOM(html, { url: finalUrl });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    const imageUrl = extractLeadImageUrl(dom.window.document, finalUrl);

    const articleText = sanitizeArticleText(article?.textContent || "");
    if (!articleText) {
      throw new Error("Article body could not be extracted.");
    }

    return {
      finalUrl,
      title: article?.title || "",
      text: articleText,
      imageUrl
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchArticlePreview(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const decodedResult = url.includes("news.google.com")
      ? await decoder.decodeGoogleNewsUrl(url).catch(() => null)
      : null;
    const decodedUrl = decodedResult?.decodedUrl || url;

    const response = await fetch(decodedUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch preview: ${response.status}`);
    }

    const html = await response.text();
    const finalUrl = response.url;
    const dom = new JSDOM(html, { url: finalUrl });

    return {
      finalUrl,
      imageUrl: extractLeadImageUrl(dom.window.document, finalUrl)
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  fetchArticleContent,
  fetchArticlePreview
};
