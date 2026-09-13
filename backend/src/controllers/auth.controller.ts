import { Request, Response } from "express";
import { pool } from "../config/db";
import { AdminRecord } from "../types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../middleware/errorHandler";
import { comparePassword, hashPassword } from "../utils/password";
import { signAdminToken } from "../utils/jwt";
import { env } from "../config/env";
import { loginSchema, registerSchema } from "../validation/schemas";

/**
 * POST /api/admin/auth/register
 * Полноценная регистрация администратора: email + пароль (bcrypt-хэш).
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0].message);
  }
  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await pool.query<AdminRecord>(
    "SELECT id FROM admins WHERE email = $1",
    [normalizedEmail]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    throw new ApiError(409, "EMAIL_TAKEN", "Администратор с таким email уже существует");
  }

  const passwordHash = await hashPassword(password);

  const inserted = await pool.query<AdminRecord>(
    `INSERT INTO admins (email, password_hash)
     VALUES ($1, $2)
     RETURNING id, email, created_at`,
    [normalizedEmail, passwordHash]
  );
  const admin = inserted.rows[0];

  const token = signAdminToken({ adminId: admin.id, email: admin.email });

  res.status(201).json({
    admin: { id: admin.id, email: admin.email, createdAt: admin.created_at },
    token,
    expiresIn: env.jwtExpiresIn,
  });
});

/**
 * POST /api/admin/auth/login
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new ApiError(400, "VALIDATION_ERROR", parsed.error.issues[0].message);
  }
  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const result = await pool.query<AdminRecord>(
    "SELECT id, email, password_hash FROM admins WHERE email = $1",
    [normalizedEmail]
  );

  if (result.rowCount === 0) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Неверный email или пароль");
  }

  const admin = result.rows[0];
  const isValidPassword = await comparePassword(password, admin.password_hash);

  if (!isValidPassword) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Неверный email или пароль");
  }

  const token = signAdminToken({ adminId: admin.id, email: admin.email });

  res.status(200).json({
    admin: { id: admin.id, email: admin.email },
    token,
    expiresIn: env.jwtExpiresIn,
  });
});
