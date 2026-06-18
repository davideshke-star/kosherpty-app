import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { DEFAULT_CHECKLIST_ITEMS } from "./constants";

const SETTINGS_REF = doc(db, "settings", "checklist");

/**
 * Reads the global checklist from Firestore. If it doesn't exist yet
 * (first run after this update), seeds it with the default items.
 */
export async function getGlobalChecklist() {
  const snap = await getDoc(SETTINGS_REF);
  if (snap.exists() && Array.isArray(snap.data().items) && snap.data().items.length) {
    return snap.data().items;
  }
  await setDoc(SETTINGS_REF, { items: DEFAULT_CHECKLIST_ITEMS, updatedAt: Date.now() });
  return DEFAULT_CHECKLIST_ITEMS;
}

/**
 * Live subscription so supervisors instantly see checklist edits the
 * admin makes, without needing to reload the app.
 */
export function subscribeGlobalChecklist(callback) {
  return onSnapshot(SETTINGS_REF, snap => {
    if (snap.exists() && Array.isArray(snap.data().items) && snap.data().items.length) {
      callback(snap.data().items);
    } else {
      callback(DEFAULT_CHECKLIST_ITEMS);
      setDoc(SETTINGS_REF, { items: DEFAULT_CHECKLIST_ITEMS, updatedAt: Date.now() });
    }
  });
}

export async function saveGlobalChecklist(items) {
  await setDoc(SETTINGS_REF, { items, updatedAt: Date.now() });
}

/**
 * Resolves which checklist a given stop should use:
 * its own customChecklist if defined (full replace), otherwise the global list.
 */
export function resolveChecklist(stop, globalItems) {
  if (stop?.customChecklist && Array.isArray(stop.customChecklist) && stop.customChecklist.length) {
    return stop.customChecklist;
  }
  return globalItems;
}
