const DB_NAME = "AlphaX_IPTV_Cache";
const DB_VERSION = 1;
const STORE_NAME = "content_cache";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 Horas

export const iptvCacheDB = {
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: "type" });
                }
            };

            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject("Erro ao abrir IndexedDB: " + event.target.error);
        });
    },

    async get(type) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(type);

            request.onsuccess = () => {
                const result = request.result;
                if (!result) return resolve(null);

                const agora = Date.now();
                if (agora - result.timestamp > CACHE_TTL) {
                    resolve(null);
                } else {
                    resolve(result.data);
                }
            };
            request.onerror = () => reject(request.error);
        });
    },

    async set(type, data) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            const store = transaction.objectStore(STORE_NAME);

            const entry = {
                type: type,
                timestamp: Date.now(),
                data: data
            };

            const request = store.put(entry);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    },

    async clearAll() {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }
};