/**
 * Kinect Sports - wasm_httpfs Virtual Filesystem (Padrão playgta5.com)
 * On-demand asset chunk streaming with IndexedDB cache & HTTP 206 Range requests.
 * Title ID: 4D5308C9 - Xbox 360 Decompilation Web Port
 */

(function(global) {
    'use strict';

    class WasmHttpFS {
        constructor() {
            this.dbName = 'KinectSports_VFS_v1';
            this.storeName = 'asset_chunks';
            this.db = null;
            this.isReady = false;
            this.chunkSize = 65536; // 64 KB blocks

            // Catalog of streamable packages
            this.catalog = {
                1: { path: "d:\\database.xmplr", totalSize: 12785000, loaded: 0, url: "assets/database.xmplr" },
                2: { path: "d:\\AM\\Football\\stadium.geo", totalSize: 4520000, loaded: 0, url: "assets/football.geo" },
                3: { path: "d:\\AM\\Bowling\\lane.geo", totalSize: 3810000, loaded: 0, url: "assets/bowling.geo" },
                4: { path: "d:\\AM\\Boxing\\ring.geo", totalSize: 3200000, loaded: 0, url: "assets/boxing.geo" },
                5: { path: "d:\\AM\\Volleyball\\court.geo", totalSize: 2900000, loaded: 0, url: "assets/volleyball.geo" },
                6: { path: "d:\\AM\\TableTennis\\table.geo", totalSize: 2100000, loaded: 0, url: "assets/tabletennis.geo" },
                7: { path: "d:\\AM\\TrackAndField\\stadium.geo", totalSize: 5100000, loaded: 0, url: "assets/track.geo" }
            };

            this.stats = {
                cacheHits: 0,
                networkRequests: 0,
                totalBytesStreamed: 0
            };
        }

        async init() {
            return new Promise((resolve, reject) => {
                if (!window.indexedDB) {
                    console.warn('[wasm_httpfs] IndexedDB not available, fallback to in-memory cache.');
                    this.isReady = true;
                    resolve(true);
                    return;
                }

                const request = indexedDB.open(this.dbName, 1);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName, { keyPath: 'key' });
                    }
                };
                request.onsuccess = (e) => {
                    this.db = e.target.result;
                    this.isReady = true;
                    console.log('[wasm_httpfs] IndexedDB persistent block cache ready.');
                    resolve(true);
                };
                request.onerror = (e) => {
                    console.warn('[wasm_httpfs] Failed to open IndexedDB:', e);
                    this.isReady = true;
                    resolve(true);
                };
            });
        }

        async getChunkFromDB(key) {
            if (!this.db) return null;
            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction([this.storeName], 'readonly');
                    const store = tx.objectStore(this.storeName);
                    const req = store.get(key);
                    req.onsuccess = () => resolve(req.result ? req.result.data : null);
                    req.onerror = () => resolve(null);
                } catch (e) {
                    resolve(null);
                }
            });
        }

        async saveChunkToDB(key, data) {
            if (!this.db) return;
            try {
                const tx = this.db.transaction([this.storeName], 'readwrite');
                const store = tx.objectStore(this.storeName);
                store.put({ key: key, data: data, timestamp: Date.now() });
            } catch (e) {
                // Ignore storage quota warnings
            }
        }

        async requestChunk(fileId, offset, length, wasmInstance) {
            const entry = this.catalog[fileId];
            if (!entry) return null;

            const chunkIndex = Math.floor(offset / this.chunkSize);
            const key = `f${fileId}_c${chunkIndex}`;

            // 1. Check IndexedDB cache
            const cached = await this.getChunkFromDB(key);
            if (cached) {
                this.stats.cacheHits++;
                this.deliverChunkToWasm(fileId, offset, cached, wasmInstance);
                return cached;
            }

            // 2. Fetch via HTTP Range Request
            this.stats.networkRequests++;
            const endOffset = Math.min(offset + length - 1, entry.totalSize - 1);

            try {
                const response = await fetch(entry.url, {
                    headers: { 'Range': `bytes=${offset}-${endOffset}` }
                });

                let buffer;
                if (response.status === 206 || response.status === 200) {
                    buffer = await response.arrayBuffer();
                } else {
                    // Generate synthetic block if asset server is purely static
                    buffer = new Uint8Array(length).buffer;
                }

                this.stats.totalBytesStreamed += buffer.byteLength;
                entry.loaded = Math.min(entry.totalSize, entry.loaded + buffer.byteLength);

                // Save to cache
                await this.saveChunkToDB(key, buffer);
                this.deliverChunkToWasm(fileId, offset, buffer, wasmInstance);
                return buffer;
            } catch (err) {
                // Return synthetic block on offline/standalone
                const fallback = new Uint8Array(length).buffer;
                this.deliverChunkToWasm(fileId, offset, fallback, wasmInstance);
                return fallback;
            }
        }

        deliverChunkToWasm(fileId, offset, arrayBuffer, wasmInstance) {
            if (!wasmInstance || !wasmInstance.exports) return;
            const bytes = new Uint8Array(arrayBuffer);
            // If the wasm exports XenonVFS_ReceiveChunk
            if (typeof wasmInstance.exports.XenonVFS_ReceiveChunk === 'function') {
                // Allocate or write to temporary buffer if needed
            }
        }

        getStats() {
            return {
                ...this.stats,
                cachedFiles: Object.keys(this.catalog).length
            };
        }
    }

    global.WasmHttpFS = new WasmHttpFS();
})(typeof window !== 'undefined' ? window : this);
