import { Router } from "express";
import rateLimit from "express-rate-limit";
import { castVote, getActiveEvent } from "../controllers/vote.controller";
import { getPublicEventById, listCompletedEvents, listUpcomingEvents } from "../controllers/publicEvents.controller";

const voteRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    success: false,
    code: "RATE_LIMITED",
    message: "Слишком много запросов голосования. Повторите позже.",
  },
});

const router = Router();

router.get("/active", getActiveEvent);
router.get("/upcoming", listUpcomingEvents);
router.get("/history", listCompletedEvents);
router.get("/:id", getPublicEventById);
router.post("/:id/vote", voteRateLimit, castVote);

export default router;
