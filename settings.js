// views/settings.js — backup/import/reset, app info, storage status.

import { h, icon } from "../utils/dom.js";
import { dumpAll, restoreAll, dropDB, raw } from "../storage/db.js";
import { list } from "../storage/repo.js";
import { SCHEMA_VERSION, STORES } from "../models/schema.js";
import { confirm, toast, alert, emptyState } from "../components/ui.js";
import { navigate } from "../router.js";
import { refreshActiveContext, refreshNavBadges } from "../app.js";

export async function render(ctx) {
  refreshActiveContext();
  refreshNavBadges();

  // Storage stats
  const counts = {};
  let total = 0;
  for (const store of STORES) {
    const c = await raw.count(store);
    counts[store] = c;
    total += c;
  }

  // Backup handler
  async function doBackup() {
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
  }

  // Restore handler — with validation
  async function doRestore(file) {
    if (!file) return;
    const text = await file.text();
    let dump;
    try {
      dump = JSON.parse(text);
    } catch {
      toast.danger("Invalid JSON file", "Could not parse the file as JSON.");
      return;
    }
    // Validate shape
    const errors = validateBackup(dump);
    if (errors.length > 0) {
      toast.danger("Backup validation failed", errors.join("; "));
      return;
    }
    const ok = await confirm({
      title: "Restore from backup",
      body: h("div",
        h("p", "Restoring will REPLACE all current data with the contents of this backup file."),
        h("p.mt-3.warn", "This cannot be undone. Consider exporting a backup of your current data first."),
        h("p.mt-3.dim", `Backup schema version: ${dump._schemaVersion || "?"} · Exported at: ${dump._exportedAt || "?"}`),
      ),
      confirmLabel: "Replace data with backup", danger: true, confirmIcon: "import",
    });
    if (!ok) return;
    try {
      await restoreAll(dump);
      toast.ok("Data restored.", "Reloading…");
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      toast.danger("Restore failed", err.message);
    }
  }

  // Hard reset
  async function doReset() {
    const ok = await confirm({
      title: "Reset all data",
      body: h("div",
        h("p", "This permanently deletes ALL data and reseeds the demo event."),
        h("p.mt-3.warn", "This cannot be undone. Export a backup first if you want to keep your data."),
      ),
      confirmLabel: "Reset everything", danger: true, confirmIcon: "trash",
    });
    if (!ok) return;
    try {
      await dropDB();
      toast.ok("Database reset.", "Reloading…");
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      toast.danger("Reset failed", err.message);
    }
  }

  // Clear demo data only (delete the demo event + its descendants; user data preserved)
  async function clearDemo() {
    const events = await list("event");
    const demo = events.find(e => e.name.startsWith("Demo —"));
    if (!demo) {
      toast.info("No demo event", "The demo event has already been removed.");
      return;
    }
    const ok = await confirm({
      title: "Remove demo event",
      body: `Delete "${demo.name}" and its associated records? Your other events are not affected.`,
      confirmLabel: "Remove", danger: true,
    });
    if (!ok) return;
    const { remove } = await import("../storage/repo.js");
    await remove("event", demo.id);
    toast.ok("Demo event removed.");
    refreshNavBadges();
    navigate("/events");
  }

  const storageStats = h("div.grid.grid-3",
    ...STORES.map(s => h("div.card",
      h("div.stat",
        h("div.stat-label", s),
        h("div.stat-value", String(counts[s] || 0)),
      ),
    )),
  );

  const fileInput = h("input", { type: "file", accept: ".json,application/json", id: "restore-file", hidden: true });
  fileInput.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) doRestore(f);
    fileInput.value = "";
  });

  const page = h("div.page",
    h("div.page-head",
      h("div.page-head-meta",
        h("h1", "Settings"),
        h("div.subtitle", "Backup, restore, and application information."),
      ),
    ),

    h("div.settings-section",
      h("h3", "Storage status"),
      h("div.row.gap-4.mb-3",
        h("div.stat", h("div.stat-label", "Schema version"), h("div.stat-value", { style: { fontSize: "var(--fs-lg)" } }, String(SCHEMA_VERSION))),
        h("div.stat", h("div.stat-label", "Total records"), h("div.stat-value", { style: { fontSize: "var(--fs-lg)" } }, String(total))),
        h("div.stat", h("div.stat-label", "Storage backend"), h("div.stat-value", { style: { fontSize: "var(--fs-lg)" } }, "IndexedDB (local)")),
      ),
      storageStats,
    ),

    h("div.settings-section",
      h("h3", "Backup & restore"),
      h("div.alert.alert-info",
        h(".alert-icon", icon("info", 18)),
        h("div.grow",
          h("div.alert-title", "JSON backup"),
          h("div.alert-body", "Backups include all events, workspaces, inputs, channels, outputs, signal connections, equipment, allocations, and checklist tasks. Stored as a single JSON file you can keep anywhere."),
        ),
      ),
      h("div.row.gap-2.mt-3",
        h("button.btn.btn-primary", { onclick: () => doBackup() }, icon("download", 14), "Export backup"),
        h("button.btn.btn-ghost", { onclick: () => fileInput.click() }, icon("upload", 14), "Import backup"),
        fileInput,
      ),
      h("p.muted.mt-3",
        "Imported files are validated for schema shape. Malformed or incompatible files are rejected safely without modifying existing data.",
      ),
    ),

    h("div.settings-section",
      h("h3", "Demo data"),
      h("p.muted", "XMAX Performance seeds a demo event on first run so the app isn't empty. You can remove it here once you've created your own events."),
      h("button.btn.btn-ghost.mt-3", { onclick: () => clearDemo() }, icon("trash", 14), "Remove demo event"),
    ),

    h("div.settings-section",
      h("h3", "Reset"),
      h("div.alert.alert-danger",
        h(".alert-icon", icon("danger", 18)),
        h("div.grow",
          h("div.alert-title", "Danger zone"),
          h("div.alert-body", "Reset deletes ALL data from this browser and reseeds the demo event. Make sure you have a backup if you want to keep your data."),
        ),
      ),
      h("button.btn.btn-danger.mt-3", { onclick: () => doReset() }, icon("trash", 14), "Reset all data"),
    ),

    h("div.settings-section",
      h("h3", "About"),
      h("p", "XMAX Performance is a local-first web application for live audio operations."),
      h("p.muted", "No data leaves this browser. No multi-user sync, no remote backup, no hardware control. Plan, document, and reference — that's all this tool does."),
      h("p.muted", "All displayed operational states (soundcheck status, verification status, etc.) reflect documented plan values, not physical reality. Verifying a cable in the app does not verify it in real life."),
    ),
  );
  ctx.mount(page);
}

// Validate a backup object's basic shape. Returns array of error strings.
function validateBackup(dump) {
  const errors = [];
  if (!dump || typeof dump !== "object") {
    errors.push("Root is not an object.");
    return errors;
  }
  if (!dump.stores || typeof dump.stores !== "object") {
    errors.push("Missing 'stores' object.");
    return errors;
  }
  for (const store of STORES) {
    const arr = dump.stores[store];
    if (arr === undefined) continue; // missing stores are allowed
    if (!Array.isArray(arr)) {
      errors.push(`'stores.${store}' is not an array.`);
      continue;
    }
    for (const rec of arr) {
      if (!rec || typeof rec !== "object" || !rec.id) {
        errors.push(`'stores.${store}' contains a record without an id.`);
        break;
      }
    }
  }
  return errors;
}
