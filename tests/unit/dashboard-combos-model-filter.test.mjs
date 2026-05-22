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
