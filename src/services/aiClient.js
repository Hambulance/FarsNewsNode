const { getAdminSettings } = require("./admin");

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-nano";
const LOCAL_TENSORRT_BASE_URL = process.env.TENSORRT_LLM_BASE_URL || "http://127.0.0.1:8000/v1";
const LOCAL_TENSORRT_MODEL = process.env.TENSORRT_LLM_MODEL || "";

const healthCache = new Map();
let localModelCache = {
  value: LOCAL_TENSORRT_MODEL,
  checkedAt: LOCAL_TENSORRT_MODEL ? Date.now() : 0
};

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/+$/, "");
}

function getProviderBaseUrl(provider) {
  if (provider === "local") {
    return normalizeBaseUrl(LOCAL_TENSORRT_BASE_URL);
  }

  return normalizeBaseUrl(OPENROUTER_BASE_URL);
}

function getProviderLabel(provider) {
  return provider === "local" ? "TensorRT-LLM Local" : "OpenRouter";
}

function getProviderRootUrl(provider) {
  const baseUrl = getProviderBaseUrl(provider);
  return baseUrl.endsWith("/v1") ? baseUrl.slice(0, -3) : baseUrl;
}

async function resolveLocalModel(force = false) {
  const now = Date.now();
  if (!force && localModelCache.value && now - localModelCache.checkedAt < 30000) {
    return localModelCache.value;
  }

  try {
    const response = await fetch(`${getProviderBaseUrl("local")}/models`);
    if (!response.ok) {
      throw new Error(`Model lookup failed with status ${response.status}`);
    }

    const payload = await response.json();
    const discoveredModel = payload.data?.[0]?.id || LOCAL_TENSORRT_MODEL || "default";
    localModelCache = {
      value: discoveredModel,
      checkedAt: now
    };
    return discoveredModel;
  } catch (error) {
    localModelCache = {
      value: LOCAL_TENSORRT_MODEL || "default",
      checkedAt: now
    };
    return localModelCache.value;
  }
}

