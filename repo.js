// storage/repo.js — generic repository per entity.
// Wraps db.raw, applies cascade rules, and provides typed lookups.
//
// All public methods are async. Errors propagate (caller surfaces them via toast).

import { raw } from "./db.js";
import { ENTITIES, ENTITY_BY_STORE } from "../models/schema.js";
import { uuid } from "../utils/id.js";

// === Generic CRUD ===

export async function list(entityName, filterFn) {
  const def = ENTITIES[entityName];
  const all = await raw.all(def.store);
  return filterFn ? all.filter(filterFn) : all;
}

export async function get(entityName, id) {
  const def = ENTITIES[entityName];
  if (!id) return null;
  return raw.get(def.store, id);
}

export async function create(entityName, data) {
  const def = ENTITIES[entityName];
  const now = Date.now();
  const record = {
    ...defaultValues(def),
    id: uuid(),
    createdAt: now,
    updatedAt: now,
    ...sanitize(data, def),
  };
  // Preserve parent FK field (e.g. eventId, workspaceId) — these are not in `fields`
  if (def.parent) {
    const fkField = `${def.parent}Id`;
    if (data && data[fkField] != null) record[fkField] = data[fkField];
  }
  await raw.put(def.store, record);
  return record;
}

export async function update(entityName, id, patch) {
  const def = ENTITIES[entityName];
  const existing = await raw.get(def.store, id);
  if (!existing) throw new Error(`${def.label} not found.`);
  const record = {
    ...existing,
    ...sanitize(patch, def),
    id, // preserve
    createdAt: existing.createdAt, // preserve
    updatedAt: Date.now(),
  };
  // Preserve parent FK on update too
  if (def.parent) {
    const fkField = `${def.parent}Id`;
    if (patch && patch[fkField] != null) record[fkField] = patch[fkField];
    else if (existing[fkField] != null) record[fkField] = existing[fkField];
  }
  await raw.put(def.store, record);
  return record;
}

export async function remove(entityName, id) {
  const def = ENTITIES[entityName];
  // Cascade: delete child records where child.parent === entityName
  await cascadeDeleteChildren(entityName, id);
  // Special-case: deleting a Workspace also clears links (inputId) on channels
  // of that workspace (already done by cascade), and deleting an Input nulls
  // the assignedChannelId on... actually we keep the channel — we null inputId
  // on channels pointing at this input.
  if (entityName === "input") {
    await nullChannelLinksForInput(id);
  }
  if (entityName === "channel") {
    await nullInputLinksForChannel(id);
  }
  return raw.delete(def.store, id);
}

function defaultValues(def) {
  const v = {};
  for (const f of def.fields) {
    if (f.default !== undefined) v[f.name] = f.default;
    else if (f.type === "checkbox") v[f.name] = false;
    else if (f.type === "number") v[f.name] = 0;
    else v[f.name] = "";
  }
  return v;
}

function sanitize(data, def) {
  if (!data) return {};
  const out = {};
  for (const f of def.fields) {
    if (!(f.name in data)) continue;
    let val = data[f.name];
    if (f.type === "number") {
      val = val === "" || val == null ? 0 : Number(val);
      if (isNaN(val)) val = 0;
    } else if (f.type === "checkbox") {
      val = Boolean(val);
    } else if (typeof val === "string") {
      val = val;
    }
    out[f.name] = val;
  }
  return out;
}

async function cascadeDeleteChildren(parentEntity, parentId) {
  // Find children where ENTITIES[child].parent === parentEntity
  for (const [childName, childDef] of Object.entries(ENTITIES)) {
    if (childDef.parent === parentEntity) {
      // Determine the foreign-key field on the child
      const fkField = `${parentEntity}Id`;
      const children = await raw.all(childDef.store);
      const toDelete = children.filter(c => c[fkField] === parentId);
      for (const child of toDelete) {
        // Recursive: delete child's children first
        await cascadeDeleteChildren(childName, child.id);
        await raw.delete(childDef.store, child.id);
      }
    }
  }
}

// Special-case: when an Input is deleted, set channel.inputId = null on any
// channels pointing at it (don't delete the channel).
async function nullChannelLinksForInput(inputId) {
  const channels = await raw.all(ENTITIES.channel.store);
  for (const ch of channels) {
    if (ch.inputId === inputId) {
      await raw.put(ENTITIES.channel.store, { ...ch, inputId: null, updatedAt: Date.now() });
    }
  }
}

// Special-case: when a Channel is deleted, clear assignedChannelId on the
// Input that pointed at it.
async function nullInputLinksForChannel(channelId) {
  const inputs = await raw.all(ENTITIES.input.store);
  for (const inp of inputs) {
    if (inp.assignedChannelId === channelId) {
      await raw.put(ENTITIES.input.store, { ...inp, assignedChannelId: null, updatedAt: Date.now() });
    }
  }
}

