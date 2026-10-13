// components/tables.js — sortable, searchable table builder.
// Each row click triggers onRowClick(record). Columns: { key, label, sortable, render, width, align }.

import { h } from "../utils/dom.js";

export function dataTable(opts = {}) {
  const {
    columns = [],
    rows = [],
    onRowClick = null,
    rowKey = (r) => r.id,
    rowClass = null,
    sortable = true,
  } = opts;

  let sortKey = null;
  let sortDir = "asc";
  let currentRows = [...rows];

  function applySort() {
    if (!sortKey) return;
    const col = columns.find(c => c.key === sortKey);
    if (!col) return;
    currentRows = [...currentRows].sort((a, b) => {
      let av = col.sortValue ? col.sortValue(a) : a[sortKey];
      let bv = col.sortValue ? col.sortValue(b) : b[sortKey];
      if (av == null) av = "";
      if (bv == null) bv = "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      av = String(av).toLowerCase();
      bv = String(bv).toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  function renderHeader() {
    return h("thead", h("tr",
      columns.map(col => {
        const isSortKey = col.key === sortKey;
        const sortableCol = sortable && col.sortable !== false;
        const ind = isSortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "";
        return h(`th${sortableCol ? ".sortable" : ""}`,
          {
            onclick: sortableCol ? () => {
              if (sortKey === col.key) sortDir = sortDir === "asc" ? "desc" : "asc";
              else { sortKey = col.key; sortDir = "asc"; }
              applySort();
              rerenderBody();
              updateHeaders();
            } : null,
            style: col.width ? { width: col.width } : null,
          },
          col.label,
          isSortKey ? h("span.sort-ind", ind) : null,
        );
      }),
    ));
  }

  function renderRow(r) {
    const cells = columns.map(col => {
      const content = col.render ? col.render(r) : (r[col.key] ?? "—");
      const cls = col.align === "right" ? "cell-num" : col.mono ? "cell-mono" : "";
      return h(`td${cls ? "." + cls : ""}`, content);
    });
    const rowCls = rowClass ? rowClass(r) : "";
    return h("tr",
      {
        onclick: onRowClick ? () => onRowClick(r) : null,
        class: rowCls,
        "data-id": rowKey(r),
        style: { cursor: onRowClick ? "pointer" : "default" },
      },
      cells,
    );
  }

  function renderBody() {
    return h("tbody", currentRows.map(renderRow));
  }

  // Build initial table
  const thead = renderHeader();
  const tbody = renderBody();
  const table = h("table.data", thead, tbody);
  const wrap = h("div.table-wrap", table);

  function updateHeaders() {
    const newHead = renderHeader();
    table.querySelector("thead")?.replaceWith(newHead);
  }

  return {
    el: wrap,
    setRows(newRows) {
      currentRows = [...newRows];
      applySort();
      const newTbody = renderBody();
      table.querySelector("tbody")?.replaceWith(newTbody);
    },
    setSort(key, dir) {
      sortKey = key; sortDir = dir;
      applySort();
      const newTbody = renderBody();
      table.querySelector("tbody")?.replaceWith(newTbody);
      updateHeaders();
    },
    getRows() { return currentRows; },
  };
}

// Simple text-search filter across multiple fields of a record.
export function searchFilter(query, fields) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return () => true;
  return (rec) => {
    for (const f of fields) {
      const v = rec[f];
      if (v != null && String(v).toLowerCase().includes(q)) return true;
    }
    return false;
  };
}
