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
const {
  checkAiAvailability,
  getAiProviderStatus,
  streamArticleSummaryToFarsi,
  testProviderConnection
} = require("./src/services/aiClient");
const {
  DEFAULT_PASSWORD,
  DEFAULT_USERNAME,
  clearAdminSessionCookie,
  getAdminSettings,
  getAuthenticatedAdmin,
  setAdminSessionCookie,
  updateAdminCredentials,
  updateAiProvider,
  updateOpenRouterApiKey,
  verifyAdminCredentials
} = require("./src/services/admin");
const { fetchArticleContent } = require("./src/services/articleContent");

const PORT = process.env.PORT || 3000;
const NEWS_PER_PAGE = 12;

async function bootstrap() {
  await initializeDatabase();

  const app = express();
  const server = http.createServer(app);
  const realtime = createRealtimeServer(server);

  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use("/public", express.static(path.join(__dirname, "public")));
  app.use("/fonts", express.static(path.join(__dirname, "node_modules", "vazir-font", "dist")));

  app.locals.siteTitle = "\u0641\u0627\u0631\u0633 \u0646\u06cc\u0648\u0632 \u0646\u0648\u062f";

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

  async function buildAdminViewModel({ error = "", notice = "", testResults = null } = {}) {
    const admin = await getAdminSettings();
    const providerStatus = await getAiProviderStatus(true);

    return {
      error,
      notice,
      testResults,
      defaultUsername: DEFAULT_USERNAME,
      defaultPassword: DEFAULT_PASSWORD,
      adminUsername: admin.username,
      openrouterApiKey: admin.openrouterApiKey || "",
      activeProvider: providerStatus.activeProvider,
      activeProviderLabel: providerStatus.activeProviderLabel,
      providers: providerStatus.providers
    };
  }

  async function renderMaintenanceIfNeeded(req, res, next) {
    const aiAvailable = await checkAiAvailability();
    if (aiAvailable) {
      next();
      return;
    }

    const providerStatus = await getAiProviderStatus();
    if (req.path === "/") {
      res.status(503).render("maintenance", {
        providerLabel: providerStatus.activeProviderLabel
      });
      return;
    }

    res.status(503).json({
      error: `سایت در حال تعمیر است. سرویس ${providerStatus.activeProviderLabel} در دسترس نیست.`
    });
  }

  app.use(async (req, res, next) => {
    if (
      req.path.startsWith("/admin") ||
      req.path.startsWith("/public") ||
      req.path.startsWith("/fonts")
    ) {
      next();
      return;
    }

    renderMaintenanceIfNeeded(req, res, next);
  });

  app.get("/", async (req, res) => {
    res.render("index", await buildPageModel(req.query.page));
  });

  app.get("/admin", async (req, res) => {
    const admin = await getAuthenticatedAdmin(req);
    res.render("admin", {
      ...(await buildAdminViewModel()),
      isAuthenticated: Boolean(admin)
    });
  });

  app.post("/admin/login", async (req, res) => {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    const isValid = await verifyAdminCredentials(username, password);

    if (!isValid) {
      res.status(401).render("admin", {
        ...(await buildAdminViewModel({ error: "نام کاربری یا رمز عبور صحیح نیست." })),
        isAuthenticated: false
      });
      return;
    }

    const settings = await getAdminSettings();
    setAdminSessionCookie(res, settings);
    res.redirect("/admin");
  });

  app.post("/admin/logout", async (req, res) => {
    clearAdminSessionCookie(res);
    res.redirect("/admin");
  });

  app.post("/admin/provider", async (req, res) => {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin) {
      clearAdminSessionCookie(res);
      res.redirect("/admin");
      return;
    }

    await updateAiProvider(req.body.aiProvider);
    res.render("admin", {
      ...(await buildAdminViewModel({ notice: "ارائه‌دهنده‌ی هوش مصنوعی ذخیره شد." })),
      isAuthenticated: true
    });
  });

  app.post("/admin/openrouter-api-key", async (req, res) => {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin) {
      clearAdminSessionCookie(res);
      res.redirect("/admin");
      return;
    }

    await updateOpenRouterApiKey(req.body.openrouterApiKey);
    res.render("admin", {
      ...(await buildAdminViewModel({ notice: "OpenRouter API key به‌روزرسانی شد." })),
      isAuthenticated: true
    });
  });

  app.post("/admin/credentials", async (req, res) => {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin) {
      clearAdminSessionCookie(res);
      res.redirect("/admin");
      return;
    }

    const currentPassword = String(req.body.currentPassword || "");
    const nextUsername = String(req.body.newUsername || "").trim();
    const nextPassword = String(req.body.newPassword || "");
    const confirmedPassword = String(req.body.confirmPassword || "");

    const currentUserValid = await verifyAdminCredentials(admin.username, currentPassword);
    if (!currentUserValid) {
      res.status(400).render("admin", {
        ...(await buildAdminViewModel({ error: "برای تغییر مشخصات، رمز فعلی را درست وارد کنید." })),
        isAuthenticated: true
      });
      return;
    }

    if (nextPassword !== confirmedPassword) {
      res.status(400).render("admin", {
        ...(await buildAdminViewModel({ error: "رمز عبور جدید و تکرار آن یکسان نیست." })),
        isAuthenticated: true
      });
      return;
    }

    try {
      const updatedSettings = await updateAdminCredentials({
        username: nextUsername,
        password: nextPassword
      });
      setAdminSessionCookie(res, updatedSettings);
      res.render("admin", {
        ...(await buildAdminViewModel({ notice: "نام کاربری و رمز عبور مدیر به‌روزرسانی شد." })),
        isAuthenticated: true
      });
    } catch (error) {
      res.status(400).render("admin", {
        ...(await buildAdminViewModel({ error: error.message || "تغییر مشخصات مدیر انجام نشد." })),
        isAuthenticated: true
      });
    }
  });

  app.post("/admin/connectivity-test", async (req, res) => {
    const admin = await getAuthenticatedAdmin(req);
    if (!admin) {
      clearAdminSessionCookie(res);
      res.redirect("/admin");
      return;
    }

    const testResults = {
      openrouter: await testProviderConnection("openrouter"),
      local: await testProviderConnection("local")
    };

    res.render("admin", {
      ...(await buildAdminViewModel({ notice: "تست اتصال اجرا شد.", testResults })),
      isAuthenticated: true
    });
  });

  app.get("/api/news", async (req, res) => {
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

  app.get("/api/news/:id/article-summary-stream", async (req, res) => {
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
        sendEvent("progress", { value: 100, label: "خلاصه‌ی ذخیره‌شده آماده است." });
        sendEvent("result", {
          summary: item.fullArticleFarsi,
          sourceUrl: item.fullArticleSourceUrl || item.sourceUrl,
          cached: true
        });
        res.end();
        return;
      }

      sendEvent("progress", { value: 12, label: "در حال دریافت مقاله‌ی اصلی..." });
      const article = await fetchArticleContent(item.sourceUrl);
      sendEvent("progress", { value: 28, label: "مقاله دریافت شد. در حال خلاصه‌سازی خبر..." });

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
              label: "مدل در حال ساخت خلاصه‌ی فارسی خبر است..."
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
