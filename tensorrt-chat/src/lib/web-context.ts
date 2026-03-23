import { load } from "cheerio";
import { chatConfig } from "@/lib/chat-config";

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

type CrawledResult = SearchResult & {
  excerpt: string;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function resolveSearchResultUrl(rawUrl: string) {
  if (!rawUrl) {
    return "";
  }

  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    return rawUrl;
  }

  if (rawUrl.startsWith("//duckduckgo.com/l/?")) {
    const parsed = new URL(`https:${rawUrl}`);
    const redirected = parsed.searchParams.get("uddg");
    return redirected ? decodeURIComponent(redirected) : "";
  }

  return "";
}

async function fetchText(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TensorRTChat/1.0; +http://localhost:3001)"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const html = await fetchText(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    Math.min(chatConfig.requestTimeoutMs, 10000)
  );

  const $ = load(html);
  const results: SearchResult[] = [];

  $(".result").each((_, element) => {
    if (results.length >= chatConfig.maxSearchResults) {
      return false;
    }

    const anchor = $(element).find(".result__title a").first();
    const href = resolveSearchResultUrl(anchor.attr("href") || "");
    const title = normalizeWhitespace(anchor.text());
    const snippet = normalizeWhitespace($(element).find(".result__snippet").first().text());

    if (!href || !title || !href.startsWith("http")) {
      return;
    }

    results.push({
      title,
      url: href,
      snippet
    });
  });

  return results;
}

async function crawlPage(result: SearchResult): Promise<CrawledResult | null> {
  try {
    const html = await fetchText(result.url, Math.min(chatConfig.requestTimeoutMs, 12000));
    const $ = load(html);
    $("script, style, noscript, svg, iframe").remove();

    const text = normalizeWhitespace($("body").text());
    if (!text) {
      return null;
    }

    return {
      ...result,
      excerpt: text.slice(0, 1800) || result.snippet
    };
  } catch (error) {
    if (!result.snippet) {
      return null;
    }

    return {
      ...result,
      excerpt: result.snippet
    };
  }
}

export async function buildWebContext(latestUserPrompt: string) {
  if (!chatConfig.enableWebSearchByDefault || !latestUserPrompt.trim()) {
    return "";
  }

  try {
    const results = await searchDuckDuckGo(latestUserPrompt);
    const crawledPages = (
      await Promise.all(results.slice(0, chatConfig.maxCrawledPages).map((result) => crawlPage(result)))
    ).filter((item): item is CrawledResult => Boolean(item));

    if (crawledPages.length === 0) {
      return "";
    }

    const context = crawledPages
      .map(
        (item, index) =>
          `Source ${index + 1}\nTitle: ${item.title}\nURL: ${item.url}\nSearch snippet: ${item.snippet}\nContent: ${item.excerpt}`
      )
      .join("\n\n");

    return context.slice(0, chatConfig.maxWebContextChars);
  } catch (error) {
    return "";
  }
}
