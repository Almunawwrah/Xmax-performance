// views/documents.js — printable documents index + per-document print preview.
// All documents reflect saved data — never hardcoded sample values.

import { h, icon, clear } from "../utils/dom.js";
import {
  get, list, getWorkspaceForEvent, getInputsForWorkspace,
  getChannelsForWorkspace, getOutputsForWorkspace, getSignalForWorkspace,
  getAllocationsForEvent, getChecklistForEvent, getEvents,
} from "../storage/repo.js";
import { ENTITIES, optionLabel } from "../models/schema.js";
import { checkStatusBadge, verificationBadge, emptyState, alert, toast, confirm } from "../components/ui.js";
import { formatDate, formatDateTime } from "../utils/date.js";
import { navigate } from "../router.js";
import { refreshActiveContext } from "../app.js";
import { dumpAll } from "../storage/db.js";

// === Documents index ===

export async function renderIndex(ctx) {
  refreshActiveContext();
  const events = (await getEvents()).filter(e => e.status !== "archived");
  const page = h("div.page",
    h("div.page-head",
      h("div.page-head-meta",
        h("h1", "Technical documents"),
        h("div.subtitle", "Printable sheets for inputs, channels, outputs, equipment, and checklists."),
      ),
    ),
    events.length === 0
      ? h("div.card", emptyState({
          icon: "documents", title: "No events to document",
          body: "Create an event first, then come back here for printable documents.",
          action: h("button.btn.btn-primary", { onclick: () => navigate("/events") }, icon("events", 14), "Open events"),
        }))
      : h("div.col.gap-4",
          events.map(ev => h("div.card",
            h("div.card-header",
              h("div.card-title", ev.name),
              h("div.row.gap-2",
                h("span.badge.badge-neutral", formatDate(ev.date) || "No date"),
                h("button.btn.btn-ghost.btn-sm", { onclick: () => navigate(`/events/${ev.id}/documents`) }, "Open document set →"),
              ),
            ),
            h("div.doc-grid",
              docCard(ev, "Input list", "All planned audio sources", "input-list"),
              docCard(ev, "Channel sheet", "Mixer channels with notes", "channel-sheet"),
              docCard(ev, "Outputs & routing", "Outputs and signal flow", "outputs"),
              docCard(ev, "Equipment sheet", "Required, prepared, returned", "equipment"),
              docCard(ev, "Soundcheck checklist", "Preparation tasks", "checklist"),
              docCard(ev, "Event summary", "Full technical summary", "summary"),
            ),
          )),
        ),
  );
  ctx.mount(page);
}

function docCard(ev, title, desc, kind) {
  return h("a.doc-card",
    { href: `#/events/${ev.id}/documents?kind=${kind}`,
      onclick: (e) => { e.preventDefault(); navigate(`/events/${ev.id}/documents?kind=${kind}`); } },
    h("div.doc-card-title", title),
    h("div.doc-card-desc", desc),
    h("div.doc-card-actions",
      h("span.badge.badge-neutral", "Print-ready"),
    ),
  );
}

// === Per-event documents ===

