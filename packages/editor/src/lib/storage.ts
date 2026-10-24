/**
 * Minimal key-value store on IndexedDB (one database, one object store). Values are stored by
 * structured clone, so carts go in as plain objects.
 */
const DB = 'stitch';
const STORE = 'kv';

let db: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return db;
}

function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = f(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const kvGet = <T>(key: string) =>
  run<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
export const kvSet = (key: string, value: unknown) =>
  run('readwrite', (s) => s.put(value, key)).then(() => undefined);
export const kvDelete = (key: string) =>
  run('readwrite', (s) => s.delete(key)).then(() => undefined);
