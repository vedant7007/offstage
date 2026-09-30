/**
 * Side-effect import for CLI entry points (worker, scripts, migrations).
 * Next.js loads .env on its own; plain Node does not. Import this first.
 */
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
