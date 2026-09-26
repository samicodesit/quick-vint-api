export type PendingPhoto = {
  id: string;
  workspaceId: string;
  sessionId: string;
  itemId: string;
  file: File;
  sha256: string;
  manifestKey: string;
  uploadId?: string;
  state: "local" | "uploading" | "failed";
  error?: string;
};

const DB_NAME = "autolister-capture-v1";
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("photos", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function operation<T>(
  mode: IDBTransactionMode,
  run: (
    store: IDBObjectStore,
    resolve: (value: T) => void,
    reject: (reason: unknown) => void,
  ) => void,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("photos", mode);
    run(tx.objectStore("photos"), resolve, reject);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => db.close();
  });
}

export const captureQueue = {
  put(photo: PendingPhoto) {
    return operation<void>("readwrite", (store, resolve, reject) => {
      const request = store.put(photo);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  remove(id: string) {
    return operation<void>("readwrite", (store, resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },
  all() {
    return operation<PendingPhoto[]>("readonly", (store, resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as PendingPhoto[]);
      request.onerror = () => reject(request.error);
    });
  },
  async forSession(sessionId: string) {
    return (await this.all()).filter((photo) => photo.sessionId === sessionId);
  },
};
