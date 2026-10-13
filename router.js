// router.js — hash-based router.
//
// Routes are functions registered for a path prefix. The router parses
// location.hash into { name, params, query } and dispatches.
//
// Example hashes:
//   #/                          dashboard
//   #/events                    events list
//   #/events/:id                event detail (workspace hub)
//   #/events/:id/workspace/:wid/inputs
//   #/events/:id/workspace/:wid/channels
//   #/events/:id/workspace/:wid/signal
//   #/events/:id/workspace/:wid/outputs
//   #/events/:id/equipment
//   #/events/:id/checklist
//   #/events/:id/live
//   #/events/:id/documents
//   #/equipment
//   #/checklists                (cross-event checklist overview)
//   #/documents
//   #/settings

import { h, mount, clear } from "./utils/dom.js";
import { icon } from "./utils/dom.js";

const routes = [];
let currentRender = null;
let appShell = null;

export function registerRoute(pattern, handler) {
  routes.push({ pattern, handler });
}

export function startRouter(shellEl) {
  appShell = shellEl;
  window.addEventListener("hashchange", dispatch);
  dispatch();
}

export function navigate(hash) {
  if (!hash.startsWith("#")) hash = "#" + hash;
  if (window.location.hash === hash) {
    dispatch(); // re-render even if same hash
  } else {
    window.location.hash = hash;
  }
}

function parseHash() {
  let raw = window.location.hash.replace(/^#/, "");
  if (!raw) raw = "/";
  const [path, queryStr] = raw.split("?");
  const segments = path.split("/").filter(Boolean); // drop leading ""
  const query = {};
  if (queryStr) {
    for (const pair of queryStr.split("&")) {
      const [k, v] = pair.split("=");
      query[decodeURIComponent(k)] = decodeURIComponent(v || "");
    }
  }
  return { path: "/" + segments.join("/"), segments, query };
}

function matchRoute(segments) {
  // Find first route whose pattern segments match length and parameter positions
  for (const r of routes) {
    const pat = r.pattern.split("/").filter(Boolean);
    if (pat.length !== segments.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pat.length; i++) {
      const pseg = pat[i];
      const sseg = segments[i];
      if (pseg.startsWith(":")) {
        params[pseg.slice(1)] = decodeURIComponent(sseg);
      } else if (pseg !== sseg) {
        ok = false; break;
      }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}

async function dispatch() {
  if (!appShell) return;
  const { segments, query } = parseHash();
  const match = matchRoute(segments);

  const mainEl = appShell.querySelector(".app-main");
  if (!match) {
    mount(mainEl, h("div.empty-state",
      h(".empty-state-icon", icon("warn", 32)),
      h("div.empty-state-title", "Page not found"),
      h("div.empty-state-body", `No route matches /${segments.join("/")}.`),
      h("button.btn.btn-primary", { onclick: () => navigate("/") }, "Back to dashboard"),
    ));
    return;
  }

  try {
    mainEl.setAttribute("aria-busy", "true");
    clear(mainEl);
    const ctx = { params: match.params, query, navigate, mount: (el) => mount(mainEl, el) };
    await match.handler(ctx);
    mainEl.removeAttribute("aria-busy");
  } catch (err) {
    console.error("Route render error:", err);
    mainEl.removeAttribute("aria-busy");
    mount(mainEl, h("div.empty-state",
      h(".empty-state-icon", icon("danger", 32)),
      h("div.empty-state-title", "Something went wrong"),
      h("div.empty-state-body", String(err?.message || err)),
      h("button.btn.btn-ghost", { onclick: () => location.reload() }, "Reload"),
    ));
  }
}

export function currentPath() {
  return parseHash().path;
}
