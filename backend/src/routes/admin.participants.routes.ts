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

export default router;
