/**
 * GAJE Helix Engine - Sovereign Storage Engine (IndexedDB)
 * Modulo desacoplado para persistencia local estructurada, backup y auditoría.
 */

(function (window) {
    'use strict';

    const DB_NAME = 'GajeHelixDB';
    const DB_VERSION = 2;

    class GajeIndexedStorage {
        constructor() {
            this.db = null;
            this.readyPromise = this.init();
        }

        /**
         * Inicializa la base de datos IndexedDB con versionado y esquemas.
         */
        async init() {
            if (!window.indexedDB) {
                console.warn('⚠️ [GajeStorage] IndexedDB no disponible en este navegador. Usando localStorage como fallback.');
                return null;
            }

            return new Promise((resolve) => {
                const req = indexedDB.open(DB_NAME, DB_VERSION);

                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    
                    // 1. Historial de mensajes estructurado
                    if (!db.objectStoreNames.contains('messages')) {
                        const msgStore = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                        msgStore.createIndex('role', 'role', { unique: false });
                        msgStore.createIndex('time', 'time', { unique: false });
                        msgStore.createIndex('model', 'model', { unique: false });
                        msgStore.createIndex('sessionId', 'sessionId', { unique: false });
                    }

                    // 2. Sesiones de chat independientes
                    if (!db.objectStoreNames.contains('sessions')) {
                        const sessionStore = db.createObjectStore('sessions', { keyPath: 'sessionId' });
                        sessionStore.createIndex('lastActivity', 'lastActivity', { unique: false });
                    }

                    // 3. Bitácora de auditoría y eventos
                    if (!db.objectStoreNames.contains('audit_logs')) {
                        const auditStore = db.createObjectStore('audit_logs', { keyPath: 'id', autoIncrement: true });
                        auditStore.createIndex('timestamp', 'timestamp', { unique: false });
                    }

                    // 4. Islas de Memoria Soberanas .gmem v2 (WASM In-Browser)
                    if (!db.objectStoreNames.contains('memory_islands')) {
                        const memStore = db.createObjectStore('memory_islands', { keyPath: 'key' });
                        memStore.createIndex('organism', 'organism', { unique: false });
                        memStore.createIndex('niche', 'niche', { unique: false });
                        memStore.createIndex('updatedAt', 'updatedAt', { unique: false });
                    }
                };

                req.onsuccess = (e) => {
                    this.db = e.target.result;
                    console.log('⚡ [GajeStorage] GajeHelixDB v2 (con Islas .gmem) inicializada exitosamente en IndexedDB.');
                    this.migrateFromLocalStorage();
                    this.notifyChange('init');
                    resolve(this.db);
                };

                req.onerror = (e) => {
                    console.warn('⚠️ [GajeStorage] Error al abrir IndexedDB:', e);
                    resolve(null);
                };
            });
        }

        /**
         * Migra datos legacy de localStorage a IndexedDB sin pérdida.
         */
        async migrateFromLocalStorage() {
            try {
                const legacy = localStorage.getItem('gaje_chat_history');
                if (legacy) {
                    const arr = JSON.parse(legacy);
                    if (Array.isArray(arr) && arr.length > 0) {
                        const count = await this.getMessageCount();
                        if (count === 0) {
                            for (const item of arr) {
                                await this.saveMessage(item, false);
                            }
                            console.log(`📦 [GajeStorage] Migrados ${arr.length} mensajes históricos desde localStorage a IndexedDB.`);
                            this.notifyChange('migrated');
                        }
                    }
                }
            } catch (e) {
                // Silencioso
            }
        }

        /**
         * Guarda un mensaje de forma asíncrona.
         */
        async saveMessage(entry, notify = true) {
            await this.readyPromise;
            if (!this.db) {
                this.fallbackPush(entry);
                return;
            }

            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('messages', 'readwrite');
                    const store = tx.objectStore('messages');
                    const metaData = entry.meta || entry.metrics || null;
                    const serverTime = (metaData && metaData.server_time) || entry.time || (window.ChatUtils ? window.ChatUtils.formatExactTime() : new Date().toLocaleTimeString('es-ES'));
                    const posixTime = (metaData && metaData.timestamp_posix) || (Date.now() / 1000);

                    const item = {
                        role: entry.role,
                        content: entry.content,
                        thought: entry.thought || null,
                        model: entry.model || 'GAJE',
                        meta: metaData,
                        time: serverTime,
                        timestampPosix: posixTime,
                        sessionId: entry.sessionId || 'default',
                        savedAt: Date.now()
                    };

                    const req = store.add(item);
                    req.onsuccess = () => {
                        if (notify) this.notifyChange('save_message');
                        resolve(req.result);
                    };
                    req.onerror = () => {
                        this.fallbackPush(entry);
                        resolve(null);
                    };
                } catch (e) {
                    this.fallbackPush(entry);
                    resolve(null);
                }
            });
        }

        /**
         * Obtiene todos los mensajes (o por sesión).
         */
        async getAllMessages(sessionId = null) {
            await this.readyPromise;
            if (!this.db) {
                return this.fallbackGet();
            }

            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('messages', 'readonly');
                    const store = tx.objectStore('messages');
                    const req = store.getAll();

                    req.onsuccess = () => {
                        let msgs = req.result || [];
                        if (sessionId) {
                            msgs = msgs.filter(m => m.sessionId === sessionId);
                        }
                        resolve(msgs);
                    };
                    req.onerror = () => resolve(this.fallbackGet());
                } catch (e) {
                    resolve(this.fallbackGet());
                }
            });
        }

        /**
         * Elimina todos los mensajes de la base de datos.
         */
        async clearAllMessages() {
            await this.readyPromise;
            if (this.db) {
                try {
                    const tx = this.db.transaction(['messages'], 'readwrite');
                    tx.objectStore('messages').clear();
                } catch (e) {
                    // Silencioso
                }
            }
            try { localStorage.removeItem('gaje_chat_history'); } catch (e) {}
            this.notifyChange('clear_messages');
        }

        /**
         * Cuenta el total de mensajes almacenados.
         */
        async getMessageCount() {
            await this.readyPromise;
            if (!this.db) return this.fallbackGet().length;

            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('messages', 'readonly');
                    const req = tx.objectStore('messages').count();
                    req.onsuccess = () => resolve(req.result || 0);
                    req.onerror = () => resolve(0);
                } catch (e) {
                    resolve(0);
                }
            });
        }

        // =====================================================================
        // PERSISTENCIA SOBERANA DE ISLAS DE MEMORIA (.gmem v2) EN INDEXEDDB
        // =====================================================================

        /**
         * Guarda un búfer binario .gmem v2 para un organismo y nicho específico.
         */
        async saveMemoryIsland(organism, niche, arrayBuffer) {
            await this.readyPromise;
            if (!this.db) return false;

            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('memory_islands', 'readwrite');
                    const store = tx.objectStore('memory_islands');
                    const key = `${organism}:${niche}`;
                    const entry = {
                        key,
                        organism,
                        niche,
                        buffer: arrayBuffer,
                        byteLength: arrayBuffer.byteLength,
                        updatedAt: Date.now()
                    };
                    const req = store.put(entry);
                    req.onsuccess = () => {
                        this.notifyChange('memory_island_saved');
                        resolve(true);
                    };
                    req.onerror = () => resolve(false);
                } catch (err) {
                    console.error('[GajeStorage] Error guardando isla .gmem:', err);
                    resolve(false);
                }
            });
        }

        /**
         * Carga el búfer binario .gmem v2 para un organismo y nicho específico.
         */
        async loadMemoryIsland(organism, niche) {
            await this.readyPromise;
            if (!this.db) return null;

            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('memory_islands', 'readonly');
                    const store = tx.objectStore('memory_islands');
                    const key = `${organism}:${niche}`;
                    const req = store.get(key);
                    req.onsuccess = () => {
                        if (req.result && req.result.buffer) {
                            resolve(req.result.buffer);
                        } else {
                            resolve(null);
                        }
                    };
                    req.onerror = () => resolve(null);
                } catch (err) {
                    console.error('[GajeStorage] Error cargando isla .gmem:', err);
                    resolve(null);
                }
            });
        }

        /**
         * Lista todas las islas de memoria guardadas en IndexedDB.
         */
        async listMemoryIslands(organism = null) {
            await this.readyPromise;
            if (!this.db) return [];

            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('memory_islands', 'readonly');
                    const store = tx.objectStore('memory_islands');
                    const req = store.getAll();
                    req.onsuccess = () => {
                        let list = req.result || [];
                        if (organism) {
                            list = list.filter(item => item.organism === organism);
                        }
                        resolve(list.map(item => ({
                            key: item.key,
                            organism: item.organism,
                            niche: item.niche,
                            byteLength: item.byteLength,
                            updatedAt: item.updatedAt
                        })));
                    };
                    req.onerror = () => resolve([]);
                } catch (err) {
                    resolve([]);
                }
            });
        }

        /**
         * Borra todas las islas de memoria de un organismo o de todos.
         */
        async clearMemoryIslands(organism = null) {
            await this.readyPromise;
            if (!this.db) return false;

            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('memory_islands', 'readwrite');
                    const store = tx.objectStore('memory_islands');
                    if (!organism) {
                        const req = store.clear();
                        req.onsuccess = () => resolve(true);
                        req.onerror = () => resolve(false);
                    } else {
                        const req = store.getAllKeys();
                        req.onsuccess = () => {
                            const keys = req.result || [];
                            keys.forEach(k => {
                                if (String(k).startsWith(`${organism}:`)) {
                                    store.delete(k);
                                }
                            });
                            resolve(true);
                        };
                        req.onerror = () => resolve(false);
                    }
                } catch (err) {
                    resolve(false);
                }
            });
        }

        /**
         * Estima el almacenamiento ocupado en disco por IndexedDB.
         */
        async getStorageEstimate() {
            if (navigator.storage && navigator.storage.estimate) {
                try {
                    const est = await navigator.storage.estimate();
                    return {
                        usageBytes: est.usage || 0,
                        quotaBytes: est.quota || 0,
                        usageFormatted: this.formatBytes(est.usage || 0),
                        quotaFormatted: this.formatBytes(est.quota || 0),
                        percentUsed: est.quota ? ((est.usage / est.quota) * 100).toFixed(2) : 0
                    };
                } catch (e) {
                    // fallback
                }
            }
            return {
                usageBytes: 0,
                quotaBytes: 0,
                usageFormatted: 'N/A',
                quotaFormatted: 'N/A',
                percentUsed: 0
            };
        }

        /**
         * Exporta toda la base de datos local en formato JSON soberano.
         */
        async exportFullDatabase() {
            const messages = await this.getAllMessages();
            const estimate = await this.getStorageEstimate();
            const exportData = {
                app: 'GAJE Helix Engine',
                version: '1.6.2',
                schema: 'GajeHelixDB-v1',
                exportedAt: new Date().toISOString(),
                stats: {
                    totalMessages: messages.length,
                    storageEstimate: estimate
                },
                messages: messages
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gaje_helix_database_backup_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        /**
         * Importa datos desde un archivo JSON respaldado previamente.
         */
        async importFullDatabase(jsonString) {
            try {
                const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
                if (!data || !Array.isArray(data.messages)) {
                    throw new Error('Formato de backup inválido: debe contener un array de mensajes.');
                }

                await this.clearAllMessages();
                for (const msg of data.messages) {
                    await this.saveMessage(msg, false);
                }

                this.notifyChange('imported');
                return { success: true, count: data.messages.length };
            } catch (err) {
                console.error('[GajeStorage] Error al importar base de datos:', err);
                return { success: false, error: err.message };
            }
        }

        /**
         * Emite un evento en window para reactividad de la interfaz.
         */
        notifyChange(action) {
            window.dispatchEvent(new CustomEvent('gaje:db:changed', {
                detail: { action, timestamp: Date.now() }
            }));
        }

        formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        // Fallbacks para entornos restringidos
        fallbackPush(entry) {
            try {
                const raw = localStorage.getItem('gaje_chat_history');
                const arr = raw ? JSON.parse(raw) : [];
                arr.push(entry);
                if (arr.length > 200) arr.splice(0, arr.length - 200);
                localStorage.setItem('gaje_chat_history', JSON.stringify(arr));
            } catch (e) {}
        }

        fallbackGet() {
            try {
                const raw = localStorage.getItem('gaje_chat_history');
                return raw ? JSON.parse(raw) : [];
            } catch (e) { return []; }
        }
    }

    // Exponer como Singleton Global
    window.GajeDB = new GajeIndexedStorage();

})(window);
