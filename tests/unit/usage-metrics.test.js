import { describe, expect, it } from "vitest";
import { getRecentRequestTokenMetrics } from "../../src/shared/utils/usageMetrics.js";

describe("recent request token metrics", () => {
  it("keeps cache tokens separate when provider reports input tokens excluding cache", () => {
    const metrics = getRecentRequestTokenMetrics({
      promptTokens: 901,
      completionTokens: 25,
      cacheInputTokens: 54016,
    });

    expect(metrics.promptTokens).toBe(901);
    expect(metrics.completionTokens).toBe(25);
    expect(metrics.cacheInputTokens).toBe(54016);
    expect(metrics.uncachedInputTokens).toBe(901);
  });

  it("computes uncached input when input tokens include cached tokens", () => {
    const metrics = getRecentRequestTokenMetrics({
      promptTokens: 56000,
      completionTokens: 25,
      cacheInputTokens: 54016,
    });

    expect(metrics.uncachedInputTokens).toBe(1984);
  });
});
