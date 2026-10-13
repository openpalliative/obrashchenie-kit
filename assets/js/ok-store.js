import { openStore } from "../../ui/js/store.js";
import { today, statusEl, kit } from "./ok-core.js";
import { cleanCase, cleanProfile, fieldMeta } from "../../lib/backup.js";

export const MAX_CASES = 3;
export const damaged = [];

function memoryStore() {
  const m = new Map();
  return {
    volatile: true,
    get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v), delete: async (k) => void m.delete(k),
    list: async () => [...m].map(([key, value]) => ({ key, value })),
    exportAll: async () => ({ format: "openpalliative-backup/1", repo: "obrashchenie-kit", exported_at: new Date().toISOString(), entries: [...m].map(([key, value]) => ({ key, value })) }),
    wipe: async () => m.clear(),
  };
}

let storePromise = null;
export function store() {
  const open = async () => {
    const s = openStore("obrashchenie-kit");
    await s.list();
    return s;
  };
  storePromise ??= open().catch(memoryStore);
  return storePromise;
}

let metaPromise = null;
export const fields = () => (metaPromise ??= kit("documents").then(fieldMeta));

export async function listCases() {
  const [s, meta] = await Promise.all([store(), fields()]);
  damaged.length = 0;
  const out = [];
  for (const { key, value } of await s.list()) {
    if (typeof key !== "string" || !key.startsWith("case:")) continue;
    const c = cleanCase(value, { fields: meta });
    if (c && key === `case:${c.id}`) out.push(c);
    else damaged.push(key);
  }
  return out.sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at));
}

export async function getCase(id) {
  const [s, meta] = await Promise.all([store(), fields()]);
  const c = cleanCase(await s.get(`case:${id}`), { fields: meta });
  return c && c.id === id ? c : null;
}

export async function saveCase(c) {
  c.updated_at = today();
  await (await store()).set(`case:${c.id}`, c);
  return c;
}

export const deleteCase = async (id) => (await store()).delete(`case:${id}`);
export const deleteKey = async (key) => (await store()).delete(key);

export async function getProfile() {
  const [s, meta] = await Promise.all([store(), fields()]);
  return cleanProfile(await s.get("profile"), { fields: meta });
}

export async function setProfile(p) {
  const s = await store();
  if (p) await s.set("profile", p);
  else await s.delete("profile");
}

let persistPromise = null;
export function persist() {
  const ask = async () => {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  };
  persistPromise ??= ask().catch(() => false);
  return persistPromise;
}

export function newId() {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  return [...crypto.getRandomValues(new Uint8Array(10))].map((b) => abc[b % abc.length]).join("");
}

export function storageNotice(s, container) {
  if (!s.volatile || !container) return;
  container.prepend(statusEl("info", "Важно", "Браузер не даёт сохранять на этом устройстве, например в режиме инкогнито. Документ можно собрать и распечатать, но после закрытия вкладки он пропадёт"));
}

export function pushEvent(c, ev) {
  c.events.push({ seq: Math.max(0, ...c.events.map((x) => x.seq || 0)) + 1, edited_at: null, ...ev });
}
