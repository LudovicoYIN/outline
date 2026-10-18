import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const keyLength = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scryptAsync(password, salt, keyLength)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const [algorithm, saltHex, keyHex] = storedHash.split("$");
  if (algorithm !== "scrypt" || !saltHex || !keyHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");
  if (salt.length !== 16 || expectedKey.length !== keyLength) {
    return false;
  }

  const actualKey = (await scryptAsync(password, salt, keyLength)) as Buffer;
  return timingSafeEqual(actualKey, expectedKey);
}
