import { NextFunction, Request, Response } from "express";
import { verifyAdminToken } from "../utils/jwt";
import { ApiError } from "./errorHandler";

/**
 * Защищает административные маршруты. Ожидает заголовок:
 *   Authorization: Bearer <jwt>
 * При успехе прокидывает данные администратора в req.admin.
 */
export function requireAdminAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    next(
      new ApiError(
        401,
        "UNAUTHORIZED",
        "Отсутствует токен авторизации (Authorization: Bearer <token>)"
      )
    );
    return;
  }

  const token = header.slice("Bearer ".length).trim();

  try {
    const payload = verifyAdminToken(token);
    req.admin = payload;
    next();
  } catch {
    next(new ApiError(401, "UNAUTHORIZED", "Недействительный или истёкший токен"));
  }
}
