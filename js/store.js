// Everything lives in this browser's IndexedDB: the app state under one key,
// template pictures and uploaded fonts as blobs. Nothing is sent anywhere.
const DB_NAME = 'invitation-studio';
let dbPromise;

function open() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('kv');
      db.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

async function run(storeName, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const kvGet = (key) => run('kv', 'readonly', (s) => s.get(key));
export const kvSet = (key, value) => run('kv', 'readwrite', (s) => s.put(value, key));
export const blobGet = (key) => run('blobs', 'readonly', (s) => s.get(key));
export const blobSet = (key, blob) => run('blobs', 'readwrite', (s) => s.put(blob, key));
export const blobDel = (key) => run('blobs', 'readwrite', (s) => s.delete(key));
