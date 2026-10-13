// views/signalflow.js — document signal-flow connections as structured records.
// Each connection: Source (label + type) → [Via (optional label + type)] → Destination (label + type)
// Verification status: planned | unchecked | confirmed | problem
// Always provides an accessible text representation, not just a diagram.

import { h, icon, clear } from "../utils/dom.js";
import {
  get, create, update, remove,
  getSignalForWorkspace,
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

  let connections = [];

  async function reload() {
    connections = (await getSignalForWorkspace(workspaceId)).sort((a,b) => (a.createdAt||0) - (b.createdAt||0));
    renderList();
    renderStats();
  }

  const statsEl = h("div.grid.grid-4.mb-4");
  function renderStats() {
    clear(statsEl);
    const total = connections.length;
    const planned = connections.filter(c => c.verificationStatus === "planned").length;
    const unchecked = connections.filter(c => c.verificationStatus === "unchecked").length;
    const confirmed = connections.filter(c => c.verificationStatus === "confirmed").length;
    const problem = connections.filter(c => c.verificationStatus === "problem").length;
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Connections"), h("div.stat-value", String(total)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Planned"), h("div.stat-value", String(planned)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Confirmed"), h("div.stat-value.ok", String(confirmed)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Problems"), h("div.stat-value" + (problem ? ".danger" : ""), String(problem)))));
  }

  const listEl = h("div.signalflow-list");

  function renderList() {
    clear(listEl);
    if (connections.length === 0) {
      listEl.appendChild(emptyState({
        icon: "signalflow", title: "No signal connections documented",
        body: "Add a connection to document the planned path of audio through your system — e.g. 'Vocal mic → Stage input → Channel → Main LR → PA'.",
        action: h("button.btn.btn-primary", { onclick: () => openEditor() }, icon("plus", 14), "Add connection"),
      }));
      return;
    }
    for (const c of connections) {
      listEl.appendChild(h("div.signal-chain",
        h("div.signal-chain-head",
          h("div.signal-chain-title", c.notes ? c.notes.split("\n")[0] : `${c.sourceLabel} → ${c.destinationLabel}`),
          h("div.row.gap-2",
            verificationBadge(c.verificationStatus),
            h("button.btn.btn-ghost.btn-icon.btn-sm", { onclick: () => openEditor(c), "aria-label": "Edit" }, icon("edit", 14)),
            h("button.btn.btn-danger.btn-ghost.btn-icon.btn-sm", { onclick: () => onDelete(c), "aria-label": "Delete" }, icon("trash", 14)),
          ),
        ),
        h("div.signal-chain-path",
          h("span.signal-node", `${c.sourceLabel} (${optionLabel("signalConnection", "sourceType", c.sourceType)})`),
          c.viaLabel ? [
            h("span.signal-arrow", "→"),
            h("span.signal-node", `${c.viaLabel}${c.viaType ? ` (${optionLabel("signalConnection", "viaType", c.viaType)})` : ""}`),
          ] : null,
          h("span.signal-arrow", "→"),
          h("span.signal-node", `${c.destinationLabel} (${optionLabel("signalConnection", "destinationType", c.destinationType)})`),
        ),
        h("div.row.gap-3.mt-2",
          h("span.badge.badge-neutral", optionLabel("signalConnection", "connectionType", c.connectionType)),
          c.notes ? h("span.dim", { style: { fontSize: "var(--fs-sm)" } }, c.notes) : null,
        ),
      ));
    }
  }

  async function openEditor(existing = null) {
    const isEdit = !!existing;
    const form = entityForm("signalConnection", existing || { workspaceId }, { columns: 2 });

    const m = modal({
      title: isEdit ? "Edit signal connection" : "New signal connection",
      size: "lg",
      body: h("div",
        h("div.alert.alert-info",
          h(".alert-icon", icon("info", 18)),
          h("div.grow",
            h("div.alert-title", "Documenting a planned connection"),
            h("div.alert-body", "Describe the source, optional intermediate node (e.g. stage input / snake), and destination. The verification status tracks physical checks — selecting 'Confirmed' does not verify the cable itself, only that you have physically checked it."),
          ),
        ),
        form.el,
      ),
      footer: h("div.row",
        h("button.btn.btn-ghost", { onclick: () => m.close() }, "Cancel"),
        h("button.btn.btn-primary", {
          onclick: async () => {
            const data = form.getData();
            data.workspaceId = workspaceId;
            const v = validateRecord("signalConnection", data);
            if (!v.valid) {
              form.setErrors(v.errors);
              toast.danger("Please fix the highlighted fields.");
              return;
            }
            try {
              if (isEdit) {
                await update("signalConnection", existing.id, data);
                toast.ok("Connection updated.");
              } else {
                await create("signalConnection", data);
                toast.ok("Connection added.");
              }
              m.close();
              await reload();
            } catch (err) {
              toast.danger("Save failed", err.message);
            }
          },
        }, icon("check", 14), isEdit ? "Save changes" : "Add connection"),
      ),
    });
  }

  async function onDelete(c) {
    const ok = await confirm({
      title: "Delete signal connection",
      body: `Delete "${c.sourceLabel} → ${c.destinationLabel}"?`,
      confirmLabel: "Delete", danger: true, confirmIcon: "trash",
    });
    if (!ok) return;
    await remove("signalConnection", c.id);
    toast.ok("Connection deleted.");
    await reload();
  }

  const page = h("div.page",
    breadcrumb(ev, ws),
    h("div.page-head",
      h("div.page-head-meta",
        h("div.row.gap-3", h("h1", "Signal flow"), h("span.badge.badge-neutral", ws.workspaceName)),
        h("div.subtitle", "Document the planned path of audio through the system."),
      ),
      h("div.page-head-actions",
        workspaceNavTabs(ev, ws, "signal"),
        h("button.btn.btn-primary", { onclick: () => openEditor() }, icon("plus", 14), "New connection"),
      ),
    ),
    h("div.alert.alert-info",
      h(".alert-icon", icon("info", 18)),
      h("div.grow",
        h("div.alert-title", "Documentation, not hardware control"),
        h("div.alert-body", "This view records your planned and verified signal routing. It does not control physical cables or audio paths."),
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
    h("span.current", `${ws.workspaceName} · Signal flow`),
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
