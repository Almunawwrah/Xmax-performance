// views/dashboard.js — overview: upcoming events, recent workspaces, incomplete tasks, quick actions.

import { h, mount, icon } from "../utils/dom.js";
import { getEvents, getWorkspaceForEvent, getChecklistForEvent } from "../storage/repo.js";
import { daysFromToday, formatDate, relativeDate } from "../utils/date.js";
import { statusBadge } from "../components/ui.js";
import { navigate, currentPath } from "../router.js";
import { refreshNavBadges, refreshActiveContext } from "../app.js";

export async function render(ctx) {
  refreshActiveContext();
  refreshNavBadges();

  const events = await getEvents();
  const activeEvents = events.filter(e => e.status !== "archived");

  // Upcoming: sorted by date asc, future only (today onwards)
  const upcoming = activeEvents
    .filter(e => e.date)
    .map(e => ({ ev: e, d: daysFromToday(e.date) }))
    .filter(x => x.d !== null && x.d >= 0)
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);

  // Recent workspaces (by updatedAt desc across all events)
  const workspacesByEvent = [];
  for (const ev of activeEvents) {
    const ws = await getWorkspaceForEvent(ev.id);
    for (const w of ws) {
      workspacesByEvent.push({ ev, ws: w, updatedAt: w.updatedAt || w.createdAt });
    }
  }
  workspacesByEvent.sort((a, b) => b.updatedAt - a.updatedAt);
  const recentWorkspaces = workspacesByEvent.slice(0, 5);

  // Incomplete tasks count across all events
  let incompleteTotal = 0;
  const incompleteByEvent = [];
  for (const ev of activeEvents) {
    const tasks = await getChecklistForEvent(ev.id);
    const incomplete = tasks.filter(t => !t.completed).length;
    incompleteTotal += incomplete;
    if (incomplete > 0) incompleteByEvent.push({ ev, count: incomplete });
  }
  incompleteByEvent.sort((a, b) => b.count - a.count);

  const page = h("div.page",
    pageHead(),
    upcomingSection(upcoming),
    h("div.grid.grid-2",
      recentWorkspacesSection(recentWorkspaces),
      incompleteSection(incompleteByEvent, incompleteTotal),
    ),
    quickActionsSection(),
  );
  ctx.mount(page);
}

function pageHead() {
  return h("div.page-head",
    h("div.page-head-meta",
      h("h1", "Dashboard"),
      h("div.subtitle", "Operational overview — what's next, what's pending."),
    ),
    h("div.page-head-actions",
      h("button.btn.btn-primary",
        { onclick: () => navigate("/events") },
        icon("plus", 14), "New event",
      ),
    ),
  );
}

function upcomingSection(upcoming) {
  let body;
  if (upcoming.length === 0) {
    body = h("div.card",
      h("div.muted", "No upcoming events scheduled. "),
      h("button.btn.btn-ghost.btn-sm.mt-3", { onclick: () => navigate("/events") }, "Open Events list →"),
    );
  } else {
    body = h("div.event-grid",
      upcoming.map(({ ev, d }) => h("div.event-card",
        { onclick: () => navigate(`/events/${ev.id}`) },
        h("div.spread",
          statusBadge(ev.status),
          h("span.badge.badge-neutral", relativeDate(ev.date)),
        ),
        h("div.event-card-title", ev.name),
        h("div.event-card-meta",
          h("div.meta-row", h("span.meta-label", "Date"), h("span", formatDate(ev.date))),
          h("div.meta-row", h("span.meta-label", "Venue"), h("span", ev.venue || "—")),
          h("div.meta-row", h("span.meta-label", "Operator"), h("span", ev.operator || "—")),
        ),
      )),
    );
  }
  return h("div.dash-section",
    h("h2", "Upcoming events"),
    body,
  );
}

function recentWorkspacesSection(recentWorkspaces) {
  let body;
  if (recentWorkspaces.length === 0) {
    body = h("div.card",
      h("div.muted", "No workspaces yet. Open an event and create one."),
    );
  } else {
    body = h("div.recent-list",
      recentWorkspaces.map(({ ev, ws }) => h("div.recent-item",
        { onclick: () => navigate(`/events/${ev.id}`) },
        h("div.recent-item-meta",
          h("div.recent-item-title", ws.workspaceName),
          h("div.recent-item-sub", `${ev.name} · ${ws.mixerDescription || "No mixer description"}`),
        ),
        h("div.row.gap-2",
          h("span.badge.badge-neutral", ev.name.slice(0, 30) + (ev.name.length > 30 ? "…" : "")),
        ),
      )),
    );
  }
  return h("div.dash-section",
    h("h2", "Recently edited workspaces"),
    body,
  );
}

function incompleteSection(byEvent, total) {
  let body;
  if (total === 0) {
    body = h("div.card",
      h("div.row.gap-2",
        icon("ok", 18),
        h("div", h("strong", "All tasks complete"), h("div.muted", "Preparation checklist is empty across all events.")),
      ),
    );
  } else {
    body = h("div.col",
      h("div.stat",
        h("div.stat-label", "Incomplete tasks"),
        h("div.stat-value.warn", String(total)),
      ),
      h("div.recent-list.mt-3",
        byEvent.slice(0, 5).map(({ ev, count }) => h("div.recent-item",
          { onclick: () => navigate(`/events/${ev.id}/checklist`) },
          h("div.recent-item-meta",
            h("div.recent-item-title", ev.name),
            h("div.recent-item-sub", `${count} pending ${count === 1 ? "task" : "tasks"}`),
          ),
          icon("chevronRight", 16),
        )),
      ),
    );
  }
  return h("div.dash-section",
    h("h2", "Incomplete preparation"),
    body,
  );
}

function quickActionsSection() {
  const actions = [
    { icon: "events", title: "New event", sub: "Create a new event", target: "/events" },
    { icon: "equipment", title: "Equipment inventory", sub: "Manage mics, cables, DI boxes", target: "/equipment" },
    { icon: "documents", title: "Documents", sub: "Print channel sheets & input lists", target: "/documents" },
    { icon: "settings", title: "Settings", sub: "Backup, restore, reset", target: "/settings" },
  ];
  return h("div.dash-section",
    h("h2", "Quick actions"),
    h("div.quick-actions",
      actions.map(a => h("a.quick-action",
        { href: "#" + a.target, onclick: (e) => { e.preventDefault(); navigate(a.target); } },
        h("div.quick-action-icon", icon(a.icon, 18)),
        h("div.quick-action-title", a.title),
        h("div.quick-action-sub", a.sub),
      )),
    ),
  );
}
