/* =============================================================================
   🧬 GAJE — static/js/chat/model_loader.js
   Módulo de Carga, Descarga Multi-Stream (HTTP Range 206) y Persistencia OPFS/IndexedDB.
   ============================================================================= */

window.ChatModelLoader = {
    /**
     * Resuelve un identificador de modelo o URL directa al endpoint real de Hugging Face.
     */
    resolveModelUrl(modelIdentifier) {
        if (typeof modelIdentifier !== "string") {
            return ["https://huggingface.co/eaguilar/gaje-models/resolve/main/max.gaje", "max.gaje"];
        }

        if (modelIdentifier.startsWith("http://") || modelIdentifier.startsWith("https://")) {
            const cleanUrl = modelIdentifier.split("?")[0];
            const parts = cleanUrl.split("/");
            const filename = parts[parts.length - 1] || "max.gaje";
            return [modelIdentifier, filename];
        }

        const modelMap = {
            "max": ["max.gaje", "eaguilar/gaje-models"],
            "max.gaje": ["max.gaje", "eaguilar/gaje-models"],
            "max_512": ["max_512.gaje", "eaguilar/gaje-models"],
            "max_512.gaje": ["max_512.gaje", "eaguilar/gaje-models"],
            "max_512_pro": ["max_512_pro.gaje", "eaguilar/gaje-models"],
            "max_512_pro.gaje": ["max_512_pro.gaje", "eaguilar/gaje-models"]
        };

        if (modelMap[modelIdentifier]) {
            const [fname, repo] = modelMap[modelIdentifier];
            const cdnBase = window.GAJE_CONFIG?.cdnBaseUrl || `https://huggingface.co/${repo}/resolve/main/`;
            const url = cdnBase.endsWith("/") ? `${cdnBase}${encodeURIComponent(fname)}` : `${cdnBase}/${encodeURIComponent(fname)}`;
            return [url, fname];
        }

        const fname = modelIdentifier.endsWith(".gaje") ? modelIdentifier : `${modelIdentifier}.gaje`;
        const cdnBase = window.GAJE_CONFIG?.cdnBaseUrl || "https://huggingface.co/eaguilar/gaje-models/resolve/main/";
        const url = cdnBase.endsWith("/") ? `${cdnBase}${encodeURIComponent(fname)}` : `${cdnBase}/${encodeURIComponent(fname)}`;
        return [url, fname];
    },

    /**
     * Construye y devuelve el elemento DOM del banner interactivo Y2K de descarga multi-stream.
     */
    createDownloadAlert(modelName) {
        const dataAlert = document.createElement("div");
        dataAlert.className = "data-usage-alert";
        dataAlert.setAttribute("role", "alert");
        dataAlert.innerHTML = `
            <div class="data-alert-icon"><svg class="y2k-icon"><use href="static/icons/y2k/sprite.svg#i-download"/></svg></div>
            <div class="data-alert-content">
                <div class="data-alert-header">
                    <span class="data-alert-title"><svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-alert"/></svg> Descarga Multi-Canal (4 Streams)</span>
                    <span class="data-alert-badge">4x HTTP Range</span>
                </div>
                <p class="data-alert-text">Descargando pesos de <strong>${modelName}</strong> en 4 canales concurrentes. Los pesos se guardarán en caché local IndexedDB para futuras ejecuciones offline sin consumo de datos.</p>
                <div class="data-alert-progress-track">
                    <div class="data-alert-progress-bar" style="width: 0%"></div>
                </div>
                <div class="data-alert-stats">
                    <span class="data-alert-pct">Iniciando 4 canales...</span>
                    <span class="data-alert-mb">Calculando</span>
                </div>
            </div>
        `;
        return dataAlert;
    },

    /**
     * Descarga un modelo .flat usando 4 streams HTTP Range concurrentes (estilo DNF / hf_transfer).
     */
    async downloadModelMultiStream(modelNameOrUrl, progressCb = null, signal = null) {
        const [url, filename] = this.resolveModelUrl(modelNameOrUrl);
        const CONCURRENCY = 4;

        console.log(`⚡ [Web-DL] Iniciando descarga multi-stream (${CONCURRENCY} canales) para: ${filename} desde ${url}`);

        let contentLength = 0;
        let supportsRange = false;
        try {
            const headResp = await fetch(url, { method: "HEAD", mode: "cors", signal });
            if (headResp.ok) {
                contentLength = parseInt(headResp.headers.get("content-length") || "0", 10);
                const acceptRanges = headResp.headers.get("accept-ranges") || "";
                supportsRange = acceptRanges.toLowerCase().includes("bytes") || contentLength > 0;
                console.log(`⚡ [Web-DL] HEAD: Content-Length=${contentLength}, Range=${supportsRange ? "sí" : "no"}`);
            }
        } catch (e) {
            if (signal?.aborted) throw new Error("Descarga cancelada por el usuario");
            console.warn("⚠️ [Web-DL] HEAD request falló o bloqueado por CORS, procediendo con descarga:", e);
        }

        if (!supportsRange || contentLength < 4 * 1024 * 1024) {
            console.log("[Web-DL] Fallback a descarga lineal por streaming...");
            return this.downloadLinearStream(url, filename, contentLength, progressCb, signal);
        }

        const chunkSize = Math.ceil(contentLength / CONCURRENCY);
        const ranges = [];
        for (let i = 0; i < CONCURRENCY; i++) {
            const start = i * chunkSize;
            if (start >= contentLength) break;
            const end = Math.min(start + chunkSize - 1, contentLength - 1);
            ranges.push({ workerId: i, start, end, total: (end - start + 1) });
        }

        const totalBuffer = new ArrayBuffer(contentLength);
        const totalView = new Uint8Array(totalBuffer);

        const channelReceived = new Array(ranges.length).fill(0);
        const dlStart = Date.now();
        let lastSpeedCheck = dlStart;
        let lastReceived = 0;
        let currentSpeedMb = 0;

        const updateProgress = () => {
            if (!progressCb) return;
            const now = Date.now();
            const totalReceived = channelReceived.reduce((a, b) => a + b, 0);
            const elapsedSec = (now - dlStart) / 1000;
            const intervalSec = (now - lastSpeedCheck) / 1000;

            if (intervalSec >= 0.25 || totalReceived === contentLength) {
                const bytesInInterval = totalReceived - lastReceived;
                currentSpeedMb = (bytesInInterval / (1024 * 1024)) / Math.max(intervalSec, 0.001);
                lastSpeedCheck = now;
                lastReceived = totalReceived;
            }

            const pct = Math.min(100, Math.round((totalReceived / contentLength) * 100));
            const remainingBytes = contentLength - totalReceived;
            const avgSpeed = totalReceived / Math.max(elapsedSec, 0.001);
            const etaSec = avgSpeed > 0 ? Math.ceil(remainingBytes / avgSpeed) : 0;

            progressCb({
                pct,
                receivedBytes: totalReceived,
                totalBytes: contentLength,
                speedMb: currentSpeedMb > 0 ? currentSpeedMb : (totalReceived / (1024 * 1024 * Math.max(0.1, elapsedSec))),
                etaSec,
                concurrency: ranges.length
            });
        };

        const downloadRange = async (range) => {
            const rangeHeader = `bytes=${range.start}-${range.end}`;
            const resp = await fetch(url, {
                method: "GET",
                headers: { "Range": rangeHeader },
                mode: "cors",
                signal
            });

            if (!resp.ok && resp.status !== 206 && resp.status !== 200) {
                throw new Error(`Canal ${range.workerId} error HTTP: ${resp.status} ${resp.statusText}`);
            }

            if (!resp.body) {
                const chunkData = await resp.arrayBuffer();
                const chunkView = new Uint8Array(chunkData);
                totalView.set(chunkView, range.start);
                channelReceived[range.workerId] = chunkView.length;
                updateProgress();
                return;
            }

            const reader = resp.body.getReader();
            let writeOffset = range.start;

            try {
                while (true) {
                    if (signal?.aborted) {
                        try { await reader.cancel(); } catch (e) {}
                        throw new Error("Descarga cancelada por el usuario");
                    }
                    const { done, value } = await reader.read();
                    if (done) break;
                    totalView.set(value, writeOffset);
                    writeOffset += value.length;
                    channelReceived[range.workerId] += value.length;
                    updateProgress();
                }
            } finally {
                reader.releaseLock();
            }
        };

        console.log(`⚡ [Web-DL] Lanzando ${ranges.length} streams concurrentes:`, ranges.map(r => `C${r.workerId}: ${r.start}-${r.end}`));

        try {
            await Promise.all(ranges.map(r => downloadRange(r)));
        } catch (err) {
            if (signal?.aborted) {
                throw new Error("Descarga cancelada por el usuario");
            }
            console.warn("⚠️ [Web-DL] Falló descarga multi-canal, recurriendo a descarga lineal:", err);
            return this.downloadLinearStream(url, filename, contentLength, progressCb, signal);
        }

        const totalElapsedSec = (Date.now() - dlStart) / 1000;
        const finalAvgSpeed = (contentLength / (1024 * 1024)) / Math.max(0.1, totalElapsedSec);

        if (progressCb) {
            progressCb({
                pct: 100,
                receivedBytes: contentLength,
                totalBytes: contentLength,
                speedMb: finalAvgSpeed,
                etaSec: 0,
                concurrency: ranges.length
            });
        }

        console.log(`✅ [Web-DL] Descarga 4-canales completada en ${totalElapsedSec.toFixed(1)}s a ${finalAvgSpeed.toFixed(1)} MB/s`);

        return {
            buffer: totalBuffer,
            filename,
            stats: {
                elapsedSec: totalElapsedSec.toFixed(1),
                speedMb: finalAvgSpeed.toFixed(1),
                channels: ranges.length
            }
        };
    },

    /**
     * Descarga lineal por streaming con actualización fluida de telemetría de progreso.
     */
    async downloadLinearStream(url, filename, expectedBytes = 0, progressCb = null, signal = null) {
        const resp = await fetch(url, { mode: "cors", signal });
        if (!resp.ok) {
            throw new Error(`No se pudo descargar el modelo (${resp.status} ${resp.statusText})`);
        }

        const totalBytes = expectedBytes || parseInt(resp.headers.get("content-length") || "0", 10);
        const dlStart = Date.now();
        let lastSpeedCheck = dlStart;
        let lastReceived = 0;
        let currentSpeedMb = 0;

        if (resp.body && totalBytes > 0) {
            const reader = resp.body.getReader();
            const totalBuffer = new ArrayBuffer(totalBytes);
            const totalView = new Uint8Array(totalBuffer);
            let receivedBytes = 0;

            try {
                while (true) {
                    if (signal?.aborted) {
                        try { await reader.cancel(); } catch (e) {}
                        throw new Error("Descarga cancelada por el usuario");
                    }
                    const { done, value } = await reader.read();
                    if (done) break;
                    totalView.set(value, receivedBytes);
                    receivedBytes += value.length;

                    const now = Date.now();
                    const elapsedSec = (now - dlStart) / 1000;
                    const intervalSec = (now - lastSpeedCheck) / 1000;

                    if (intervalSec >= 0.25 || receivedBytes === totalBytes) {
                        const bytesInInterval = receivedBytes - lastReceived;
                        currentSpeedMb = (bytesInInterval / (1024 * 1024)) / Math.max(intervalSec, 0.001);
                        lastSpeedCheck = now;
                        lastReceived = receivedBytes;
                    }

                    if (progressCb) {
                        const pct = Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
                        const remainingBytes = totalBytes - receivedBytes;
                        const avgSpeed = receivedBytes / Math.max(elapsedSec, 0.001);
                        const etaSec = avgSpeed > 0 ? Math.ceil(remainingBytes / avgSpeed) : 0;
                        progressCb({
                            pct,
                            receivedBytes,
                            totalBytes,
                            speedMb: currentSpeedMb > 0 ? currentSpeedMb : (receivedBytes / (1024 * 1024 * Math.max(0.1, elapsedSec))),
                            etaSec,
                            concurrency: 1
                        });
                    }
                }
            } finally {
                reader.releaseLock();
            }

            const totalElapsedSec = (Date.now() - dlStart) / 1000;
            const avgSpeed = (totalBytes / (1024 * 1024)) / Math.max(0.1, totalElapsedSec);

            return {
                buffer: totalBuffer,
                filename,
                stats: {
                    elapsedSec: totalElapsedSec.toFixed(1),
                    speedMb: avgSpeed.toFixed(1),
                    channels: 1
                }
            };
        } else {
            const buffer = await resp.arrayBuffer();
            const totalElapsedSec = (Date.now() - dlStart) / 1000;
            const avgSpeed = (buffer.byteLength / (1024 * 1024)) / Math.max(0.1, totalElapsedSec);

            return {
                buffer,
                filename,
                stats: {
                    elapsedSec: totalElapsedSec.toFixed(1),
                    speedMb: avgSpeed.toFixed(1),
                    channels: 1
                }
            };
        }
    },

    /**
     * Orquestador completo para obtener el buffer de un modelo:
     * 1. Verifica la caché local persistente IndexedDB / OPFS (validando tokenizador GTOK en offset 88)
     * 2. Si no existe, intenta el backend local (localhost/127.0.0.1)
     * 3. Si no existe, descarga concurrentemente vía CDN (4 canales) con telemetría visual
     * 4. Persiste en IndexedDB / OPFS para subsiguientes arranques instantáneos (0s)
     */
    async loadOrFetchModel(modelName, options = {}) {
        const {
            signal = null,
            onStatusChange = null,
            containerEl = null,
            insertBeforeEl = null
        } = options;

        let buffer = null;

        // 0. Verificar si el modelo ya está en la caché local persistente IndexedDB / OPFS
        if (window.GajeDB && typeof window.GajeDB.getCachedModel === "function") {
            if (onStatusChange) onStatusChange(`Verificando caché local para ${modelName}...`);
            const cachedBuf = await window.GajeDB.getCachedModel(modelName);
            if (cachedBuf && cachedBuf.byteLength >= 4096) {
                let gtokLen = 0n;
                try {
                    const dv = new DataView(cachedBuf);
                    gtokLen = dv.getBigUint64(88, true);
                } catch (e) {
                    gtokLen = 0n;
                }

                if (gtokLen > 0n) {
                    console.log(`⚡ [GAJE-ModelLoader] Modelo ${modelName} recuperado desde caché IndexedDB (${(cachedBuf.byteLength / 1048576).toFixed(1)} MB, con tokenizador GTOK).`);
                    if (onStatusChange) onStatusChange(`Cargando ${modelName} desde almacenamiento local...`);
                    return { buffer: cachedBuf, fromCache: true, source: "indexeddb" };
                } else {
                    console.warn(`[GAJE-ModelLoader] El modelo ${modelName} en caché local IndexedDB está desactualizado (sin GTOK). Purgando y descargando versión actualizada...`);
                    if (typeof window.GajeDB.deleteCachedModel === "function") {
                        await window.GajeDB.deleteCachedModel(modelName);
                    }
                }
            }
        }

        // 1. Si no está en caché, intentar descargar desde el backend local si existe
        if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
            try {
                const localRes = await fetch(`/models/${encodeURIComponent(modelName)}`, { signal });
                if (localRes.ok) {
                    const localBuf = await localRes.arrayBuffer();
                    if (localBuf && localBuf.byteLength >= 4096) {
                        return { buffer: localBuf, fromCache: false, source: "backend" };
                    }
                }
            } catch (err) {
                if (signal?.aborted) throw new Error("Descarga cancelada por el usuario");
                console.warn("[GAJE-ModelLoader] Backend local no respondió, usando CDN...");
            }
        }

        // 2. Si no hay backend local, descargar usando 4 streams concurrentes
        let dataAlert = null;
        if (containerEl) {
            dataAlert = this.createDownloadAlert(modelName);
            if (insertBeforeEl && insertBeforeEl.parentNode === containerEl) {
                containerEl.insertBefore(dataAlert, insertBeforeEl);
            } else {
                containerEl.appendChild(dataAlert);
            }
        }

        if (onStatusChange) onStatusChange(`Conectando con CDN en 4 canales paralelos (${modelName})...`);

        const bar = dataAlert?.querySelector(".data-alert-progress-bar");
        const pctEl = dataAlert?.querySelector(".data-alert-pct");
        const mbEl = dataAlert?.querySelector(".data-alert-mb");

        try {
            const dlResult = await this.downloadModelMultiStream(
                modelName,
                ({ pct, receivedBytes, totalBytes, speedMb, etaSec, concurrency }) => {
                    const recMb = (receivedBytes / (1024 * 1024)).toFixed(1);
                    const totMb = totalBytes > 0 ? (totalBytes / (1024 * 1024)).toFixed(1) : "?";
                    const speedStr = speedMb ? speedMb.toFixed(1) : "0.0";
                    const etaStr = etaSec > 60 ? `${Math.floor(etaSec / 60)}m ${etaSec % 60}s` : `${etaSec}s`;
                    const channelText = concurrency > 1 ? ` · ${concurrency} canales` : "";

                    if (bar) bar.style.width = `${pct}%`;
                    if (pctEl) pctEl.textContent = `${pct}% (${speedStr} MB/s${channelText})`;
                    if (mbEl) mbEl.textContent = `${recMb} / ${totMb} MB · ETA ${etaStr}`;
                    if (onStatusChange) onStatusChange(`Descargando ${modelName}: ${pct}% (${recMb} / ${totMb} MB · ${speedStr} MB/s${channelText})...`);
                },
                signal
            );

            buffer = dlResult.buffer;
            const dlTotalSec = dlResult.stats.elapsedSec;
            const avgSpeedMb = dlResult.stats.speedMb;
            const channels = dlResult.stats.channels || 4;

            if (dataAlert) {
                dataAlert.classList.add("completed");
                const iconContainer = dataAlert.querySelector(".data-alert-icon");
                if (iconContainer) iconContainer.innerHTML = "<svg class=\"y2k-icon\"><use href=\"static/icons/y2k/sprite.svg#i-database\"/></svg>";
                const titleEl = dataAlert.querySelector(".data-alert-title");
                const badgeEl = dataAlert.querySelector(".data-alert-badge");
                if (titleEl) titleEl.innerHTML = `<svg class="y2k-icon-inline"><use href="static/icons/y2k/sprite.svg#i-check"/></svg> Descarga completada en ${dlTotalSec}s (${avgSpeedMb} MB/s - ${channels}x streams)`;
                if (badgeEl) badgeEl.textContent = "IndexedDB Listo";

                setTimeout(() => {
                    if (dataAlert && dataAlert.parentNode) {
                        dataAlert.classList.add("fade-out");
                        setTimeout(() => {
                            if (dataAlert && dataAlert.parentNode) {
                                dataAlert.remove();
                            }
                        }, 450);
                    }
                }, 2200);
            }

            if (buffer && buffer.byteLength >= 4096 && window.GajeDB && typeof window.GajeDB.saveCachedModel === "function") {
                try {
                    if (onStatusChange) onStatusChange(`Persistiendo ${modelName} en almacenamiento local seguro...`);
                    await window.GajeDB.saveCachedModel(modelName, buffer);
                } catch (cacheErr) {
                    console.warn("[GAJE-ModelLoader] Error no fatal al persistir caché:", cacheErr);
                }
            }

            return {
                buffer,
                fromCache: false,
                source: "cdn",
                stats: dlResult.stats,
                dataAlert
            };
        } catch (err) {
            if (dataAlert && dataAlert.parentNode) {
                dataAlert.remove();
            }
            throw err;
        }
    }
};