// === Lookup helpers ===

export async function listByParent(entityName, parentEntity, parentId) {
  const def = ENTITIES[entityName];
  if (def.parent !== parentEntity) {
    throw new Error(`${def.label} is not a child of ${parentEntity}`);
  }
  const fkField = `${parentEntity}Id`;
  const all = await raw.all(def.store);
  return all.filter(r => r[fkField] === parentId);
}

export async function getWorkspaceForEvent(eventId) {
  return listByParent("workspace", "event", eventId);
}

export async function getInputsForWorkspace(workspaceId) {
  return listByParent("input", "workspace", workspaceId);
}

export async function getChannelsForWorkspace(workspaceId) {
  return listByParent("channel", "workspace", workspaceId);
}

export async function getOutputsForWorkspace(workspaceId) {
  return listByParent("output", "workspace", workspaceId);
}

export async function getSignalForWorkspace(workspaceId) {
  return listByParent("signalConnection", "workspace", workspaceId);
}

export async function getAllocationsForEvent(eventId) {
  return listByParent("eventEquipment", "event", eventId);
}

export async function getChecklistForEvent(eventId) {
  return listByParent("checklistTask", "event", eventId);
}

export async function getEvents() {
  return raw.all(ENTITIES.event.store);
}

export async function getEquipment() {
  return raw.all(ENTITIES.equipment.store);
}

// === Bulk / import / duplicate helpers ===

// Duplicate an event — including its workspace, inputs, channels, outputs,
// signal connections, equipment allocations, and checklist tasks.
// The new event gets a new ID and a "(copy)" suffix in its name.
export async function duplicateEvent(eventId, overrides = {}) {
  const src = await get("event", eventId);
  if (!src) throw new Error("Source event not found.");

  const newEvent = await create("event", {
    ...src,
    name: overrides.name || `${src.name} (copy)`,
    status: "preparing",
    ...overrides,
  });

  // Workspaces + descendants
  const workspaces = await getWorkspaceForEvent(eventId);
  for (const ws of workspaces) {
    const newWs = await create("workspace", {
      ...ws,
      eventId: newEvent.id,
    });
    // Inputs
    const inputs = await getInputsForWorkspace(ws.id);
    const inputIdMap = new Map();
    for (const inp of inputs) {
      const newInp = await create("input", { ...inp, workspaceId: newWs.id });
      inputIdMap.set(inp.id, newInp.id);
    }
    // Channels (remap inputId via inputIdMap)
    const channels = await getChannelsForWorkspace(ws.id);
    const channelIdMap = new Map();
    for (const ch of channels) {
      const newInputId = ch.inputId ? (inputIdMap.get(ch.inputId) || null) : null;
      const newCh = await create("channel", { ...ch, workspaceId: newWs.id, inputId: newInputId });
      channelIdMap.set(ch.id, newCh.id);
    }
    // Update input.assignedChannelId to new channel IDs
    for (const inp of inputs) {
      if (inp.assignedChannelId) {
        const newChId = channelIdMap.get(inp.assignedChannelId);
        if (newChId) {
          const newInpId = inputIdMap.get(inp.id);
          if (newInpId) await update("input", newInpId, { assignedChannelId: newChId });
        }
      }
    }
    // Outputs
    const outputs = await getOutputsForWorkspace(ws.id);
    for (const o of outputs) {
      await create("output", { ...o, workspaceId: newWs.id });
    }
    // Signal connections
    const conns = await getSignalForWorkspace(ws.id);
    for (const c of conns) {
      await create("signalConnection", { ...c, workspaceId: newWs.id });
    }
  }

  // Equipment allocations
  const allocs = await getAllocationsForEvent(eventId);
  for (const a of allocs) {
    await create("eventEquipment", { ...a, eventId: newEvent.id, preparedQuantity: 0, returnedQuantity: 0, status: "needed" });
  }

  // Checklist
  const tasks = await getChecklistForEvent(eventId);
  for (const t of tasks) {
    await create("checklistTask", { ...t, eventId: newEvent.id, completed: false, completedAt: null });
  }

  return newEvent;
}

// Seed a default checklist on a new event
export async function seedDefaultChecklist(eventId) {
  const { DEFAULT_CHECKLIST } = await import("../models/schema.js");
  for (const [category, title] of DEFAULT_CHECKLIST) {
    await create("checklistTask", { eventId, title, category });
  }
}

// Seed an empty channel strip set for a new workspace (if requested)
export async function seedChannels(workspaceId, count) {
  for (let i = 1; i <= count; i++) {
    await create("channel", {
      workspaceId,
      channelNumber: i,
      label: `CH ${i}`,
    });
  }
}
