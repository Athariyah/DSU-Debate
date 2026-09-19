import { Router } from "express";
import { requireAdminAuth } from "../middleware/authMiddleware";
import {
  createParticipant,
  deleteParticipant,
  getParticipantById,
  listParticipants,
  updateParticipant,
} from "../controllers/participants.controller";

const router = Router();

router.use(requireAdminAuth);

router.post("/", createParticipant);
router.get("/", listParticipants);
router.get("/:id", getParticipantById);
router.put("/:id", updateParticipant);
router.delete("/:id", deleteParticipant);
// POST-алиасы (см. комментарий в admin.events.routes.ts): на случай шлюзов,
// блокирующих PUT/DELETE.
router.post("/:id/update", updateParticipant);
router.post("/:id/delete", deleteParticipant);

export default router;
