const newsContainer = document.getElementById("news-container");
const tickerTrack = document.getElementById("ticker-track");
const connectionStatus = document.getElementById("connection-status");
const themeToggle = document.getElementById("theme-toggle");
const body = document.body;
const root = document.documentElement;

let activeAnalysisStream = null;
let activeAnalysisButton = null;

function getTitleModalElements() {
  return {
    modal: document.getElementById("title-modal"),
    heading: document.getElementById("title-modal-heading"),
    summaryBlock: document.getElementById("title-modal-summary-block"),
    summary: document.getElementById("title-modal-summary")
  };
}

function getAnalysisModalElements() {
  return {
    modal: document.getElementById("analysis-modal"),
    heading: document.getElementById("analysis-modal-heading"),
    progressBar: document.getElementById("analysis-modal-progress-bar"),
    statusText: document.getElementById("analysis-modal-status-text"),
    result: document.getElementById("analysis-modal-result"),
    resultText: document.getElementById("analysis-modal-result-text"),
    cacheBadge: document.getElementById("analysis-modal-cache-badge")
  };
}

async function loadPage(page, pushState = true) {
  const currentSearch = body.dataset.currentSearch || "";
  const querySuffix = currentSearch ? `&q=${encodeURIComponent(currentSearch)}` : "";
  const response = await fetch(`/api/news?page=${page}${querySuffix}`);
  if (!response.ok) {
    throw new Error("Failed to fetch paginated news.");
  }

  const data = await response.json();
  newsContainer.innerHTML = data.html;
  updateTicker(data.tickerItems);
  body.dataset.currentPage = data.meta.currentPage;

  if (pushState) {
    const nextUrl = currentSearch
      ? `/?page=${data.meta.currentPage}&q=${encodeURIComponent(currentSearch)}`
      : `/?page=${data.meta.currentPage}`;
    window.history.pushState({ page: data.meta.currentPage, q: currentSearch }, "", nextUrl);
  }
}

function updateTicker(items) {
  const repeatedItems = [...items, ...items];
  tickerTrack.innerHTML = repeatedItems
    .map((item) => `<span class="ticker__item">${item.translatedTitle}</span>`)
    .join("");
}

function openTitleModal(title, summaryText = "") {
  const { modal, heading, summaryBlock, summary } = getTitleModalElements();
  if (!modal || !heading || !summaryBlock || !summary) {
    return;
  }

  heading.textContent = title;
  if (summaryText.trim()) {
    summary.textContent = summaryText;
    summaryBlock.hidden = false;
  } else {
    summary.textContent = "";
    summaryBlock.hidden = true;
  }
  modal.hidden = false;
  body.style.overflow = "hidden";
}

function closeTitleModal() {
  const { modal, heading, summaryBlock, summary } = getTitleModalElements();
  if (!modal || modal.hidden || !summaryBlock || !summary) {
    return;
  }

  modal.hidden = true;
  heading.textContent = "";
  summary.textContent = "";
  summaryBlock.hidden = true;
  body.style.overflow = "";
}

function openAnalysisModal(title) {
  const { modal, heading, progressBar, statusText, result, resultText, cacheBadge } = getAnalysisModalElements();
  if (!modal || !heading || !progressBar || !statusText || !result || !resultText || !cacheBadge) {
    return false;
  }

  heading.textContent = title;
  progressBar.style.width = "8%";
  statusText.textContent = "در حال آماده‌سازی تحلیل خبر...";
  result.hidden = true;
  resultText.textContent = "";
  cacheBadge.hidden = true;
  modal.hidden = false;
  body.style.overflow = "hidden";
  return true;
}

function closeAnalysisModal() {
  const { modal, heading, progressBar, statusText, result, resultText, cacheBadge } = getAnalysisModalElements();
  if (!modal || modal.hidden) {
    return;
  }

  if (activeAnalysisStream) {
    activeAnalysisStream.close();
    activeAnalysisStream = null;
  }

  if (activeAnalysisButton) {
    activeAnalysisButton.disabled = false;
    activeAnalysisButton.classList.remove("is-loading");
    activeAnalysisButton = null;
  }

  modal.hidden = true;
  heading.textContent = "";
  progressBar.style.width = "0%";
  statusText.textContent = "";
  result.hidden = true;
  resultText.textContent = "";
  cacheBadge.hidden = true;
  body.style.overflow = "";
}

function updateAnalysisProgress(value, label) {
  const { progressBar, statusText } = getAnalysisModalElements();
  if (!progressBar || !statusText) {
    return;
  }

  progressBar.style.width = `${Math.max(0, Math.min(100, value || 0))}%`;
  statusText.textContent = label || "";
}

