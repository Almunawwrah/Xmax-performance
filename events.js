// views/events.js — list, create, edit, duplicate, archive, reopen events.
// Also renders the event detail page (workspace hub) — a single event page
// that links to all the audio workspace sub-pages.

import { h, icon, clear } from "../utils/dom.js";
import { ENTITIES, optionLabel } from "../models/schema.js";
import {
  list, get, create, update, remove, duplicateEvent,
  getWorkspaceForEvent, seedDefaultChecklist, getChecklistForEvent,
} from "../storage/repo.js";
import { validateRecord } from "../validation/validators.js";
import { modal, confirm, toast, statusBadge, emptyState, alert } from "../components/ui.js";
import { entityForm } from "../components/forms.js";
import { formatDate, relativeDate, daysFromToday } from "../utils/date.js";
import { navigate } from "../router.js";
import { setActiveEventId, refreshActiveContext, refreshNavBadges } from "../app.js";

// === List view ===

export async function renderList(ctx) {
  refreshActiveContext();
  refreshNavBadges();

  let filter = "all"; // all | upcoming | preparing | ready | live | completed | archived
  let search = "";

  const events = await list("event");
  const allEvents = events.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));

  async function refresh() {
    const filtered = allEvents.filter(e => {
      if (filter === "archived" && e.status !== "archived") return false;
      if (filter !== "all" && filter !== "archived" && e.status === "archived") return false;
      if (filter === "upcoming") {
        const d = daysFromToday(e.date);
        return d !== null && d >= 0 && d <= 14;
      }
      if (filter !== "all" && filter !== "upcoming" && e.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (e.name || "").toLowerCase().includes(q) ||
               (e.venue || "").toLowerCase().includes(q) ||
               (e.operator || "").toLowerCase().includes(q);
      }
      return true;
    });

    clear(gridEl);
    if (filtered.length === 0) {
      gridEl.appendChild(emptyState({
        icon: "events",
        title: search || filter !== "all" ? "No events match your filters" : "No events yet",
        body: search || filter !== "all"
          ? "Try changing the filter or search."
          : "Create your first event to begin building an audio workspace.",
        action: h("button.btn.btn-primary", { onclick: () => openEditor() }, icon("plus", 14), "New event"),
      }));
    } else {
      filtered.forEach(e => gridEl.appendChild(eventCard(e)));
    }
  }

  function eventCard(ev) {
    const archived = ev.status === "archived";
    return h("div.event-card" + (archived ? ".archived" : ""),
      { onclick: () => navigate(`/events/${ev.id}`) },
      h("div.spread",
        statusBadge(ev.status),
        ev.date ? h("span.badge.badge-neutral", relativeDate(ev.date)) : h("span.badge.badge-neutral", "No date"),
      ),
      h("div.event-card-title", ev.name + (archived ? " (archived)" : "")),
      h("div.event-card-meta",
        h("div.meta-row", h("span.meta-label", "Date"), h("span", formatDate(ev.date) || "—")),
        h("div.meta-row", h("span.meta-label", "Venue"), h("span", ev.venue || "—")),
        h("div.meta-row", h("span.meta-label", "Stage"), h("span", ev.stage || "—")),
        h("div.meta-row", h("span.meta-label", "Operator"), h("span", ev.operator || "—")),
        h("div.meta-row", h("span.meta-label", "Category"), h("span", optionLabel("event", "category", ev.category) || "—")),
      ),
      h("div.event-card-footer",
        h("div.row.gap-2",
          h("button.btn.btn-ghost.btn-sm",
            { onclick: (e) => { e.stopPropagation(); openEditor(ev); } },
            icon("edit", 12), "Edit",
          ),
          h("button.btn.btn-ghost.btn-sm",
            { onclick: (e) => { e.stopPropagation(); onDuplicate(ev); } },
            icon("duplicate", 12), "Duplicate",
          ),
        ),
        h("div.row.gap-2",
          archived
            ? h("button.btn.btn-ghost.btn-sm",
                { onclick: (e) => { e.stopPropagation(); onReopen(ev); } },
                icon("refresh", 12), "Reopen",
              )
            : h("button.btn.btn-ghost.btn-sm",
                { onclick: (e) => { e.stopPropagation(); onArchive(ev); } },
                icon("archive", 12), "Archive",
              ),
          h("button.btn.btn-danger.btn-sm",
            { onclick: (e) => { e.stopPropagation(); onDelete(ev); } },
            icon("trash", 12), "Delete",
          ),
        ),
      ),
    );
  }

  const gridEl = h("div.event-grid");

  const filterBtn = (label, key) => h("button.btn.btn-sm" + (filter === key ? ".btn-primary" : ".btn-ghost"),
    { onclick: () => { filter = key; updateFilterButtons(); refresh(); } },
    label);

  const filterBtns = [
    filterBtn("All", "all"),
    filterBtn("Upcoming", "upcoming"),
    filterBtn("Preparing", "preparing"),
    filterBtn("Ready", "ready"),
    filterBtn("Live", "live"),
    filterBtn("Completed", "completed"),
    filterBtn("Archived", "archived"),
  ];

  const filterContainer = h("div.row.wrap.gap-2", ...filterBtns);
  function updateFilterButtons() {
    filterContainer.querySelectorAll("button").forEach((b, i) => {
      const keys = ["all","upcoming","preparing","ready","live","completed","archived"];
      b.className = "btn btn-sm " + (filter === keys[i] ? "btn-primary" : "btn-ghost");
    });
  }

  const page = h("div.page",
    h("div.page-head",
      h("div.page-head-meta",
        h("h1", "Events"),
        h("div.subtitle", "Create, manage, and archive live audio events."),
      ),
      h("div.page-head-actions",
        h("button.btn.btn-primary", { onclick: () => openEditor() }, icon("plus", 14), "New event"),
      ),
    ),
    h("div.row.wrap.gap-3.mb-4",
      filterContainer,
      h("input.input.search", {
        type: "search", placeholder: "Search events…", value: "",
        oninput: (e) => { search = e.target.value; refresh(); },
      }),
    ),
    gridEl,
  );

  ctx.mount(page);
  refresh();
}

