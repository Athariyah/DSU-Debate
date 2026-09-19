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
// POST-алиасы тех же обработчиков: часть сетевых шлюзов и CDN по умолчанию
// блокирует PUT/DELETE (исторически считаются «небезопасными») и отвечает
// 405. Клиент шлёт POST .../update и POST .../delete, PUT/DELETE остаются
// для обратной совместимости.
router.post("/:id/update", updateEvent);
router.post("/:id/delete", deleteEvent);

export default router;
