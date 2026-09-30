import { existsSync } from "node:fs";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import postgres from "postgres";

/**
 * Creates a fresh `<db>_test` database next to DATABASE_URL, with its own keys, so integration
 * tests never touch the dev database or its encryption keys. Test files read the settings from env.
 */
export default async function setup() {
  if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is required for integration tests");
  const url = new URL(base);
  const testDb = `${url.pathname.slice(1)}_test`;
  const admin = postgres(base, { max: 1, onnotice: () => {} });
  await admin.unsafe(`drop database if exists "${testDb}" with (force)`);
  await admin.unsafe(`create database "${testDb}"`);
  await admin.end();
  url.pathname = `/${testDb}`;

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  process.env.DATABASE_URL = url.toString();
  process.env.DATABASE_APP_ROLE = "sutradhar_app";
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  process.env.TICKET_SIGNING_PRIVATE_KEY = privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64");
  process.env.TICKET_SIGNING_PUBLIC_KEY = publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64");
  process.env.DEMO_MODE = "true";
  process.env.LOG_LEVEL = "silent";
}
