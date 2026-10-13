// components/ui.js — reusable UI primitives: modal, confirm, toast, badges, empty states.
// No virtual DOM. Functions return DOM nodes ready to mount.

import { h, mount, clear, icon } from "../utils/dom.js";

// === Toast system ===
let _toastStack = null;
function getToastStack() {
  if (!_toastStack) {
    _toastStack = h("div.toast-stack", { "aria-live": "polite", "aria-atomic": "false" });
    document.body.appendChild(_toastStack);
  }
  return _toastStack;
}

export function toast(opts = {}) {
  const { title = "", body = "", type = "info", timeout = 3500 } = opts;
  const t = h(`div.toast.${type}`,
    { role: "status" },
    title ? h("div.toast-title", title) : null,
    body ? h("div.toast-body", body) : null,
  );
  getToastStack().appendChild(t);
  if (timeout > 0) {
    setTimeout(() => dismissToast(t), timeout);
  }
  return { dismiss: () => dismissToast(t) };
}

function dismissToast(t) {
  if (!t.parentElement) return;
  t.style.opacity = "0";
  t.style.transform = "translateX(20px)";
  t.style.transition = "opacity 150ms, transform 150ms";
  setTimeout(() => t.remove(), 160);
}

toast.ok = (title, body) => toast({ title, body, type: "ok" });
toast.warn = (title, body) => toast({ title, body, type: "warn" });
toast.danger = (title, body) => toast({ title, body, type: "danger" });
toast.info = (title, body) => toast({ title, body, type: "info" });

// === Modal dialog ===
// Returns a control object: { close, el }
// opts: { title, size ("md"|"lg"|"xl"), body (node|string), footer (node|null),
//         onMount(node), dismissible (true) }
export function modal(opts = {}) {
  const {
    title = "",
    size = "md",
    body = null,
    footer = null,
    dismissible = true,
    onMount = null,
  } = opts;

  let overlay;
  let closeFn = null;

  function close() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    document.removeEventListener("keydown", onKey);
    if (typeof closeFn === "function") closeFn();
  }

  function onKey(e) {
    if (dismissible && e.key === "Escape") close();
    // basic focus trap
    if (e.key === "Tab" && overlay) {
      const focusables = overlay.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  const modalClass = size === "lg" ? "modal.modal-lg" : size === "xl" ? "modal.modal-xl" : "modal";
  overlay = h("div.modal-overlay",
    {
      onclick: (e) => { if (dismissible && e.target === overlay) close(); },
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "modal-title",
    },
    h(`div.${modalClass}`,
      h("div.modal-header",
        h("div.modal-title#modal-title", title),
        dismissible ? h("button.modal-close", {
          type: "button",
          "aria-label": "Close dialog",
          onclick: close,
        }, "×") : null,
      ),
      h("div.modal-body", body),
      footer ? h("div.modal-footer", footer) : null,
    ),
  );
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKey);
  // Focus first focusable element inside modal
  setTimeout(() => {
    const f = overlay.querySelector("input, select, textarea, button");
    if (f) f.focus();
  }, 0);
  if (onMount) onMount(overlay);

  return { close, el: overlay };
}

// === Confirm dialog ===
// opts: { title, body (string|node), confirmLabel, cancelLabel, danger (bool), confirmIcon }
// Returns a Promise<boolean>.
export function confirm(opts = {}) {
  const {
    title = "Confirm",
    body = "Are you sure?",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
    confirmIcon = null,
  } = opts;

  return new Promise((resolve) => {
    let m;
    let resolved = false;
    const handleConfirm = () => { if (resolved) return; resolved = true; m.close(); resolve(true); };
    const handleCancel = () => { if (resolved) return; resolved = true; m.close(); resolve(false); };

    const bodyNode = typeof body === "string" ? h("p.muted", body) : body;
    const footer = h("div.row",
      h("button.btn.btn-ghost", { type: "button", onclick: handleCancel }, cancelLabel),
      h(`button.btn.${danger ? "btn-danger" : "btn-primary"}`, {
        type: "button",
        onclick: handleConfirm,
      }, confirmIcon ? icon(confirmIcon, 14) : null, confirmLabel),
    );

    m = modal({
      title,
      size: "md",
      body: bodyNode,
      footer,
      dismissible: false, // we handle overlay-click ourselves via mousedown
    });

    // Close on overlay click resolves as cancel
    m.el.addEventListener("mousedown", (e) => {
      if (e.target === m.el) handleCancel();
    });
    // Escape = Cancel (since dismissible: false disables the modal's own Esc handler)
    m.el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.stopPropagation(); handleCancel(); }
    }, true);
  });
}

// === Badge / status pill helpers ===
export function statusBadge(status) {
  const map = {
    preparing: { cls: "preparing", label: "Preparing" },
    ready: { cls: "ready", label: "Ready" },
    live: { cls: "live", label: "Live" },
    completed: { cls: "completed", label: "Completed" },
    archived: { cls: "archived", label: "Archived" },
  };
  const s = map[status] || { cls: "neutral", label: status || "—" };
  return h(`span.status-pill.${s.cls}`, s.label);
}

export function checkStatusBadge(status) {
  const map = {
    pending: { cls: "badge-neutral", label: "Pending" },
    patched: { cls: "badge-info", label: "Patched" },
    checked: { cls: "badge-ok", label: "Checked" },
    problem: { cls: "badge-danger", label: "Problem" },
  };
  const s = map[status] || { cls: "badge-neutral", label: status || "—" };
  return h(`span.badge.badge-dot.${s.cls}`, s.label);
}

export function verificationBadge(status) {
  const map = {
    planned: { cls: "planned", label: "Planned" },
    unchecked: { cls: "unchecked", label: "Not checked" },
    confirmed: { cls: "confirmed", label: "Confirmed" },
    problem: { cls: "problem", label: "Problem" },
  };
  const s = map[status] || { cls: "planned", label: status || "—" };
  return h(`span.signal-conn-status.${s.cls}`, s.label);
}

// === Empty state ===
export function emptyState(opts = {}) {
  const { icon: iconName = "info", title = "Nothing here yet", body = "", action = null } = opts;
  return h("div.empty-state",
    h(`.empty-state-icon`, icon(iconName, 32)),
    h("div.empty-state-title", title),
    body ? h("div.empty-state-body", body) : null,
    action,
  );
}

// === Alert ===
// type: "info" | "warn" | "danger" | "ok"
export function alert({ type = "info", title = "", body = "" }) {
  const iconName = type === "warn" || type === "danger" ? "warn" : type === "ok" ? "ok" : "info";
  return h(`div.alert.alert-${type}`,
    h(".alert-icon", icon(iconName, 18)),
    h("div.grow",
      title ? h("div.alert-title", title) : null,
      body ? (typeof body === "string" ? h("div.alert-body", body) : h("div.alert-body", body)) : null,
    ),
  );
}

// === Loading spinner (used briefly) ===
export function loading(message = "Loading…") {
  return h("div.empty-state",
    h("div.empty-state-icon", h("span", { style: { animation: "spin 1s linear infinite", display: "inline-block" } }, "⟳")),
    h("div.empty-state-title", message),
  );
}

// CSS injection for spinner animation (added once)
if (!document.getElementById("xmax-spinner-style")) {
  const style = document.createElement("style");
  style.id = "xmax-spinner-style";
  style.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(style);
}
