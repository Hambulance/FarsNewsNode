const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-nano";

let healthState = {
  available: false,
  checkedAt: 0
};

function getHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    "HTTP-Referer": "http://localhost:3000",
    "X-Title": "FNN"
  };
}

async function checkOpenRouter(force = false) {
  const now = Date.now();
  if (!OPENROUTER_API_KEY) {
    healthState = {
      available: false,
      checkedAt: now
    };
    return false;
  }

  if (!force && now - healthState.checkedAt < 15000) {
    return healthState.available;
  }

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: getHeaders()
    });

    healthState = {
      available: response.ok,
      checkedAt: now
    };
  } catch (error) {
    healthState = {
      available: false,
      checkedAt: now
    };
  }

  return healthState.available;
}

async function createChatCompletion(messages, temperature = 0.3) {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature,
      messages
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter translation failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  return (payload.choices?.[0]?.message?.content || "").trim();
}

async function createStreamingChatCompletion(messages, { temperature = 0.3, onToken }) {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature,
      stream: true,
      messages
    })
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(`OpenRouter streaming failed: ${response.status} ${errorText}`);
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
          "You are a cautious Persian macro and markets analyst. Based only on the provided news, write a short Farsi outlook for: US stock market, global stock market, US housing, gasoline/energy prices, and gold. Do not present certainty. Use conditional language. Output only concise Persian text in 5 short labeled lines. Each line must start with one of these labels exactly: بازار سهام آمریکا: ، بازار سهام جهان: ، مسکن آمریکا: ، بنزین و انرژی: ، طلا: ."
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
  checkOpenRouter,
  generateMarketPredictionFarsi,
  rewriteHeadlineToFarsi,
  rewriteSummaryToFarsi,
  translateFullArticleToFarsi,
  streamArticleSummaryToFarsi
};
