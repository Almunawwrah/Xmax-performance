// views/channels.js — mixer channel management.
// Compact strip grid + detailed editor. Conflict detection on duplicate numbers.

import { h, icon, clear } from "../utils/dom.js";
import {
  get, create, update, remove,
  getChannelsForWorkspace, getInputsForWorkspace,
} from "../storage/repo.js";
import { ENTITIES, optionLabel } from "../models/schema.js";
import { validateRecord, detectDuplicateChannelNumbers } from "../validation/validators.js";
import { modal, confirm, toast, emptyState, checkStatusBadge, alert } from "../components/ui.js";
import { entityForm, displayValue } from "../components/forms.js";
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
      h("button.btn.btn-primary", { onclick: () => navigate("/events") }, "Back to events"),
    ));
    return;
  }
  refreshActiveContext();

  let state = { channels: [], inputs: [] };

  async function reload() {
    state.channels = (await getChannelsForWorkspace(workspaceId)).sort((a,b) => a.channelNumber - b.channelNumber);
    state.inputs = (await getInputsForWorkspace(workspaceId));
    renderStrips();
    renderDetail();
    renderStats();
    renderConflicts();
  }

  // === Conflict banner ===
  const conflictBanner = h("div.conflict-banner.hidden");

  function renderConflicts() {
    clear(conflictBanner);
    const dups = detectDuplicateChannelNumbers(state.channels);
    if (dups.length === 0) {
      conflictBanner.classList.add("hidden");
      return;
    }
    conflictBanner.classList.remove("hidden");
    conflictBanner.appendChild(h(".conflict-icon", icon("warn", 18)));
    conflictBanner.appendChild(h("div.grow",
      h("div.alert-title", "Duplicate channel numbers"),
      h("div.conflict-list", h("ul", dups.map(d =>
        h("li", `Channel number ${d.channelNumber} appears on multiple channel records. Resolve to avoid ambiguity.`),
      ))),
    ));
  }

  // === Stats ===
  const statsEl = h("div.grid.grid-4.mb-4");
  function renderStats() {
    clear(statsEl);
    const total = state.channels.length;
    const assigned = state.channels.filter(c => c.inputId).length;
    const checked = state.channels.filter(c => c.checkStatus === "checked").length;
    const problem = state.channels.filter(c => c.checkStatus === "problem").length;
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Channels"), h("div.stat-value", String(total)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Assigned"), h("div.stat-value", String(assigned)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Checked"), h("div.stat-value.ok", String(checked)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Problems"), h("div.stat-value" + (problem ? ".danger" : ""), String(problem)))));
  }

  // === Strip grid ===
  const stripsEl = h("div.channel-strip-grid");
  let selectedId = null;

  function renderStrips() {
    clear(stripsEl);
    if (state.channels.length === 0) {
      stripsEl.appendChild(emptyState({
        icon: "channels", title: "No channels yet",
        body: "Seed empty channel strips when creating a workspace, or add a single channel below.",
        action: h("button.btn.btn-primary", { onclick: () => seedChannels() }, icon("plus", 14), "Seed 16 channels"),
      }));
      return;
    }
    for (const ch of state.channels) {
      const input = state.inputs.find(i => i.id === ch.inputId);
      const isConflict = state.channels.filter(x => x.channelNumber === ch.channelNumber).length > 1;
      const isSelected = selectedId === ch.id;
      const cls = ["channel-strip"];
      if (isConflict) cls.push("conflict");
      if (ch.checkStatus === "unchecked" || ch.checkStatus === "pending") cls.push("unchecked");
      if (isSelected) cls.push("row-selected");
      const buses = (ch.busAssignments || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 4);

      stripsEl.appendChild(h("div." + cls.join("."),
        { onclick: () => { selectedId = ch.id; renderStrips(); renderDetail(); } },
        h("div.channel-strip-head",
          h("span.channel-strip-num", String(ch.channelNumber)),
          checkStatusBadge(ch.checkStatus),
        ),
        h("div.channel-strip-label", ch.label || "—"),
        h("div.channel-strip-sub", input ? `${input.sourceName} (${optionLabel("input", "sourceType", input.sourceType)})` : "No input"),
        h("div.channel-strip-buses",
          buses.length ? buses.map(b => h("span.channel-strip-bus", b)) : null,
        ),
      ));
    }
  }

  // === Detail panel ===
  const detailEl = h("div.detail-panel");

  function renderDetail() {
    clear(detailEl);
    if (!selectedId) {
      detailEl.appendChild(emptyState({
        icon: "channels", title: "Select a channel",
        body: "Click a strip above to view and edit its full configuration.",
      }));
      return;
    }
    const ch = state.channels.find(c => c.id === selectedId);
    if (!ch) { selectedId = null; return renderDetail(); }
    const input = state.inputs.find(i => i.id === ch.inputId);

    const fields = [
      ["Channel #", String(ch.channelNumber)],
      ["Label", ch.label || "—"],
      ["Input source", input ? `${input.sourceName} (#${input.inputNumber})` : "— (no input)"],
      ["Input connection", ch.inputConnection || "—"],
      ["Gain notes", ch.gainNotes || "—"],
      ["Phantom power", displayValue("channel", "phantomPower", ch.phantomPower)],
      ["High-pass filter", displayValue("channel", "highpassFilter", ch.highpassFilter)],
      ["EQ notes", ch.eqNotes || "—"],
      ["Dynamics notes", ch.dynamicsNotes || "—"],
      ["Pan", ch.pan || "—"],
      ["Bus / output assignments", ch.busAssignments || "—"],
      ["Monitor-send notes", ch.monitorNotes || "—"],
      ["Mute group", ch.muteGroup || "—"],
      ["Soundcheck status", displayValue("channel", "checkStatus", ch.checkStatus)],
    ];

    detailEl.appendChild(
      h("div",
        h("div.card-header",
          h("div.card-title", `Channel ${ch.channelNumber} — ${ch.label}`),
          h("div.row.gap-2",
            h("button.btn.btn-ghost.btn-sm", { onclick: () => openEditor(ch) }, icon("edit", 12), "Edit"),
            h("button.btn.btn-danger.btn-ghost.btn-sm", { onclick: () => onDelete(ch) }, icon("trash", 12), "Delete"),
          ),
        ),
        h("div.detail-grid",
          fields.map(([label, val]) => h("div",
            h("div.detail-field-label", label),
            h("div.detail-field-value", val),
          )),
        ),
      ),
    );
  }

  // === Editor ===
  async function openEditor(existing = null) {
    const isEdit = !!existing;
    const form = entityForm("channel", existing || { workspaceId }, { columns: 2 });

    // Build input picker
    const inputSelect = h("select.select",
      h("option", { value: "" }, "— (no input)"),
      ...state.inputs.map(i => h("option", {
        value: i.id, selected: existing && existing.inputId === i.id,
      }, `#${i.inputNumber} — ${i.sourceName}`)),
    );

    const inputField = form.el.querySelector('[data-field="inputId"]');
    if (inputField) {
      const txt = inputField.querySelector("input");
      if (txt) txt.replaceWith(inputSelect);
      const origGetData = form.getData;
      form.getData = function() {
        const d = origGetData.call(this);
        d.inputId = inputSelect.value || null;
        return d;
      };
    }

    const m = modal({
      title: isEdit ? `Edit channel ${existing.channelNumber}` : "New channel",
      size: "lg",
      body: form.el,
      footer: h("div.row",
        h("button.btn.btn-ghost", { onclick: () => m.close() }, "Cancel"),
        isEdit ? h("button.btn.btn-danger", { onclick: async () => {
          m.close(); await onDelete(existing);
        } }, "Delete") : null,
        h("button.btn.btn-primary", {
          onclick: async () => {
            const data = form.getData();
            data.workspaceId = workspaceId;
            const v = validateRecord("channel", data);
            if (!v.valid) {
              form.setErrors(v.errors);
              toast.danger("Please fix the highlighted fields.");
              return;
            }
            try {
              if (isEdit) {
                await update("channel", existing.id, data);
                await syncInputLink(existing.id, data.inputId);
                toast.ok("Channel updated.");
              } else {
                const saved = await create("channel", data);
                await syncInputLink(saved.id, data.inputId);
                toast.ok("Channel added.");
                selectedId = saved.id;
              }
              m.close();
              await reload();
            } catch (err) {
              toast.danger("Save failed", err.message);
            }
          },
        }, icon("check", 14), isEdit ? "Save changes" : "Add channel"),
      ),
    });
  }

  // Keep input.assignedChannelId in sync with channel.inputId
  async function syncInputLink(channelId, inputId) {
    // Clear any input previously pointing at this channel
    for (const inp of state.inputs) {
      if (inp.assignedChannelId === channelId) {
        await update("input", inp.id, { assignedChannelId: null });
      }
    }
    if (inputId) {
      await update("input", inputId, { assignedChannelId });
    }
  }

  async function onDelete(ch) {
    const ok = await confirm({
      title: "Delete channel",
      body: `Delete channel ${ch.channelNumber} ("${ch.label}")? Any input linked to this channel will be unassigned.`,
      confirmLabel: "Delete", danger: true, confirmIcon: "trash",
    });
    if (!ok) return;
    await remove("channel", ch.id);
    if (selectedId === ch.id) selectedId = null;
    toast.ok("Channel deleted.");
    await reload();
  }

  async function seedChannels() {
    const count = 16;
    const start = state.channels.length + 1;
    for (let i = start; i < start + count; i++) {
      await create("channel", { workspaceId, channelNumber: i, label: `CH ${i}` });
    }
    toast.ok(`Seeded ${count} channels.`);
    await reload();
  }

  const page = h("div.page",
    breadcrumb(ev, ws),
    h("div.page-head",
      h("div.page-head-meta",
        h("div.row.gap-3", h("h1", "Mixer channels"), h("span.badge.badge-neutral", ws.workspaceName)),
        h("div.subtitle", "Compact strip view + detailed editor. All values are documented notes, not live measurements."),
      ),
      h("div.page-head-actions",
        workspaceNavTabs(ev, ws, "channels"),
        h("button.btn.btn-primary", { onclick: () => openEditor() }, icon("plus", 14), "New channel"),
      ),
    ),
    conflictBanner,
    statsEl,
    h("div.section-head", h("h2", "Channel strips"), h("div.section-head-actions")),
    stripsEl,
    h("div.section-head.mt-6", h("h2", "Channel detail")),
    detailEl,
  );

  ctx.mount(page);
  await reload();
  // Auto-select first channel if any
  if (!selectedId && state.channels.length > 0) {
    selectedId = state.channels[0].id;
    renderStrips();
    renderDetail();
  }
}

function breadcrumb(ev, ws) {
  return h("div.breadcrumb",
    h("a", { href: "#/", onclick: (e) => { e.preventDefault(); navigate("/"); } }, "Dashboard"),
    h("span.sep", "/"),
    h("a", { href: "#/events", onclick: (e) => { e.preventDefault(); navigate("/events"); } }, "Events"),
    h("span.sep", "/"),
    h("a", { href: `#/events/${ev.id}`, onclick: (e) => { e.preventDefault(); navigate(`/events/${ev.id}`); } }, ev.name),
    h("span.sep", "/"),
    h("span.current", `${ws.workspaceName} · Channels`),
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