// === Create / edit dialog ===

function openEditor(existing = null) {
  const isEdit = !!existing;
  const form = entityForm("event", existing || {}, { columns: 2 });

  const m = modal({
    title: isEdit ? "Edit event" : "New event",
    size: "lg",
    body: form.el,
    footer: h("div.row",
      h("button.btn.btn-ghost", { onclick: () => m.close() }, "Cancel"),
      h("button.btn.btn-primary", {
        onclick: async () => {
          const data = form.getData();
          const v = validateRecord("event", data);
          if (!v.valid) {
            form.setErrors(v.errors);
            toast.danger("Please fix the highlighted fields.");
            return;
          }
          if (v.warnings.length) {
            // advisory only
            toast.warn("Heads up", v.warnings[0]);
          }
          try {
            let saved;
            if (isEdit) {
              saved = await update("event", existing.id, data);
              toast.ok("Event updated.");
            } else {
              saved = await create("event", data);
              // seed default checklist automatically
              await seedDefaultChecklist(saved.id);
              toast.ok("Event created.", "A default preparation checklist has been added.");
            }
            m.close();
            setActiveEventId(saved.id);
            refreshActiveContext();
            refreshNavBadges();
            navigate(`/events/${saved.id}`);
          } catch (err) {
            toast.danger("Save failed", err.message);
          }
        },
      }, icon("check", 14), isEdit ? "Save changes" : "Create event"),
    ),
  });
}

