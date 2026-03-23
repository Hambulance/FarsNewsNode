export const chatConfig = {
  appName: "TensorRT Chat",
  appUrl: "http://localhost:3001",
  baseUrl: "http://127.0.0.1:8000",
  chatEndpoint: "/v1/chat/completions",
  model: "Qwen/Qwen2-7B-Instruct",
  systemPrompt: "You are a helpful Persian assistant. Always reply in clear, natural Farsi.",
  maxTokens: 512,
  temperature: 0.7,
  requestTimeoutMs: 180000,
  enableWebSearchByDefault: true,
  maxSearchResults: 4,
  maxCrawledPages: 3,
  maxWebContextChars: 6000,
  maxDocumentContextChars: 8000,
  storageKey: "tensorrt-chat-state-v1"
} as const;
