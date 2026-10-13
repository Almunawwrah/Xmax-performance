// utils/dom.js — minimal DOM helpers (no virtual DOM, no templating engine)

// h() — element factory. Supports:
//   h("div", {class:"x", onclick:fn}, "text", childEl, ["a","b"])
//   h("div.cls1.cls2#id")
//   h(".cls1.cls2#id")  — defaults to div
//   h("#id")            — defaults to div
export function h(tag, attrs, ...children) {
  let el;
  let tagName = tag;

  // Parse shorthand: "div.cls1.cls2#id" (tag optional)
  const m = tagName.match(/^([\w-]+)?((?:\.[\w-]+)*)(#[\w-]+)?$/);
  if (m) {
    tagName = m[1] || "div";
    el = document.createElement(tagName);
    if (m[2]) {
      for (const cls of m[2].slice(1).split(".")) {
        if (cls) el.classList.add(cls);
      }
    }
    if (m[3]) el.id = m[3].slice(1);
  } else {
    el = document.createElement(tagName);
  }

  // Allow h(tag, ...children) without attrs, OR h(tag, "string"/node) treated as child
  // A DOM Node is a child, not attrs — even though typeof === "object".
  if (attrs != null && (typeof attrs !== "object" || Array.isArray(attrs) || attrs instanceof Node)) {
    // attrs is actually a child — prepend it to children
    children = [attrs, ...children];
    attrs = null;
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class" || k === "className") {
        const val = Array.isArray(v) ? v.filter(Boolean).join(" ") : v;
        if (val) el.setAttribute("class", val);
      } else if (k === "style" && typeof v === "object") {
        for (const [prop, val] of Object.entries(v)) {
          if (val != null) el.style[prop] = val;
        }
      } else if (k === "dataset" && typeof v === "object") {
        for (const [prop, val] of Object.entries(v)) el.dataset[prop] = val;
      } else if (k === "html") {
        el.innerHTML = v;
      } else if (k === "text") {
        el.textContent = v;
      } else if (k.startsWith("on") && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "for") {
        el.setAttribute("for", v);
      } else if (k === "checked" || k === "disabled" || k === "selected" || k === "readonly" || k === "required" || k === "hidden" || k === "multiple") {
        if (v === true) el.setAttribute(k, "");
      } else if (k === "value") {
        el.value = v;
      } else if (k === "aria" && typeof v === "object") {
        for (const [prop, val] of Object.entries(v)) el.setAttribute(`aria-${prop}`, val);
      } else {
        el.setAttribute(k, v);
      }
    }
  }

  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false || child === true) continue;
    if (child instanceof Node) {
      el.appendChild(child);
    } else {
      el.appendChild(document.createTextNode(String(child)));
    }
  }
}

// Query helpers
export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

// Empty an element
export function clear(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// Replace contents of an element with the given children
export function mount(target, ...children) {
  if (!target) return;
  clear(target);
  appendChildren(target, children);
  return target;
}

// SVG icon helper — inline paths to avoid an icon-font dependency.
// All icons use stroke="currentColor" so they inherit text color.
export function icon(name, size = 16) {
  const paths = ICONS[name];
  if (!paths) return "";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = paths;
  return svg;
}

// Icon path library — consistent 24×24 stroke icons
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  events: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  workspace: '<path d="M3 7h18M3 12h18M3 17h18M7 4v16M17 4v16"/>',
  equipment: '<path d="M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01"/>',
  checklist: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  documents: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  live: '<path d="M3 12h2l2 9 4-18 4 14 2-5h4"/>',
  inputs: '<path d="M12 2v20M7 7l-5 5 5 5M17 7l5 5-5 5"/>',
  channels: '<path d="M4 4v16M10 4v16M16 4v16M22 4v16"/>',
  signalflow: '<path d="M3 12h6l3-7 3 14 3-7h3"/>',
  outputs: '<path d="M4 4h16v16H4z"/><path d="M9 9l6 6M15 9l-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  archive: '<path d="M3 7h18v2H3zM5 9h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/><path d="M10 13h4"/>',
  duplicate: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/>',
  export: '<path d="M12 3v12M7 8l5-5 5 5M21 15v6H3v-6"/>',
  import: '<path d="M12 15V3M7 10l5 5 5-5M21 15v6H3v-6"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  warn: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  danger: '<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
  ok: '<circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  sort: '<path d="M3 6h18M6 12h12M9 18h6"/>',
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  warning: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M21 15v6H3v-6"/>',
  upload: '<path d="M12 15V3M7 8l5 5 5-5M21 15v6H3v-6"/>',
};