function showAnalysisResult(newsId, summary, cached) {
  const { result, resultText, cacheBadge } = getAnalysisModalElements();
  if (!result || !resultText || !cacheBadge) {
    return;
  }

  result.hidden = false;
  resultText.textContent = summary;
  cacheBadge.hidden = !cached;
  updateAnalysisProgress(100, cached ? "تحلیل ذخیره‌شده آماده است." : "تحلیل خبر آماده شد.");
}

function startAiAnalysis(newsId, title, button) {
  if (!openAnalysisModal(title)) {
    return;
  }

  if (activeAnalysisStream) {
    activeAnalysisStream.close();
  }

  button.disabled = true;
  button.classList.add("is-loading");
  activeAnalysisButton = button;

  const stream = new EventSource(`/api/news/${newsId}/article-summary-stream`);
  activeAnalysisStream = stream;

  stream.addEventListener("progress", (event) => {
    const payload = JSON.parse(event.data);
    updateAnalysisProgress(payload.value, payload.label);
  });

  stream.addEventListener("result", (event) => {
    const payload = JSON.parse(event.data);
    showAnalysisResult(newsId, payload.summary || "", Boolean(payload.cached));
    button.disabled = false;
    button.classList.remove("is-loading");
    if (activeAnalysisButton === button) {
      activeAnalysisButton = null;
    }
    stream.close();
    if (activeAnalysisStream === stream) {
      activeAnalysisStream = null;
    }
  });

  stream.addEventListener("error", () => {
    updateAnalysisProgress(100, "دریافت تحلیل این خبر انجام نشد.");
    button.disabled = false;
    button.classList.remove("is-loading");
    if (activeAnalysisButton === button) {
      activeAnalysisButton = null;
    }
    stream.close();
    if (activeAnalysisStream === stream) {
      activeAnalysisStream = null;
    }
  });
}

function setupPagination() {
  document.addEventListener("click", async (event) => {
    const link = event.target.closest("[data-page-link]");
    if (!link || link.classList.contains("is-disabled")) {
      return;
    }

    event.preventDefault();
    const page = Number.parseInt(link.dataset.pageLink, 10);
    await loadPage(page);
  });
}

function setupTitleModal() {
  document.addEventListener("click", (event) => {
    const titleButton = event.target.closest("[data-full-title]");
    if (titleButton) {
      openTitleModal(titleButton.dataset.fullTitle, titleButton.dataset.fullSummary || "");
      return;
    }

    if (event.target.closest("[data-title-modal-close]")) {
      closeTitleModal();
    }
  });
}

function setupAiAnalysis() {
  document.addEventListener("click", (event) => {
    const analysisButton = event.target.closest("[data-ai-summary-button]");
    if (analysisButton) {
      startAiAnalysis(
        analysisButton.dataset.newsId,
        analysisButton.dataset.newsTitle || "تحلیل خبر",
        analysisButton
      );
      return;
    }

    if (event.target.closest("[data-analysis-modal-close]")) {
      closeAnalysisModal();
    }
  });
}

function setupEscapeKey() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeTitleModal();
      closeAnalysisModal();
    }
  });
}

function setupHistory() {
  window.addEventListener("popstate", async (event) => {
    const url = new URL(window.location.href);
    body.dataset.currentSearch = event.state?.q ?? url.searchParams.get("q") ?? "";
    const page = event.state?.page || Number.parseInt(body.dataset.currentPage, 10) || 1;
    await loadPage(page, false);
  });
}

function setupWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${window.location.host}`);

  socket.addEventListener("open", () => {
    connectionStatus.textContent = "متصل";
  });

  socket.addEventListener("close", () => {
    connectionStatus.textContent = "قطع شده";
    setTimeout(setupWebSocket, 3000);
  });

  socket.addEventListener("message", async (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "news:update") {
      const currentPage = Number.parseInt(body.dataset.currentPage, 10) || 1;
      updateTicker(message.payload.topTickerItems || []);
      await loadPage(currentPage, false);
    }
  });
}

function applyTheme(theme) {
  root.dataset.theme = theme;
  localStorage.setItem("fnn-theme", theme);

  if (!themeToggle) {
    return;
  }

  const isDark = theme === "dark";
  themeToggle.setAttribute("aria-pressed", isDark ? "true" : "false");
  themeToggle.querySelector(".theme-toggle__label").textContent = isDark ? "تم روشن" : "تم تیره";
}

function setupThemeToggle() {
  applyTheme(localStorage.getItem("fnn-theme") || root.dataset.theme || "light");

  if (!themeToggle) {
    return;
  }

  themeToggle.addEventListener("click", () => {
    applyTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });
}

setupPagination();
setupTitleModal();
setupAiAnalysis();
setupEscapeKey();
setupHistory();
setupWebSocket();
setupThemeToggle();
