import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Keep next dev from rewriting the shared rules file.
  agentRules: false,
  // Keep the Postgres and job queue drivers out of the server bundle.
  serverExternalPackages: ["postgres", "pg-boss", "pino"],
};

export default nextConfig;
