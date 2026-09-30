/**
 * Print the Amazon SES SMTP password for an IAM secret access key, for EMAIL_DRIVER=smtp.
 * Algorithm from https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html
 *
 *   pnpm ses:smtp-password              uses AWS_SECRET_ACCESS_KEY and AWS_REGION from .env
 *
 * The SMTP user name is the access key id itself. The IAM user needs ses:SendRawEmail.
 */
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

const secret = process.env.AWS_SECRET_ACCESS_KEY;
const region = process.env.AWS_REGION ?? "ap-south-1";
if (!secret) {
  console.error("AWS_SECRET_ACCESS_KEY is not set");
  process.exit(1);
}

const sign = (key: Buffer, msg: string) => createHmac("sha256", key).update(msg, "utf8").digest();
let sig = sign(Buffer.from(`AWS4${secret}`, "utf8"), "11111111");
for (const part of [region, "ses", "aws4_request", "SendRawEmail"]) sig = sign(sig, part);
const password = Buffer.concat([Buffer.from([0x04]), sig]).toString("base64");

console.log(`SMTP_HOST=email-smtp.${region}.amazonaws.com`);
console.log("SMTP_PORT=587");
console.log(`SMTP_USER=${process.env.AWS_ACCESS_KEY_ID ?? "<access key id>"}`);
console.log(`SMTP_PASS=${password}`);
