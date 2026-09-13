import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { JwtPayload } from "../types";

export function signAdminToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, env.jwtSecret, options);
}

export function verifyAdminToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (
    typeof decoded === "object" &&
    decoded !== null &&
    "adminId" in decoded &&
    "email" in decoded
  ) {
    return {
      adminId: Number((decoded as Record<string, unknown>).adminId),
      email: String((decoded as Record<string, unknown>).email),
    };
  }
  throw new Error("Invalid token payload");
}
