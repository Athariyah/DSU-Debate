import { Router } from "express";
import { requireAdminAuth } from "../middleware/authMiddleware";
import { createMatch, deleteMatch, updateMatch } from "../controllers/matches.controller";
import { refreshStandings } from "../controllers/standings.controller";
import { setPodium } from "../controllers/leaderboard.controller";

const router = Router();
router.use(requireAdminAuth);

// Matches CRUD: nested under events but also standalone for update/delete
router.post("/events/:id/matches", createMatch);
router.put("/matches/:matchId", updateMatch);
router.delete("/matches/:matchId", deleteMatch);
// POST-алиасы (см. комментарий в admin.events.routes.ts): на случай шлюзов,
// блокирующих PUT/DELETE.
router.post("/matches/:matchId/update", updateMatch);
router.post("/matches/:matchId/delete", deleteMatch);

// Standings refresh
router.post("/events/:id/standings/refresh", refreshStandings);

// Podium management
router.post("/events/:id/podium", setPodium);
router.put("/events/:id/podium", setPodium);

export default router;