async function onDuplicate(ev) {
  const ok = await confirm({
    title: "Duplicate event",
    body: `Create a copy of "${ev.name}"? The copy will include its workspaces, inputs, channels, outputs, signal routing, equipment allocations, and checklist.`,
    confirmLabel: "Duplicate",
  });
  if (!ok) return;
  try {
    const dup = await duplicateEvent(ev.id);
    toast.ok("Event duplicated", `Created "${dup.name}".`);
    refreshNavBadges();
    navigate(`/events/${dup.id}`);
  } catch (err) {
    toast.danger("Duplication failed", err.message);
  }
}

async function onArchive(ev) {
  const ok = await confirm({
    title: "Archive event",
    body: `Archive "${ev.name}"? Archived events are hidden from active lists but can be reopened. This does NOT delete any data.`,
    confirmLabel: "Archive",
  });
  if (!ok) return;
  await update("event", ev.id, { status: "archived" });
  toast.ok("Event archived.");
  refreshNavBadges();
  // Re-render by re-navigating to the same route
  navigate("/events");
}

async function onReopen(ev) {
  await update("event", ev.id, { status: "preparing" });
  toast.ok("Event reopened.", "Status set to Preparing.");
  refreshNavBadges();
  navigate("/events");
}

async function onDelete(ev) {
  const ok = await confirm({
    title: "Delete event permanently",
    body: h("div",
      h("p", `This will permanently delete "${ev.name}" and all of its associated records:`),
      h("ul.muted.mt-2",
        h("li", "Audio workspaces"),
        h("li", "Inputs, mixer channels, signal connections, outputs"),
        h("li", "Equipment allocations for this event"),
        h("li", "Preparation checklist"),
      ),
      h("p.mt-3", "The equipment inventory itself is not affected."),
    ),
    confirmLabel: "Delete permanently",
    danger: true,
    confirmIcon: "trash",
  });
  if (!ok) return;
  try {
    await remove("event", ev.id);
    toast.ok("Event deleted.");
    refreshNavBadges();
    navigate("/events");
  } catch (err) {
    toast.danger("Delete failed", err.message);
  }
}

// === Event detail (workspace hub) ===

