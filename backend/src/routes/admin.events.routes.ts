import { Router } from "express";
import { requireAdminAuth } from "../middleware/authMiddleware";
import {
  createEvent,
  deleteEvent,
  getEventById,
  listEvents,
  updateEvent,
} from "../controllers/events.controller";

const router = Router();

router.use(requireAdminAuth);

router.post("/", createEvent);
router.get("/", listEvents);
router.get("/:id", getEventById);
router.put("/:id", updateEvent);
router.delete("/:id", deleteEvent);

export default router;
