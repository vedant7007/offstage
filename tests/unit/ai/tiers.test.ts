import { afterEach, describe, expect, it, vi } from "vitest";
import { chain } from "@/ai/router/tiers";

afterEach(() => vi.unstubAllEnvs());

describe("chain", () => {
  it("follows the profile order, and `only` reaches a provider the profile leaves out", () => {
    vi.stubEnv("AI_PROFILE", "dev");
    vi.stubEnv("GROQ_API_KEY", "x");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "x");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "x");
    expect(chain("smart").map((l) => l.provider)).not.toContain("bedrock"); // dev: ollama then groq
    expect(chain("smart", "bedrock")).toEqual([
      { provider: "bedrock", model: "global.amazon.nova-2-lite-v1:0" },
    ]);
    expect(chain("guard", "bedrock")).toEqual([]); // Bedrock has no guard model
  });

  it("drops a forced provider that has no credentials", () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");
    vi.stubEnv("AWS_BEARER_TOKEN_BEDROCK", "");
    expect(chain("smart", "bedrock")).toEqual([]);
  });
});
