import crypto from "node:crypto";

/**
 * 生成一个随机的 Gateway session token。
 * 每次 Electron 启动生成新 token，仅存在于内存中，不持久化。
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
