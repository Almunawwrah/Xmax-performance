// views/outputs.js — output and monitoring configuration.

import { h, icon, clear } from "../utils/dom.js";
import {
  get, create, update, remove, getOutputsForWorkspace,
} from "../storage/repo.js";
import { ENTITIES, optionLabel } from "../models/schema.js";
import { validateRecord } from "../validation/validators.js";
import { modal, confirm, toast, emptyState, verificationBadge, alert } from "../components/ui.js";
import { entityForm } from "../components/forms.js";
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

  let outputs = [];

  async function reload() {
    outputs = (await getOutputsForWorkspace(workspaceId)).sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    renderList();
    renderStats();
  }

  const statsEl = h("div.grid.grid-4.mb-4");
  function renderStats() {
    clear(statsEl);
    const total = outputs.length;
    const confirmed = outputs.filter(o => o.connectionStatus === "confirmed").length;
    const unchecked = outputs.filter(o => o.connectionStatus === "unchecked").length;
    const problem = outputs.filter(o => o.connectionStatus === "problem").length;
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Outputs"), h("div.stat-value", String(total)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Confirmed"), h("div.stat-value.ok", String(confirmed)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Unchecked"), h("div.stat-value" + (unchecked ? ".warn" : ""), String(unchecked)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Problems"), h("div.stat-value" + (problem ? ".danger" : ""), String(problem)))));
  }

  const listEl = h("div.event-grid");

  function renderList() {
    clear(listEl);
    if (outputs.length === 0) {
      listEl.appendChild(emptyState({
        icon: "outputs", title: "No outputs documented",
        body: "Add outputs to record where signals go — main PA, subs, monitors, IEM, recording, streaming.",
        action: h("button.btn.btn-primary", { onclick: () => openEditor() }, icon("plus", 14), "Add output"),
      }));
      return;
    }
    for (const o of outputs) {
      listEl.appendChild(h("div.event-card",
        h("div.spread",
          h("div.event-card-title", o.name),
          verificationBadge(o.connectionStatus),
        ),
        h("div.event-card-meta",
          h("div.meta-row", h("span.meta-label", "Type"), h("span", optionLabel("output", "outputType", o.outputType))),
          h("div.meta-row", h("span.meta-label", "Source bus"), h("span", o.sourceBus || "—")),
          h("div.meta-row", h("span.meta-label", "Destination"), h("span", o.destination || "—")),
          h("div.meta-row", h("span.meta-label", "Connector"), h("span", o.connector || "—")),
          o.equipment ? h("div.meta-row", h("span.meta-label", "Equipment"), h("span", o.equipment)) : null,
        ),
        o.notes ? h("div.muted", { style: { fontSize: "var(--fs-sm)", whiteSpace: "pre-wrap" } }, o.notes) : null,
        h("div.event-card-footer",
          h("span.badge.badge-neutral", optionLabel("output", "outputType", o.outputType)),
          h("div.row.gap-2",
            h("button.btn.btn-ghost.btn-sm", { onclick: () => openEditor(o) }, icon("edit", 12), "Edit"),
            h("button.btn.btn-danger.btn-ghost.btn-sm", { onclick: () => onDelete(o) }, icon("trash", 12), "Delete"),
          ),
        ),
      ));
    }
  }

  async function openEditor(existing = null) {
    const isEdit = !!existing;
    const form = entityForm("output", existing || { workspaceId }, { columns: 2 });

    const m = modal({
      title: isEdit ? `Edit output: ${existing.name}` : "New output",
      size: "lg",
      body: form.el,
      footer: h("div.row",
        h("button.btn.btn-ghost", { onclick: () => m.close() }, "Cancel"),
        h("button.btn.btn-primary", {
          onclick: async () => {
            const data = form.getData();
            data.workspaceId = workspaceId;
            const v = validateRecord("output", data);
            if (!v.valid) {
              form.setErrors(v.errors);
              toast.danger("Please fix the highlighted fields.");
              return;
            }
            try {
              if (isEdit) {
                await update("output", existing.id, data);
                toast.ok("Output updated.");
              } else {
                await create("output", data);
                toast.ok("Output added.");
              }
              m.close();
              await reload();
            } catch (err) {
              toast.danger("Save failed", err.message);
            }
          },
        }, icon("check", 14), isEdit ? "Save changes" : "Add output"),
      ),
    });
  }

  async function onDelete(o) {
    const ok = await confirm({
      title: "Delete output",
      body: `Delete "${o.name}"?`,
      confirmLabel: "Delete", danger: true, confirmIcon: "trash",
    });
    if (!ok) return;
    await remove("output", o.id);
    toast.ok("Output deleted.");
    await reload();
  }

  const page = h("div.page",
    breadcrumb(ev, ws),
    h("div.page-head",
      h("div.page-head-meta",
        h("div.row.gap-3", h("h1", "Outputs & monitoring"), h("span.badge.badge-neutral", ws.workspaceName)),
        h("div.subtitle", "Document where each signal goes — PA, subs, monitors, IEM, recording, streaming."),
      ),
      h("div.page-head-actions",
        workspaceNavTabs(ev, ws, "outputs"),
        h("button.btn.btn-primary", { onclick: () => openEditor() }, icon("plus", 14), "New output"),
      ),
    ),
    statsEl,
    listEl,
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
    h("span.current", `${ws.workspaceName} · Outputs`),
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
