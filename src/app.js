const express = require("express");
const paths = require("./config/paths");
const { createDocsStore } = require("./data/docs-store");
const { createApiRouter } = require("./routes/api-routes");
const { createInsightService } = require("./services/insight-service");
const { createSearchService } = require("./services/search-service");
const { createTopicService } = require("./services/topic-service");

function createApp() {
  const store = createDocsStore(paths);
  const topicService = createTopicService(store);
  const searchService = createSearchService(store);
  const insightService = createInsightService(store, topicService, searchService);
  const app = express();

  app.disable("x-powered-by");
  app.use(noStore);
  app.use("/api", createApiRouter({ store, topicService, searchService, insightService }));
  app.use("/assets", express.static(paths.assetsRoot));
  app.use("/books/pbman", express.static(paths.BOOK_ROOT));
  app.use(express.static(paths.PUBLIC));

  app.get("*", (req, res) => {
    res.sendFile("index.html", { root: paths.PUBLIC });
  });

  return app;
}

function noStore(req, res, next) {
  res.set("cache-control", "no-store");
  next();
}

module.exports = {
  createApp,
};
