// views/equipment.js — equipment inventory + event equipment allocation + cables/accessories.

import { h, icon, clear } from "../utils/dom.js";
import {
  list, get, create, update, remove,
  getAllocationsForEvent, getChecklistForEvent,
} from "../storage/repo.js";
import { ENTITIES, optionLabel } from "../models/schema.js";
import { validateRecord, checkEquipmentAvailability } from "../validation/validators.js";
import { modal, confirm, toast, emptyState, alert, statusBadge } from "../components/ui.js";
import { entityForm } from "../components/forms.js";
import { dataTable, searchFilter } from "../components/tables.js";
import { formatDate, daysFromToday, relativeDate } from "../utils/date.js";
import { navigate } from "../router.js";
import { refreshActiveContext, refreshNavBadges } from "../app.js";

// === Inventory view (global, no event context) ===

export async function renderInventory(ctx) {
  refreshActiveContext();
  refreshNavBadges();

  let search = "";
  let categoryFilter = "all";
  let state = { items: [] };

  async function reload() {
    state.items = (await list("equipment")).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    renderTable();
  }

  let tableCtl;

  function renderTable() {
    const q = search.toLowerCase().trim();
    const filtered = state.items.filter(it => {
      if (categoryFilter !== "all" && it.category !== categoryFilter) return false;
      return !q || searchFilter(q, ["name", "model", "code", "storageLocation", "maintenanceNotes"])(it);
    });

    const columns = [
      { key: "name", label: "Name", sortable: true, render: r => h("div",
        h("div", { style: { fontWeight: 500 } }, r.name),
        h("div.dim", { style: { fontSize: "11px" } }, r.code ? `Code: ${r.code}` : "No code"),
      ) },
      { key: "category", label: "Category", sortable: true, render: r => h("span.badge.badge-neutral", optionLabel("equipment", "category", r.category)) },
      { key: "model", label: "Manufacturer / model", sortable: true, render: r => r.model || "—" },
      { key: "quantity", label: "Qty", sortable: true, align: "right", mono: true, render: r => h("span.mono", String(r.quantity)) },
      { key: "condition", label: "Condition", sortable: true, render: r => {
        const cls = r.condition === "needs-repair" ? "badge-danger" : r.condition === "retired" ? "badge-neutral" : r.condition === "fair" ? "badge-warn" : "badge-ok";
        return h(`span.badge.${cls}`, optionLabel("equipment", "condition", r.condition));
      } },
      { key: "storageLocation", label: "Storage", sortable: true, render: r => r.storageLocation || "—" },
      { key: "_actions", label: "", sortable: false, width: "90px", render: r => h("div.row.gap-1",
        h("button.btn.btn-ghost.btn-icon.btn-sm", { onclick: (e) => { e.stopPropagation(); openEditor(r); } }, icon("edit", 14)),
        h("button.btn.btn-danger.btn-ghost.btn-icon.btn-sm", { onclick: (e) => { e.stopPropagation(); onDelete(r); } }, icon("trash", 14)),
      ) },
    ];

    tableCtl = dataTable({ columns, rows: filtered, onRowClick: (r) => openEditor(r) });
    clear(tableWrapEl);
    tableWrapEl.appendChild(tableCtl.el);
  }

  const tableWrapEl = h("div");

  async function openEditor(existing = null) {
    const isEdit = !!existing;
    const form = entityForm("equipment", existing || { quantity: 1 }, { columns: 2 });

    const m = modal({
      title: isEdit ? `Edit: ${existing.name}` : "New equipment item",
      size: "lg",
      body: form.el,
      footer: h("div.row",
        h("button.btn.btn-ghost", { onclick: () => m.close() }, "Cancel"),
        h("button.btn.btn-primary", {
          onclick: async () => {
            const data = form.getData();
            const v = validateRecord("equipment", data);
            if (!v.valid) {
              form.setErrors(v.errors);
              toast.danger("Please fix the highlighted fields.");
              return;
            }
            try {
              if (isEdit) await update("equipment", existing.id, data);
              else await create("equipment", data);
              toast.ok(isEdit ? "Equipment updated." : "Equipment added.");
              m.close();
              await reload();
              refreshNavBadges();
            } catch (err) {
              toast.danger("Save failed", err.message);
            }
          },
        }, icon("check", 14), isEdit ? "Save changes" : "Add item"),
      ),
    });
  }

  async function onDelete(item) {
    // Check if it has allocations
    const allAllocs = [];
    const events = await list("event");
    for (const ev of events) {
      const allocs = await getAllocationsForEvent(ev.id);
      allAllocs.push(...allocs.filter(a => a.equipmentId === item.id));
    }
    const ok = await confirm({
      title: "Delete equipment item",
      body: allAllocs.length > 0
        ? `"${item.name}" is allocated to ${allAllocs.length} event(s). Deleting the inventory item will remove those allocation records. The events themselves are not affected.`
        : `Delete "${item.name}" from the inventory?`,
      confirmLabel: "Delete", danger: true, confirmIcon: "trash",
    });
    if (!ok) return;
    await remove("equipment", item.id);
    toast.ok("Equipment deleted.");
    await reload();
    refreshNavBadges();
  }

  // === Page assembly ===
  const categories = ENTITIES.equipment.fields.find(f => f.name === "category").options;
  const catBtns = [
    h("button.btn.btn-sm.btn-primary", { onclick: () => { categoryFilter = "all"; updateCatBtns(); renderTable(); } }, "All"),
    ...categories.map(c => h("button.btn.btn-sm.btn-ghost", {
      "data-cat": c.value,
      onclick: () => { categoryFilter = c.value; updateCatBtns(); renderTable(); },
    }, c.label)),
  ];
  function updateCatBtns() {
    const arr = catBtns;
    arr.forEach((b) => {
      const val = b.getAttribute("data-cat") || "all";
      b.className = "btn btn-sm " + (categoryFilter === val ? "btn-primary" : "btn-ghost");
    });
  }

  const page = h("div.page",
    h("div.page-head",
      h("div.page-head-meta",
        h("h1", "Equipment inventory"),
        h("div.subtitle", "Microphones, DI boxes, mixers, cables, stands — and their condition and storage location."),
      ),
      h("div.page-head-actions",
        h("button.btn.btn-primary", { onclick: () => openEditor() }, icon("plus", 14), "Add item"),
      ),
    ),
    h("div.alert.alert-info",
      h(".alert-icon", icon("info", 18)),
      h("div.grow",
        h("div.alert-title", "Inventory ≠ event allocation"),
        h("div.alert-body", "The inventory records what you own. To assign equipment to a specific event, open the event and use its Equipment section."),
      ),
    ),
    h("div.row.wrap.gap-3.mb-4", h("div.row.wrap.gap-2", ...catBtns),
      h("input.input.search", {
        type: "search", placeholder: "Search inventory…",
        oninput: (e) => { search = e.target.value; renderTable(); },
      }),
    ),
    tableWrapEl,
  );
  ctx.mount(page);
  await reload();
}

