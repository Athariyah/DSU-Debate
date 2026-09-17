import { Router } from "express";
import { requireAdminAuth } from "../middleware/authMiddleware";
import {
  createEvent,
  createVoting,
  deleteEvent,
  getEventById,
  listEvents,
  listVotings,
  updateEvent,
} from "../controllers/events.controller";

const router = Router();

router.use(requireAdminAuth);

router.post("/", createEvent);
router.get("/", listEvents);
router.post("/:id/votings", createVoting);
router.get("/:id/votings", listVotings);
router.get("/:id", getEventById);
router.put("/:id", updateEvent);
router.delete("/:id", deleteEvent);

export default router;
