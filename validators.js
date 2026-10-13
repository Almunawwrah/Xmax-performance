// validation/validators.js — per-entity validation.
//
// Returns a { valid: bool, errors: [], warnings: [] } object.
// "errors" block save; "warnings" surface to the user but allow save.
//
// We avoid imposing arbitrary audio-engineering rules. Hard conflicts are
// only those that produce an ambiguous / unsaveable configuration; everything
// else is an advisory warning.

import { ENTITIES } from "../models/schema.js";
import { list } from "../storage/repo.js";

// Validate a single record against its entity field defs.
export function validateRecord(entityName, record) {
  const def = ENTITIES[entityName];
  const errors = [];
  const warnings = [];

  if (!def) return { valid: false, errors: ["Unknown entity"], warnings };

  for (const f of def.fields) {
    const val = record[f.name];

    // Required
    if (f.required && (val == null || val === "" || (typeof val === "string" && !val.trim()))) {
      errors.push(`${f.label} is required.`);
      continue;
    }

    // Skip further checks on empty optional fields
    if (val == null || val === "") continue;

    // Max length
    if (f.max && typeof val === "string" && val.length > f.max) {
      errors.push(`${f.label} exceeds ${f.max} characters.`);
    }
    // Number bounds
    if (f.type === "number") {
      const n = Number(val);
      if (isNaN(n)) errors.push(`${f.label} must be a number.`);
      else {
        if (f.min != null && n < f.min) errors.push(`${f.label} must be ≥ ${f.min}.`);
        if (f.max != null && n > f.max) errors.push(`${f.label} must be ≤ ${f.max}.`);
      }
    }
    // Date
    if (f.type === "date" && val) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val) || isNaN(new Date(val + "T00:00:00").getTime())) {
        errors.push(`${f.label} must be a valid date (YYYY-MM-DD).`);
      }
    }
  }

  // Entity-specific cross-field checks (no arbitrary audio rules)
  if (entityName === "event") {
    if (record.date && record.endDate) {
      if (record.endDate < record.date) {
        errors.push("End date cannot be before start date.");
      }
    }
  }
  if (entityName === "eventEquipment") {
    if (record.requiredQuantity < 0) errors.push("Required quantity must be ≥ 0.");
    if (record.preparedQuantity > record.requiredQuantity && record.requiredQuantity > 0) {
      warnings.push(`Prepared (${record.preparedQuantity}) exceeds required (${record.requiredQuantity}).`);
    }
    if (record.returnedQuantity > record.preparedQuantity) {
      warnings.push(`Returned (${record.returnedQuantity}) exceeds prepared (${record.preparedQuantity}).`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// Detect conflicting channel assignments within a workspace.
// A conflict is: two or more inputs share the same assignedChannelId AND
// that channel exists. Returns advisory warnings (not errors).
export function detectChannelAssignmentConflicts(inputs, channels) {
  const channelMap = new Map(channels.map(c => [c.id, c]));
  const byChannel = new Map();
  for (const inp of inputs) {
    if (!inp.assignedChannelId) continue;
    if (!channelMap.has(inp.assignedChannelId)) continue;
    if (!byChannel.has(inp.assignedChannelId)) byChannel.set(inp.assignedChannelId, []);
    byChannel.get(inp.assignedChannelId).push(inp);
  }
  const conflicts = [];
  for (const [channelId, list] of byChannel) {
    if (list.length > 1) {
      const ch = channelMap.get(channelId);
      conflicts.push({
        channelId,
        channelLabel: ch.label,
        channelNumber: ch.channelNumber,
        inputs: list.map(i => ({ id: i.id, sourceName: i.sourceName, inputNumber: i.inputNumber })),
      });
    }
  }
  return conflicts;
}

// Detect duplicate channel numbers within a workspace (hard error).
export function detectDuplicateChannelNumbers(channels) {
  const seen = new Map();
  const dups = [];
  for (const ch of channels) {
    if (seen.has(ch.channelNumber)) {
      dups.push({
        channelNumber: ch.channelNumber,
        ids: [seen.get(ch.channelNumber), ch.id],
      });
    } else {
      seen.set(ch.channelNumber, ch.id);
    }
  }
  return dups;
}

// Detect duplicate input numbers within a workspace (hard error).
export function detectDuplicateInputNumbers(inputs) {
  const seen = new Map();
  const dups = [];
  for (const inp of inputs) {
    if (seen.has(inp.inputNumber)) {
      dups.push({
        inputNumber: inp.inputNumber,
        ids: [seen.get(inp.inputNumber), inp.id],
      });
    } else {
      seen.set(inp.inputNumber, inp.id);
    }
  }
  return dups;
}

// Check equipment availability for an event allocation (advisory).
// Returns null if data insufficient, otherwise { required, available, shortage }.
export async function checkEquipmentAvailability(equipmentId, requiredQty) {
  if (!equipmentId || requiredQty == null) return null;
  const item = await list("equipment").then(items => items.find(e => e.id === equipmentId));
  if (!item) return null;
  const available = Math.max(0, (item.quantity || 0));
  return {
    required: requiredQty,
    available,
    shortage: Math.max(0, requiredQty - available),
    itemName: item.name,
  };
}
