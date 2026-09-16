import { NextFunction, Request, Response } from "express";
import { pool } from "../config/db";
import { verifyAdminToken } from "../utils/jwt";
import { ApiError } from "./errorHandler";

function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const pair = header
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

export function getBearerOrCookieToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length).trim();
  return readCookie(req.headers.cookie, "dsu_admin_token");
}

export async function requireAdminAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const token = getBearerOrCookieToken(req);
  if (!token) {
    console.log(`[auth] 401 ${req.method} ${req.originalUrl} reason=token-missing`);
    next(new ApiError(401, "UNAUTHORIZED", "Требуется авторизация администратора"));
    return;
  }

  try {
    const payload = verifyAdminToken(token);
    const admin = await pool.query<{ id: number; email: string }>(
      "SELECT id, email FROM admins WHERE id = $1",
      [payload.adminId]
    );
    if (admin.rowCount === 0) {
      throw new Error("Admin no longer exists");
    }
    req.admin = { adminId: admin.rows[0].id, email: admin.rows[0].email };
    next();
  } catch {
    console.log(`[auth] 401 ${req.method} ${req.originalUrl} reason=token-invalid prefix=${token.slice(0, 12)}…`);
    next(new ApiError(401, "UNAUTHORIZED", "Недействительный или отозванный токен"));
  }
}
