"use client";

import { useState, useEffect, useCallback } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers";
import { Card, Button, Modal, Input, CardSkeleton, ModelSelectModal, Toggle, ConfirmModal } from "@/shared/components";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider, getProviderAlias, OAUTH_PROVIDERS, APIKEY_PROVIDERS, FREE_PROVIDERS, FREE_TIER_PROVIDERS, AI_PROVIDERS } from "@/shared/constants/providers";
import { getModelsByProviderId } from "@/shared/constants/models";

// Validate combo name: only a-z, A-Z, 0-9, -, _
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

// Provider priority order for model sorting
const PROVIDER_ORDER = [
  ...Object.keys(OAUTH_PROVIDERS),
  ...Object.keys(FREE_PROVIDERS),
  ...Object.keys(FREE_TIER_PROVIDERS),
  ...Object.keys(APIKEY_PROVIDERS),
];
const NO_AUTH_PROVIDER_IDS = Object.keys(FREE_PROVIDERS).filter(id => FREE_PROVIDERS[id].noAuth);

// Normalize model ID for fuzzy grouping
// Handles patterns like kimi-k2.5 ≈ kimi-k2p5, claude-sonnet-4-20250514 ≈ claude-sonnet-4
function normalizeForGrouping(modelId) {
  let s = modelId.toLowerCase();
  // Remove date suffixes like -20250514
  s = s.replace(/-\d{6,8}$/, "");
  // Remove separators
  s = s.replace(/[-_.]/g, "");
  // Normalize p between digits (.5 ≈ p5 ≈ 5)
  s = s.replace(/(\d)p(\d)/g, "$1$2");
  return s;
}

