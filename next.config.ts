import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Stop next dev from writing its own agent notes into the repo's shared rules file.
  agentRules: false,
  // Keep the Postgres and job queue drivers out of the server bundle.
  serverExternalPackages: ["postgres", "pg-boss", "pino"],
};

export default nextConfig;