export async function render(ctx) {
  const { id: eventId } = ctx.params;
  const ev = await get("event", eventId);
  if (!ev) {
    ctx.mount(h("div.empty-state",
      h(".empty-state-icon", icon("warn", 32)),
      h("div.empty-state-title", "Event not found"),
      h("button.btn.btn-primary", { onclick: () => navigate("/events") }, "Back to events"),
    ));
    return;
  }
  refreshActiveContext();

  const kind = ctx.query.kind || "input-list";
  const workspaces = await getWorkspaceForEvent(eventId);

  // For per-workspace docs, choose the first workspace (or query param)
  let activeWsId = ctx.query.ws || workspaces[0]?.id;

  const previewEl = h("div.print-preview");
  const controlsEl = h("div.row.gap-2.wrap");

  function renderControls() {
    clear(controlsEl);
    controlsEl.appendChild(h("button.btn.btn-ghost", { onclick: () => navigate(`/events/${ev.id}`) }, icon("back", 14), "Back to event"));
    controlsEl.appendChild(h("button.btn.btn-primary", { onclick: () => window.print() }, icon("print", 14), "Print"));
    controlsEl.appendChild(h("button.btn.btn-ghost", { onclick: () => exportJSON() }, icon("download", 14), "Export JSON backup"));
    // Workspace switcher
    if (workspaces.length > 1) {
      controlsEl.appendChild(h("div.row.gap-2.ml-4",
        h("span.dim", "Workspace:"),
        ...workspaces.map(w => h("button.btn.btn-sm" + (activeWsId === w.id ? ".btn-primary" : ".btn-ghost"),
          { onclick: () => { activeWsId = w.id; rerender(); } }, w.workspaceName)),
      ));
    }
    // Kind picker
    controlsEl.appendChild(h("div.row.gap-2.ml-4",
      h("span.dim", "Document:"),
      docButton("input-list", "Input list"),
      docButton("channel-sheet", "Channel sheet"),
      docButton("outputs", "Outputs & routing"),
      docButton("equipment", "Equipment"),
      docButton("checklist", "Checklist"),
      docButton("summary", "Summary"),
    ));
  }

  function docButton(k, label) {
    return h("button.btn.btn-sm" + (kind === k ? ".btn-primary" : ".btn-ghost"),
      { onclick: () => { navigate(`/events/${ev.id}/documents?kind=${k}${activeWsId ? `&ws=${activeWsId}` : ""}`); } },
      label,
    );
  }

  async function rerender() {
    renderControls();
    clear(previewEl);
    const ws = activeWsId ? workspaces.find(w => w.id === activeWsId) : null;
    switch (kind) {
      case "input-list": previewEl.appendChild(await inputListDoc(ev, ws)); break;
      case "channel-sheet": previewEl.appendChild(await channelSheetDoc(ev, ws)); break;
      case "outputs": previewEl.appendChild(await outputsDoc(ev, ws)); break;
      case "equipment": previewEl.appendChild(await equipmentDoc(ev)); break;
      case "checklist": previewEl.appendChild(await checklistDoc(ev)); break;
      case "summary": previewEl.appendChild(await summaryDoc(ev, ws)); break;
    }
  }

  async function exportJSON() {
    const ok = await confirm({
      title: "Export JSON backup",
      body: "Download a JSON backup of ALL data (events, workspaces, inputs, channels, outputs, equipment, allocations, checklist tasks, signal connections)?",
      confirmLabel: "Download",
    });
    if (!ok) return;
    try {
      const dump = await dumpAll();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `xmax-backup-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.ok("Backup exported", a.download);
    } catch (err) {
      toast.danger("Export failed", err.message);
    }
  }

  const page = h("div.page",
    breadcrumb(ev),
    h("div.page-head",
      h("div.page-head-meta",
        h("h1", "Technical documents"),
        h("div.subtitle", `Print-ready sheets for ${ev.name}.`),
      ),
      h("div.page-head-actions",
        h("button.btn.btn-primary", { onclick: () => window.print() }, icon("print", 14), "Print"),
      ),
    ),
    h("div.alert.alert-info",
      h(".alert-icon", icon("info", 18)),
      h("div.grow",
        h("div.alert-title", "Print preview"),
        h("div.alert-body", "The preview below shows what will be printed. Click Print to send to a printer or save as PDF."),
      ),
    ),
    controlsEl,
    h("div.mt-4", previewEl),
  );
  ctx.mount(page);
  await rerender();
}

function breadcrumb(ev) {
  return h("div.breadcrumb",
    h("a", { href: "#/", onclick: (e) => { e.preventDefault(); navigate("/"); } }, "Dashboard"),
    h("span.sep", "/"),
    h("a", { href: "#/events", onclick: (e) => { e.preventDefault(); navigate("/events"); } }, "Events"),
    h("span.sep", "/"),
    h("a", { href: `#/events/${ev.id}`, onclick: (e) => { e.preventDefault(); navigate(`/events/${ev.id}`); } }, ev.name),
    h("span.sep", "/"),
    h("span.current", "Documents"),
  );
}

// === Document builders — return DOM nodes using .print-doc class ===

function docHeader(ev, title) {
  return h("div.doc-header",
    h("h1", title),
    h("div.doc-meta",
      h("span.meta-item", h("span.meta-label", "Event:"), h("span", ev.name)),
      h("span.meta-item", h("span.meta-label", "Date:"), h("span", formatDate(ev.date) || "—")),
      h("span.meta-item", h("span.meta-label", "Venue:"), h("span", ev.venue || "—")),
      h("span.meta-item", h("span.meta-label", "Operator:"), h("span", ev.operator || "—")),
    ),
  );
}

function docFooter(ev) {
  return h("div.doc-footer",
    h("span", `Generated ${formatDateTime(new Date().toISOString())} · XMAX Performance`),
    h("span", ev.name),
  );
}

async function inputListDoc(ev, ws) {
  const inputs = ws ? (await getInputsForWorkspace(ws.id)).sort((a,b) => a.inputNumber - b.inputNumber) : [];
  const channels = ws ? await getChannelsForWorkspace(ws.id) : [];

  return h("div.print-doc",
    docHeader(ev, `Input list — ${ws?.workspaceName || "(no workspace)"}`),
    inputs.length === 0
      ? h("p", "No inputs recorded.")
      : h("table",
          h("thead", h("tr",
            th("#"), th("Source"), th("Type"), th("Performer"), th("Mic / DI"), th("Conn"),
            th("48V"), th("Channel"), th("Stage"), th("Status"), th("Notes"),
          )),
          h("tbody",
            inputs.map(i => {
              const ch = channels.find(c => c.id === i.assignedChannelId);
              return h("tr",
                td(String(i.inputNumber)),
                td(i.sourceName || "—"),
                td(optionLabel("input", "sourceType", i.sourceType)),
                td(i.assignedTo || "—"),
                td(i.micOrDI || "—"),
                td(optionLabel("input", "connectionType", i.connectionType)),
                td(i.phantomPower ? "Yes" : "—"),
                td(ch ? `${ch.channelNumber}: ${ch.label}` : "—"),
                td(i.stagePosition || "—"),
                td(optionLabel("input", "checkStatus", i.checkStatus)),
                td(i.notes || ""),
              );
            }),
          ),
        ),
    docFooter(ev),
  );
}

async function channelSheetDoc(ev, ws) {
  const channels = ws ? (await getChannelsForWorkspace(ws.id)).sort((a,b) => a.channelNumber - b.channelNumber) : [];
  const inputs = ws ? await getInputsForWorkspace(ws.id) : [];

  return h("div.print-doc",
    docHeader(ev, `Channel sheet — ${ws?.workspaceName || "(no workspace)"}`),
    channels.length === 0
      ? h("p", "No channels recorded.")
      : h("table",
          h("thead", h("tr",
            th("#"), th("Label"), th("Source"), th("48V"), th("HPF"),
            th("Pan"), th("Buses"), th("Mute grp"), th("Status"), th("Gain / EQ / Dynamics notes"),
          )),
          h("tbody",
            channels.map(c => {
              const inp = inputs.find(i => i.id === c.inputId);
              const notes = [c.gainNotes, c.eqNotes, c.dynamicsNotes].filter(Boolean).join(" / ");
              return h("tr",
                td(String(c.channelNumber)),
                td(c.label || "—"),
                td(inp ? inp.sourceName : "—"),
                td(optionLabel("channel", "phantomPower", c.phantomPower)),
                td(optionLabel("channel", "highpassFilter", c.highpassFilter)),
                td(c.pan || "—"),
                td(c.busAssignments || "—"),
                td(c.muteGroup || "—"),
                td(optionLabel("channel", "checkStatus", c.checkStatus)),
                td(notes || "—"),
              );
            }),
          ),
        ),
    docFooter(ev),
  );
}

async function outputsDoc(ev, ws) {
  const outputs = ws ? await getOutputsForWorkspace(ws.id) : [];
  const signal = ws ? await getSignalForWorkspace(ws.id) : [];

  return h("div.print-doc",
    docHeader(ev, `Outputs & signal routing — ${ws?.workspaceName || "(no workspace)"}`),
    h("h2", "Outputs"),
    outputs.length === 0
      ? h("p", "No outputs recorded.")
      : h("table",
          h("thead", h("tr",
            th("Name"), th("Type"), th("Source bus"), th("Destination"),
            th("Connector"), th("Equipment"), th("Status"), th("Notes"),
          )),
          h("tbody",
            outputs.map(o => h("tr",
              td(o.name || "—"),
              td(optionLabel("output", "outputType", o.outputType)),
              td(o.sourceBus || "—"),
              td(o.destination || "—"),
              td(o.connector || "—"),
              td(o.equipment || "—"),
              td(optionLabel("output", "connectionStatus", o.connectionStatus)),
              td(o.notes || ""),
            )),
          ),
        ),
    h("h2", "Signal routing"),
    signal.length === 0
      ? h("p", "No signal connections recorded.")
      : h("table",
          h("thead", h("tr",
            th("Source"), th("Via"), th("Destination"), th("Connection"), th("Verification"), th("Notes"),
          )),
          h("tbody",
            signal.map(c => h("tr",
              td(`${c.sourceLabel} (${optionLabel("signalConnection", "sourceType", c.sourceType)})`),
              td(c.viaLabel ? `${c.viaLabel}${c.viaType ? ` (${optionLabel("signalConnection", "viaType", c.viaType)})` : ""}` : "—"),
              td(`${c.destinationLabel} (${optionLabel("signalConnection", "destinationType", c.destinationType)})`),
              td(optionLabel("signalConnection", "connectionType", c.connectionType)),
              td(optionLabel("signalConnection", "verificationStatus", c.verificationStatus)),
              td(c.notes || ""),
            )),
          ),
        ),
    docFooter(ev),
  );
}

async function equipmentDoc(ev) {
  const allocations = await getAllocationsForEvent(ev.id);
  const items = await list("equipment");

  return h("div.print-doc",
    docHeader(ev, "Equipment preparation sheet"),
    allocations.length === 0
      ? h("p", "No equipment allocated.")
      : h("table",
          h("thead", h("tr",
            th("Item"), th("Category"), th("Model"), th("Required"),
            th("Prepared"), th("Returned"), th("Status"), th("Assignment"),
          )),
          h("tbody",
            allocations.map(a => {
              const item = items.find(i => i.id === a.equipmentId);
              return h("tr",
                td(item?.name || "(deleted)"),
                td(item ? optionLabel("equipment", "category", item.category) : "—"),
                td(item?.model || "—"),
                td(String(a.requiredQuantity)),
                td(String(a.preparedQuantity)),
                td(String(a.returnedQuantity || 0)),
                td(optionLabel("eventEquipment", "status", a.status)),
                td(a.assignment || "—"),
              );
            }),
          ),
        ),
    docFooter(ev),
  );
}

async function checklistDoc(ev) {
  const tasks = await getChecklistForEvent(ev.id);
  const cats = ENTITIES.checklistTask.fields.find(f => f.name === "category").options;

  return h("div.print-doc",
    docHeader(ev, "Soundcheck checklist"),
    tasks.length === 0
      ? h("p", "No checklist tasks.")
      : h("div",
          cats.map(cat => {
            const catTasks = tasks.filter(t => t.category === cat.value);
            if (catTasks.length === 0) return null;
            return h("div.doc-section",
              h("h2", cat.label),
              h("table",
                h("thead", h("tr",
                  th("Done"), th("Task"), th("Assigned"), th("Completed", { style: { width: "120px" } }), th("Notes"),
                )),
                h("tbody",
                  catTasks.map(t => h("tr",
                    td(t.completed ? "✓" : "□"),
                    td(t.title),
                    td(t.assignedTo || "—"),
                    td(t.completedAt ? formatDate(t.completedAt.slice(0, 10)) : "—"),
                    td(t.notes || ""),
                  )),
                ),
              ),
            );
          }),
        ),
    docFooter(ev),
  );
}

async function summaryDoc(ev, ws) {
  const workspaces = await getWorkspaceForEvent(ev.id);
  const inputs = ws ? await getInputsForWorkspace(ws.id) : [];
  const channels = ws ? await getChannelsForWorkspace(ws.id) : [];
  const outputs = ws ? await getOutputsForWorkspace(ws.id) : [];
  const signal = ws ? await getSignalForWorkspace(ws.id) : [];
  const allocs = await getAllocationsForEvent(ev.id);
  const tasks = await getChecklistForEvent(ev.id);
  const done = tasks.filter(t => t.completed).length;

  return h("div.print-doc",
    docHeader(ev, "Event audio summary"),
    h("h2", "Event"),
    h("table",
      h("tbody",
        row("Event name", ev.name),
        row("Category", optionLabel("event", "category", ev.category)),
        row("Date", formatDate(ev.date) || "—"),
        row("Venue", ev.venue || "—"),
        row("Stage / room", ev.stage || "—"),
        row("Operator", ev.operator || "—"),
        row("Status", optionLabel("event", "status", ev.status)),
      ),
    ),
    h("h2", "Workspace overview"),
    h("p", `${workspaces.length} workspace(s) total. Selected for this summary: ${ws?.workspaceName || "(none)"}`),
    ws ? h("table",
      h("tbody",
        row("Mixer description", ws.mixerDescription || "—"),
        row("Channel count", String(ws.channelCount || 0)),
        row("Inputs", String(inputs.length)),
        row("Channels", String(channels.length)),
        row("Outputs", String(outputs.length)),
        row("Signal connections", String(signal.length)),
      ),
    ) : null,
    h("h2", "Equipment"),
    h("p", `${allocs.length} allocation(s). ${allocs.filter(a => a.status === "ready").length} ready, ${allocs.filter(a => a.status === "needed").length} still needed.`),
    h("h2", "Checklist progress"),
    h("p", `${done} of ${tasks.length} tasks complete (${tasks.length > 0 ? Math.round((done/tasks.length)*100) : 0}%).`),
    ws?.configurationNotes ? h("div.doc-section",
      h("h2", "Configuration notes"),
      h("p", { style: { whiteSpace: "pre-wrap" } }, ws.configurationNotes),
    ) : null,
    ev.notes ? h("div.doc-section",
      h("h2", "Team notes"),
      h("p", { style: { whiteSpace: "pre-wrap" } }, ev.notes),
    ) : null,
    docFooter(ev),
  );
}

function th(label, attrs = {}) {
  return h("th", attrs, label);
}
function td(val) {
  return h("td", val == null ? "—" : String(val));
}
function row(label, val) {
  return h("tr", h("th", { style: { width: "160px" } }, label), h("td", val || "—"));
}
