// views/inputs.js — input list management (create/edit/delete/search/sort).
// Detects conflicting channel assignments (advisory warnings).

import { h, icon, clear } from "../utils/dom.js";
import {
  get, create, update, remove,
  getInputsForWorkspace, getChannelsForWorkspace,
} from "../storage/repo.js";
import { ENTITIES, optionLabel } from "../models/schema.js";
import { validateRecord, detectChannelAssignmentConflicts, detectDuplicateInputNumbers } from "../validation/validators.js";
import { modal, confirm, toast, emptyState, checkStatusBadge, alert } from "../components/ui.js";
import { entityForm } from "../components/forms.js";
import { dataTable, searchFilter } from "../components/tables.js";
import { navigate } from "../router.js";
import { refreshActiveContext } from "../app.js";

export async function render(ctx) {
  const { id: eventId, wid: workspaceId } = ctx.params;
  const ev = await get("event", eventId);
  const ws = await get("workspace", workspaceId);
  if (!ev || !ws) {
    ctx.mount(h("div.empty-state",
      h(".empty-state-icon", icon("warn", 32)),
      h("div.empty-state-title", "Not found"),
      h("div.empty-state-body", "Event or workspace not found."),
      h("button.btn.btn-primary", { onclick: () => navigate("/events") }, "Back to events"),
    ));
    return;
  }
  refreshActiveContext();

  // Reload function — re-fetch and re-render
  let search = "";
  let state = { inputs: [], channels: [] };

  async function reload() {
    state.inputs = (await getInputsForWorkspace(workspaceId)).sort((a,b) => a.inputNumber - b.inputNumber);
    state.channels = (await getChannelsForWorkspace(workspaceId)).sort((a,b) => a.channelNumber - b.channelNumber);
    renderTable();
    renderConflicts();
    renderStats();
  }

  // === Conflict detection ===
  const conflictBanner = h("div.conflict-banner.hidden#conflict-banner");

  function renderConflicts() {
    clear(conflictBanner);
    const conflicts = detectChannelAssignmentConflicts(state.inputs, state.channels);
    const dups = detectDuplicateInputNumbers(state.inputs);
    if (conflicts.length === 0 && dups.length === 0) {
      conflictBanner.classList.add("hidden");
      return;
    }
    conflictBanner.classList.remove("hidden");
    const items = [];
    for (const c of conflicts) {
      items.push(`Channel "${c.channelLabel || `#${c.channelNumber}`}" is assigned to ${c.inputs.length} inputs: ${c.inputs.map(i => `"${i.sourceName}" (#${i.inputNumber})`).join(", ")}.`);
    }
    for (const d of dups) {
      items.push(`Duplicate input number ${d.inputNumber} — resolve before soundcheck.`);
    }
    conflictBanner.appendChild(h(".conflict-icon", icon("warn", 18)));
    conflictBanner.appendChild(h("div.grow",
      h("div.alert-title", "Configuration conflicts"),
      h("div.conflict-list", h("ul", items.map(t => h("li", t)))),
      h("div.muted.mt-2",
        "Shared or re-patched setups are allowed if explicitly documented. Use the notes field to record intentional sharing."),
    ));
  }

  // === Stats ===
  const statsEl = h("div.grid.grid-4.mb-4");

  function renderStats() {
    clear(statsEl);
    const total = state.inputs.length;
    const patched = state.inputs.filter(i => i.checkStatus === "patched").length;
    const checked = state.inputs.filter(i => i.checkStatus === "checked").length;
    const problem = state.inputs.filter(i => i.checkStatus === "problem").length;
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Inputs"), h("div.stat-value", String(total)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Patched"), h("div.stat-value", String(patched)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Checked"), h("div.stat-value.ok", String(checked)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Problems"), h("div.stat-value" + (problem ? ".danger" : ""), String(problem)))));
  }

  // === Table ===
  let tableCtl;

  function channelLabel(input) {
    if (!input.assignedChannelId) return "—";
    const ch = state.channels.find(c => c.id === input.assignedChannelId);
    if (!ch) return "— (channel removed)";
    return `${ch.channelNumber}: ${ch.label}`;
  }

  function renderTable() {
    const q = search.toLowerCase().trim();
    const rows = state.inputs.filter(searchFilter(q, ["sourceName", "assignedTo", "micOrDI", "stagePosition", "notes"]));

    const columns = [
      { key: "inputNumber", label: "#", sortable: true, mono: true, align: "right", width: "40px", render: r => h("span.mono", String(r.inputNumber)) },
      { key: "sourceName", label: "Source", sortable: true, render: r => h("div",
        h("div", { style: { fontWeight: 500 } }, r.sourceName),
        h("div.dim", { style: { fontSize: "11px" } }, optionLabel("input", "sourceType", r.sourceType)),
      ) },
      { key: "assignedTo", label: "Performer / device", sortable: true, render: r => r.assignedTo || "—" },
      { key: "micOrDI", label: "Mic / DI", sortable: true, render: r => r.micOrDI || "—" },
      { key: "connectionType", label: "Conn", sortable: true, render: r => optionLabel("input", "connectionType", r.connectionType) },
      { key: "phantomPower", label: "48V", sortable: true, render: r => r.phantomPower ? h("span.badge.badge-info", "48V") : "—" },
      { key: "assignedChannelId", label: "Channel", sortable: false, render: r => channelLabel(r) },
      { key: "stagePosition", label: "Stage", sortable: true, render: r => r.stagePosition || "—" },
      { key: "checkStatus", label: "Status", sortable: true, render: r => checkStatusBadge(r.checkStatus) },
      { key: "_actions", label: "", sortable: false, width: "90px", render: r => h("div.row.gap-1",
        h("button.btn.btn-ghost.btn-icon.btn-sm", { onclick: (e) => { e.stopPropagation(); openEditor(r); }, "aria-label": "Edit input" }, icon("edit", 14)),
        h("button.btn.btn-danger.btn-ghost.btn-icon.btn-sm", { onclick: (e) => { e.stopPropagation(); onDelete(r); }, "aria-label": "Delete input" }, icon("trash", 14)),
      ) },
    ];

    tableCtl = dataTable({
      columns,
      rows,
      onRowClick: (r) => openEditor(r),
    });
    clear(tableWrapEl);
    tableWrapEl.appendChild(tableCtl.el);
  }

  const tableWrapEl = h("div");

  // === Editor ===
  async function openEditor(existing = null) {
    const isEdit = !!existing;
    const form = entityForm("input", existing || { workspaceId }, { columns: 2 });

    // Build a channel picker (replaces the assignedChannelId text input with a select)
    // We do this by adding a select below the form for clarity.
    const channelSelect = h("select.select",
      h("option", { value: "" }, "— (unassigned)"),
      ...state.channels.map(c => h("option", {
        value: c.id,
        selected: existing && existing.assignedChannelId === c.id,
      }, `${c.channelNumber}: ${c.label}`)),
    );

    // Replace the assignedChannelId input with our select
    const assignedField = form.el.querySelector('[data-field="assignedChannelId"]');
    if (assignedField) {
      const inputEl = assignedField.querySelector("input");
      if (inputEl) {
        inputEl.replaceWith(channelSelect);
      }
      // Hook getData to read our select instead
      const origGetData = form.getData;
      form.getData = function() {
        const data = origGetData.call(this);
        data.assignedChannelId = channelSelect.value || null;
        return data;
      };
    }

    const m = modal({
      title: isEdit ? `Edit input: ${existing.sourceName}` : "New input",
      size: "lg",
      body: form.el,
      footer: h("div.row",
        h("button.btn.btn-ghost", { onclick: () => m.close() }, "Cancel"),
        h("button.btn.btn-danger", { onclick: async () => {
          if (!isEdit) return;
          m.close();
          await onDelete(existing);
        } }, "Delete"),
        h("button.btn.btn-primary", {
          onclick: async () => {
            const data = form.getData();
            data.workspaceId = workspaceId;
            const v = validateRecord("input", data);
            if (!v.valid) {
              form.setErrors(v.errors);
              toast.danger("Please fix the highlighted fields.");
              return;
            }
            try {
              if (isEdit) {
                await update("input", existing.id, data);
                // Sync channel.inputId link
                await syncChannelLink(existing.id, data.assignedChannelId);
                toast.ok("Input updated.");
              } else {
                const saved = await create("input", data);
                await syncChannelLink(saved.id, data.assignedChannelId);
                toast.ok("Input added.");
              }
              m.close();
              await reload();
            } catch (err) {
              toast.danger("Save failed", err.message);
            }
          },
        }, icon("check", 14), isEdit ? "Save changes" : "Add input"),
      ),
    });
  }

  // When an input's assigned channel changes, ensure the channel.inputId
  // points back at the input (mutual link). For multiple inputs to the same
  // channel, the most recent one wins the back-link, which is fine — the
  // conflict detection still surfaces the multi-input case as advisory.
  async function syncChannelLink(inputId, channelId) {
    // Clear any channel that previously pointed at this input
    for (const ch of state.channels) {
      if (ch.inputId === inputId) {
        await update("channel", ch.id, { inputId: null });
      }
    }
    if (channelId) {
      await update("channel", channelId, { inputId });
    }
  }

  async function onDelete(input) {
    const ok = await confirm({
      title: "Delete input",
      body: `Delete "${input.sourceName}" (#${input.inputNumber})? The linked mixer channel will be unassigned but not deleted.`,
      confirmLabel: "Delete", danger: true, confirmIcon: "trash",
    });
    if (!ok) return;
    try {
      await remove("input", input.id);
      toast.ok("Input deleted.");
      await reload();
    } catch (err) {
      toast.danger("Delete failed", err.message);
    }
  }

  // === Page assembly ===
  const page = h("div.page",
    breadcrumb(ev, ws),
    h("div.page-head",
      h("div.page-head-meta",
        h("div.row.gap-3", h("h1", "Input list"), h("span.badge.badge-neutral", `${ws.workspaceName}`)),
        h("div.subtitle", "Define every planned audio source. Channel conflicts are surfaced as warnings."),
      ),
      h("div.page-head-actions",
        workspaceNavTabs(ev, ws, "inputs"),
        h("button.btn.btn-primary", { onclick: () => openEditor() }, icon("plus", 14), "New input"),
      ),
    ),
    conflictBanner,
    statsEl,
    h("div.table-toolbar",
      h("input.input.search", {
        type: "search", placeholder: "Search inputs…",
        oninput: (e) => { search = e.target.value; renderTable(); },
      }),
      h("div.row.gap-2",
        h("button.btn.btn-ghost.btn-sm", { onclick: () => reload() }, icon("refresh", 12), "Refresh"),
      ),
    ),
    tableWrapEl,
    state.inputs.length === 0 ? h("div.card.mt-4", emptyState({
      icon: "inputs", title: "No inputs yet",
      body: "Add every planned audio source — vocals, instruments, playback, drums, wireless.",
      action: h("button.btn.btn-primary", { onclick: () => openEditor() }, icon("plus", 14), "Add first input"),
    })) : null,
  );

  ctx.mount(page);
  await reload();
}

