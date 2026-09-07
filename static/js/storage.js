/**
 * GAJE Helix Engine - Sovereign Storage Engine (IndexedDB)
 * Modulo desacoplado para persistencia local estructurada, backup y auditoría.
 */

(function (window) {
    'use strict';

    const DB_NAME = 'GajeHelixDB';
    const DB_VERSION = 3;

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

                    // 5. Caché Local de Modelos Binarios .flat (Zero-Download Offline)
                    if (!db.objectStoreNames.contains('model_cache')) {
                        db.createObjectStore('model_cache', { keyPath: 'name' });
                    }
                };

                req.onsuccess = (e) => {
                    this.db = e.target.result;
                    console.log('⚡ [GajeStorage] GajeHelixDB v3 (con Islas .gmem y Model Cache) inicializada en IndexedDB.');
                    this.migrateFromLocalStorage();
                    this.requestPersistentStorage();
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
         * Solicita persistencia de almacenamiento para evitar que navegadores móviles (iOS/Android) purguen los modelos binarios.
         */
        async requestPersistentStorage() {
            try {
                if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
                    const isPersisted = await navigator.storage.persisted();
                    if (!isPersisted) {
                        const granted = await navigator.storage.persist();
                        if (granted) {
                            console.log('🛡️ [GajeStorage] Almacenamiento persistente concedido por el navegador.');
                        }
                    }
                }
            } catch (err) {
                console.debug('ℹ️ [GajeStorage] No se pudo verificar persistencia de almacenamiento:', err);
            }
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
                    req.onsuccess = async () => {
                        // Actualizar o inicializar metadatos de la sesión en el store 'sessions'
                        try {
                            if (this.db.objectStoreNames.contains('sessions')) {
                                await this._upsertSessionOnMessage(item);
                            }
                        } catch (_) {}
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
         * Actualiza o crea la entrada de sesión tras registrar un mensaje.
         */
        async _upsertSessionOnMessage(msgItem) {
            const sid = msgItem.sessionId || 'default';
            const existing = await this.getSession(sid);
            const now = Date.now();
            let title = existing?.title;
            const isCustom = !!existing?.customTitle;

            if (!existing) {
                // Si es el primer mensaje de la sesión, derivar un título inicial legible
                if (msgItem.role === 'user' && msgItem.content) {
                    const cleanText = msgItem.content.replace(/\s+/g, ' ').trim();
                    title = cleanText.length > 42 ? cleanText.slice(0, 42) + '...' : cleanText;
                } else {
                    title = 'Nueva Conversación';
                }
            } else if (!isCustom && existing.title === 'Nueva Conversación' && msgItem.role === 'user' && msgItem.content) {
                const cleanText = msgItem.content.replace(/\s+/g, ' ').trim();
                title = cleanText.length > 42 ? cleanText.slice(0, 42) + '...' : cleanText;
            }

            const sessionData = {
                sessionId: sid,
                title: title || 'Conversación',
                customTitle: isCustom,
                model: msgItem.model || existing?.model || 'GAJE',
                createdAt: existing?.createdAt || now,
                lastActivity: now
            };

            await this.saveSession(sessionData);
        }

        /**
         * Guarda o actualiza los metadatos de una sesión en el store 'sessions'.
         */
        async saveSession(sessionData) {
            await this.readyPromise;
            if (!this.db || !sessionData || !sessionData.sessionId) return null;
            if (!this.db.objectStoreNames.contains('sessions')) return null;

            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('sessions', 'readwrite');
                    const store = tx.objectStore('sessions');
                    const item = {
                        sessionId: sessionData.sessionId,
                        title: sessionData.title || 'Conversación',
                        customTitle: !!sessionData.customTitle,
                        model: sessionData.model || 'GAJE',
                        createdAt: sessionData.createdAt || Date.now(),
                        lastActivity: sessionData.lastActivity || Date.now()
                    };
                    const req = store.put(item);
                    req.onsuccess = () => resolve(item);
                    req.onerror = () => resolve(null);
                } catch (e) {
                    resolve(null);
                }
            });
        }

        /**
         * Obtiene los metadatos de una sesión por su sessionId.
         */
        async getSession(sessionId) {
            await this.readyPromise;
            if (!this.db || !sessionId) return null;
            if (!this.db.objectStoreNames.contains('sessions')) return null;

            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('sessions', 'readonly');
                    const req = tx.objectStore('sessions').get(sessionId);
                    req.onsuccess = () => resolve(req.result || null);
                    req.onerror = () => resolve(null);
                } catch (e) {
                    resolve(null);
                }
            });
        }

        /**
         * Obtiene la lista completa de sesiones ordenadas por última actividad.
         */
        async getAllSessions() {
            await this.readyPromise;
            if (!this.db || !this.db.objectStoreNames.contains('sessions')) return [];

            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('sessions', 'readonly');
                    const store = tx.objectStore('sessions');
                    const req = store.getAll();
                    req.onsuccess = () => {
                        const sessions = req.result || [];
                        sessions.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
                        resolve(sessions);
                    };
                    req.onerror = () => resolve([]);
                } catch (e) {
                    resolve([]);
                }
            });
        }

        /**
         * Actualiza el título personalizado de una conversación.
         */
        async updateSessionTitle(sessionId, newTitle) {
            await this.readyPromise;
            if (!this.db || !sessionId || !newTitle) return false;
            const existing = await this.getSession(sessionId);
            const now = Date.now();
            const sessionData = existing || {
                sessionId: sessionId,
                createdAt: now,
                model: 'GAJE'
            };
            sessionData.title = newTitle.trim();
            sessionData.customTitle = true;
            sessionData.lastActivity = now;

            const res = await this.saveSession(sessionData);
            if (res) {
                this.notifyChange('update_session_title');
                return true;
            }
            return false;
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
         * Elimina todos los mensajes y sesiones de la base de datos.
         */
        async clearAllMessages() {
            await this.readyPromise;
            if (this.db) {
                try {
                    const stores = ['messages'];
                    if (this.db.objectStoreNames.contains('sessions')) stores.push('sessions');
                    const tx = this.db.transaction(stores, 'readwrite');
                    stores.forEach(s => tx.objectStore(s).clear());
                } catch (e) {
                    // Silencioso
                }
            }
            try { localStorage.removeItem('gaje_chat_history'); } catch (e) {}
            this.notifyChange('clear_messages');
        }

        /**
         * Elimina los mensajes y la entrada de una sesión específica.
         */
        async deleteMessagesBySession(sessionId) {
            await this.readyPromise;
            if (!this.db || !sessionId) return false;

            // Borrar de sessions
            if (this.db.objectStoreNames.contains('sessions')) {
                try {
                    const sTx = this.db.transaction('sessions', 'readwrite');
                    sTx.objectStore('sessions').delete(sessionId);
                } catch (_) {}
            }

            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction(['messages'], 'readwrite');
                    const store = tx.objectStore('messages');
                    const idx = store.index('sessionId');
                    const req = idx.openCursor(IDBKeyRange.only(sessionId));
                    req.onsuccess = (e) => {
                        const cursor = e.target.result;
                        if (cursor) {
                            cursor.delete();
                            cursor.continue();
                        } else {
                            this.notifyChange('delete_session');
                            resolve(true);
                        }
                    };
                    req.onerror = () => resolve(false);
                } catch (e) {
                    resolve(false);
                }
            });
        }

        /**
         * Exporta una conversación individual en formato Markdown (.md)
         */
        async exportSessionMarkdown(sessionId) {
            await this.readyPromise;
            const msgs = await this.getAllMessages(sessionId);
            if (!msgs || msgs.length === 0) return false;

            const sessionInfo = await this.getSession(sessionId);
            const title = sessionInfo?.title || `Conversación ${sessionId}`;
            const dateStr = new Date(sessionInfo?.createdAt || Date.now()).toLocaleString('es-ES');
            const modelStr = sessionInfo?.model || msgs[0]?.model || 'GAJE Helix';

            let md = `# 🧬 GAJE Helix — ${title}\n\n`;
            md += `* **ID de Sesión:** \`${sessionId}\`\n`;
            md += `* **Fecha:** ${dateStr}\n`;
            md += `* **Modelo Activo:** \`${modelStr}\`\n`;
            md += `* **Total Mensajes:** ${msgs.length}\n\n`;
            md += `---\n\n`;

            msgs.forEach((m) => {
                const roleName = m.role === 'user' ? '👤 Usuario' : `🧬 GAJE (${m.model || modelStr})`;
                const timeStr = m.time || '';
                md += `### ${roleName} ${timeStr ? `*[${timeStr}]*` : ''}\n\n`;
                if (m.thought) {
                    md += `> **Pensamiento:**\n> ${m.thought.split('\n').join('\n> ')}\n\n`;
                }
                md += `${m.content}\n\n---\n\n`;
            });

            const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const sanitizedTitle = title.replace(/[^a-z0-9_\u00C0-\u017F-]/gi, '_').toLowerCase();
            a.download = `gaje_${sanitizedTitle}_${Date.now()}.md`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            return true;
        }

        /**
         * Exporta una conversación individual en formato JSON
         */
        async exportSessionJson(sessionId) {
            await this.readyPromise;
            const msgs = await this.getAllMessages(sessionId);
            if (!msgs || msgs.length === 0) return false;

            const sessionInfo = await this.getSession(sessionId);
            const data = {
                session: sessionInfo || { sessionId, title: 'Conversación' },
                exportedAt: new Date().toISOString(),
                messages: msgs
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gaje_session_${sessionId}_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            return true;
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

        /**
         * Guarda un registro de auditoría / evento del sistema en audit_logs.
         */
        async saveAuditLog(eventText, level = 'info') {
            await this.readyPromise;
            if (!this.db) return null;

            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('audit_logs', 'readwrite');
                    const store = tx.objectStore('audit_logs');
                    const item = {
                        text: eventText,
                        level: level,
                        timestamp: Date.now(),
                        time: window.ChatUtils ? window.ChatUtils.formatExactTime() : new Date().toLocaleTimeString('es-ES')
                    };
                    const req = store.add(item);
                    req.onsuccess = () => resolve(req.result);
                    req.onerror = () => resolve(null);
                } catch (e) {
                    resolve(null);
                }
            });
        }

        /**
         * Obtiene todos los logs de auditoría guardados.
         */
        async getAuditLogs(limit = 100) {
            await this.readyPromise;
            if (!this.db) return [];

            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('audit_logs', 'readonly');
                    const store = tx.objectStore('audit_logs');
                    const req = store.getAll();
                    req.onsuccess = () => {
                        const list = req.result || [];
                        resolve(list.slice(-limit));
                    };
                    req.onerror = () => resolve([]);
                } catch (e) {
                    resolve([]);
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
         * Obtiene un modelo binario .flat almacenado en caché local (OPFS con fallback a IndexedDB)
         */
        async getCachedModel(name) {
            // 1. Intentar OPFS primero (alto rendimiento, sin límite de clonado estructurado)
            if (navigator.storage && navigator.storage.getDirectory) {
                try {
                    const root = await navigator.storage.getDirectory();
                    const fileHandle = await root.getFileHandle(name, { create: false });
                    const file = await fileHandle.getFile();
                    if (file.size >= 4096) {
                        const buffer = await file.arrayBuffer();
                        console.log(`⚡ [GajeStorage] Modelo ${name} recuperado desde OPFS (${(buffer.byteLength / 1048576).toFixed(1)} MB).`);
                        return buffer;
                    }
                } catch (e) {
                    // Fallback transparente a IndexedDB
                }
            }

            // 2. Fallback a IndexedDB
            await this.readyPromise;
            if (!this.db || !this.db.objectStoreNames.contains('model_cache')) return null;
            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('model_cache', 'readonly');
                    const store = tx.objectStore('model_cache');
                    const req = store.get(name);
                    req.onsuccess = () => resolve(req.result ? req.result.buffer : null);
                    req.onerror = () => resolve(null);
                } catch (e) {
                    resolve(null);
                }
            });
        }

        /**
         * Guarda un modelo binario .flat en la caché local (OPFS + IndexedDB) para acceso offline instantáneo
         */
        async saveCachedModel(name, buffer) {
            let opfsSaved = false;

            // 1. Guardar en OPFS si está disponible
            if (navigator.storage && navigator.storage.getDirectory) {
                try {
                    const root = await navigator.storage.getDirectory();
                    const fileHandle = await root.getFileHandle(name, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(buffer);
                    await writable.close();
                    opfsSaved = true;
                    console.log(`📦 [GajeStorage] Modelo ${name} guardado en OPFS (${(buffer.byteLength / 1048576).toFixed(1)} MB).`);
                } catch (e) {
                    console.warn('[GajeStorage] No se pudo guardar en OPFS, usando IndexedDB:', e);
                }
            }

            // 2. Guardar en IndexedDB como redundancia solo si el modelo no es gigante (>300 MB)
            // Si OPFS ya persistió un modelo pesado, evitamos clonar cientos de MB en IndexedDB
            if (opfsSaved && buffer.byteLength > 300 * 1024 * 1024) {
                return true;
            }

            await this.readyPromise;
            if (!this.db || !this.db.objectStoreNames.contains('model_cache')) return opfsSaved;
            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('model_cache', 'readwrite');
                    const store = tx.objectStore('model_cache');
                    const req = store.put({ name, buffer, updatedAt: Date.now() });
                    req.onsuccess = () => {
                        console.log(`📦 [GajeStorage] Modelo ${name} sincronizado en IndexedDB.`);
                        resolve(true);
                    };
                    req.onerror = () => resolve(opfsSaved);
                } catch (e) {
                    resolve(opfsSaved);
                }
            });
        }

        /**
         * Elimina un modelo específico de la caché OPFS e IndexedDB
         */
        async deleteCachedModel(name) {
            if (navigator.storage && navigator.storage.getDirectory) {
                try {
                    const root = await navigator.storage.getDirectory();
                    await root.removeEntry(name);
                    console.log(`🗑️ [GajeStorage] Modelo ${name} purgado de OPFS.`);
                } catch (e) {}
            }

            await this.readyPromise;
            if (!this.db || !this.db.objectStoreNames.contains('model_cache')) return false;
            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('model_cache', 'readwrite');
                    const store = tx.objectStore('model_cache');
                    const req = store.delete(name);
                    req.onsuccess = () => {
                        console.log(`🗑️ [GajeStorage] Modelo ${name} purgado de IndexedDB.`);
                        resolve(true);
                    };
                    req.onerror = () => resolve(false);
                } catch (e) {
                    resolve(false);
                }
            });
        }

        /**
         * Limpia todos los modelos almacenados en caché OPFS e IndexedDB
         */
        async clearModelCache() {
            if (navigator.storage && navigator.storage.getDirectory) {
                try {
                    const root = await navigator.storage.getDirectory();
                    for await (const [key] of root.entries()) {
                        if (key.endsWith('.flat') || key.endsWith('.gaje')) {
                            await root.removeEntry(key);
                        }
                    }
                    console.log(`🗑️ [GajeStorage] Modelos purgados de OPFS.`);
                } catch (e) {}
            }

            await this.readyPromise;
            if (!this.db || !this.db.objectStoreNames.contains('model_cache')) return false;
            return new Promise((resolve) => {
                try {
                    const tx = this.db.transaction('model_cache', 'readwrite');
                    const store = tx.objectStore('model_cache');
                    const req = store.clear();
                    req.onsuccess = () => {
                        console.log(`🗑️ [GajeStorage] Caché de modelos vaciada completamente en IndexedDB.`);
                        resolve(true);
                    };
                    req.onerror = () => resolve(false);
                } catch (e) {
                    resolve(false);
                }
            });
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
