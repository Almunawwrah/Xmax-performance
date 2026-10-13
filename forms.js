// components/forms.js — form field builders, form layout, form state.
//
// Built on schema field definitions so adding/changing a field there is
// reflected automatically in forms. Returns DOM nodes; does not handle saving.

import { h } from "../utils/dom.js";
import { ENTITIES, optionLabel } from "../models/schema.js";

// Render a single field based on a field definition + current value.
export function field(fieldDef, value, opts = {}) {
  const { onChange = null, container = true, disabled = false } = opts;
  const inputEl = renderInput(fieldDef, value, { onChange, disabled });

  if (!container) return inputEl;

  const required = fieldDef.required ? h("span.req", "*") : null;
  const labelEl = h("label.field-label", { for: inputEl.id },
    fieldDef.label, required,
  );

  const errEl = h("div.field-error");
  const hintEl = fieldDef.help ? h("div.field-hint", fieldDef.help) : null;

  const f = h("div.field",
    { dataset: { field: fieldDef.name } },
    labelEl,
    inputEl,
    errEl,
    hintEl,
  );
  f._input = inputEl;
  f._error = errEl;
  return f;
}

function renderInput(fd, value, { onChange, disabled }) {
  const id = `f-${fd.name}-${Math.random().toString(36).slice(2, 8)}`;
  const common = {
    id,
    "aria-label": fd.label,
    disabled: disabled || fd.readonly,
    onchange: onChange ? () => onChange(getValue(fd, id)) : null,
  };

  if (fd.type === "textarea") {
    return h("textarea.textarea", {
      ...common,
      placeholder: fd.placeholder || "",
      maxlength: fd.max || undefined,
    }, value || "");
  }

  if (fd.type === "select") {
    return h("select.select", common,
      // allow an empty option for non-required fields
      fd.required ? null : h("option", { value: "" }, "—"),
      (fd.options || []).map(o =>
        h("option", { value: o.value, selected: o.value === value }, o.label),
      ),
    );
  }

  if (fd.type === "checkbox") {
    const cb = h("input", { type: "checkbox", id, ...common,
      checked: Boolean(value),
      onchange: onChange ? () => onChange(cb.checked) : null,
    });
    return cb;
  }

  if (fd.type === "number") {
    return h("input.input", {
      ...common, type: "number",
      value: (value === undefined || value === null) ? "" : value,
      min: fd.min, max: fd.max, step: fd.step || "1",
      oninput: onChange ? (e) => onChange(Number(e.target.value) || 0) : null,
    });
  }

  if (fd.type === "date") {
    return h("input.input", {
      ...common, type: "date",
      value: value || "",
      oninput: onChange ? (e) => onChange(e.target.value) : null,
    });
  }

  if (fd.type === "datetime") {
    // display-only representation of ISO timestamp
    return h("input.input", {
      ...common, type: "text", readonly: true,
      value: value ? new Date(value).toLocaleString() : "",
    });
  }

  // text
  return h("input.input", {
    ...common, type: "text",
    value: value || "",
    maxlength: fd.max || undefined,
    placeholder: fd.placeholder || "",
    oninput: onChange ? (e) => onChange(e.target.value) : null,
  });
}

function getValue(fd, id) {
  const el = document.getElementById(id);
  if (!el) return "";
  if (fd.type === "checkbox") return el.checked;
  if (fd.type === "number") {
    const n = Number(el.value);
    return isNaN(n) ? 0 : n;
  }
  return el.value;
}

// Build a full form for an entity. Returns:
//   { el, validate(), getData(), setData(record), setErrors(errors) }
// where el is a DOM node ready to mount.
export function entityForm(entityName, record = {}, opts = {}) {
  const def = ENTITIES[entityName];
  if (!def) throw new Error(`Unknown entity: ${entityName}`);
  const { columns = 2, disabled = false } = opts;

  const fields = def.fields.map(fd => field(fd, record[fd.name], { disabled }));

  // Layout fields in a grid; fields with `wide` flag span all columns
  const grid = h(`.form-row`, { style: { "--cols": columns } });
  for (const f of fields) {
    // Some fields are wider
    const fd = def.fields.find(x => x.name === f.dataset.field);
    if (fd && (fd.type === "textarea" || fd.wide)) {
      grid.appendChild(h(".col-span-2", f));
    } else {
      grid.appendChild(f);
    }
  }

  const state = {
    el: grid,
    getData() {
      const data = {};
      for (const f of fields) {
        const fd = def.fields.find(x => x.name === f.dataset.field);
        if (!fd) continue;
        if (fd.type === "checkbox") data[fd.name] = f._input.checked;
        else if (fd.type === "number") {
          const n = Number(f._input.value);
          data[fd.name] = isNaN(n) ? 0 : n;
        } else if (fd.type === "datetime") {
          data[fd.name] = f._input.value; // ISO or empty
        } else {
          data[fd.name] = f._input.value;
        }
      }
      return data;
    },
    setData(rec) {
      for (const f of fields) {
        const fd = def.fields.find(x => x.name === f.dataset.field);
        if (!fd) continue;
        const v = rec[fd.name];
        if (fd.type === "checkbox") f._input.checked = Boolean(v);
        else f._input.value = (v === undefined || v === null) ? "" : v;
      }
    },
    setErrors(errors) {
      for (const f of fields) {
        f.classList.remove("has-error");
        f._error.textContent = "";
      }
      for (const e of errors) {
        // Try to find a matching field by partial match against label
        const match = fields.find(f => {
          const fd = def.fields.find(x => x.name === f.dataset.field);
          return e.toLowerCase().startsWith((fd.label || "").toLowerCase());
        });
        if (match) {
          match.classList.add("has-error");
          match._error.textContent = e;
        }
      }
    },
  };
  return state;
}

// Pretty-print an entity field value (for detail panels / print views)
export function displayValue(entityName, fieldName, value) {
  if (value == null || value === "") return "—";
  const def = ENTITIES[entityName];
  if (!def) return String(value);
  const fd = def.fields.find(f => f.name === fieldName);
  if (!fd) return String(value);
  if (fd.type === "checkbox") return value ? "Yes" : "No";
  if (fd.type === "select" && fd.options) return optionLabel(entityName, fieldName, value);
  if (fd.type === "date") return value; // already YYYY-MM-DD
  if (fd.type === "datetime") {
    try { return new Date(value).toLocaleString(); } catch { return String(value); }
  }
  return String(value);
}
