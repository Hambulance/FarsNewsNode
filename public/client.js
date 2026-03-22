const newsContainer = document.getElementById("news-container");
const tickerTrack = document.getElementById("ticker-track");
const connectionStatus = document.getElementById("connection-status");
const themeToggle = document.getElementById("theme-toggle");
const body = document.body;
const root = document.documentElement;

function getTitleModalElements() {
  return {
    modal: document.getElementById("title-modal"),
    heading: document.getElementById("title-modal-heading"),
    summaryBlock: document.getElementById("title-modal-summary-block"),
    summary: document.getElementById("title-modal-summary")
  };
}

async function loadPage(page, pushState = true) {
  const response = await fetch(`/api/news?page=${page}`);
  if (!response.ok) {
    throw new Error("Failed to fetch paginated news.");
  }

  const data = await response.json();
  newsContainer.innerHTML = data.html;
  updateTicker(data.tickerItems);
  body.dataset.currentPage = data.meta.currentPage;

  if (pushState) {
    window.history.pushState({ page: data.meta.currentPage }, "", `/?page=${data.meta.currentPage}`);
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

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeTitleModal();
    }
  });
}

function setupHistory() {
  window.addEventListener("popstate", async (event) => {
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
setupHistory();
setupWebSocket();
setupThemeToggle();
