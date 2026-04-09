// Chat persistence adapters for Zustand persist middleware
// Uses IndexedDB in web browsers, Electron IPC in Electron

const IDB_NAME = "leochat-storage";
const IDB_STORE = "keyval";
const IDB_VERSION = 1;

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => reject(req.error);
  });
}

function createIndexedDBStorage() {
  return {
    async getItem(key: string): Promise<string | null> {
      const db = await openIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readonly");
        const req = tx.objectStore(IDB_STORE).get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    },
    async setItem(key: string, value: string): Promise<void> {
      const db = await openIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const req = tx.objectStore(IDB_STORE).put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
    async removeItem(key: string): Promise<void> {
      const db = await openIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        const req = tx.objectStore(IDB_STORE).delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },
  };
}

function createElectronStorage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (window as any).electronAPI;
  return {
    async getItem(key: string): Promise<string | null> {
      return api.invoke("storage:getItem", key);
    },
    async setItem(key: string, value: string): Promise<void> {
      return api.invoke("storage:setItem", key, value);
    },
    async removeItem(key: string): Promise<void> {
      return api.invoke("storage:removeItem", key);
    },
  };
}

export function getChatStorageAdapter() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const isElectron = typeof window !== "undefined" && !!(window as any).electronAPI;
  return isElectron ? createElectronStorage() : createIndexedDBStorage();
}

export async function migrateFromLocalStorage(
  key: string,
  storage: ReturnType<typeof getChatStorageAdapter>
): Promise<void> {
  try {
    const existing = localStorage.getItem(key);
    if (!existing) return;
    await storage.setItem(key, existing);
    localStorage.removeItem(key);
    console.log(`[Persistence] Migrated "${key}" from localStorage to new storage`);
  } catch (err) {
    console.warn("[Persistence] Migration failed:", err);
  }
}
