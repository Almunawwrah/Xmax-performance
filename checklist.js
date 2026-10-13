// views/checklist.js — soundcheck preparation checklist (per event + cross-event overview).

import { h, icon, clear } from "../utils/dom.js";
import {
  get, create, update, remove, list,
  getChecklistForEvent, getEvents, seedDefaultChecklist,
} from "../storage/repo.js";
import { ENTITIES, optionLabel } from "../models/schema.js";
import { validateRecord } from "../validation/validators.js";
import { modal, confirm, toast, emptyState, alert } from "../components/ui.js";
import { entityForm } from "../components/forms.js";
import { formatDate, formatDateTime } from "../utils/date.js";
import { navigate } from "../router.js";
import { refreshActiveContext, refreshNavBadges } from "../app.js";

// Categories in order
const CATEGORIES = ENTITIES.checklistTask.fields.find(f => f.name === "category").options;

// === Per-event checklist ===

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
  refreshNavBadges();

  let tasks = [];

  async function reload() {
    tasks = await getChecklistForEvent(eventId);
    renderList();
    renderProgress();
  }

  const progressEl = h("div.card.mb-4");

  function renderProgress() {
    clear(progressEl);
    const total = tasks.length;
    const done = tasks.filter(t => t.completed).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    progressEl.appendChild(
      h("div.row-gap-4",
        h("div.grow",
          h("div.row.gap-4",
            h("div.stat", h("div.stat-label", "Progress"), h("div.stat-value", `${pct}%`)),
            h("div.stat", h("div.stat-label", "Tasks"), h("div.stat-value", `${done}/${total}`)),
            h("div.stat", h("div.stat-label", "Pending"), h("div.stat-value", String(total - done))),
          ),
          h("div.progress.mt-3",
            h(`div.progress-bar${pct === 100 ? ".ok" : pct < 50 ? ".warn" : ""}`, { style: { width: pct + "%" } }),
          ),
        ),
        h("button.btn.btn-ghost", { onclick: () => addTask() }, icon("plus", 14), "Add task"),
      ),
    );
  }

  const listEl = h("div.col.gap-4");

  function renderList() {
    clear(listEl);
    if (tasks.length === 0) {
      listEl.appendChild(emptyState({
        icon: "checklist", title: "No checklist tasks yet",
        body: "Add the standard preparation steps for this event, or seed the default checklist.",
        action: h("div.row.gap-2",
          h("button.btn.btn-primary", { onclick: () => seedDefault() }, icon("check", 14), "Seed default checklist"),
          h("button.btn.btn-ghost", { onclick: () => addTask() }, icon("plus", 14), "Add a task"),
        ),
      }));
      return;
    }

    // Group by category, in order
    for (const cat of CATEGORIES) {
      const catTasks = tasks.filter(t => t.category === cat.value);
      if (catTasks.length === 0) continue;
      const catDone = catTasks.filter(t => t.completed).length;
      listEl.appendChild(h("div.checklist-cat",
        h("div.checklist-cat-head",
          h("div.checklist-cat-title", cat.label),
          h("div.row.gap-3",
            h("span.badge.badge-neutral", `${catDone}/${catTasks.length}`),
            h("button.btn.btn-ghost.btn-icon.btn-sm", {
              "aria-label": "Add task to this category",
              onclick: () => addTask(cat.value),
            }, icon("plus", 12)),
          ),
        ),
        h("div.col",
          ...catTasks.map(t => renderTask(t)),
        ),
      ));
    }
  }

  function renderTask(t) {
    return h("div.checklist-task" + (t.completed ? ".completed" : ""),
      { onclick: () => toggleTask(t) },
      h("input", { type: "checkbox", checked: t.completed, "aria-label": `Mark "${t.title}" complete` }),
      h("div.checklist-task-body",
        h("div.checklist-task-title", t.title),
        h("div.checklist-task-meta",
          t.assignedTo ? h("span", `Assigned: ${t.assignedTo}`) : null,
          t.completedAt ? h("span", `Completed: ${formatDateTime(t.completedAt)}`) : null,
          t.notes ? h("span.dim", t.notes) : null,
        ),
      ),
      h("div.row.gap-1",
        h("button.btn.btn-ghost.btn-icon.btn-sm", { onclick: (e) => { e.stopPropagation(); editTask(t); } }, icon("edit", 14)),
        h("button.btn.btn-danger.btn-ghost.btn-icon.btn-sm", { onclick: (e) => { e.stopPropagation(); deleteTask(t); } }, icon("trash", 14)),
      ),
    );
  }

  async function toggleTask(t) {
    const completed = !t.completed;
    const patch = { completed, completedAt: completed ? new Date().toISOString() : null };
    await update("checklistTask", t.id, patch);
    await reload();
    refreshNavBadges();
  }

  async function addTask(defaultCategory = null) {
    const form = entityForm("checklistTask", { category: defaultCategory || "equipment-prep" }, { columns: 1 });
    const m = modal({
      title: "New checklist task",
      size: "md",
      body: form.el,
      footer: h("div.row",
        h("button.btn.btn-ghost", { onclick: () => m.close() }, "Cancel"),
        h("button.btn.btn-primary", {
          onclick: async () => {
            const data = form.getData();
            data.eventId = eventId;
            const v = validateRecord("checklistTask", data);
            if (!v.valid) {
              form.setErrors(v.errors);
              return;
            }
            await create("checklistTask", data);
            toast.ok("Task added.");
            m.close();
            await reload();
            refreshNavBadges();
          },
        }, icon("check", 14), "Add task"),
      ),
    });
  }

  async function editTask(t) {
    const form = entityForm("checklistTask", t, { columns: 1 });
    const m = modal({
      title: "Edit checklist task",
      size: "md",
      body: form.el,
      footer: h("div.row",
        h("button.btn.btn-ghost", { onclick: () => m.close() }, "Cancel"),
        h("button.btn.btn-primary", {
          onclick: async () => {
            const data = form.getData();
            await update("checklistTask", t.id, data);
            toast.ok("Task updated.");
            m.close();
            await reload();
          },
        }, icon("check", 14), "Save"),
      ),
    });
  }

  async function deleteTask(t) {
    const ok = await confirm({
      title: "Delete task",
      body: `Delete "${t.title}"?`,
      confirmLabel: "Delete", danger: true, confirmIcon: "trash",
    });
    if (!ok) return;
    await remove("checklistTask", t.id);
    toast.ok("Task deleted.");
    await reload();
    refreshNavBadges();
  }

  async function seedDefault() {
    const existing = await getChecklistForEvent(eventId);
    if (existing.length > 0) {
      const ok = await confirm({
        title: "Seed default checklist",
        body: "This event already has tasks. Seed the default tasks in addition? You may want to delete duplicates afterwards.",
        confirmLabel: "Seed",
      });
      if (!ok) return;
    }
    await seedDefaultChecklist(eventId);
    toast.ok("Default checklist added.");
    await reload();
    refreshNavBadges();
  }

  const page = h("div.page",
    breadcrumb(ev),
    h("div.page-head",
      h("div.page-head-meta",
        h("div.row.gap-3", h("h1", "Soundcheck checklist"), h("span.badge.badge-neutral", "Preparation")),
        h("div.subtitle", `Preparation progress for ${ev.name}.`),
      ),
      h("div.page-head-actions",
        h("button.btn.btn-ghost", { onclick: () => navigate(`/events/${ev.id}`) }, icon("back", 14), "Back"),
        h("button.btn.btn-primary", { onclick: () => addTask() }, icon("plus", 14), "Add task"),
      ),
    ),
    h("div.alert.alert-warn",
      h(".alert-icon", icon("warn", 18)),
      h("div.grow",
        h("div.alert-title", "Checklist completion ≠ physical verification"),
        h("div.alert-body", "A completed checkbox records a planning step. It does not prove that the corresponding physical equipment, cable, or connection has been verified. Use channel and signal-flow verification states for that."),
      ),
    ),
    progressEl,
    listEl,
  );
  ctx.mount(page);
  await reload();
}