async function getProviderConfig(provider) {
  const normalizedProvider = provider === "local" ? "local" : "openrouter";
  const settings = await getAdminSettings();

  if (normalizedProvider === "local") {
    return {
      provider: normalizedProvider,
      label: getProviderLabel(normalizedProvider),
      baseUrl: getProviderBaseUrl(normalizedProvider),
      model: await resolveLocalModel(),
      headers: {
        "Content-Type": "application/json"
      }
    };
  }

  return {
    provider: normalizedProvider,
    label: getProviderLabel(normalizedProvider),
    baseUrl: getProviderBaseUrl(normalizedProvider),
    model: OPENROUTER_MODEL,
    apiKey: settings.openrouterApiKey || "",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.openrouterApiKey || ""}`,
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "FNN"
    }
  };
}

async function getActiveProviderConfig() {
  const settings = await getAdminSettings();
  return getProviderConfig(settings.aiProvider);
}

async function checkProviderAvailability(provider, force = false) {
  const normalizedProvider = provider === "local" ? "local" : "openrouter";
  const cacheKey = normalizedProvider;
  const now = Date.now();
  const existing = healthCache.get(cacheKey);

  if (!force && existing && now - existing.checkedAt < 15000) {
    return existing.available;
  }

  let available = false;

  try {
    const config = normalizedProvider === "openrouter" ? await getProviderConfig("openrouter") : null;

    if (normalizedProvider === "openrouter" && !config.apiKey) {
      available = false;
    } else if (normalizedProvider === "local") {
      const modelResponse = await fetch(`${getProviderBaseUrl("local")}/models`);
      available = modelResponse.ok;

      if (!available) {
        const fallbackResponse = await fetch(`${getProviderRootUrl("local")}/health`);
        available = fallbackResponse.ok;
      }
    } else {
      const response = await fetch(`${config.baseUrl}/models`, {
        headers: config.headers
      });
      available = response.ok;
    }
  } catch (error) {
    available = false;
  }

  healthCache.set(cacheKey, {
    available,
    checkedAt: now
  });

  return available;
}

async function checkAiAvailability(force = false) {
  const settings = await getAdminSettings();
  return checkProviderAvailability(settings.aiProvider, force);
}

async function getAiProviderStatus(force = false) {
  const settings = await getAdminSettings();
  const activeProvider = settings.aiProvider;

  return {
    activeProvider,
    activeProviderLabel: getProviderLabel(activeProvider),
    providers: {
      openrouter: {
        label: getProviderLabel("openrouter"),
        available: await checkProviderAvailability("openrouter", force),
        configured: Boolean((await getProviderConfig("openrouter")).apiKey),
        model: OPENROUTER_MODEL,
        baseUrl: OPENROUTER_BASE_URL
      },
      local: {
        label: getProviderLabel("local"),
        available: await checkProviderAvailability("local", force),
        configured: true,
        model: await resolveLocalModel(force),
        baseUrl: LOCAL_TENSORRT_BASE_URL
      }
    }
  };
}

async function createChatCompletion(messages, temperature = 0.3) {
  const config = await getActiveProviderConfig();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify({
      model: config.model,
      temperature,
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${config.label} completion failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  return (payload.choices?.[0]?.message?.content || "").trim();
}

async function testProviderConnection(provider) {
  const normalizedProvider = provider === "local" ? "local" : "openrouter";
  const startedAt = Date.now();

  try {
    const config = await getProviderConfig(normalizedProvider);

    if (normalizedProvider === "openrouter" && !config.apiKey) {
      return {
        provider: normalizedProvider,
        label: getProviderLabel(normalizedProvider),
        ok: false,
        model: config.model,
        durationMs: Date.now() - startedAt,
        message: "OPENROUTER_API_KEY تنظیم نشده است."
      };
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        max_tokens: 16,
        messages: [
          {
            role: "system",
            content: "Reply with exactly: OK"
          },
          {
            role: "user",
            content: "Connectivity test"
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        provider: normalizedProvider,
        label: getProviderLabel(normalizedProvider),
        ok: false,
        model: config.model,
        durationMs: Date.now() - startedAt,
        message: `${response.status} ${errorText}`.trim()
      };
    }

    const payload = await response.json();
    const content = (payload.choices?.[0]?.message?.content || "").trim();

    return {
      provider: normalizedProvider,
      label: getProviderLabel(normalizedProvider),
      ok: true,
      model: config.model,
      durationMs: Date.now() - startedAt,
      message: content || "OK"
    };
  } catch (error) {
    return {
      provider: normalizedProvider,
      label: getProviderLabel(normalizedProvider),
      ok: false,
      model: normalizedProvider === "local" ? await resolveLocalModel() : OPENROUTER_MODEL,
      durationMs: Date.now() - startedAt,
      message: error.message || "Connectivity test failed."
    };
  }
}

async function createStreamingChatCompletion(messages, { temperature = 0.3, onToken }) {
  const config = await getActiveProviderConfig();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: config.headers,
    body: JSON.stringify({
      model: config.model,
      temperature,
      stream: true,
      messages
    })
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(`${config.label} streaming failed: ${response.status} ${errorText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) {
        continue;
      }

      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") {
        return fullText.trim();
      }

      const parsed = JSON.parse(payload);
      const token = parsed.choices?.[0]?.delta?.content || "";
      if (!token) {
        continue;
      }

      fullText += token;
      if (typeof onToken === "function") {
        onToken(fullText, token);
      }
    }
  }

  return fullText.trim();
}

async function rewriteHeadlineToFarsi(text) {
  return createChatCompletion(
    [
      {
        role: "system",
        content:
          "You are a senior Persian news editor writing for native Iranian readers. Rewrite the input as a natural, clear Persian news headline. Do not translate word-for-word. If the English uses idioms or awkward phrasing, convert it into a simple factual Persian headline. Do not invent facts. Avoid unnecessary source names. Output only one polished Persian headline."
      },
      {
        role: "user",
        content: text
      }
    ],
    0.15
  );
}

async function rewriteSummaryToFarsi(text) {
  return createChatCompletion(
    [
      {
        role: "system",
        content:
          "You are a senior Persian news editor writing for native Iranian readers. Write one or two short Persian sentences as a clean news summary. Use only explicit facts from the input. Do not guess, embellish, or add details. If the source text is noisy or incomplete, produce a cautious and simple summary. Remove duplicate source names and broken phrasing. Output only the Persian summary."
      },
      {
        role: "user",
        content: text
      }
    ],
    0.2
  );
}

