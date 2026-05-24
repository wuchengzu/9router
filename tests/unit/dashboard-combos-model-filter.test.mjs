import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const combosPage = readFileSync("src/app/(dashboard)/dashboard/combos/page.js", "utf8");
const providerPage = readFileSync("src/app/(dashboard)/dashboard/providers/[id]/page.js", "utf8");
const compatibleModelsSection = readFileSync("src/app/(dashboard)/dashboard/providers/[id]/CompatibleModelsSection.js", "utf8");

test("auto combo result always includes updatedCombos for rendering", () => {
  assert.ok(
    /setResultState\(\{\s*type:\s*"auto",\s*createdCombos,\s*updatedCombos\s*\}\)/s.test(combosPage),
    "auto result state must include updatedCombos before result modal renders"
  );
});

test("provider model filter reaches compatible provider model list", () => {
  assert.ok(
    /<CompatibleModelsSection[\s\S]*modelSearch=\{modelSearch\}/.test(providerPage),
    "provider page must pass modelSearch into compatible provider models"
  );
  assert.ok(/modelSearch\s*=\s*""/.test(compatibleModelsSection), "compatible section must accept modelSearch");
  assert.ok(/filteredModels/.test(compatibleModelsSection), "compatible section must render filtered models");
  assert.ok(
    /modelId\.toLowerCase\(\)\.includes\(search\)/.test(compatibleModelsSection),
    "compatible section must filter by model id"
  );
});

test("auto combo and sync model groups ignore disabled provider models", () => {
  assert.ok(
    /const\s+\[disabledModels,\s*setDisabledModels\]\s*=\s*useState\(\{\}\)/.test(combosPage),
    "combos page must keep disabled model state"
  );
  assert.ok(
    /fetch\("\/api\/models\/disabled"\)/.test(combosPage),
    "combos page must load disabled provider models before grouping"
  );
  assert.ok(
    /getDisabledIdsForProvider/.test(combosPage),
    "combos page must resolve disabled ids by provider alias and provider id"
  );
  assert.ok(
    /providerModels\s*=\s*providerModels\.filter\(\(\{\s*id\s*:\s*modelId\s*\}\)\s*=>\s*!disabledIds\.has\(modelId\)\)/.test(combosPage),
    "collectModelGroups must remove disabled provider models before auto combos and sync"
  );
});

test("sync combo removes models that are no longer available", () => {
  assert.ok(
    /const\s+availableValues\s*=\s*new Set\(matchingGroup\.models\.map\(m\s*=>\s*m\.value\)\)/.test(combosPage),
    "sync must compute available model values from the filtered matching group"
  );
  assert.ok(
    /const\s+removed\s*=\s*combo\.models\.filter\(m\s*=>\s*!availableValues\.has\(m\)\)/.test(combosPage),
    "sync must identify existing combo models that are no longer available"
  );
  assert.ok(
    /body:\s*JSON\.stringify\(\{\s*name:\s*combo\.name,\s*models:\s*plan\.synced\s*\}\)/s.test(combosPage),
    "sync PUT must persist the rebuilt available model list from the shared plan"
  );
});

test("sync combo removes stale models even when no matching model group remains", () => {
  assert.ok(
    /const\s+availableModelValues\s*=\s*new Set\(\);/.test(combosPage),
    "sync must collect every currently available model value"
  );
  assert.ok(
    /groups\.forEach\(group\s*=>\s*\{\s*group\.models\.forEach\(m\s*=>\s*availableModelValues\.add\(m\.value\)\);?\s*\}\)/s.test(combosPage),
    "sync must populate available values from all filtered groups"
  );
  assert.ok(
    /const\s+removed\s*=\s*combo\.models\.filter\(m\s*=>\s*!availableModelValues\.has\(m\)\)/.test(combosPage),
    "sync not-found branch must identify stale models from disabled providers"
  );
  assert.ok(
    /synced:\s*combo\.models\.filter\(m\s*=>\s*availableModelValues\.has\(m\)\)/.test(combosPage),
    "sync not-found branch must plan combo without stale unavailable models"
  );
});

test("combo model groups exclude inactive provider connections", () => {
  assert.ok(
    /const\s+activeConnectionIds\s*=\s*activeProviders\s*\.filter\(p\s*=>\s*p\.isActive\s*!==\s*false\)\s*\.map\(p\s*=>\s*p\.provider\)/s.test(combosPage),
    "collectModelGroups must not include disabled provider connections"
  );
});

test("combo model groups include custom compatible providers", () => {
  assert.ok(
    /const\s+isCustom\s*=\s*isOpenAICompatibleProvider\(providerId\)\s*\|\|\s*isAnthropicCompatibleProvider\(providerId\);[\s\S]*const\s+providerInfo\s*=\s*allProviders\[providerId\];[\s\S]*if\s*\(!providerInfo\s*&&\s*!isCustom\)\s*return;/.test(combosPage),
    "custom compatible providers must be allowed even when not present in built-in provider constants"
  );
});

test("custom compatible providers do not read missing provider info", () => {
  assert.ok(
    /if\s*\(providerInfo\?\.passthroughModels\)/.test(combosPage),
    "collectModelGroups must guard providerInfo before reading passthroughModels"
  );
});

test("combos page has Sync All next to Auto Combos", () => {
  assert.ok(/const\s+\[syncingAll,\s*setSyncingAll\]\s*=\s*useState\(false\)/.test(combosPage), "Sync All must have loading state");
  assert.ok(/const\s+handleSyncAll\s*=\s*async\s*\(\)\s*=>/.test(combosPage), "Sync All handler must exist");
  assert.ok(/<Button\s+icon="sync"[\s\S]*onClick=\{handleSyncAll\}[\s\S]*Sync All/.test(combosPage), "Sync All button must render in header");
  assert.ok(/disabled=\{syncingAll\s*\|\|\s*combos\.length\s*===\s*0\}/.test(combosPage), "Sync All must disable while running or empty");
});

test("Sync All reuses combo sync calculation and reports a batch result", () => {
  assert.ok(/function\s+buildComboSyncPlan\(combo,\s*groups\)/.test(combosPage), "single and batch sync must share sync calculation");
  assert.ok(/for\s*\(const\s+combo\s+of\s+combos\)/.test(combosPage), "Sync All must iterate current combos");
  assert.ok(/setResultState\(\{\s*type:\s*"syncAll",\s*updatedCombos,\s*unchangedCount\s*\}\)/s.test(combosPage), "Sync All must show a batch result");
});
