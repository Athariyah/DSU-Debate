import { Router } from "express";
import { castVote, getActiveEvent } from "../controllers/vote.controller";
import { getPublicEventById, listUpcomingEvents } from "../controllers/publicEvents.controller";

const router = Router();

router.get("/active", getActiveEvent);
router.get("/upcoming", listUpcomingEvents);
router.get("/:id", getPublicEventById);
router.post("/:id/vote", castVote);

export default router;
