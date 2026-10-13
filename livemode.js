// views/livemode.js — focused operational view for use during the performance.
// Read-only. Large labels. Quick navigation between sections.

import { h, icon, clear } from "../utils/dom.js";
import {
  get, getWorkspaceForEvent, getInputsForWorkspace,
  getChannelsForWorkspace, getOutputsForWorkspace, getSignalForWorkspace,
} from "../storage/repo.js";
import { optionLabel } from "../models/schema.js";
import { checkStatusBadge, verificationBadge, emptyState, alert } from "../components/ui.js";
import { formatDate } from "../utils/date.js";
import { navigate } from "../router.js";
import { refreshActiveContext } from "../app.js";

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

  const workspaces = await getWorkspaceForEvent(eventId);
  let activeWsId = workspaces[0]?.id || null;

  // Pick default workspace via query param if provided
  if (ctx.query.ws) activeWsId = ctx.query.ws;

  let state = { ws: null, channels: [], inputs: [], outputs: [], signal: [] };

  async function loadWorkspace(wsId) {
    activeWsId = wsId;
    state.ws = workspaces.find(w => w.id === wsId);
    state.inputs = await getInputsForWorkspace(wsId);
    state.channels = (await getChannelsForWorkspace(wsId)).sort((a,b) => a.channelNumber - b.channelNumber);
    state.outputs = await getOutputsForWorkspace(wsId);
    state.signal = await getSignalForWorkspace(wsId);
    renderBody();
  }

  const bodyEl = h("div.col.gap-4");

  function renderBody() {
    clear(bodyEl);
    // Warnings — channels with problems
    const problemCh = state.channels.filter(c => c.checkStatus === "problem");
    if (problemCh.length > 0) {
      bodyEl.appendChild(h("div.alert.alert-danger",
        h(".alert-icon", icon("danger", 18)),
        h("div.grow",
          h("div.alert-title", `${problemCh.length} channel(s) flagged as problem`),
          h("div.alert-body", problemCh.map(c => `${c.channelNumber}: ${c.label}`).join(" · ")),
        ),
      ));
    }

    // Warnings — inputs with special handling notes / mute notes
    const muteNotes = state.inputs.filter(i => i.muteNotes);
    if (muteNotes.length > 0) {
      bodyEl.appendChild(h("div.alert.alert-warn",
        h(".alert-icon", icon("warn", 18)),
        h("div.grow",
          h("div.alert-title", "Special handling / mute notes"),
          h("div.alert-body", muteNotes.map(i => `${i.sourceName}: ${i.muteNotes}`).join(" · ")),
        ),
      ));
    }

    // Channel grid (large labels)
    if (state.channels.length === 0) {
      bodyEl.appendChild(h("div.empty-state",
        h(".empty-state-icon", icon("channels", 28)),
        h("div.empty-state-title", "No channels"),
        h("div.empty-state-body", "Open the workspace to add channels."),
      ));
    } else {
      bodyEl.appendChild(h("div.section-head", h("h2", "Channels")));
      const grid = h("div.live-grid");
      for (const ch of state.channels) {
        const input = state.inputs.find(i => i.id === ch.inputId);
        const cls = ["live-channel"];
        if (ch.checkStatus === "problem") cls.push("row-selected");
        grid.appendChild(h("div." + cls.join("."),
          h("div.row-gap-3",
            h("span.live-channel-num", String(ch.channelNumber)),
            checkStatusBadge(ch.checkStatus),
          ),
          h("div.live-channel-label", ch.label || "—"),
          input ? h("div.live-channel-source", `${input.sourceName}`) : null,
          ch.muteGroup ? h("div.dim", { style: { fontSize: "var(--fs-sm)" } }, `Mute grp: ${ch.muteGroup}`) : null,
          ch.busAssignments ? h("div.dim", { style: { fontSize: "var(--fs-sm)" } }, `Buses: ${ch.busAssignments}`) : null,
          ch.checkStatus === "problem" ? h("div.live-channel-warn", "Problem — verify") : null,
        ));
      }
      bodyEl.appendChild(grid);
    }

    // Outputs
    if (state.outputs.length > 0) {
      bodyEl.appendChild(h("div.section-head", h("h2", "Outputs & monitors")));
      const outGrid = h("div.live-grid");
      for (const o of state.outputs) {
        outGrid.appendChild(h("div.live-channel",
          h("div.row-gap-3",
            h("span.live-channel-num", { style: { fontSize: "var(--live-fs-base)", color: "var(--accent)" } }, optionLabel("output", "outputType", o.outputType).slice(0, 4).toUpperCase()),
            verificationBadge(o.connectionStatus),
          ),
          h("div.live-channel-label", o.name),
          o.destination ? h("div.live-channel-source", o.destination) : null,
          o.sourceBus ? h("div.dim", { style: { fontSize: "var(--fs-sm)" } }, `Bus: ${o.sourceBus}`) : null,
        ));
      }
      bodyEl.appendChild(outGrid);
    }

    // Quick signal reference
    if (state.signal.length > 0) {
      bodyEl.appendChild(h("div.section-head", h("h2", "Signal reference")));
      bodyEl.appendChild(h("div.col",
        state.signal.map(c => h("div.signal-chain",
          h("div.signal-chain-path",
            h("span.signal-node", c.sourceLabel),
            c.viaLabel ? [h("span.signal-arrow", "→"), h("span.signal-node", c.viaLabel)] : null,
            h("span.signal-arrow", "→"),
            h("span.signal-node", c.destinationLabel),
          ),
          h("div.row.gap-3", verificationBadge(c.verificationStatus)),
        )),
      ));
    }
  }

  // Workspace switcher (if more than one workspace)
  const wsSwitcher = workspaces.length > 1
    ? h("div.row.gap-2",
        ...workspaces.map(w => h("button.btn.btn-sm" + (activeWsId === w.id ? ".btn-primary" : ".btn-ghost"),
          { onclick: () => loadWorkspace(w.id) }, w.workspaceName)),
      )
    : null;

  const headEl = h("div.live-head",
    h("div.col",
      h("div.live-title", ev.name),
      h("div.live-subtitle",
        ev.venue || "No venue",
        " · ",
        ev.date ? formatDate(ev.date) : "No date",
        ev.operator ? ` · Operator: ${ev.operator}` : "",
      ),
      wsSwitcher,
    ),
    h("div.row.gap-2",
      h("button.btn.btn-ghost.btn-lg", { onclick: () => navigate(`/events/${ev.id}`) }, icon("back", 16), "Exit live mode"),
      h("button.btn.btn-ghost.btn-lg", { onclick: () => navigate(`/events/${ev.id}/documents`) }, icon("documents", 16), "Documents"),
    ),
  );

  const page = h("div.page.live-mode",
    headEl,
    h("div.alert.alert-info",
      h(".alert-icon", icon("info", 18)),
      h("div.grow",
        h("div.alert-title", "Live reference mode"),
        h("div.alert-body", "This is a documentation and navigation view. It does not control any audio hardware."),
      ),
    ),
    bodyEl,
  );

  ctx.mount(page);

  if (workspaces.length === 0) {
    bodyEl.appendChild(emptyState({
      icon: "live", title: "No workspaces for this event",
      body: "Create a workspace first to use live reference mode.",
      action: h("button.btn.btn-primary", { onclick: () => navigate(`/events/${ev.id}`) }, "Back to event"),
    }));
    return;
  }
  await loadWorkspace(activeWsId);
}
