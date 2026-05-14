import { afterEach, describe, expect, it, vi } from "vitest";

function installDom({ locale = "en", fetchMap = {} } = {}) {
  let observerCount = 0;
  let observedTargets = 0;

  global.NodeFilter = { SHOW_TEXT: 4 };
  global.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 };
  global.fetch = vi.fn(async (url) => ({
    ok: true,
    json: async () => fetchMap[url] ?? {},
  }));
  global.window = {};
  global.document = {
    cookie: `locale=${encodeURIComponent(locale)}`,
    body: {
      nodeType: 1,
      hasAttribute: () => false,
      parentElement: null,
    },
    createTreeWalker: () => ({
      nextNode() {
        return null;
      },
    }),
  };
  global.MutationObserver = class FakeMutationObserver {
    constructor() {
      observerCount += 1;
    }

    observe() {
      observedTargets += 1;
    }

    disconnect() {}
  };

  return {
    getObserverCount: () => observerCount,
    getObservedTargets: () => observedTargets,
  };
}

async function loadRuntimeModule() {
  vi.resetModules();
  return import("../../src/i18n/runtime.js");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete global.window;
  delete global.document;
  delete global.fetch;
  delete global.NodeFilter;
  delete global.Node;
  delete global.MutationObserver;
});

describe("runtime i18n initialization", () => {
  it("does not start a DOM observer for English locale", async () => {
    const dom = installDom({ locale: "en" });
    const { initRuntimeI18n } = await loadRuntimeModule();

    await initRuntimeI18n();

    expect(dom.getObserverCount()).toBe(0);
    expect(dom.getObservedTargets()).toBe(0);
  });

  it("reuses a single DOM observer across repeated initialization", async () => {
    const dom = installDom({
      locale: "zh-CN",
      fetchMap: {
        "/i18n/literals/zh-CN.json": { Endpoint: "端点" },
      },
    });
    const { initRuntimeI18n } = await loadRuntimeModule();

    await initRuntimeI18n();
    await initRuntimeI18n();

    expect(dom.getObserverCount()).toBe(1);
    expect(dom.getObservedTargets()).toBe(1);
  });
});