// === Event allocation view ===

export async function renderEvent(ctx) {
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

  let state = { items: [], allocations: [], availabilityMap: new Map() };

  async function reload() {
    state.items = (await list("equipment")).sort((a,b) => (a.name||"").localeCompare(b.name||""));
    state.allocations = await getAllocationsForEvent(eventId);
    // Compute availability for each allocation
    state.availabilityMap = new Map();
    for (const a of state.allocations) {
      const avail = await checkEquipmentAvailability(a.equipmentId, a.requiredQuantity);
      state.availabilityMap.set(a.id, avail);
    }
    renderList();
    renderStats();
  }

  const statsEl = h("div.grid.grid-4.mb-4");
  function renderStats() {
    clear(statsEl);
    const total = state.allocations.length;
    const ready = state.allocations.filter(a => a.status === "ready").length;
    const needed = state.allocations.filter(a => a.status === "needed").length;
    const problem = state.allocations.filter(a => a.status === "problem").length;
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Allocated items"), h("div.stat-value", String(total)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Needed"), h("div.stat-value" + (needed ? ".warn" : ""), String(needed)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Ready"), h("div.stat-value.ok", String(ready)))));
    statsEl.appendChild(h("div.card", h("div.stat", h("div.stat-label", "Problems"), h("div.stat-value" + (problem ? ".danger" : ""), String(problem)))));
  }

  const allocListEl = h("div.col");

  function renderList() {
    clear(allocListEl);
    if (state.allocations.length === 0) {
      allocListEl.appendChild(emptyState({
        icon: "equipment", title: "No equipment allocated to this event",
        body: "Use the button below to allocate equipment from your inventory.",
        action: h("button.btn.btn-primary", { onclick: () => addAllocation() }, icon("plus", 14), "Allocate equipment"),
      }));
      return;
    }
    // Header row
    allocListEl.appendChild(h("div.alloc-row.header",
      h("div", "Equipment"),
      h("div.text-right", "Required"),
      h("div.text-right", "Prepared"),
      h("div.text-right", "Returned"),
      h("div", "Status / assignment"),
      h("div", "Availability"),
    ));
    for (const a of state.allocations) {
      const item = state.items.find(i => i.id === a.equipmentId);
      const avail = state.availabilityMap.get(a.id);
      const isShort = avail && avail.shortage > 0;
      allocListEl.appendChild(h("div.alloc-row",
        h("div",
          h("div", { style: { fontWeight: 500 } }, item ? item.name : "— (item deleted)"),
          h("div.dim", { style: { fontSize: "11px" } }, item ? `${optionLabel("equipment", "category", item.category)} · ${item.model || "No model"}` : ""),
        ),
        h("input.input.alloc-input", { type: "number", min: "0", value: String(a.requiredQuantity),
          onchange: async (e) => {
            const v = Number(e.target.value);
            await update("eventEquipment", a.id, { requiredQuantity: v });
            toast.ok("Updated.");
            reload();
          } }),
        h("input.input.alloc-input", { type: "number", min: "0", value: String(a.preparedQuantity),
          onchange: async (e) => {
            const v = Number(e.target.value);
            await update("eventEquipment", a.id, { preparedQuantity: v });
            await reload();
          } }),
        h("input.input.alloc-input", { type: "number", min: "0", value: String(a.returnedQuantity || 0),
          onchange: async (e) => {
            const v = Number(e.target.value);
            await update("eventEquipment", a.id, { returnedQuantity: v });
            await reload();
          } }),
        h("div.col",
          h("select.select.select-sm", { style: { height: "26px", fontSize: "12px" },
            onchange: async (e) => {
              await update("eventEquipment", a.id, { status: e.target.value });
              await reload();
            },
          }, ...ENTITIES.eventEquipment.fields.find(f => f.name === "status").options.map(o =>
            h("option", { value: o.value, selected: o.value === a.status }, o.label),
          )),
          h("input.input", { type: "text", placeholder: "Assignment / location", value: a.assignment || "",
            onchange: async (e) => {
              await update("eventEquipment", a.id, { assignment: e.target.value });
              await reload();
            },
          }),
        ),
        h("div",
          avail
            ? (isShort
                ? h("span.badge.badge-warn", `Short by ${avail.shortage}`)
                : h("span.badge.badge-ok", `${avail.available} available`))
            : h("span.dim", "—"),
        ),
        h("div.row.gap-1",
          h("button.btn.btn-ghost.btn-icon.btn-sm", { onclick: () => editNotes(a) }, icon("edit", 14)),
          h("button.btn.btn-danger.btn-ghost.btn-icon.btn-sm", { onclick: () => onDelete(a, item) }, icon("trash", 14)),
        ),
      ));
    }
  }

  async function addAllocation() {
    if (state.items.length === 0) {
      toast.warn("Inventory is empty", "Add equipment to the inventory first.");
      return;
    }
    const form = entityForm("eventEquipment", {
      equipmentId: state.items[0].id,
      requiredQuantity: 1, preparedQuantity: 0, returnedQuantity: 0,
      status: "needed",
    }, { columns: 1 });
    // Replace equipmentId text input with a select
    const equipField = form.el.querySelector('[data-field="equipmentId"]');
    const sel = h("select.select",
      ...state.items.map(it => h("option", { value: it.id }, `${it.name} (${optionLabel("equipment", "category", it.category)})`)),
    );
    const txt = equipField.querySelector("input");
    if (txt) txt.replaceWith(sel);
    const origGetData = form.getData;
    form.getData = function() {
      const d = origGetData.call(this);
      d.equipmentId = sel.value;
      return d;
    };

    const m = modal({
      title: "Allocate equipment to event",
      size: "md",
      body: form.el,
      footer: h("div.row",
        h("button.btn.btn-ghost", { onclick: () => m.close() }, "Cancel"),
        h("button.btn.btn-primary", {
          onclick: async () => {
            const data = form.getData();
            data.eventId = eventId;
            const v = validateRecord("eventEquipment", data);
            if (!v.valid) {
              form.setErrors(v.errors);
              return;
            }
            try {
              await create("eventEquipment", data);
              toast.ok("Equipment allocated.");
              m.close();
              await reload();
            } catch (err) {
              toast.danger("Save failed", err.message);
            }
          },
        }, icon("check", 14), "Allocate"),
      ),
    });
  }

  async function editNotes(a) {
    const item = state.items.find(i => i.id === a.equipmentId);
    const form = entityForm("eventEquipment", a, { columns: 1 });
    const m = modal({
      title: `Edit allocation: ${item?.name || "—"}`,
      size: "md",
      body: form.el,
      footer: h("div.row",
        h("button.btn.btn-ghost", { onclick: () => m.close() }, "Cancel"),
        h("button.btn.btn-primary", {
          onclick: async () => {
            const data = form.getData();
            await update("eventEquipment", a.id, data);
            toast.ok("Allocation updated.");
            m.close();
            await reload();
          },
        }, icon("check", 14), "Save"),
      ),
    });
  }

  async function onDelete(a, item) {
    const ok = await confirm({
      title: "Remove allocation",
      body: `Remove "${item?.name || "this item"}" from this event? The inventory item itself is not affected.`,
      confirmLabel: "Remove", danger: true, confirmIcon: "trash",
    });
    if (!ok) return;
    await remove("eventEquipment", a.id);
    toast.ok("Allocation removed.");
    await reload();
  }

  const page = h("div.page",
    breadcrumb(ev),
    h("div.page-head",
      h("div.page-head-meta",
        h("div.row.gap-3", h("h1", "Equipment"), h("span.badge.badge-neutral", "Event allocation")),
        h("div.subtitle", `Required, prepared, and returned quantities for ${ev.name}.`),
      ),
      h("div.page-head-actions",
        h("button.btn.btn-ghost", { onclick: () => navigate(`/events/${ev.id}`) }, icon("back", 14), "Back to event"),
        h("button.btn.btn-primary", { onclick: () => addAllocation() }, icon("plus", 14), "Allocate"),
      ),
    ),
    h("div.alert.alert-info",
      h(".alert-icon", icon("info", 18)),
      h("div.grow",
        h("div.alert-title", "Availability check"),
        h("div.alert-body", "Availability compares your required quantity against the inventory total. It does not account for allocations to other events; for accurate cross-event availability, ensure your other events' allocations are also tracked."),
      ),
    ),
    statsEl,
    h("div.card", allocListEl),
  );

  ctx.mount(page);
  await reload();
}

function breadcrumb(ev) {
  return h("div.breadcrumb",
    h("a", { href: "#/", onclick: (e) => { e.preventDefault(); navigate("/"); } }, "Dashboard"),
    h("span.sep", "/"),
    h("a", { href: "#/events", onclick: (e) => { e.preventDefault(); navigate("/events"); } }, "Events"),
    h("span.sep", "/"),
    h("a", { href: `#/events/${ev.id}`, onclick: (e) => { e.preventDefault(); navigate(`/events/${ev.id}`); } }, ev.name),
    h("span.sep", "/"),
    h("span.current", "Equipment allocation"),
  );
}
