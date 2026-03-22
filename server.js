require("dotenv").config();

const path = require("path");
const http = require("http");
const express = require("express");

const {
  initializeDatabase,
  getNewsPage,
  getTopTickerItems,
  getNewsCount,
  getNewsItemById,
  updateFullArticleTranslation
} = require("./src/db");
const { startNewsSync } = require("./src/services/googleNews");
const { createRealtimeServer } = require("./src/realtime");
const { checkOpenRouter, streamArticleSummaryToFarsi } = require("./src/services/openRouter");
const { fetchArticleContent } = require("./src/services/articleContent");

const PORT = process.env.PORT || 3000;
const NEWS_PER_PAGE = 10;

async function bootstrap() {
  await initializeDatabase();

  const app = express();
  const server = http.createServer(app);
  const realtime = createRealtimeServer(server);

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  app.use(express.json());
  app.use("/public", express.static(path.join(__dirname, "public")));
  app.use("/fonts", express.static(path.join(__dirname, "node_modules", "vazir-font", "dist")));

  app.locals.siteTitle = "فارس نیوز نود";

  async function buildPageModel(page) {
    const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const totalItems = await getNewsCount();
    const totalPages = Math.max(Math.ceil(totalItems / NEWS_PER_PAGE), 1);
    const normalizedPage = Math.min(currentPage, totalPages);

    return {
      newsItems: await getNewsPage(normalizedPage, NEWS_PER_PAGE),
      tickerItems: await getTopTickerItems(10),
      pagination: {
        currentPage: normalizedPage,
        totalPages,
        hasPrev: normalizedPage > 1,
        hasNext: normalizedPage < totalPages,
        prevPage: Math.max(normalizedPage - 1, 1),
        nextPage: Math.min(normalizedPage + 1, totalPages)
      }
    };
  }

  async function renderMaintenanceIfNeeded(req, res, next) {
    const openRouterAvailable = await checkOpenRouter();
    if (openRouterAvailable) {
      next();
      return;
    }

    if (req.path === "/") {
      res.status(503).render("maintenance");
      return;
    }

    res.status(503).json({ error: "سایت در حال تعمیر است. سرویس OpenRouter در دسترس نیست." });
  }

  app.get("/", renderMaintenanceIfNeeded, async (req, res) => {
    res.render("index", await buildPageModel(req.query.page));
  });

  app.get("/api/news", renderMaintenanceIfNeeded, async (req, res) => {
    const pageModel = await buildPageModel(req.query.page);

    res.render("partials/news-feed", pageModel, (error, html) => {
      if (error) {
        res.status(500).json({ error: "خطا در بارگذاری خبرها." });
        return;
      }

      res.json({
        html,
        meta: pageModel.pagination,
        tickerItems: pageModel.tickerItems
      });
    });
  });

  app.get("/api/news/:id/article-summary-stream", renderMaintenanceIfNeeded, async (req, res) => {
    try {
      const item = await getNewsItemById(Number.parseInt(req.params.id, 10));
      if (!item) {
        res.status(404).json({ error: "خبر مورد نظر پیدا نشد." });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const sendEvent = (type, payload) => {
        res.write(`event: ${type}\n`);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      };

      if (item.fullArticleFarsi) {
        sendEvent("progress", { value: 100, label: "خلاصهٔ ذخیره‌شده آماده است." });
        sendEvent("result", {
          summary: item.fullArticleFarsi,
          sourceUrl: item.fullArticleSourceUrl || item.sourceUrl,
          cached: true
        });
        res.end();
        return;
      }

      sendEvent("progress", { value: 12, label: "در حال دریافت مقالهٔ اصلی..." });
      const article = await fetchArticleContent(item.sourceUrl);
      sendEvent("progress", { value: 28, label: "مقاله دریافت شد. در حال خلاصه‌سازی با OpenRouter..." });

      let lastProgress = 28;
      const summary = await streamArticleSummaryToFarsi({
        title: item.originalTitle,
        sourceName: item.sourceName,
        articleText: article.text,
        onToken(accumulatedText) {
          const nextProgress = Math.min(94, 28 + Math.floor(accumulatedText.length / 20));
          if (nextProgress > lastProgress) {
            lastProgress = nextProgress;
            sendEvent("progress", {
              value: nextProgress,
              label: "مدل در حال ساخت خلاصهٔ فارسی خبر است..."
            });
          }
        }
      });

      await updateFullArticleTranslation({
        id: item.id,
        fullArticleSourceUrl: article.finalUrl,
        fullArticleOriginal: article.text,
        fullArticleFarsi: summary
      });

      sendEvent("progress", { value: 100, label: "خلاصه خبر آماده شد." });
      sendEvent("result", {
        summary,
        sourceUrl: article.finalUrl,
        cached: false
      });
      res.end();
    } catch (error) {
      console.error("Article summary generation failed.", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "خلاصه‌سازی خبر انجام نشد." });
        return;
      }

      res.write("event: error\n");
      res.write(`data: ${JSON.stringify({ error: "خلاصه‌سازی خبر انجام نشد." })}\n\n`);
      res.end();
    }
  });

  server.listen(PORT, () => {
    console.log(`FNN running at http://localhost:${PORT}`);
  });

  startNewsSync({
    async onNewsSaved(insertedItems) {
      realtime.broadcast("news:update", {
        insertedCount: insertedItems.length,
        topTickerItems: await getTopTickerItems(10)
      });
    }
  }).catch((error) => {
    console.error("Initial news sync failed.", error);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start the application.", error);
  process.exit(1);
});