export default function CombosPage() {
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState(null);
  const [activeProviders, setActiveProviders] = useState([]);
  const [comboStrategies, setComboStrategies] = useState({});
  const [confirmState, setConfirmState] = useState(null);
  const [createKey, setCreateKey] = useState(0);
  const [autoCreating, setAutoCreating] = useState(false);
  const [syncingIds, setSyncingIds] = useState(new Set());
  const [resultState, setResultState] = useState(null);
  const [modelAliases, setModelAliases] = useState({});
  const [providerNodes, setProviderNodes] = useState([]);
  const [customModels, setCustomModels] = useState([]);
  const [disabledModels, setDisabledModels] = useState({});
  const { copied, copy } = useCopyToClipboard();

  useEffect(() => {
    fetchData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    try {
      const [combosRes, providersRes, settingsRes, aliasesRes, nodesRes, customModelsRes, disabledModelsRes] = await Promise.all([
        fetch("/api/combos"),
        fetch("/api/providers"),
        fetch("/api/settings"),
        fetch("/api/models/alias"),
        fetch("/api/provider-nodes"),
        fetch("/api/models/custom"),
        fetch("/api/models/disabled"),
      ]);
      const combosData = await combosRes.json();
      const providersData = await providersRes.json();
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};

      // Only LLM combos here — webSearch/webFetch combos belong to media-providers/web
      if (combosRes.ok) setCombos((combosData.combos || []).filter(c => !c.kind));
      if (providersRes.ok) {
        setActiveProviders(providersData.connections || []);
      }
      setComboStrategies(settingsData.comboStrategies || {});
      if (aliasesRes.ok) {
        const ad = await aliasesRes.json();
        setModelAliases(ad.aliases || {});
      }
      if (nodesRes.ok) {
        const nd = await nodesRes.json();
        setProviderNodes(nd.nodes || []);
      }
      if (customModelsRes.ok) {
        const cd = await customModelsRes.json();
        setCustomModels(cd.models || []);
      }
      if (disabledModelsRes.ok) {
        const dd = await disabledModelsRes.json();
        setDisabledModels(dd.disabled || {});
      }
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getDisabledIdsForProvider = (providerId) => {
    const alias = getProviderAlias(providerId);
    return new Set([
      ...(disabledModels[alias] || []),
      ...(disabledModels[providerId] || []),
    ]);
  };

  // Collect all available model values across all active providers
  // Returns Map<normalizedKey, { canonicalId: string, models: string[] }>
  const collectModelGroups = () => {
    const allProviders = { ...OAUTH_PROVIDERS, ...FREE_PROVIDERS, ...FREE_TIER_PROVIDERS, ...APIKEY_PROVIDERS };
    const activeConnectionIds = activeProviders.map(p => p.provider);
    const providerIdsToShow = new Set([...activeConnectionIds, ...NO_AUTH_PROVIDER_IDS]);
    const groups = new Map(); // normalizedKey → { canonicalId, models: [{ value, providerId, modelId }] }

    providerIdsToShow.forEach((providerId) => {
      const alias = getProviderAlias(providerId);
      const providerInfo = allProviders[providerId];
      if (!providerInfo) return;
      const isCustom = isOpenAICompatibleProvider(providerId) || isAnthropicCompatibleProvider(providerId);

      let providerModels = [];

      if (providerInfo.passthroughModels) {
        // Passthrough providers: get models from aliases
        providerModels = Object.entries(modelAliases)
          .filter(([, fullModel]) => fullModel.startsWith(`${alias}/`))
          .map(([aliasName, fullModel]) => ({
            id: fullModel.replace(`${alias}/`, ""),
            value: fullModel,
          }));
      } else if (isCustom) {
        const matchedNode = providerNodes.find(node => node.id === providerId);
        const nodePrefix = matchedNode?.prefix || providerId;
        providerModels = Object.entries(modelAliases)
          .filter(([, fullModel]) => fullModel.startsWith(`${providerId}/`))
          .map(([aliasName, fullModel]) => ({
            id: fullModel.replace(`${providerId}/`, ""),
            value: `${nodePrefix}/${fullModel.replace(`${providerId}/`, "")}`,
          }));
      } else {
        const hardcoded = getModelsByProviderId(providerId);
        const hardcodedIds = new Set(hardcoded.map(m => m.id));
        const customFromAliases = Object.entries(modelAliases)
          .filter(([aName, fullModel]) =>
            fullModel.startsWith(`${alias}/`) &&
            (hardcoded.length > 0 ? aName === fullModel.replace(`${alias}/`, "") : true) &&
            !hardcodedIds.has(fullModel.replace(`${alias}/`, ""))
          )
          .map(([aName, fullModel]) => ({ id: fullModel.replace(`${alias}/`, ""), value: fullModel, isCustom: true }));
        const customRegistered = customModels
          .filter(m => m.providerAlias === alias && !hardcodedIds.has(m.id))
          .map(m => ({ id: m.id, value: `${alias}/${m.id}`, isCustom: true }));
        providerModels = [
          ...hardcoded.filter(m => !m.type || m.type === "llm").map(m => ({ id: m.id, value: `${alias}/${m.id}` })),
          ...customFromAliases,
          ...customRegistered,
        ];
      }

      const disabledIds = getDisabledIdsForProvider(providerId);
      if (disabledIds.size > 0) {
        providerModels = providerModels.filter(({ id: modelId }) => !disabledIds.has(modelId));
      }

      providerModels.forEach(({ id: modelId, value }) => {
        const normalized = normalizeForGrouping(modelId);
        if (!groups.has(normalized)) {
          groups.set(normalized, { canonicalId: modelId, models: [] });
        }
        const group = groups.get(normalized);
        const providerOrder = PROVIDER_ORDER.indexOf(providerId);
        // Prefer canonicalId from higher-priority provider; tiebreak by shorter id
        const currentOrder = group.canonicalProviderOrder ?? 999;
        if (providerOrder < currentOrder || (providerOrder === currentOrder && modelId.length < group.canonicalId.length)) {
          group.canonicalId = modelId;
          group.canonicalProviderOrder = providerOrder;
        }
        group.models.push({ value, providerId, modelId, providerOrder: providerOrder === -1 ? 999 : providerOrder });
      });
    });

    // Sort models within each group by provider order, dedupe by value
    groups.forEach((group) => {
      group.models.sort((a, b) => a.providerOrder - b.providerOrder);
      const seen = new Set();
      group.models = group.models.filter(m => {
        if (seen.has(m.value)) return false;
        seen.add(m.value);
        return true;
      });
    });

    return groups;
  };

  const handleAutoCombos = async () => {
    setAutoCreating(true);
    try {
      const groups = collectModelGroups();
      const existingMap = new Map(combos.map(c => [c.name, c]));
      const createdCombos = [];
      const updatedCombos = [];

      for (const [, group] of groups) {
        if (group.models.length < 2) continue;
        const name = group.canonicalId;
        if (!VALID_NAME_REGEX.test(name)) continue;
        if (existingMap.has(name)) continue;

        const newValues = group.models.map(m => m.value);
        const res = await fetch("/api/combos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, models: newValues }),
        });
        if (res.ok) createdCombos.push({ name, models: newValues });
      }

      await fetchData();
      setResultState({ type: "auto", createdCombos, updatedCombos });
    } catch (error) {
      console.log("Error auto-creating combos:", error);
    } finally {
      setAutoCreating(false);
    }
  };

  const handleSyncCombo = async (combo) => {
    setSyncingIds(prev => new Set([...prev, combo.id]));
    try {
      const groups = collectModelGroups();
      const comboNormalized = normalizeForGrouping(combo.name);
      let matchingGroup = groups.get(comboNormalized);
      if (!matchingGroup) {
        for (const [, group] of groups) {
          if (normalizeForGrouping(group.canonicalId) === comboNormalized) {
            matchingGroup = group;
            break;
          }
        }
      }
      if (matchingGroup) {
        const existingSet = new Set(combo.models);
        const merged = [...combo.models];
        const added = [];
        for (const m of matchingGroup.models) {
          if (!existingSet.has(m.value)) { merged.push(m.value); added.push(m.value); }
        }
        if (added.length > 0) {
          await fetch(`/api/combos/${combo.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: combo.name, models: merged }),
          });
          await fetchData();
          setResultState({ type: "sync", comboName: combo.name, added });
        } else {
          setResultState({ type: "sync", comboName: combo.name, added: [] });
        }
      } else {
        setResultState({ type: "sync", comboName: combo.name, added: [], notFound: true });
      }
    } catch (error) {
      console.log("Error syncing combo:", error);
    } finally {
      setSyncingIds(prev => new Set([...prev].filter(id => id !== combo.id)));
    }
  };

  const handleCreate = async (data) => {
    try {
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchData();
        setShowCreateModal(false);
        setCreateKey(k => k + 1);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create combo");
      }
    } catch (error) {
      console.log("Error creating combo:", error);
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      const res = await fetch(`/api/combos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchData();
        setEditingCombo(null);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update combo");
      }
    } catch (error) {
      console.log("Error updating combo:", error);
    }
  };

  const handleDelete = async (id) => {
    setConfirmState({
      title: "Delete Combo",
      message: "Delete this combo?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/combos/${id}`, { method: "DELETE" });
          if (res.ok) {
            setCombos(combos.filter(c => c.id !== id));
          }
        } catch (error) {
          console.log("Error deleting combo:", error);
        }
      }
    });
  };

  const handleToggleRoundRobin = async (comboName, enabled) => {
    try {
      const updated = { ...comboStrategies };
      if (enabled) {
        updated[comboName] = { fallbackStrategy: "round-robin" };
      } else {
        delete updated[comboName];
      }
      
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStrategies: updated }),
      });
      
      setComboStrategies(updated);
    } catch (error) {
      console.log("Error updating combo strategy:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Combos</h1>
          <p className="text-sm text-text-muted mt-1">
            Create model combos with fallback support
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:w-auto">
          <Button icon="auto_awesome" onClick={handleAutoCombos} disabled={autoCreating} variant="secondary" className="w-full sm:w-auto">
            {autoCreating ? "Creating..." : "Auto Combos"}
          </Button>
          <Button icon="add" onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto">
            Create Combo
          </Button>
        </div>
      </div>

      {/* Combos List */}
      {combos.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
              <span className="material-symbols-outlined text-[32px]">layers</span>
            </div>
            <p className="text-text-main font-medium mb-1">No combos yet</p>
            <p className="text-sm text-text-muted mb-4">Create model combos with fallback support</p>
            <Button icon="add" onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto">
              Create Combo
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {combos.map((combo) => (
            <ComboCard
              key={combo.id}
              combo={combo}
              copied={copied}
              syncing={syncingIds.has(combo.id)}
              onCopy={copy}
              onEdit={() => setEditingCombo(combo)}
              onDelete={() => handleDelete(combo.id)}
              onSync={() => handleSyncCombo(combo)}
              roundRobinEnabled={comboStrategies[combo.name]?.fallbackStrategy === "round-robin"}
              onToggleRoundRobin={(enabled) => handleToggleRoundRobin(combo.name, enabled)}
            />
          ))}
        </div>
      )}

      {/* Create Modal - Use key to force remount and reset state */}
      <ComboFormModal
        key={`create-${createKey}`}
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={handleCreate}
        activeProviders={activeProviders}
      />

      {/* Edit Modal - Use key to force remount and reset state */}
      <ComboFormModal
        key={editingCombo?.id || "new"}
        isOpen={!!editingCombo}
        combo={editingCombo}
        onClose={() => setEditingCombo(null)}
        onSave={(data) => handleUpdate(editingCombo.id, data)}
        activeProviders={activeProviders}
      />

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        variant="danger"
      />

      {/* Result Modal */}
      {resultState && (
        <Modal
          isOpen={!!resultState}
          onClose={() => setResultState(null)}
          title={resultState.type === "auto" ? "Auto Combos Result" : `Sync: ${resultState.comboName}`}
        >
          <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
            {resultState.type === "auto" && (
              <>
                {resultState.createdCombos.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-emerald-500 mb-1.5">
                      Created {resultState.createdCombos.length} combo(s)
                    </p>
                    <div className="flex flex-col gap-1">
                      {resultState.createdCombos.map((c) => (
                        <div key={c.name} className="flex flex-col gap-0.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] px-3 py-1.5">
                          <code className="font-mono text-xs font-medium">{c.name}</code>
                          <div className="flex flex-wrap gap-1">
                            {c.models.slice(0, 4).map((m) => (
                              <code key={m} className="text-[10px] text-text-muted bg-black/5 dark:bg-white/5 px-1 py-0.5 rounded">{m}</code>
                            ))}
                            {c.models.length > 4 && <span className="text-[10px] text-text-muted">+{c.models.length - 4} more</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {resultState.updatedCombos.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-blue-500 mb-1.5">
                      Updated {resultState.updatedCombos.length} combo(s)
                    </p>
                    <div className="flex flex-col gap-1">
                      {resultState.updatedCombos.map((c) => (
                        <div key={c.name} className="flex flex-col gap-0.5 rounded-lg bg-black/[0.02] dark:bg-white/[0.02] px-3 py-1.5">
                          <code className="font-mono text-xs font-medium">{c.name}</code>
                          <div className="flex flex-wrap gap-1">
                            {c.added.map((m) => (
                              <code key={m} className="text-[10px] text-emerald-500 bg-emerald-500/10 px-1 py-0.5 rounded">+{m}</code>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {resultState.createdCombos.length === 0 && resultState.updatedCombos.length === 0 && (
                  <p className="text-sm text-text-muted py-2">No new combos to create or update.</p>
                )}
              </>
            )}
            {resultState.type === "sync" && (
              <>
                {resultState.notFound ? (
                  <p className="text-sm text-text-muted py-2">No matching models found for this combo name.</p>
                ) : resultState.added.length > 0 ? (
                  <div>
                    <p className="text-sm font-medium text-emerald-500 mb-1.5">
                      Added {resultState.added.length} model(s)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {resultState.added.map((m) => (
                        <code key={m} className="text-xs text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded">+{m}</code>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted py-2">Already up to date.</p>
                )}
              </>
            )}
          </div>
          <div className="flex justify-end mt-4">
            <Button size="sm" onClick={() => setResultState(null)}>OK</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ComboCard({ combo, copied, syncing, onCopy, onEdit, onDelete, onSync, roundRobinEnabled, onToggleRoundRobin }) {
  return (
    <Card padding="sm" className="group">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary text-[18px]">layers</span>
          </div>
          <div className="min-w-0 flex-1">
            <code className="block truncate font-mono text-sm font-medium">{combo.name}</code>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
              {combo.models.length === 0 ? (
                <span className="text-xs text-text-muted italic">No models</span>
              ) : (
                combo.models.slice(0, 3).map((model, index) => (
                  <code key={index} className="max-w-full truncate rounded bg-black/5 px-1.5 py-0.5 font-mono text-[10px] text-text-muted dark:bg-white/5 sm:max-w-[220px]">
                    {model}
                  </code>
                ))
              )}
              {combo.models.length > 3 && (
                <span className="text-[10px] text-text-muted">+{combo.models.length - 3} more</span>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3 sm:shrink-0">
          {/* Round Robin Toggle — always visible */}
          <div className="flex items-center justify-between gap-1.5 rounded-lg bg-black/[0.02] px-2 py-1.5 dark:bg-white/[0.02] sm:justify-start sm:bg-transparent sm:px-0 sm:py-0 sm:dark:bg-transparent">
            <span className="text-xs text-text-muted font-medium">Round Robin</span>
            <Toggle
              size="sm"
              checked={roundRobinEnabled}
              onChange={onToggleRoundRobin}
            />
          </div>

          <div className="grid grid-cols-4 gap-1 sm:flex">
            <button
              onClick={onSync}
              disabled={syncing}
              className={`flex flex-col items-center rounded px-2 py-1 transition-colors ${syncing ? "text-primary animate-pulse" : "text-text-muted hover:bg-black/5 hover:text-primary dark:hover:bg-white/5"}`}
              title="Sync models from available providers"
            >
              <span className="material-symbols-outlined text-[18px]">{syncing ? "hourglass_top" : "sync"}</span>
              <span className="text-[10px] leading-tight">Sync</span>
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onCopy(combo.name, `combo-${combo.id}`); }}
              className="flex flex-col items-center rounded px-2 py-1 text-text-muted transition-colors hover:bg-black/5 hover:text-primary dark:hover:bg-white/5"
              title="Copy combo name"
            >
              <span className="material-symbols-outlined text-[18px]">
                {copied === `combo-${combo.id}` ? "check" : "content_copy"}
              </span>
              <span className="text-[10px] leading-tight">Copy</span>
            </button>
            <button
              onClick={onEdit}
              className="flex flex-col items-center rounded px-2 py-1 text-text-muted transition-colors hover:bg-black/5 hover:text-primary dark:hover:bg-white/5"
              title="Edit"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
              <span className="text-[10px] leading-tight">Edit</span>
            </button>
            <button
              onClick={onDelete}
              className="flex flex-col items-center rounded px-2 py-1 text-red-500 transition-colors hover:bg-red-500/10"
              title="Delete"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              <span className="text-[10px] leading-tight">Delete</span>
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ModelItem({ id, index, model, isFirst, isLast, onEdit, onMoveUp, onMoveDown, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    // no transition — prevents the CSS settle animation fighting React's re-render on drop
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
  };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(model);
  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== model) onEdit(trimmed);
    else setDraft(model);
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") { setDraft(model); setEditing(false); }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 bg-black/[0.02] hover:bg-black/[0.04] dark:bg-white/[0.02] dark:hover:bg-white/[0.04] transition-colors ${isDragging ? "shadow-md ring-1 ring-primary/30" : ""}`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab touch-none p-0.5 rounded text-text-muted hover:text-primary active:cursor-grabbing shrink-0"
        title="Drag to reorder"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="4" r="2"/><circle cx="15" cy="4" r="2"/>
          <circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/>
          <circle cx="9" cy="20" r="2"/><circle cx="15" cy="20" r="2"/>
        </svg>
      </button>

      {/* Index badge */}
      <span className="text-[10px] font-medium text-text-muted w-3 text-center shrink-0">{index + 1}</span>

      {/* Inline editable model value */}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 rounded border border-primary/40 bg-white px-1.5 py-0.5 font-mono text-xs text-text-main outline-none dark:bg-black/20"
        />
      ) : (
        <div
          className="min-w-0 flex-1 cursor-text truncate rounded px-1.5 py-0.5 font-mono text-xs text-text-main hover:bg-black/5 dark:hover:bg-white/5"
          onClick={() => setEditing(true)}
          title="Click to edit"
        >
          {model}
        </div>
      )}

      {/* Priority arrows */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className={`p-0.5 rounded ${isFirst ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`}
          title="Move up"
        >
          <span className="material-symbols-outlined text-[12px]">arrow_upward</span>
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className={`p-0.5 rounded ${isLast ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`}
          title="Move down"
        >
          <span className="material-symbols-outlined text-[12px]">arrow_downward</span>
        </button>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="p-0.5 hover:bg-red-500/10 rounded text-text-muted hover:text-red-500 transition-all"
        title="Remove"
      >
        <span className="material-symbols-outlined text-[12px]">close</span>
      </button>
    </div>
  );
}

function ComboFormModal({ isOpen, combo, onClose, onSave, activeProviders, kindFilter = null }) {
  // Initialize state with combo values - key prop on parent handles reset on remount
  const [name, setName] = useState(combo?.name || "");
  const [models, setModels] = useState(combo?.models || []);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [modelAliases, setModelAliases] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Use stable index-based IDs so duplicates and similar names are handled correctly
  const modelItems = models.map((model, i) => ({ uid: `item-${i}`, model }));

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = modelItems.findIndex((m) => m.uid === active.id);
      const newIndex = modelItems.findIndex((m) => m.uid === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        setModels((prev) => arrayMove(prev, oldIndex, newIndex));
      }
    }
  };

  const fetchModalData = async () => {
    try {
      const aliasesRes = await fetch("/api/models/alias");
      if (!aliasesRes.ok) return;
      const aliasesData = await aliasesRes.json();
      setModelAliases(aliasesData.aliases || {});
    } catch (error) {
      console.error("Error fetching modal data:", error);
    }
  };

  useEffect(() => {
    if (isOpen) fetchModalData();
  }, [isOpen]);

  const validateName = (value) => {
    if (!value.trim()) {
      setNameError("Name is required");
      return false;
    }
    if (!VALID_NAME_REGEX.test(value)) {
      setNameError("Only letters, numbers, -, _ and . allowed");
      return false;
    }
    setNameError("");
    return true;
  };

  const handleNameChange = (e) => {
    const value = e.target.value;
    setName(value);
    if (value) validateName(value);
    else setNameError("");
  };

  const handleAddModel = (model) => {
    if (!models.includes(model.value)) {
      setModels([...models, model.value]);
    }
  };

  const handleDeselectModel = (model) => {
    setModels(models.filter((m) => m !== model.value));
  };

  const handleRemoveModel = (index) => {
    setModels(models.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index) => {
    if (index === 0) return;
    const newModels = [...models];
    [newModels[index - 1], newModels[index]] = [newModels[index], newModels[index - 1]];
    setModels(newModels);
  };

  const handleMoveDown = (index) => {
    if (index === models.length - 1) return;
    const newModels = [...models];
    [newModels[index], newModels[index + 1]] = [newModels[index + 1], newModels[index]];
    setModels(newModels);
  };

  const handleSave = async () => {
    if (!validateName(name)) return;
    setSaving(true);
    await onSave({ name: name.trim(), models });
    setSaving(false);
  };

  const isEdit = !!combo;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isEdit ? "Edit Combo" : "Create Combo"}
      >
        <div className="flex flex-col gap-3">
          {/* Name */}
          <div>
            <Input
              label="Combo Name"
              value={name}
              onChange={handleNameChange}
              placeholder="my-combo"
              error={nameError}
            />
            <p className="text-[10px] text-text-muted mt-0.5">
              Only letters, numbers, -, _ and . allowed
            </p>
          </div>

          {/* Models */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">Models</label>

            {models.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-black/10 dark:border-white/10 rounded-lg bg-black/[0.01] dark:bg-white/[0.01]">
                <span className="material-symbols-outlined text-text-muted text-xl mb-1">layers</span>
                <p className="text-xs text-text-muted">No models added yet</p>
              </div>
            ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis, restrictToParentElement]}>
              <SortableContext items={modelItems.map((m) => m.uid)} strategy={verticalListSortingStrategy}>
                <div className="flex max-h-[55vh] min-w-0 flex-col gap-1 overflow-y-auto sm:max-h-[350px]">
                  {modelItems.map(({ uid, model }, index) => (
                    <ModelItem
                      key={uid}
                      id={uid}
                      index={index}
                      model={model}
                      isFirst={index === 0}
                      isLast={index === modelItems.length - 1}
                      onEdit={(newVal) => {
                        const updated = [...models];
                        updated[index] = newVal;
                        setModels(updated);
                      }}
                      onMoveUp={() => handleMoveUp(index)}
                      onMoveDown={() => handleMoveDown(index)}
                      onRemove={() => handleRemoveModel(index)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            )}

            {/* Add Model button */}
            <button
              onClick={() => setShowModelSelect(true)}
              className="w-full mt-2 py-2 border border-dashed border-black/10 dark:border-white/10 rounded-lg text-xs text-primary font-medium hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add Model
            </button>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <Button onClick={onClose} variant="ghost" fullWidth size="sm">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              fullWidth
              size="sm"
              disabled={!name.trim() || !!nameError || saving}
            >
              {saving ? "Saving..." : isEdit ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Model Select Modal */}
      <ModelSelectModal
        isOpen={showModelSelect}
        onClose={() => setShowModelSelect(false)}
        onSelect={handleAddModel}
        onDeselect={handleDeselectModel}
        activeProviders={activeProviders}
        modelAliases={modelAliases}
        initialSearch={name.trim()}
        title="Add Model to Combo"
        kindFilter={kindFilter}
        addedModelValues={models}
        closeOnSelect={false}
      />
    </>
  );
}
