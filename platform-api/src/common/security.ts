import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const opaqueToken = (bytes = 48): string =>
  randomBytes(bytes).toString("base64url");
export const organizationJoinCode = (): string =>
  randomBytes(5).toString("hex").toUpperCase();
export const hashToken = (token: string, secret: string): string =>
  createHmac("sha256", secret).update(token).digest("hex");
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