function breadcrumb(ev, ws) {
  return h("div.breadcrumb",
    h("a", { href: "#/", onclick: (e) => { e.preventDefault(); navigate("/"); } }, "Dashboard"),
    h("span.sep", "/"),
    h("a", { href: "#/events", onclick: (e) => { e.preventDefault(); navigate("/events"); } }, "Events"),
    h("span.sep", "/"),
    h("a", { href: `#/events/${ev.id}`, onclick: (e) => { e.preventDefault(); navigate(`/events/${ev.id}`); } }, ev.name),
    h("span.sep", "/"),
    h("span.current", `${ws.workspaceName} · Inputs`),
  );
}

function workspaceNavTabs(ev, ws, active) {
  const tabs = [
    { key: "inputs", label: "Inputs", path: "inputs" },
    { key: "channels", label: "Channels", path: "channels" },
    { key: "signal", label: "Signal flow", path: "signal" },
    { key: "outputs", label: "Outputs", path: "outputs" },
  ];
  return h("div.row.gap-2",
    tabs.map(t => h("a.btn.btn-sm" + (active === t.key ? ".btn-primary" : ".btn-ghost"),
      { href: `#/events/${ev.id}/workspace/${ws.id}/${t.path}`,
        onclick: (e) => { e.preventDefault(); navigate(`/events/${ev.id}/workspace/${ws.id}/${t.path}`); } },
      t.label,
    )),
  );
}
