// app.js — bootstrap. Builds the app shell, registers routes, seeds first-run data.

import { h, mount, icon } from "./utils/dom.js";
import { startRouter, registerRoute, navigate } from "./router.js";
import { openDB, raw, dropDB } from "./storage/db.js";
import { list, create, getEvents, getChecklistForEvent, getWorkspaceForEvent } from "./storage/repo.js";
import { uuid } from "./utils/id.js";
import { todayISO, daysFromToday, formatDate } from "./utils/date.js";

import * as Dashboard from "./views/dashboard.js";
import * as Events from "./views/events.js";
import * as Inputs from "./views/inputs.js";
import * as Channels from "./views/channels.js";
import * as SignalFlow from "./views/signalflow.js";
import * as Outputs from "./views/outputs.js";
import * as Equipment from "./views/equipment.js";
import * as Checklist from "./views/checklist.js";
import * as LiveMode from "./views/livemode.js";
import * as Documents from "./views/documents.js";
import * as Settings from "./views/settings.js";

// Active event context (cached; updated by events.js / workspace.js)
let _activeEventId = null;

export function getActiveEventId() { return _activeEventId; }
export function setActiveEventId(id) { _activeEventId = id; }

async function init() {
  // Open DB; if first run (no events), seed a demo event so the app isn't empty.
  await openDB();
  const events = await getEvents();
  if (events.length === 0) {
    await seedDemoEvent();
  }

  const shell = buildShell();
  document.getElementById("app").appendChild(shell);
  registerRoutes();
  startRouter(shell);
  await refreshNavBadges();
}

function buildShell() {
  const nav = h("nav.app-nav",
    { "aria-label": "Primary" },
    h("div.nav-section-label", "Main"),
    navItem("/", "dashboard", "Dashboard"),
    navItem("/events", "events", "Events"),
    navItem("/equipment", "equipment", "Equipment"),
    navItem("/checklists", "checklist", "Checklists"),
    navItem("/documents", "documents", "Documents"),
    h("div.nav-spacer"),
    h("div.nav-section-label", "System"),
    navItem("/settings", "settings", "Settings"),
  );

  const header = h("header.app-header",
    h("div.app-header-context",
      h("div.ctx-event#ctx-event", "No active event"),
    ),
    h("div.app-header-actions",
      h("button.btn.btn-ghost.btn-icon.btn-sm",
        { type: "button", "aria-label": "Print current view", onclick: () => window.print() },
        icon("print", 14),
      ),
    ),
  );

  const logo = h("div.app-logo",
    h("span.logo-mark", "X"),
    h("span", "XMAX", h("span.dim", " · Performance")),
  );

  const main = h("main.app-main", { "aria-label": "Main content", role: "main" });

  return h("div.app-shell", logo, header, nav, main);
}

function navItem(hash, iconName, label) {
  return h("a.nav-item",
    { href: "#" + hash, "data-route": hash, onclick: (e) => { e.preventDefault(); navigate(hash); } },
    h("span.nav-icon", icon(iconName, 16)),
    h("span", label),
    h(`span.nav-badge.hidden#nav-badge-${iconName.replace(/[^a-z0-9]/gi, "")}`),
  );
}

export async function refreshNavBadges() {
  // Show counts only when meaningful
  const events = await getEvents();
  const activeEvents = events.filter(e => e.status !== "archived");
  const upcoming = activeEvents.filter(e => {
    const d = daysFromToday(e.date);
    return d !== null && d >= 0 && d <= 7;
  });
  setBadge("events", activeEvents.length);

  // Pending checklist tasks across all events
  let pending = 0;
  for (const e of activeEvents) {
    const tasks = await getChecklistForEvent(e.id);
    pending += tasks.filter(t => !t.completed).length;
  }
  setBadge("checklist", pending);

  // Equipment count
  const eq = await list("equipment");
  setBadge("equipment", eq.length);
}

function setBadge(name, count) {
  const el = document.getElementById(`nav-badge-${name}`);
  if (!el) return;
  if (count > 0) {
    el.classList.remove("hidden");
    el.textContent = count > 99 ? "99+" : String(count);
  } else {
    el.classList.add("hidden");
  }
}

export async function refreshActiveContext() {
  const ctxEl = document.getElementById("ctx-event");
  if (!ctxEl) return;
  if (!_activeEventId) {
    ctxEl.innerHTML = "";
    ctxEl.appendChild(h("span.dim", "No active event"));
    return;
  }
  const ev = await import("./storage/repo.js").then(m => m.get("event", _activeEventId));
  if (!ev) {
    _activeEventId = null;
    ctxEl.innerHTML = "";
    ctxEl.appendChild(h("span.dim", "No active event"));
    return;
  }
  ctxEl.innerHTML = "";
  ctxEl.appendChild(h("span", "Active: "));
  ctxEl.appendChild(h("strong", ev.name));
  ctxEl.appendChild(h("span.dim", ` · ${formatDate(ev.date) || "No date"}`));
  // Make clickable
  ctxEl.style.cursor = "pointer";
  ctxEl.onclick = () => navigate(`/events/${ev.id}`);
}

