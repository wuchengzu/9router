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
