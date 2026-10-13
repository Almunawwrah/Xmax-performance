// storage/db.js — IndexedDB wrapper with versioning and seed support.
//
// Provides a single open() that returns a promise resolving to the DB.
// Migrations are explicit; future schema changes go in migrate().

import { STORES, SCHEMA_VERSION } from "../models/schema.js";

const DB_NAME = "xmax-performance";
let _dbPromise = null;

export function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.result;
      const oldVer = e.oldVersion;
      migrate(db, oldVer, SCHEMA_VERSION);
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("Failed to open database."));
    req.onblocked = () => reject(new Error("Database upgrade blocked by another tab."));
  });
  return _dbPromise;
}

function migrate(db, oldVer, newVer) {
  // Always (re)create object stores based on the current schema list.
  // This is safe — IndexedDB.create_OBJECT_STORE only errors if the store already
  // exists, and we check existence first.
  for (const store of STORES) {
    if (!db.objectStoreNames.contains(store)) {
      db.createObjectStore(store, { keyPath: "id" });
    }
  }
  // v1->v2: nothing structural (current release); future migrations go here.
}

// Drop the entire database — used for hard reset in settings.
export async function dropDB() {
  _dbPromise = null;
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Reset blocked by another tab. Close other tabs and try again."));
  });
}

// Generic raw store operations — wrap transactions in promises
async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    try {
      const r = fn(store);
      if (r && typeof r.onsuccess !== "undefined") {
        r.onsuccess = () => { result = r.result; };
        r.onerror = () => reject(r.error);
      }
    } catch (err) {
      reject(err);
      return;
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("Transaction aborted."));
  });
}

export const raw = {
  async get(store, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = db.transaction(store, "readonly").objectStore(store).get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
  },
  async all(store) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = db.transaction(store, "readonly").objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
  },
  async put(store, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = db.transaction(store, "readwrite").objectStore(store).put(value);
      r.onsuccess = () => resolve(value);
      r.onerror = () => reject(r.error);
    });
  },
  async bulkPut(store, values) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      const os = tx.objectStore(store);
      for (const v of values) os.put(v);
      tx.oncomplete = () => resolve(values);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  },
  async delete(store, id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = db.transaction(store, "readwrite").objectStore(store).delete(id);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  },
  async clear(store) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = db.transaction(store, "readwrite").objectStore(store).clear();
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  },
  async count(store) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const r = db.transaction(store, "readonly").objectStore(store).count();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  },
};

// Convenience — read every record across every store as a flat object
export async function dumpAll() {
  const out = { _schemaVersion: SCHEMA_VERSION, _exportedAt: new Date().toISOString(), stores: {} };
  for (const store of STORES) {
    out.stores[store] = await raw.all(store);
  }
  return out;
}

// Wipe and restore from a dump object (used by settings import).
export async function restoreAll(dump) {
  // Validate shape minimally
  if (!dump || typeof dump !== "object" || !dump.stores) {
    throw new Error("Invalid backup file: missing 'stores'.");
  }
  for (const store of STORES) {
    await raw.clear(store);
    const arr = Array.isArray(dump.stores[store]) ? dump.stores[store] : [];
    if (arr.length) await raw.bulkPut(store, arr);
  }
  return true;
}