export async function renderDetail(ctx) {
  const { id } = ctx.params;
  const ev = await get("event", id);
  if (!ev) {
    ctx.mount(h("div.empty-state",
      h(".empty-state-icon", icon("warn", 32)),
      h("div.empty-state-title", "Event not found"),
      h("div.empty-state-body", "It may have been deleted."),
      h("button.btn.btn-primary", { onclick: () => navigate("/events") }, "Back to events"),
    ));
    return;
  }

  setActiveEventId(ev.id);
  refreshActiveContext();
  refreshNavBadges();

  // Load workspaces + checklist progress
  const workspaces = await getWorkspaceForEvent(ev.id);
  const checklist = await getChecklistForEvent(ev.id);
  const completedTasks = checklist.filter(t => t.completed).length;
  const totalTasks = checklist.length;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const page = h("div.page",
    breadcrumb(ev),
    h("div.page-head",
      h("div.page-head-meta",
        h("div.row.gap-3", h("h1", ev.name), statusBadge(ev.status)),
        h("div.subtitle",
          ev.venue || "No venue set",
          " · ",
          ev.date ? formatDate(ev.date) : "No date",
          ev.operator ? ` · ${ev.operator}` : "",
        ),
      ),
      h("div.page-head-actions",
        h("button.btn.btn-ghost", { onclick: () => openEditor(ev) }, icon("edit", 14), "Edit"),
        h("button.btn.btn-ghost", { onclick: () => onDuplicate(ev) }, icon("duplicate", 14), "Duplicate"),
        h("button.btn.btn-primary", { onclick: () => createWorkspace(ev) }, icon("plus", 14), "New workspace"),
      ),
    ),

    // Event summary cards
    h("div.grid.grid-4.mb-6",
      h("div.card",
        h("div.stat",
          h("div.stat-label", "Workspaces"),
          h("div.stat-value", String(workspaces.length)),
          h("div.stat-sub", workspaces.length === 0 ? "No workspaces yet" : "Across this event"),
        ),
      ),
      h("div.card",
        h("div.stat",
          h("div.stat-label", "Checklist progress"),
          h("div.stat-value", `${progress}%`),
          h("div.progress.mt-2",
            h(`div.progress-bar${progress === 100 ? ".ok" : progress < 50 ? ".warn" : ""}`,
              { style: { width: progress + "%" } },
            ),
          ),
          h("div.stat-sub", `${completedTasks} / ${totalTasks} tasks complete`),
        ),
      ),
      h("div.card",
        h("div.stat",
          h("div.stat-label", "Date"),
          h("div.stat-value", ev.date ? formatDate(ev.date, { day: "2-digit", month: "short" }).split(",")[0] : "—"),
          h("div.stat-sub", ev.date ? relativeDate(ev.date) : "No date set"),
        ),
      ),
      h("div.card",
        h("div.stat",
          h("div.stat-label", "Venue"),
          h("div.stat-value", { style: { fontSize: "var(--fs-lg)" } }, ev.venue || "—"),
          h("div.stat-sub", ev.stage || "No stage / room"),
        ),
      ),
    ),

    // Notes (if present)
    ev.notes ? h("div.card.mb-6",
      h("div.card-header", h("div.card-title", "Team notes")),
      h("div.muted", { style: { whiteSpace: "pre-wrap" } }, ev.notes),
    ) : null,

    // Workspaces list
    h("div.section-head",
      h("h2", "Audio workspaces"),
      h("div.section-head-actions",
        h("button.btn.btn-primary.btn-sm", { onclick: () => createWorkspace(ev) }, icon("plus", 14), "New workspace"),
      ),
    ),
    workspaces.length === 0
      ? h("div.card",
          emptyState({
            icon: "workspace",
            title: "No audio workspaces yet",
            body: "A workspace holds the input list, mixer channels, signal flow, and outputs for a position (e.g. FOH, Monitors, Broadcast).",
            action: h("button.btn.btn-primary", { onclick: () => createWorkspace(ev) }, icon("plus", 14), "Create workspace"),
          }),
        )
      : h("div.event-grid",
          workspaces.map(ws => workspaceCard(ev, ws)),
        ),

    // Quick links to other sections
    h("div.section-head.mt-6",
      h("h2", "Event sections"),
    ),
    h("div.grid.grid-3",
      quickLink("equipment", "Equipment allocation", "Required, prepared, returned quantities", `/events/${ev.id}/equipment`),
      quickLink("checklist", "Soundcheck checklist", "Preparation progress and tasks", `/events/${ev.id}/checklist`),
      quickLink("live", "Live event reference", "Large-label operational view", `/events/${ev.id}/live`),
      quickLink("documents", "Technical documents", "Printable sheets and exports", `/events/${ev.id}/documents`),
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
    h("span.current", ev.name),
  );
}

function workspaceCard(ev, ws) {
  return h("div.event-card",
    { onclick: () => navigate(`/events/${ev.id}/workspace/${ws.id}/inputs`) },
    h("div.spread",
      h("div.row.gap-2", icon("workspace", 16), h("div.event-card-title", ws.workspaceName)),
      h("span.badge.badge-neutral", ws.mixerDescription ? "Mixer" : "No mixer"),
    ),
    h("div.event-card-meta",
      h("div.meta-row", h("span.meta-label", "Mixer"), h("span", ws.mixerDescription || "—")),
      h("div.meta-row", h("span.meta-label", "Channels"), h("span", String(ws.channelCount || 0))),
    ),
    ws.configurationNotes ? h("div.muted", { style: { fontSize: "var(--fs-sm)", whiteSpace: "pre-wrap" } }, ws.configurationNotes) : null,
    h("div.event-card-footer",
      h("div.row.gap-2",
        workspaceNav(ev, ws, "inputs"),
        workspaceNav(ev, ws, "channels"),
        workspaceNav(ev, ws, "signal"),
        workspaceNav(ev, ws, "outputs"),
      ),
      h("button.btn.btn-ghost.btn-sm",
        { onclick: (e) => { e.stopPropagation(); editWorkspace(ev, ws); } },
        icon("edit", 12), "Edit",
      ),
    ),
  );
}

function workspaceNav(ev, ws, page) {
  const labels = { inputs: "Inputs", channels: "Channels", signal: "Signal", outputs: "Outputs" };
  return h("a.btn.btn-ghost.btn-sm",
    { href: `#/events/${ev.id}/workspace/${ws.id}/${page}`, onclick: (e) => { e.stopPropagation(); e.preventDefault(); navigate(`/events/${ev.id}/workspace/${ws.id}/${page}`); } },
    labels[page],
  );
}

function quickLink(iconName, title, subtitle, target) {
  return h("a.quick-action",
    { href: "#" + target, onclick: (e) => { e.preventDefault(); navigate(target); } },
    h("div.quick-action-icon", icon(iconName, 18)),
    h("div.quick-action-title", title),
    h("div.quick-action-sub", subtitle),
  );
}

// === Workspace create / edit ===

async function createWorkspace(ev) {
  const form = entityForm("workspace", { workspaceName: "FOH", channelCount: 32 }, { columns: 1 });

  const m = modal({
    title: "New audio workspace",
    size: "md",
    body: h("div",
      form.el,
      h("div.field",
        h("label.field-label", "Seed empty channel strips?"),
        h("div.checkbox-row",
          (() => {
            const cb = h("input", { type: "checkbox", id: "seed-channels", checked: true });
            return cb;
          })(),
          h("label", { for: "seed-channels" }, `Create ${32} empty channel strips now (recommended)`),
        ),
        h("div.field-hint", "You can edit, add, or remove channels later."),
      ),
    ),
    footer: h("div.row",
      h("button.btn.btn-ghost", { onclick: () => m.close() }, "Cancel"),
      h("button.btn.btn-primary", {
        onclick: async () => {
          const data = form.getData();
          data.eventId = ev.id;
          const v = validateRecord("workspace", data);
          if (!v.valid) {
            form.setErrors(v.errors);
            toast.danger("Please fix the highlighted fields.");
            return;
          }
          try {
            const ws = await create("workspace", data);
            const seedCb = document.getElementById("seed-channels");
            if (seedCb?.checked && data.channelCount) {
              for (let i = 1; i <= data.channelCount; i++) {
                await create("channel", { workspaceId: ws.id, channelNumber: i, label: `CH ${i}` });
              }
              toast.ok("Workspace created", `Seeded ${data.channelCount} empty channel strips.`);
            } else {
              toast.ok("Workspace created.");
            }
            m.close();
            navigate(`/events/${ev.id}/workspace/${ws.id}/inputs`);
          } catch (err) {
            toast.danger("Save failed", err.message);
          }
        },
      }, icon("check", 14), "Create workspace"),
    ),
  });
}

async function editWorkspace(ev, ws) {
  const form = entityForm("workspace", ws, { columns: 1 });

  const m = modal({
    title: "Edit workspace",
    size: "md",
    body: form.el,
    footer: h("div.row",
      h("button.btn.btn-ghost", { onclick: () => m.close() }, "Cancel"),
      h("button.btn.btn-primary", {
        onclick: async () => {
          const data = form.getData();
          const v = validateRecord("workspace", data);
          if (!v.valid) {
            form.setErrors(v.errors);
            toast.danger("Please fix the highlighted fields.");
            return;
          }
          try {
            await update("workspace", ws.id, data);
            toast.ok("Workspace updated.");
            m.close();
            navigate(`/events/${ev.id}`);
          } catch (err) {
            toast.danger("Save failed", err.message);
          }
        },
      }, icon("check", 14), "Save changes"),
    ),
  });
}

export { openEditor };
