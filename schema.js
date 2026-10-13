// models/schema.js — entity definitions, defaults, field metadata, relationships
//
// All entities use stable UUIDs. Cross-references are by ID, not display name.
// Cascade rules are encoded here so storage/repo.js can apply them consistently.

export const SCHEMA_VERSION = 2;

// Object stores in IndexedDB
export const STORES = [
  "events",
  "workspaces",
  "inputs",
  "channels",
  "outputs",
  "signalConnections",
  "equipment",
  "eventEquipment",
  "checklistTasks",
  "meta",
];

// Entity field definitions — used by forms, validators, and print views.
// type: "text" | "number" | "date" | "datetime" | "select" | "textarea" | "checkbox"
// options: for "select" — array of {value, label}
// label: short label
// help: optional hint
export const ENTITIES = {
  event: {
    store: "events",
    label: "Event",
    labelPlural: "Events",
    fields: [
      { name: "name", type: "text", label: "Event name", required: true, max: 120, help: "Internal name used throughout the app." },
      { name: "category", type: "select", label: "Category",
        options: [
          { value: "concert", label: "Concert" },
          { value: "festival", label: "Festival" },
          { value: "conference", label: "Conference" },
          { value: "corporate", label: "Corporate" },
          { value: "theater", label: "Theater / Performing arts" },
          { value: "worship", label: "Worship service" },
          { value: "broadcast", label: "Broadcast / Stream" },
          { value: "education", label: "Educational" },
          { value: "other", label: "Other" },
        ], required: false },
      { name: "date", type: "date", label: "Date", required: false },
      { name: "endDate", type: "date", label: "End date", help: "For multi-day events.", required: false },
      { name: "venue", type: "text", label: "Venue", max: 120, required: false },
      { name: "stage", type: "text", label: "Stage / Room", max: 80, required: false },
      { name: "operator", type: "text", label: "Responsible operator", max: 80, required: false },
      { name: "status", type: "select", label: "Preparation status",
        options: [
          { value: "preparing", label: "Preparing" },
          { value: "ready", label: "Ready" },
          { value: "live", label: "Live" },
          { value: "completed", label: "Completed" },
          { value: "archived", label: "Archived" },
        ], required: true, default: "preparing" },
      { name: "notes", type: "textarea", label: "Team notes", max: 2000, required: false },
    ],
    defaults: { status: "preparing" },
  },

  workspace: {
    store: "workspaces",
    label: "Audio Workspace",
    labelPlural: "Audio Workspaces",
    parent: "event", // workspace.eventId -> event.id
    cascadeFromParent: "delete", // deleting an event deletes its workspaces
    fields: [
      { name: "workspaceName", type: "text", label: "Workspace name", required: true, max: 120, help: "e.g. 'FOH', 'Monitors', 'Broadcast'." },
      { name: "mixerDescription", type: "text", label: "Mixer / console description", max: 120, required: false, help: "e.g. 'Allen & Heath dLive S5000 + DM0'." },
      { name: "channelCount", type: "number", label: "Channel count", min: 1, max: 96, default: 32, required: false, help: "Used to seed empty channel strips." },
      { name: "configurationNotes", type: "textarea", label: "Configuration notes", max: 4000, required: false },
    ],
    defaults: { channelCount: 32 },
  },

  input: {
    store: "inputs",
    label: "Input",
    labelPlural: "Inputs",
    parent: "workspace",
    cascadeFromParent: "delete",
    fields: [
      { name: "inputNumber", type: "number", label: "Input #", min: 1, max: 999, required: true, help: "Stage input number or label." },
      { name: "sourceName", type: "text", label: "Source name", required: true, max: 80, help: "e.g. 'Lead vocal', 'Kick drum'." },
      { name: "sourceType", type: "select", label: "Source category",
        options: [
          { value: "vocal", label: "Vocal mic" },
          { value: "instrument-acoustic", label: "Acoustic instrument" },
          { value: "instrument-electric", label: "Electric instrument" },
          { value: "keyboard", label: "Keyboard / synth" },
          { value: "playback", label: "Playback / computer" },
          { value: "drum", label: "Drum" },
          { value: "wireless", label: "Wireless mic" },
          { value: "other", label: "Other" },
        ], required: true, default: "vocal" },
      { name: "assignedTo", type: "text", label: "Assigned performer / device", max: 80, required: false },
      { name: "micOrDI", type: "text", label: "Microphone / DI box", max: 80, required: false, help: "e.g. 'Shure SM58', 'Radial JDI'." },
      { name: "connectionType", type: "select", label: "Connection type",
        options: [
          { value: "xlr", label: "XLR" },
          { value: "trss", label: "TRS (mono)" },
          { value: "trss-bal", label: "TRS (stereo/balanced)" },
          { value: "ts", label: "TS (instrument)" },
          { value: "rca", label: "RCA" },
          { value: "digital", label: "Digital (AES/USB/Dante)" },
          { value: "other", label: "Other" },
        ], required: false, default: "xlr" },
      { name: "phantomPower", type: "checkbox", label: "Phantom power (48V) required", required: false },
      { name: "assignedChannelId", type: "text", label: "Assigned mixer channel", required: false, help: "Soft-link to a MixerChannel by ID." },
      { name: "stagePosition", type: "text", label: "Stage location", max: 80, required: false, help: "e.g. 'Stage left, vocal position 2'." },
      { name: "monitorNeeds", type: "text", label: "Monitor / mix needs", max: 200, required: false, help: "e.g. 'IEM mix 1 + wedge 2'." },
      { name: "muteNotes", type: "text", label: "Mute / special handling", max: 200, required: false },
      { name: "checkStatus", type: "select", label: "Soundcheck status",
        options: [
          { value: "pending", label: "Pending" },
          { value: "patched", label: "Patched" },
          { value: "checked", label: "Checked" },
          { value: "problem", label: "Problem" },
        ], required: true, default: "pending" },
      { name: "notes", type: "textarea", label: "Notes", max: 2000, required: false },
    ],
    defaults: { checkStatus: "pending", phantomPower: false, sourceType: "vocal", connectionType: "xlr" },
  },

  channel: {
    store: "channels",
    label: "Mixer Channel",
    labelPlural: "Mixer Channels",
    parent: "workspace",
    cascadeFromParent: "delete",
    fields: [
      { name: "channelNumber", type: "number", label: "Channel #", min: 1, max: 999, required: true },
      { name: "label", type: "text", label: "Label", required: true, max: 40, help: "Short label shown on the strip." },
      { name: "inputId", type: "text", label: "Input source", required: false, help: "Linked Input by ID." },
      { name: "inputConnection", type: "text", label: "Input connection", max: 80, required: false },
      { name: "gainNotes", type: "text", label: "Gain notes", max: 200, required: false, help: "Documented notes — not live measurements." },
      { name: "phantomPower", type: "select", label: "Phantom power",
        options: [
          { value: "off", label: "Off" },
          { value: "on", label: "On (48V)" },
          { value: "n/a", label: "N/A" },
        ], required: false, default: "off" },
      { name: "highpassFilter", type: "select", label: "High-pass filter",
        options: [
          { value: "off", label: "Off" },
          { value: "on", label: "On" },
          { value: "n/a", label: "N/A" },
        ], required: false, default: "off" },
      { name: "eqNotes", type: "textarea", label: "EQ notes", max: 1000, required: false },
      { name: "dynamicsNotes", type: "textarea", label: "Dynamics notes", max: 1000, required: false, help: "Compressor, gate, etc." },
      { name: "pan", type: "text", label: "Pan", max: 20, required: false, help: "e.g. 'L', 'C', 'R', 'L30'." },
      { name: "busAssignments", type: "text", label: "Bus / output assignments", max: 200, required: false, help: "Comma-separated, e.g. 'LR, Mono, Aux 1'." },
      { name: "monitorNotes", type: "text", label: "Monitor-send notes", max: 200, required: false },
      { name: "muteGroup", type: "text", label: "Mute group", max: 40, required: false },
      { name: "checkStatus", type: "select", label: "Soundcheck status",
        options: [
          { value: "pending", label: "Pending" },
          { value: "patched", label: "Patched" },
          { value: "checked", label: "Checked" },
          { value: "problem", label: "Problem" },
        ], required: true, default: "pending" },
    ],
    defaults: { checkStatus: "pending", phantomPower: "off", highpassFilter: "off" },
  },

  output: {
    store: "outputs",
    label: "Output",
    labelPlural: "Outputs",
    parent: "workspace",
    cascadeFromParent: "delete",
    fields: [
      { name: "name", type: "text", label: "Output name", required: true, max: 60 },
      { name: "outputType", type: "select", label: "Output type",
        options: [
          { value: "main-lr", label: "Main L/R (PA)" },
          { value: "sub", label: "Subwoofer feed" },
          { value: "monitor", label: "Stage monitor" },
          { value: "iem", label: "In-ear monitor feed" },
          { value: "front-fill", label: "Front fill" },
          { value: "recording", label: "Recording output" },
          { value: "stream", label: "Stream / broadcast" },
          { value: "aux", label: "Auxiliary / custom" },
        ], required: true, default: "main-lr" },
      { name: "sourceBus", type: "text", label: "Source bus / signal", max: 80, required: false, help: "e.g. 'Main LR', 'Mix 3', 'Matrix 1'." },
      { name: "destination", type: "text", label: "Destination", max: 120, required: false, help: "e.g. 'L-Acoustics K2 L/R', 'Drum wedge DSR112'." },
      { name: "connector", type: "text", label: "Connector / interface", max: 80, required: false, help: "e.g. 'XLR', 'AES50', 'Dante output'." },
      { name: "equipment", type: "text", label: "Associated equipment", max: 200, required: false },
      { name: "connectionStatus", type: "select", label: "Connection check status",
        options: [
          { value: "planned", label: "Planned" },
          { value: "unchecked", label: "Not yet checked" },
          { value: "confirmed", label: "Confirmed" },
          { value: "problem", label: "Problem" },
        ], required: true, default: "planned" },
      { name: "notes", type: "textarea", label: "Notes", max: 2000, required: false },
    ],
    defaults: { connectionStatus: "planned", outputType: "main-lr" },
  },

  signalConnection: {
    store: "signalConnections",
    label: "Signal Connection",
    labelPlural: "Signal Connections",
    parent: "workspace",
    cascadeFromParent: "delete",
    fields: [
      { name: "sourceLabel", type: "text", label: "Source", required: true, max: 80, help: "Free-text label, e.g. 'Vocal mic 1'." },
      { name: "sourceType", type: "select", label: "Source type",
        options: [
          { value: "mic", label: "Microphone" },
          { value: "di", label: "DI box" },
          { value: "instrument", label: "Instrument" },
          { value: "playback", label: "Playback" },
          { value: "mixer-out", label: "Mixer output" },
          { value: "stage-input", label: "Stage input" },
          { value: "other", label: "Other" },
        ], required: false, default: "mic" },
      { name: "viaLabel", type: "text", label: "Via (optional)", max: 80, required: false, help: "Intermediate node, e.g. 'Stage input 12', 'Sub-snake A'." },
      { name: "viaType", type: "select", label: "Via type",
        options: [
          { value: "stage-input", label: "Stage input" },
          { value: "snake", label: "Snake / splitter" },
          { value: "di", label: "DI box" },
          { value: "preamp", label: "Preamp" },
          { value: "other", label: "Other" },
        ], required: false },
      { name: "destinationLabel", type: "text", label: "Destination", required: true, max: 80, help: "e.g. 'Channel 1', 'Main LR', 'Wedge 2'." },
      { name: "destinationType", type: "select", label: "Destination type",
        options: [
          { value: "channel", label: "Mixer channel" },
          { value: "bus", label: "Bus / matrix" },
          { value: "output", label: "Output" },
          { value: "monitor", label: "Monitor / IEM" },
          { value: "pa", label: "PA speaker" },
          { value: "other", label: "Other" },
        ], required: false, default: "channel" },
      { name: "connectionType", type: "select", label: "Connection type",
        options: [
          { value: "xlr", label: "XLR" },
          { value: "trss", label: "TRS" },
          { value: "ts", label: "TS" },
          { value: "digital", label: "Digital" },
          { value: "other", label: "Other" },
        ], required: false, default: "xlr" },
      { name: "verificationStatus", type: "select", label: "Verification status",
        options: [
          { value: "planned", label: "Planned" },
          { value: "unchecked", label: "Not yet checked" },
          { value: "confirmed", label: "Confirmed" },
          { value: "problem", label: "Problem" },
        ], required: true, default: "planned" },
      { name: "notes", type: "textarea", label: "Notes", max: 2000, required: false },
    ],
    defaults: { verificationStatus: "planned", connectionType: "xlr", sourceType: "mic", destinationType: "channel" },
  },

  equipment: {
    store: "equipment",
    label: "Equipment item",
    labelPlural: "Equipment inventory",
    fields: [
      { name: "name", type: "text", label: "Name", required: true, max: 80 },
      { name: "category", type: "select", label: "Category",
        options: [
          { value: "microphone", label: "Microphone" },
          { value: "di", label: "DI box" },
          { value: "mixer", label: "Mixer / console" },
          { value: "amplifier", label: "Amplifier" },
          { value: "speaker", label: "Speaker" },
          { value: "iem", label: "In-ear system" },
          { value: "wireless", label: "Wireless system" },
          { value: "processor", label: "DSP / processor" },
          { value: "cable", label: "Cable" },
          { value: "stand", label: "Stand" },
          { value: "adapter", label: "Adapter" },
          { value: "power", label: "Power accessory" },
          { value: "other", label: "Other" },
        ], required: true, default: "microphone" },
      { name: "model", type: "text", label: "Manufacturer / model", max: 120, required: false },
      { name: "quantity", type: "number", label: "Quantity owned", min: 0, max: 9999, default: 1, required: true },
      { name: "condition", type: "select", label: "Condition",
        options: [
          { value: "good", label: "Good" },
          { value: "fair", label: "Fair" },
          { value: "needs-repair", label: "Needs repair" },
          { value: "retired", label: "Retired" },
        ], required: false, default: "good" },
      { name: "storageLocation", type: "text", label: "Storage location", max: 80, required: false },
      { name: "code", type: "text", label: "Identification code", max: 40, required: false, help: "Asset tag or ID code." },
      { name: "maintenanceNotes", type: "textarea", label: "Maintenance notes", max: 2000, required: false },
    ],
    defaults: { category: "microphone", quantity: 1, condition: "good" },
  },

  eventEquipment: {
    store: "eventEquipment",
    label: "Event equipment allocation",
    labelPlural: "Event equipment allocations",
    parent: "event",
    cascadeFromParent: "delete",
    fields: [
      { name: "equipmentId", type: "text", label: "Equipment item", required: true, help: "Equipment ID." },
      { name: "requiredQuantity", type: "number", label: "Required", min: 0, max: 9999, default: 1, required: true },
      { name: "preparedQuantity", type: "number", label: "Prepared", min: 0, max: 9999, default: 0, required: true },
      { name: "returnedQuantity", type: "number", label: "Returned", min: 0, max: 9999, default: 0, required: false },
      { name: "assignment", type: "text", label: "Assignment / location", max: 120, required: false },
      { name: "status", type: "select", label: "Status",
        options: [
          { value: "needed", label: "Needed" },
          { value: "preparing", label: "Preparing" },
          { value: "ready", label: "Ready" },
          { value: "in-use", label: "In use" },
          { value: "returned", label: "Returned" },
          { value: "problem", label: "Problem" },
        ], required: true, default: "needed" },
      { name: "notes", type: "text", label: "Notes", max: 500, required: false },
    ],
    defaults: { requiredQuantity: 1, preparedQuantity: 0, returnedQuantity: 0, status: "needed" },
  },

  checklistTask: {
    store: "checklistTasks",
    label: "Checklist task",
    labelPlural: "Checklist tasks",
    parent: "event",
    cascadeFromParent: "delete",
    fields: [
      { name: "title", type: "text", label: "Title", required: true, max: 120 },
      { name: "category", type: "select", label: "Category",
        options: [
          { value: "equipment-prep", label: "1. Equipment preparation" },
          { value: "stage-mic", label: "2. Stage & microphone setup" },
          { value: "signal-connections", label: "3. Signal connections" },
          { value: "mixer-config", label: "4. Mixer configuration" },
          { value: "output-monitor", label: "5. Output & monitor verification" },
          { value: "soundcheck", label: "6. Source-by-source soundcheck" },
          { value: "final-review", label: "7. Final readiness review" },
          { value: "teardown", label: "8. Teardown & return" },
        ], required: true, default: "equipment-prep" },
      { name: "completed", type: "checkbox", label: "Completed", required: false, default: false },
      { name: "assignedTo", type: "text", label: "Responsible person", max: 80, required: false },
      { name: "notes", type: "textarea", label: "Notes", max: 1000, required: false },
      { name: "completedAt", type: "datetime", label: "Completed at", required: false, readonly: true },
    ],
    defaults: { completed: false, category: "equipment-prep" },
  },
};

