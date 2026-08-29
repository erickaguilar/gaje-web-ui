/* =============================================================================
   🧬 GAJE — static/js/chat/toolbar.js
   Controlador de la barra de herramientas: modelos, hardware, RAM y parciales.
   ============================================================================= */

window.ChatToolbarController = {
    async init() {
        const host = document.getElementById('chat-toolbar');
        if (host && !host.children.length) {
            try {
                const res = await fetch('static/partials/chat_toolbar.html?v=1.7.0');
                if (res.ok) {
                    const html = await res.text();
                    host.innerHTML = html;
                }
            } catch (err) {
                console.warn('No se pudo cargar parcial chat_toolbar.html:', err);
            }
        }
        this.bindElements();
        const autoLoadEnabled = await this.loadEnvInfo();
        await this.loadModels(autoLoadEnabled);
    },

    clearChatInterface() {
        window.ChatStorage?.clearHistory();
        const chatWindow = document.getElementById('chat-window');
        if (chatWindow) {
            const messages = chatWindow.querySelectorAll('.message');
            messages.forEach(m => m.remove());
        }
        const starters = document.getElementById('chat-starters');
        if (starters) {
            starters.style.display = 'flex';
        }
    },

    bindElements() {
        const appContainer = document.querySelector('.app-container');

        // Botones de control de ventana estilo macOS (Traffic lights)
        const btnClose = document.getElementById('win-btn-close');
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                this.clearChatInterface();
            });
        }

        const btnMin = document.getElementById('win-btn-min');
        if (btnMin && appContainer) {
            btnMin.addEventListener('click', () => {
                appContainer.classList.remove('maximized');
                const isMin = appContainer.classList.toggle('minimized');
                btnMin.setAttribute('title', isMin ? 'Restaurar Ventana' : 'Minimizar Ventana');
            });
        }

        const btnMax = document.getElementById('win-btn-max');
        if (btnMax && appContainer) {
            btnMax.addEventListener('click', () => {
                appContainer.classList.remove('minimized');
                const isMax = appContainer.classList.toggle('maximized');
                btnMax.setAttribute('title', isMax ? 'Restaurar Tamaño' : 'Pantalla Completa');
            });
        }

        const modelSelect = document.getElementById('model-select');
        if (modelSelect) {
            modelSelect.addEventListener('change', () => {
                this.preloadModel(modelSelect.value);
            });
        }

        const modelToggleBtn = document.getElementById('model-toggle-btn');
        if (modelToggleBtn) {
            modelToggleBtn.addEventListener('click', () => this.toggleCurrentModel());
        }

        const stopAllBtn = document.getElementById('stop-all-models-btn');
        if (stopAllBtn) {
            stopAllBtn.addEventListener('click', () => this.stopAllModels());
        }

        const clearHistoryBtn = document.getElementById('clear-history-btn');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => {
                this.clearChatInterface();
            });
        }

        const unloadModelBtn = document.getElementById('unload-model-btn');
        if (unloadModelBtn) {
            unloadModelBtn.addEventListener('click', () => this.unloadModels());
        }

        const exportLogBtn = document.getElementById('export-log-btn');
        if (exportLogBtn) {
            exportLogBtn.addEventListener('click', () => window.ChatUtils.generateProjectLog(exportLogBtn));
        }



        const engineModeSelect = document.getElementById('engine-mode-select');
        if (engineModeSelect) {
            engineModeSelect.addEventListener('change', (e) => this.onEngineModeChange(e.target.value));
        }

        const btnLoadLocalFlat = document.getElementById('load-local-flat-btn');
        const inputLocalFlat = document.getElementById('local-flat-file-input');
        if (btnLoadLocalFlat && inputLocalFlat) {
            btnLoadLocalFlat.addEventListener('click', () => inputLocalFlat.click());
            inputLocalFlat.addEventListener('change', (e) => this.onLocalFlatSelected(e));
        }

        // Menú Overflow (•••)
        const menuBtn = document.getElementById('chat-overflow-menu-btn');
        const menuDropdown = document.getElementById('chat-actions-dropdown');
        if (menuBtn && menuDropdown) {
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isHidden = menuDropdown.hasAttribute('hidden');
                if (isHidden) {
                    menuDropdown.removeAttribute('hidden');
                    menuBtn.setAttribute('aria-expanded', 'true');
                } else {
                    menuDropdown.setAttribute('hidden', '');
                    menuBtn.setAttribute('aria-expanded', 'false');
                }
            });

            document.addEventListener('click', (e) => {
                if (!menuDropdown.contains(e.target) && e.target !== menuBtn && !menuBtn.contains(e.target)) {
                    menuDropdown.setAttribute('hidden', '');
                    menuBtn.setAttribute('aria-expanded', 'false');
                }
            });

            menuDropdown.querySelectorAll('.chat-menu-item:not(.engine-select-item):not(.model-select-menu-item)').forEach(item => {
                item.addEventListener('click', () => {
                    menuDropdown.setAttribute('hidden', '');
                    menuBtn.setAttribute('aria-expanded', 'false');
                });
            });
        }
    },

    isStaticEnvironment() {
        return window.location.hostname.includes('vercel.app') ||
               window.location.hostname.includes('github.io') ||
               (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1');
    },

    async loadModels(autoLoadEnabled = true) {
        const modelSelect = document.getElementById('model-select');
        if (!modelSelect) return;

        // Entorno estático (Zero-Server / Vercel / PWA): Catálogo verificado sin peticiones 404
        if (this.isStaticEnvironment()) {
            const catalog = (window.GAJE_CONFIG && window.GAJE_CONFIG.modelsCatalog) ? window.GAJE_CONFIG.modelsCatalog : [
                { id: 'gaje_pico_135m.flat', name: 'gaje_pico_135m.flat', title: 'GAJE Pico 135M', badge: 'Móvil Ultra-Rápido 470MB', size_bytes: 494280704 }
            ];
            window.ChatState.modelsData = catalog;
            modelSelect.innerHTML = '';
            catalog.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id || m.name;
                opt.innerText = `${m.title} · [${m.badge}]`;
                if ((m.id || m.name) === (window.GAJE_CONFIG?.defaultModel || 'gaje_pico_135m.flat')) {
                    opt.selected = true;
                }
                modelSelect.appendChild(opt);
            });
            this.updateModelMeta();
            return;
        }

        try {
            const response = await fetch('/api/models');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data && data.models && data.models.length > 0) {
                window.ChatState.modelsData = data.models;
                modelSelect.innerHTML = '';
                window.ChatState.modelsData.forEach(model => {
                    const opt = document.createElement('option');
                    opt.value = model.name;
                    let label = model.name;
                    if (label === 'qwen2_5_3b.flat') label = 'Qwen 2.5 3B · [Principal Flat]';
                    else if (label === 'deepseek_r1_1_5b.flat') label = 'DeepSeek-R1 1.5B · [CoT Flat]';
                    else if (label === 'feto_genomico_v1.gaje') label = 'Feto Genómico v1 · [Nacido GAJE]';
                    else if (label === 'qwen2_0_5b.flat') label = 'Qwen 2 0.5B · [Micro Flat]';
                    else if (label === 'smollm2_135m.flat') label = 'SmolLM2 135M · [Nano Flat]';
                    else if (label.endsWith('.gaje')) label = label.replace('.gaje', '') + ' · [GAJE Model]';
                    else if (label.endsWith('.flat')) label = label.replace('.flat', '') + ' · [Flat Model]';
                    opt.innerText = label;
                    modelSelect.appendChild(opt);
                });
                this.updateModelMeta();
            }
        } catch (err) {
            const catalog = (window.GAJE_CONFIG && window.GAJE_CONFIG.modelsCatalog) ? window.GAJE_CONFIG.modelsCatalog : [
                { id: 'gaje_pico_135m.flat', name: 'gaje_pico_135m.flat', title: 'GAJE Pico 135M', badge: 'Móvil Ultra-Rápido 470MB', size_bytes: 494280704 }
            ];
            window.ChatState.modelsData = catalog;
            this.updateModelMeta();
        }
    },

    async loadEnvInfo() {
        if (this.isStaticEnvironment()) {
            this.onEngineModeChange('wasm');
            this.populateClientTelemetry();
            return false;
        }

        try {
            const response = await fetch('/api/info');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const info = await response.json();
            if (!info || info.error) return true;
            window.ChatState.envData = info;
            this.renderEnvInfo(info);
            return info.auto_load_model !== false;
        } catch (err) {
            this.onEngineModeChange('wasm');
            this.populateClientTelemetry();
            return false;
        }
    },

    populateClientTelemetry() {
        const getGpuRenderer = () => {
            try {
                const canvas = document.createElement('canvas');
                const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                if (!gl) return 'Aceleración WebGL Integrada';
                const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                return debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Aceleración GPU WebGL Activa';
            } catch (e) {
                return 'Aceleración por Hardware (Browser)';
            }
        };

        const cores = navigator.hardwareConcurrency || 8;
        const memoryGb = navigator.deviceMemory ? `~${navigator.deviceMemory} GB` : 'RAM Dinámica';
        const clientPlatform = navigator.userAgent.includes('Android') ? 'Android ARM' :
                               navigator.userAgent.includes('iPhone') ? 'iOS Apple Silicon' :
                               navigator.userAgent.includes('Linux') ? 'Linux x86_64' :
                               navigator.userAgent.includes('Mac') ? 'macOS Darwin' : 'Windows x86_64';

        const clientEnv = {
            software: `GAJE Genomic Runtime (Tronco Encefálico SIMD128) · v${window.GAJE_CONFIG?.version || '1.7.7'}`,
            hardware: `${clientPlatform} (${cores} Cores, ${memoryGb} RAM)`,
            architecture: `${clientPlatform} (Cores: ${cores})`,
            cores: cores,
            gpu: getGpuRenderer(),
            simd: 'SIMD128 Genómico + Memoria Zero-Copy (Cliente)',
            throughput: 'Inferencia en Tronco Encefálico Local (Zero-Server)',
            island: {
                memory_type: '.gmem (IndexedDB GajeHelixDB Zero-Server)',
                retrieval_latency_ms: 0.45,
                context_budget: 512,
                pills: ['⚡ Episódica', '📚 Documental', '💬 Conversación']
            }
        };

        window.ChatState.envData = clientEnv;
        this.renderEnvInfo(clientEnv);
    },

    renderEnvInfo(info) {
        const setTxt = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.innerText = txt || '---';
        };

        setTxt('sf-val', info.software);
        setTxt('hd-val', info.hardware);
        setTxt('arch-val', info.architecture);
        setTxt('simd-val', info.simd);
        setTxt('cores-val', info.cores || '---');

        setTxt('modal-sf-val', info.software);
        setTxt('modal-hd-val', info.hardware);
        setTxt('modal-arch-val', info.architecture);
        setTxt('modal-simd-val', info.simd);
        setTxt('modal-cores-val', info.cores || '---');

        const status = document.querySelector('.status-text');
        if (status && info.simd) status.innerText = info.simd + ' Optimized';

        const gpuHeaderBadge = document.getElementById('gpu-header-badge');
        const gpuHeaderText = document.getElementById('gpu-header-text');
        const modalGpuVal = document.getElementById('modal-gpu-val');
        if (info.gpu) {
            const gpuName = (typeof info.gpu === 'object') ? `${info.gpu.device_name} (${info.gpu.backend})` : info.gpu;
            if (gpuHeaderBadge) gpuHeaderBadge.style.display = 'inline-flex';
            if (gpuHeaderText) gpuHeaderText.innerText = `🎮 GPU Activa`;
            if (modalGpuVal) modalGpuVal.innerText = gpuName;
        } else {
            if (gpuHeaderBadge) gpuHeaderBadge.style.display = 'none';
            if (modalGpuVal) modalGpuVal.innerText = 'No activa (Fallback CPU SIMD)';
        }

        if (info.island) {
            const pillsHtml = (info.island.pills || []).map(p => {
                let typeClass = 'pill-generic';
                const lower = p.toLowerCase();
                if (lower.includes('episod')) typeClass = 'pill-episodic';
                else if (lower.includes('doc')) typeClass = 'pill-documental';
                else if (lower.includes('convers')) typeClass = 'pill-conversational';
                return `<span class="island-pill ${typeClass}">${p}</span>`;
            }).join('');

            const p1 = document.getElementById('island-pills');
            if (p1) p1.innerHTML = pillsHtml;
            const p2 = document.getElementById('modal-island-pills');
            if (p2) p2.innerHTML = pillsHtml;

            if (info.island.memory_type) {
                setTxt('island-mem-val', info.island.memory_type);
                setTxt('modal-island-mem-val', info.island.memory_type);
            }
            if (info.island.retrieval_latency_ms != null) {
                setTxt('island-lat-val', `${info.island.retrieval_latency_ms} ms`);
                setTxt('modal-island-lat-val', `${info.island.retrieval_latency_ms} ms`);
            }
            if (info.island.context_budget != null) {
                setTxt('island-budget-val', `${info.island.context_budget} tokens`);
                setTxt('modal-island-budget-val', `${info.island.context_budget} tokens`);
            }
        }
    },

    updateModelMeta() {
        const modelSelect = document.getElementById('model-select');
        const modelDate = document.getElementById('model-date');
        const modelSize = document.getElementById('model-size');
        const modelRam = document.getElementById('model-ram');

        if (!modelSelect) return;
        const selected = modelSelect.value;
        window.ChatState.activeModel = selected;

        const composerModelEl = document.getElementById('composer-active-model-name');
        if (composerModelEl && selected) {
            const cleanName = selected.replace('.gaje.flat', '').replace('.flat', '').replace('.gaje', '');
            composerModelEl.innerText = cleanName;
        }

        const model = window.ChatState.modelsData.find(m => m.name === selected);
        if (!model) return;

        if (model.date && modelDate) modelDate.innerText = model.date;
        if (model.size_bytes != null && modelSize) modelSize.innerText = window.ChatUtils.formatBytes(model.size_bytes);
        if (modelRam) {
            const ramMb = model.ram_mb || 0;
            const ramText = ramMb > 0 ? (ramMb >= 1024 ? (ramMb / 1024).toFixed(2) + ' GB' : ramMb.toFixed(0) + ' MB') : (this.engineMode === 'wasm' ? 'WASM Local' : 'RAM —');
            modelRam.innerHTML = `<span class="ram-led ${ramMb > 0 || this.engineMode === 'wasm' ? 'active' : ''}"></span><span>${ramText}</span>`;
            modelRam.setAttribute('title', `RAM: ${ramText} · HD: ${window.ChatUtils.formatBytes(model.size_bytes)} · Creado: ${model.date || '—'}`);
        }
    },

    async refreshModelMeta(modelName) {
        try {
            const response = await fetch('/api/models');
            const data = await response.json();
            if (data && data.models && data.models.length > 0) {
                window.ChatState.modelsData = data.models;
                this.updateModelMeta();
            }
        } catch (err) {
            console.log('No se pudo refrescar los metadatos del modelo.');
        }
    },

    setModelLoading(active) {
        const modelLoadBar = document.getElementById('model-load-bar');
        const chatWindow = document.getElementById('chat-window');
        if (modelLoadBar) {
            modelLoadBar.hidden = !active;
            modelLoadBar.setAttribute('aria-valuetext', active ? 'cargando' : 'inactivo');
        }
        if (chatWindow) chatWindow.setAttribute('aria-busy', active ? 'true' : 'false');
    },

    async preloadModel(modelName) {
        if (!modelName) return;
        const modelSelect = document.getElementById('model-select');
        const userInput = document.getElementById('user-input');
        const sendBtn = document.getElementById('send-btn');

        this.updateModelMeta();

        // En modo WASM o entorno estático (ej. Vercel), activar de inmediato y precargar desde caché si está disponible
        if (this.engineMode === 'wasm' || this.isStaticEnvironment()) {
            if (this.engineMode !== 'wasm') this.onEngineModeChange('wasm');
            this.setModelLoading(false);
            if (modelSelect) modelSelect.disabled = false;
            if (userInput) userInput.disabled = false;
            if (sendBtn) sendBtn.disabled = false;
            this.updateModelToggleState(true);

            if (window.GajeDB && !window.ChatState.isWasmModelLoaded) {
                window.GajeDB.getCachedModel(modelName).then(cachedBuf => {
                    if (cachedBuf && cachedBuf.byteLength >= 4096) {
                        let gtokLen = 0n;
                        try {
                            const dv = new DataView(cachedBuf);
                            gtokLen = dv.getBigUint64(88, true);
                        } catch (e) { gtokLen = 0n; }

                        if (gtokLen > 0n) {
                            const worker = window.ChatEngineController?.initWasmWorker();
                            if (worker) {
                                worker.postMessage({ action: 'load_model', payload: { buffer: cachedBuf, modelName } }, [cachedBuf]);
                            }
                        }
                    }
                }).catch(() => {});
            }
            return;
        }

        if (modelSelect) modelSelect.disabled = true;
        if (userInput) userInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;

        this.setModelLoading(true);
        window.ChatUtils?.showToast(`Cargando organismo genómico [${modelName}]...`, 'info', 3000);

        try {
            const response = await fetch('/api/load_model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelName })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.status === 'ok') {
                window.ChatUtils?.showToast(`Organismo [${modelName}] listo en memoria`, 'success', 3000);
                this.updateModelToggleState(true);
                await this.refreshModelMeta(modelName);
            } else {
                window.ChatUtils?.showToast(`Error cargando el modelo: ${data.error}`, 'error', 5000);
                this.updateModelToggleState(false);
            }
        } catch (err) {
            console.warn('[GAJE] Servidor backend no disponible. Cambiando a modo WebAssembly In-Browser.');
            this.onEngineModeChange('wasm');
            this.updateModelToggleState(true);
        } finally {
            this.setModelLoading(false);
            if (modelSelect) modelSelect.disabled = false;
            if (userInput) {
                userInput.disabled = false;
                userInput.focus();
            }
            if (sendBtn) sendBtn.disabled = false;
            this.loadEnvInfo();
        }
    },

    updateModelToggleState(isActive) {
        const toggleBtn = document.getElementById('model-toggle-btn');
        const toggleText = document.getElementById('model-toggle-text');
        if (!toggleBtn) return;

        if (isActive) {
            toggleBtn.classList.remove('inactive');
            toggleBtn.classList.add('active');
            if (toggleText) toggleText.textContent = 'Activo';
            toggleBtn.setAttribute('data-tooltip', 'Modelo activo en RAM (Haz clic para desactivar)');
        } else {
            toggleBtn.classList.remove('active');
            toggleBtn.classList.add('inactive');
            if (toggleText) toggleText.textContent = 'Inactivo';
            toggleBtn.setAttribute('data-tooltip', 'Modelo inactivo (Haz clic para activar en RAM)');
        }
    },

    async toggleCurrentModel() {
        const toggleBtn = document.getElementById('model-toggle-btn');
        const isActive = toggleBtn ? toggleBtn.classList.contains('active') : true;
        const modelSelect = document.getElementById('model-select');
        const modelName = modelSelect ? modelSelect.value : (window.ChatState?.activeModel || 'qwen2_5_3b.flat');

        if (isActive) {
            await this.unloadModels();
            this.updateModelToggleState(false);
        } else {
            await this.preloadModel(modelName);
            this.updateModelToggleState(true);
        }
    },

    async stopAllModels() {
        // 1. Detener streaming activo de inferencia si existe
        const stopBtn = document.getElementById('stop-btn');
        if (stopBtn && !stopBtn.hidden) {
            stopBtn.click();
        }

        window.ChatUtils?.showToast('Deteniendo inferencia y purgando modelos de la sesión', 'warning', 3000);
        await this.unloadModels();
        this.updateModelToggleState(false);
    },

    async unloadModels() {
        const unloadModelBtn = document.getElementById('unload-model-btn');
        if (unloadModelBtn) unloadModelBtn.disabled = true;
        window.ChatUtils?.showToast('Purgando modelos de la memoria RAM...', 'info', 2000);
        try {
            const response = await fetch('/api/unload_model', { method: 'POST' });
            const data = await response.json();
            if (data.status === 'ok') {
                window.ChatUtils?.showToast('Memoria RAM liberada al 100%. Modelos inactivos.', 'success', 3000);
                window.ChatState.modelsData.forEach(m => { m.ram_mb = 0.0; });
                this.updateModelToggleState(false);
                this.updateModelMeta();
                this.loadEnvInfo();
            } else {
                window.ChatUtils?.showToast(`Error liberando modelos: ${data.error}`, 'error', 4000);
            }
        } catch (err) {
            window.ChatUtils?.showToast('Error de conexión al intentar liberar la memoria.', 'error', 4000);
            console.error(err);
        } finally {
            if (unloadModelBtn) unloadModelBtn.disabled = false;
        }
    },

    onEngineModeChange(mode) {
        window.ChatState.engineMode = mode;
        const wasmHeaderBadge = document.getElementById('wasm-header-badge');
        const gpuHeaderBadge = document.getElementById('gpu-header-badge');
        const modelSelect = document.getElementById('model-select');

        if (mode === 'wasm') {
            if (wasmHeaderBadge) wasmHeaderBadge.style.display = 'inline-flex';
            if (gpuHeaderBadge) gpuHeaderBadge.style.display = 'none';

            if (modelSelect && (modelSelect.value === 'qwen2_5_3b.flat' || modelSelect.value === 'gaje_coder_3b.flat')) {
                modelSelect.value = 'gaje_pico_135m.flat';
                this.updateModelMeta();
                window.ChatUtils?.showToast('Seleccionado SmolLM 135M para WebAssembly', 'info', 3000);
            }

            window.ChatEngineController?.initWasmWorker();
            window.ChatUtils?.showToast('Modo In-Browser WASM (Zero-Server) activado', 'info', 3000);
        } else {
            if (wasmHeaderBadge) wasmHeaderBadge.style.display = 'none';
            window.ChatEngineController?.stopAutonomicTick();
            if (window.ChatState.envData && window.ChatState.envData.gpu && gpuHeaderBadge) {
                gpuHeaderBadge.style.display = 'inline-flex';
            }
            window.ChatUtils?.showToast('Modo Servidor Nativo (AVX2/GPU) activado', 'info', 3000);
        }
    },

    async onLocalFlatSelected(e) {
        const file = e.target?.files?.[0];
        if (!file) return;

        const engineModeSelect = document.getElementById('engine-mode-select');
        if (engineModeSelect) {
            engineModeSelect.value = 'wasm';
            engineModeSelect.dispatchEvent(new Event('change'));
        }

        const worker = window.ChatEngineController?.initWasmWorker();
        this.setModelLoading(true);
        window.ChatComposerController?.addMessage(`📂 Cargando modelo local ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`, 'system');

        try {
            const buffer = await file.arrayBuffer();
            const modelName = file.name;

            // 1. Guardar en IndexedDB local para persistencia instantánea
            if (window.GajeDB && typeof window.GajeDB.saveCachedModel === 'function') {
                await window.GajeDB.saveCachedModel(modelName, buffer.slice(0));
            }

            await new Promise((resolve, reject) => {
                const handler = async (ev) => {
                    if (ev.data.status === 'model_loaded') {
                        worker.removeEventListener('message', handler);
                        window.ChatState.isWasmModelLoaded = true;
                        window.ChatState.wasmActiveModelName = modelName;
                        window.ChatState.activeModel = modelName;

                        if (window.GajeDB) {
                            const docBuf = await window.GajeDB.loadMemoryIsland(modelName, 'documental');
                            if (docBuf) worker.postMessage({ action: 'import_memory', payload: { niche: 'documental', buffer: docBuf } });
                            const convBuf = await window.GajeDB.loadMemoryIsland(modelName, 'conversational');
                            if (convBuf) worker.postMessage({ action: 'import_memory', payload: { niche: 'conversational', buffer: convBuf } });
                        }
                        resolve();
                    } else if (ev.data.status === 'error') {
                        worker.removeEventListener('message', handler);
                        reject(new Error(ev.data.error));
                    }
                };
                worker.addEventListener('message', handler);
                worker.postMessage({ action: 'load_model', payload: { buffer, modelName } }, [buffer]);
            });

            // 2. Actualizar estado y selector de modelos en la barra de herramientas
            window.ChatState.isWasmModelLoaded = true;
            window.ChatState.wasmActiveModelName = modelName;
            window.ChatState.activeModel = modelName;

            const modelSelect = document.getElementById('model-select');
            if (modelSelect) {
                let existingOpt = Array.from(modelSelect.options).find(opt => opt.value === modelName);
                if (!existingOpt) {
                    existingOpt = document.createElement('option');
                    existingOpt.value = modelName;
                    existingOpt.innerText = `${modelName.replace('.flat', '')} · [Local .flat]`;
                    modelSelect.appendChild(existingOpt);
                }
                modelSelect.value = modelName;
            }
            this.updateModelToggleState(true);
            this.updateModelMeta();
            window.ChatComposerController?.addMessage(`Organismo local [${modelName}] cargado y listo en el Tronco Encefálico Local.`, 'system');
        } catch (err) {
            console.error('Error cargando modelo flat local:', err);
            window.ChatComposerController?.addMessage(`Error cargando modelo local: ${err.message}`, 'system');
        } finally {
            this.setModelLoading(false);
            if (e.target) e.target.value = '';
        }
    },

    clearChatInterface() {
        // Cerrar menú dropdown si está abierto
        const menuDropdown = document.getElementById('chat-actions-dropdown');
        const menuBtn = document.getElementById('chat-overflow-menu-btn');
        if (menuDropdown) menuDropdown.setAttribute('hidden', '');
        if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');

        // Alerta y notificación visual Y2K inmediata
        if (window.ChatUtils && typeof window.ChatUtils.showToast === 'function') {
            window.ChatUtils.showToast('Borrando historial de conversación y reiniciando sesión...', 'warning', 3500, {
                code: 'GAJE-PURGE'
            });
        }

        // Limpiar persistencia IndexedDB y local
        if (window.ChatStorage && typeof window.ChatStorage.clearHistory === 'function') {
            window.ChatStorage.clearHistory();
        } else {
            localStorage.removeItem('gaje_chat_history');
            localStorage.removeItem('gaje_chat_session');
        }

        // Purgar mensajes del DOM
        const chatWindow = document.getElementById('chat-window');
        if (chatWindow) {
            const messages = chatWindow.querySelectorAll('.message');
            messages.forEach(m => {
                if (!m.classList.contains('system')) {
                    m.remove();
                }
            });

            // Re-mostrar tarjetas iniciales de prompt (starter cards)
            const starters = document.getElementById('chat-starters');
            if (starters) starters.style.display = '';
        }

        // Mensaje de sistema informativo en consola
        window.ChatComposerController?.addMessage('🧬 Historial de conversación purgado. Sesión y memoria restauradas.', 'system');
    }
};
