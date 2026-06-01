function toTokenCount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function getRecentRequestTokenMetrics(request = {}) {
  const promptTokens = toTokenCount(request.promptTokens);
  const completionTokens = toTokenCount(request.completionTokens);
  const cacheInputTokens = toTokenCount(request.cacheInputTokens);
  const uncachedInputTokens = cacheInputTokens > promptTokens
    ? promptTokens
    : Math.max(0, promptTokens - cacheInputTokens);

  return {
    promptTokens,
    completionTokens,
    cacheInputTokens,
    uncachedInputTokens,
  };
}