// Map entity -> store name (and vice versa)
export const ENTITY_BY_STORE = Object.fromEntries(
  Object.entries(ENTITIES).map(([k, v]) => [v.store, k])
);

// Default checklist seed template — applied to new events
export const DEFAULT_CHECKLIST = [
  ["equipment-prep", "Inventory and pull all required equipment"],
  ["equipment-prep", "Test microphones, DI boxes, and cables"],
  ["equipment-prep", "Charge / verify wireless batteries and IEM packs"],
  ["stage-mic", "Mark stage positions with tape"],
  ["stage-mic", "Place microphones, stands, and DI boxes"],
  ["stage-mic", "Secure cables and label stage drops"],
  ["signal-connections", "Patch all stage inputs to snake / stagebox"],
  ["signal-connections", "Verify continuity on each line"],
  ["mixer-config", "Load / create show file"],
  ["mixer-config", "Apply channel labels and color coding"],
  ["mixer-config", "Set initial gain structure"],
  ["output-monitor", "Verify PA outputs and zones"],
  ["output-monitor", "Verify monitor wedges and IEM feeds"],
  ["output-monitor", "Test talkback and comms"],
  ["soundcheck", "Line check — confirm signal on every channel"],
  ["soundcheck", "Soundcheck each source with performer"],
  ["soundcheck", "Set monitor mixes with performers"],
  ["final-review", "Walk the room and check coverage"],
  ["final-review", "Brief operators on critical cues and mutes"],
  ["final-review", "Save final show file and backup"],
  ["teardown", "Power down mixer and stage equipment in order"],
  ["teardown", "Strike cables, stands, and accessories"],
  ["teardown", "Inventory returned equipment against allocation"],
];

// Build a default entity record (with defaults + UUID + timestamps)
export function defaultRecord(entityName, overrides = {}) {
  const def = ENTITIES[entityName];
  if (!def) throw new Error(`Unknown entity: ${entityName}`);
  const record = { id: overrides.id || null };
  for (const f of def.fields) {
    if (f.default !== undefined) record[f.name] = f.default;
    else if (f.type === "checkbox") record[f.name] = false;
    else if (f.type === "number") record[f.name] = 0;
    else record[f.name] = "";
  }
  return { ...record, ...overrides };
}

// Field option labels
export function optionLabel(entityName, fieldName, value) {
  const def = ENTITIES[entityName];
  if (!def) return value;
  const f = def.fields.find(x => x.name === fieldName);
  if (!f || !f.options) return value;
  const opt = f.options.find(o => o.value === value);
  return opt ? opt.label : (value || "—");
}

export function fieldDef(entityName, fieldName) {
  const def = ENTITIES[entityName];
  return def?.fields.find(f => f.name === fieldName);
}