// === Cross-event checklist overview (Checklists nav item) ===

export async function renderOverview(ctx) {
  refreshActiveContext();
  refreshNavBadges();

  const events = (await getEvents()).filter(e => e.status !== "archived");
  const overview = [];
  for (const ev of events) {
    const tasks = await getChecklistForEvent(ev.id);
    const done = tasks.filter(t => t.completed).length;
    const total = tasks.length;
    overview.push({ ev, tasks, done, total });
  }
  overview.sort((a, b) => (a.ev.date || "9999").localeCompare(b.ev.date || "9999"));

  const page = h("div.page",
    h("div.page-head",
      h("div.page-head-meta",
        h("h1", "Checklists"),
        h("div.subtitle", "Cross-event preparation progress overview."),
      ),
    ),
    overview.length === 0
      ? h("div.card", emptyState({
          icon: "checklist", title: "No active events",
          body: "Create an event and start a preparation checklist to see progress here.",
          action: h("button.btn.btn-primary", { onclick: () => navigate("/events") }, icon("events", 14), "Open events"),
        }))
      : h("div.event-grid",
          overview.map(o => {
            const pct = o.total > 0 ? Math.round((o.done / o.total) * 100) : 0;
            return h("div.event-card",
              { onclick: () => navigate(`/events/${o.ev.id}/checklist`) },
              h("div.spread",
                h("div.event-card-title", o.ev.name),
                h("span.badge.badge-neutral", `${pct}%`),
              ),
              h("div.event-card-meta",
                h("div.meta-row", h("span.meta-label", "Date"), h("span", formatDate(o.ev.date) || "—")),
                h("div.meta-row", h("span.meta-label", "Tasks"), h("span", `${o.done} / ${o.total}`)),
              ),
              h("div.progress.mt-2",
                h(`div.progress-bar${pct === 100 ? ".ok" : pct < 50 ? ".warn" : ""}`, { style: { width: pct + "%" } }),
              ),
            );
          }),
        ),
  );
  ctx.mount(page);
}

function breadcrumb(ev) {
  return h("div.breadcrumb",
    h("a", { href: "#/", onclick: (e) => { e.preventDefault(); navigate("/"); } }, "Dashboard"),
    h("span.sep", "/"),
    h("a", { href: "#/events", onclick: (e) => { e.preventDefault(); navigate("/events"); } }, "Events"),
    h("span.sep", "/"),
    h("a", { href: `#/events/${ev.id}`, onclick: (e) => { e.preventDefault(); navigate(`/events/${ev.id}`); } }, ev.name),
    h("span.sep", "/"),
    h("span.current", "Checklist"),
  );
}
