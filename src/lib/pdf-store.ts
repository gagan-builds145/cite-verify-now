/**
 * Uploaded PDFs never leave the browser. The file is kept in IndexedDB only so
 * the viewer can re-render it after navigation; "Delete session" removes it.
 */

const DB_NAME = "citeverify-private";
const STORE = "documents";
const VERSION = 1;

export type StoredPdf = {
  id: string;
  fileName: string;
  bytes: ArrayBuffer;
  storedAt: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage."));
  });
}

export async function savePdfLocally(id: string, fileName: string, bytes: Uint8Array): Promise<void> {
  const db = await openDatabase();
  const copy = bytes.slice().buffer;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ id, fileName, bytes: copy, storedAt: Date.now() } satisfies StoredPdf);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not store the PDF in this browser."));
  });
  db.close();
}

export async function loadPdfLocally(id: string): Promise<StoredPdf | null> {
  const db = await openDatabase();
  const stored = await new Promise<StoredPdf | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as StoredPdf | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error("Could not read the stored PDF."));
  });
  db.close();
  return stored;
}

export async function deletePdfLocally(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not remove the stored PDF."));
  });
  db.close();
}

export async function clearLocalPdfs(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not clear local storage."));
  });
  db.close();
}
