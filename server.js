const path = require("path");
const http = require("http");
const express = require("express");

const { initializeDatabase, getNewsPage, getTopTickerItems, getNewsCount } = require("./src/db");
const { startNewsSync } = require("./src/services/googleNews");
const { createRealtimeServer } = require("./src/realtime");

const PORT = process.env.PORT || 3000;
const NEWS_PER_PAGE = 10;

async function bootstrap() {
  initializeDatabase();

  const app = express();
  const server = http.createServer(app);
  const realtime = createRealtimeServer(server);

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  app.use("/public", express.static(path.join(__dirname, "public")));
  app.use("/fonts", express.static(path.join(__dirname, "node_modules", "vazir-font", "dist")));

  app.locals.siteTitle = "فارس نیوز نود";

  function buildPageModel(page) {
    const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const totalItems = getNewsCount();
    const totalPages = Math.max(Math.ceil(totalItems / NEWS_PER_PAGE), 1);
    const normalizedPage = Math.min(currentPage, totalPages);

    return {
      newsItems: getNewsPage(normalizedPage, NEWS_PER_PAGE),
      tickerItems: getTopTickerItems(10),
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

  app.get("/", (req, res) => {
    res.render("index", buildPageModel(req.query.page));
  });

  app.get("/api/news", (req, res) => {
    const pageModel = buildPageModel(req.query.page);

    res.render("partials/news-feed", pageModel, (error, html) => {
      if (error) {
        res.status(500).json({ error: "خطا در بارگذاری خبرها." });
        return;
      }

      res.json({
        html,
        meta: pageModel.pagination,
        tickerItems: getTopTickerItems(10)
      });
    });
  });

  server.listen(PORT, () => {
    console.log(`FNN running at http://localhost:${PORT}`);
  });

  startNewsSync({
    onNewsSaved(insertedItems) {
      realtime.broadcast("news:update", {
        insertedCount: insertedItems.length,
        topTickerItems: getTopTickerItems(10)
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