async function translateFullArticleToFarsi({ title, sourceName, articleText }) {
  return createChatCompletion([
    {
      role: "system",
      content:
        "You are a professional Persian newsroom editor. Rewrite full articles into polished Persian news style. Remove image captions, photo credits, social prompts, duplicate fragments, and broken markup artifacts. Keep factual meaning. Output only fluent Persian article text in paragraphs, with no bullet points and no commentary."
    },
    {
      role: "user",
      content: `Source: ${sourceName}\nTitle: ${title}\n\nArticle:\n${articleText}`
    }
  ]);
}

async function streamArticleSummaryToFarsi({ title, sourceName, articleText, onToken }) {
  return createStreamingChatCompletion(
    [
      {
        role: "system",
        content:
          "You are a professional Persian newsroom editor. Read the full article and produce a concise Persian news summary in polished newsroom style. Remove image captions, photo credits, duplicate fragments, broken markup artifacts, and filler. Keep key facts, names, timing, and developments. Output only the Persian summary in a few coherent paragraphs."
      },
      {
        role: "user",
        content: `Source: ${sourceName}\nTitle: ${title}\n\nArticle:\n${articleText}`
      }
    ],
    { temperature: 0.25, onToken }
  );
}

async function streamNewsContextAnalysisToFarsi({
  title,
  sourceName,
  originalSummary,
  translatedSummary,
  onToken
}) {
  const contextParts = [
    `Source: ${sourceName}`,
    `Title: ${title}`
  ];

  if (originalSummary) {
    contextParts.push(`Original summary: ${originalSummary}`);
  }

  if (translatedSummary) {
    contextParts.push(`Existing Persian summary: ${translatedSummary}`);
  }

  return createStreamingChatCompletion(
    [
      {
        role: "system",
        content:
          "You are a professional Persian newsroom editor. You could not access the full original article, so you must work only from the provided headline and summaries. Write a careful Persian analysis-style summary of the news in polished newsroom language. Remove duplication, source noise, and broken fragments. Do not invent missing facts. If details are limited, be explicit but still useful and concise. Output only Persian text in a few coherent paragraphs."
      },
      {
        role: "user",
        content: contextParts.join("\n")
      }
    ],
    { temperature: 0.2, onToken }
  );
}

async function generateMarketPredictionFarsi(newsItems) {
  const condensedNews = newsItems
    .map((item, index) => {
      const summary = [item.translatedTitle, item.translatedSummary].filter(Boolean).join(" | ");
      return `${index + 1}. ${summary}`;
    })
    .join("\n");

  return createChatCompletion(
    [
      {
        role: "system",
        content:
          "You are a cautious Persian macro and markets analyst. Based only on the provided news, write a short Farsi outlook for: US stock market, global stock market, US housing, gasoline/energy prices, and gold. Do not present certainty. Use conditional language. Output only concise Persian text in 5 short labeled lines. Each line must start with one of these labels exactly: Ø¨Ø§Ø²Ø§Ø± Ø³Ù‡Ø§Ù… Ø¢Ù…Ø±ÛŒÚ©Ø§: ØŒ Ø¨Ø§Ø²Ø§Ø± Ø³Ù‡Ø§Ù… Ø¬Ù‡Ø§Ù†: ØŒ Ù…Ø³Ú©Ù† Ø¢Ù…Ø±ÛŒÚ©Ø§: ØŒ Ø¨Ù†Ø²ÛŒÙ† Ùˆ Ø§Ù†Ø±Ú˜ÛŒ: ØŒ Ø·Ù„Ø§: ."
      },
      {
        role: "user",
        content: `Recent news context:\n${condensedNews}`
      }
    ],
    0.25
  );
}

module.exports = {
  checkAiAvailability,
  checkProviderAvailability,
  generateMarketPredictionFarsi,
  getAiProviderStatus,
  rewriteHeadlineToFarsi,
  rewriteSummaryToFarsi,
  streamArticleSummaryToFarsi,
  streamNewsContextAnalysisToFarsi,
  testProviderConnection,
  translateFullArticleToFarsi
};
