const express = require("express");

function createApiRouter(services) {
  const router = express.Router();
  const store = services.store;
  const searchService = services.searchService;
  const insightService = services.insightService;
  const topicService = services.topicService;

  router.get("/search", (req, res) => {
    res.json(searchService.searchAll(
      String(req.query.q || ""),
      Number(req.query.limit || 80),
      String(req.query.source || "all"),
    ));
  });

  router.get("/search-insight", (req, res) => {
    res.json(insightService.searchInsight(String(req.query.q || "")) || {});
  });

  router.get("/index", (req, res) => {
    res.json(searchService.searchIndex(String(req.query.q || ""), Number(req.query.limit || 400)));
  });

  router.get("/contents", (req, res) => {
    res.json(store.contents);
  });

  router.get("/topic/:id", (req, res) => {
    const topic = topicService.getTopic(req.params.id);
    if (!topic) {
      res.status(404).send("Topic not found");
      return;
    }
    res.json(topicService.getTopicPayload(topic));
  });

  return router;
}

module.exports = {
  createApiRouter,
};
