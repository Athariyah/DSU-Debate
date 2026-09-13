import { Router } from "express";
import { login, logout, me, register } from "../controllers/auth.controller";
import { requireAdminAuth } from "../middleware/authMiddleware";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAdminAuth, me);
router.post("/logout", logout);

export default router;
