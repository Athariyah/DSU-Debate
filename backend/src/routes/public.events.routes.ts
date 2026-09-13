import { Router } from "express";
import { castVote, getActiveEvent } from "../controllers/vote.controller";

const router = Router();

// GET /api/events/active
router.get("/active", getActiveEvent);

// POST /api/events/:id/vote
router.post("/:id/vote", castVote);

export default router;
