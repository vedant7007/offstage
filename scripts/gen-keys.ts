/**
 * Prints fresh secrets in .env format:
 *   pnpm keys >> .env   (then remove the duplicate empty lines from .env.example defaults)
 * Ed25519 keys are DER encoded (PKCS8 private, SPKI public) then base64, one line each.
 */
import { generateKeyPairSync, randomBytes } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const priv = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const pub = publicKey.export({ format: "der", type: "spki" }).toString("base64");

const lines = [
  `AUTH_SECRET=${randomBytes(32).toString("base64url")}`,
  `TICKET_SIGNING_PRIVATE_KEY=${priv}`,
  `TICKET_SIGNING_PUBLIC_KEY=${pub}`,
  `PII_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`,
];
console.log(lines.join("\n"));