function registerRoutes() {
  registerRoute("/", (ctx) => Dashboard.render(ctx));
  registerRoute("/events", (ctx) => Events.renderList(ctx));
  registerRoute("/events/:id", (ctx) => Events.renderDetail(ctx));
  registerRoute("/events/:id/workspace/:wid/inputs", (ctx) => Inputs.render(ctx));
  registerRoute("/events/:id/workspace/:wid/channels", (ctx) => Channels.render(ctx));
  registerRoute("/events/:id/workspace/:wid/signal", (ctx) => SignalFlow.render(ctx));
  registerRoute("/events/:id/workspace/:wid/outputs", (ctx) => Outputs.render(ctx));
  registerRoute("/events/:id/equipment", (ctx) => Equipment.renderEvent(ctx));
  registerRoute("/events/:id/checklist", (ctx) => Checklist.render(ctx));
  registerRoute("/events/:id/live", (ctx) => LiveMode.render(ctx));
  registerRoute("/events/:id/documents", (ctx) => Documents.render(ctx));
  registerRoute("/equipment", (ctx) => Equipment.renderInventory(ctx));
  registerRoute("/checklists", (ctx) => Checklist.renderOverview(ctx));
  registerRoute("/documents", (ctx) => Documents.renderIndex(ctx));
  registerRoute("/settings", (ctx) => Settings.render(ctx));
}

// === Seed (demo) data — explicitly flagged; resettable without destroying user data ===
async function seedDemoEvent() {
  const ev = await create("event", {
    name: "Demo — Riverside Live Showcase",
    category: "concert",
    date: todayISO(),
    venue: "Riverside Hall, Jakarta",
    stage: "Main Stage",
    operator: "Demo Operator",
    status: "preparing",
    notes: "This is a sample event demonstrating XMAX Performance. Delete it from the Events page when you're ready to start your own.",
  });

  // Workspace
  const ws = await create("workspace", {
    eventId: ev.id,
    workspaceName: "FOH",
    mixerDescription: "Demo console — 32 channels",
    channelCount: 16,
    configurationNotes: "Sample workspace. Edit or replace this to match your actual setup.",
  });

  // Seed 16 empty channels
  for (let i = 1; i <= 16; i++) {
    await create("channel", {
      workspaceId: ws.id,
      channelNumber: i,
      label: `CH ${i}`,
    });
  }

  // Seed a handful of inputs with channel assignments
  const vocalMic = await create("input", {
    workspaceId: ws.id, inputNumber: 1, sourceName: "Lead vocal", sourceType: "vocal",
    assignedTo: "Vocalist", micOrDI: "Shure SM58", connectionType: "xlr",
    phantomPower: false, stagePosition: "Center stage, downstage", monitorNeeds: "Wedge 1 + IEM",
    checkStatus: "pending", notes: "",
  });
  const kickMic = await create("input", {
    workspaceId: ws.id, inputNumber: 2, sourceName: "Kick drum", sourceType: "drum",
    assignedTo: "Drum kit", micOrDI: "Beta 91A + D6", connectionType: "xlr",
    phantomPower: false, stagePosition: "Drum riser, kick", monitorNeeds: "Drum IEM mix",
    checkStatus: "pending", notes: "",
  });
  const bassDI = await create("input", {
    workspaceId: ws.id, inputNumber: 3, sourceName: "Bass (DI)", sourceType: "instrument-electric",
    assignedTo: "Bassist", micOrDI: "Radial JDI", connectionType: "xlr",
    phantomPower: false, stagePosition: "Stage right, bass position", monitorNeeds: "Wedge 2",
    checkStatus: "pending", notes: "",
  });

  // Assign inputs 1/2/3 to channels 1/2/3 (via assignedChannelId)
  const channels = await import("./storage/repo.js").then(m => m.getChannelsForWorkspace(ws.id));
  const ch1 = channels.find(c => c.channelNumber === 1);
  const ch2 = channels.find(c => c.channelNumber === 2);
  const ch3 = channels.find(c => c.channelNumber === 3);

  if (ch1) {
    await import("./storage/repo.js").then(m => m.update("input", vocalMic.id, { assignedChannelId: ch1.id }));
    await import("./storage/repo.js").then(m => m.update("channel", ch1.id, {
      inputId: vocalMic.id, label: "Lead Vocal",
      gainNotes: "Trim to -18 dBFS peaks",
      highpassFilter: "on", pan: "C", busAssignments: "LR, Aux 1, Aux 3",
      monitorNotes: "Wedge 1 + IEM mix 1", muteGroup: "Vocals",
    }));
  }
  if (ch2) {
    await import("./storage/repo.js").then(m => m.update("input", kickMic.id, { assignedChannelId: ch2.id }));
    await import("./storage/repo.js").then(m => m.update("channel", ch2.id, {
      inputId: kickMic.id, label: "Kick",
      gainNotes: "Trim carefully — high SPL",
      highpassFilter: "off", pan: "C", busAssignments: "LR, Drum mix",
      muteGroup: "Drums",
    }));
  }
  if (ch3) {
    await import("./storage/repo.js").then(m => m.update("input", bassDI.id, { assignedChannelId: ch3.id }));
    await import("./storage/repo.js").then(m => m.update("channel", ch3.id, {
      inputId: bassDI.id, label: "Bass DI",
      highpassFilter: "on", pan: "C", busAssignments: "LR, Aux 2",
      muteGroup: "Band",
    }));
  }

  // Outputs
  await create("output", {
    workspaceId: ws.id, name: "Main L/R", outputType: "main-lr",
    sourceBus: "Main LR", destination: "PA L/R — K2 array",
    connector: "XLR from console",
    connectionStatus: "planned",
    notes: "Rigging verified by venue.",
  });
  await create("output", {
    workspaceId: ws.id, name: "Sub feed", outputType: "sub",
    sourceBus: "Matrix 2 (LR + Aux)", destination: "KS28 sub array",
    connector: "XLR",
    connectionStatus: "planned",
  });
  await create("output", {
    workspaceId: ws.id, name: "Drum wedge", outputType: "monitor",
    sourceBus: "Mix 4", destination: "DSR112 — drum riser",
    connector: "XLR",
    connectionStatus: "unchecked",
  });

  // Signal flow sample
  await create("signalConnection", {
    workspaceId: ws.id,
    sourceLabel: "Vocal mic 1", sourceType: "mic",
    viaLabel: "Stage input 1", viaType: "stage-input",
    destinationLabel: "Channel 1", destinationType: "channel",
    connectionType: "xlr", verificationStatus: "planned",
    notes: "",
  });
  await create("signalConnection", {
    workspaceId: ws.id,
    sourceLabel: "Kick mic", sourceType: "mic",
    viaLabel: "Stage input 2", viaType: "stage-input",
    destinationLabel: "Channel 2", destinationType: "channel",
    connectionType: "xlr", verificationStatus: "planned",
  });

  // Equipment inventory
  const sm58 = await create("equipment", {
    name: "Shure SM58", category: "microphone", model: "Shure SM58",
    quantity: 8, condition: "good", storageLocation: "Mic cabinet A",
    code: "MIC-SM58-01",
  });
  const d6 = await create("equipment", {
    name: "Audix D6", category: "microphone", model: "Audix D6",
    quantity: 2, condition: "good", storageLocation: "Mic cabinet B",
    code: "MIC-D6-01",
  });
  await create("equipment", {
    name: "Radial JDI", category: "di", model: "Radial JDI stereo",
    quantity: 4, condition: "good", storageLocation: "DI drawer 1",
    code: "DI-JDI-01",
  });
  await create("equipment", {
    name: "XLR cable 10m", category: "cable", model: "Neutik connectors",
    quantity: 24, condition: "good", storageLocation: "Cable trunk 1",
    code: "CBL-XLR-10",
  });
  await create("equipment", {
    name: "Boom mic stand", category: "stand", model: "K&M 210/9",
    quantity: 10, condition: "fair", storageLocation: "Stand rack",
    code: "STD-BOOM",
  });

  // Equipment allocations for demo event
  await create("eventEquipment", {
    eventId: ev.id, equipmentId: sm58.id,
    requiredQuantity: 4, preparedQuantity: 0, returnedQuantity: 0,
    assignment: "Vocals (lead + 3 backing)", status: "needed",
  });
  await create("eventEquipment", {
    eventId: ev.id, equipmentId: d6.id,
    requiredQuantity: 1, preparedQuantity: 0, returnedQuantity: 0,
    assignment: "Kick drum", status: "needed",
  });

  // Default checklist (auto-seeded by UI when user opens an empty checklist,
  // but we add a few here for demo so dashboard shows progress)
  await create("checklistTask", {
    eventId: ev.id, title: "Inventory and pull all required equipment", category: "equipment-prep",
    completed: true, assignedTo: "Tech 1", notes: "", completedAt: Date.now() - 86400000,
  });
  await create("checklistTask", {
    eventId: ev.id, title: "Test microphones, DI boxes, and cables", category: "equipment-prep",
    completed: false, assignedTo: "Tech 1",
  });
  await create("checklistTask", {
    eventId: ev.id, title: "Place microphones, stands, and DI boxes", category: "stage-mic",
    completed: false,
  });
  await create("checklistTask", {
    eventId: ev.id, title: "Patch all stage inputs to snake / stagebox", category: "signal-connections",
    completed: false,
  });
  await create("checklistTask", {
    eventId: ev.id, title: "Apply channel labels and color coding", category: "mixer-config",
    completed: false,
  });
  await create("checklistTask", {
    eventId: ev.id, title: "Verify PA outputs and zones", category: "output-monitor",
    completed: false,
  });
  await create("checklistTask", {
    eventId: ev.id, title: "Line check — confirm signal on every channel", category: "soundcheck",
    completed: false,
  });
  await create("checklistTask", {
    eventId: ev.id, title: "Save final show file and backup", category: "final-review",
    completed: false,
  });

  // Store first-run flag in meta
  await raw.put("meta", { id: "first-run", value: true, seededAt: Date.now() });
}

// Initialize on DOMContentLoaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
