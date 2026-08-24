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

        // Toggle de Barra Secundaria de Información / Telemetría
        const toggleInfoBtn = document.getElementById('toggle-info-bar-btn');
        const infoBar = document.getElementById('chat-toolbar-infobar');
        if (toggleInfoBtn && infoBar) {
            const savedVisible = localStorage.getItem('gaje_toolbar_info_visible') !== 'false';
            if (!savedVisible) {
                infoBar.classList.add('collapsed');
                toggleInfoBtn.classList.remove('active');
            } else {
                infoBar.classList.remove('collapsed');
                toggleInfoBtn.classList.add('active');
            }

            toggleInfoBtn.addEventListener('click', () => {
                const isCollapsed = infoBar.classList.toggle('collapsed');
                toggleInfoBtn.classList.toggle('active', !isCollapsed);
                localStorage.setItem('gaje_toolbar_info_visible', !isCollapsed);
            });
        }

        // Botón Rápido de Borrar Chat
        const btnQuickClear = document.getElementById('btn-quick-clear-chat');
        if (btnQuickClear) {
            btnQuickClear.addEventListener('click', () => {
                this.clearChatInterface();
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

        const copyAllBtn = document.getElementById('copy-all-btn');
        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', () => window.ChatUtils.copyEntireChat(copyAllBtn));
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

            menuDropdown.querySelectorAll('.chat-menu-item:not(.engine-select-item)').forEach(item => {
                item.addEventListener('click', () => {
                    menuDropdown.setAttribute('hidden', '');
                    menuBtn.setAttribute('aria-expanded', 'false');
                });
            });
        }
    },

    async loadModels(autoLoadEnabled = true) {
        const modelSelect = document.getElementById('model-select');
        if (!modelSelect) return;

        try {
            const response = await fetch('/api/models');
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
            } else {
                this.updateModelMeta();
            }
        } catch (err) {
            console.log('Usando modelos por defecto certificados.');
            this.updateModelMeta();
        }
    },

    async loadEnvInfo() {
        try {
            const response = await fetch('/api/info');
            const info = await response.json();
            if (!info || info.error) return true;
            window.ChatState.envData = info;

            const setTxt = (id, txt) => {
                const el = document.getElementById(id);
                if (el) el.innerText = txt || '---';
            };

            setTxt('sf-val', info.software);
            setTxt('hd-val', info.hardware);
            setTxt('arch-val', info.architecture);
            setTxt('simd-val', info.simd);
            setTxt('cores-val', info.cores);

            setTxt('modal-sf-val', info.software);
            setTxt('modal-hd-val', info.hardware);
            setTxt('modal-arch-val', info.architecture);
            setTxt('modal-simd-val', info.simd);
            setTxt('modal-cores-val', info.cores);

            const status = document.querySelector('.status-text');
            if (status && info.simd) status.innerText = info.simd + ' Optimized';

            const gpuHeaderBadge = document.getElementById('gpu-header-badge');
            const gpuHeaderText = document.getElementById('gpu-header-text');
            const modalGpuVal = document.getElementById('modal-gpu-val');
            if (info.gpu) {
                const gpuName = info.gpu.device_name || 'AMD Radeon Vega';
                const gpuBackend = info.gpu.backend || 'Vulkan';
                if (gpuHeaderBadge) gpuHeaderBadge.style.display = 'inline-flex';
                if (gpuHeaderText) gpuHeaderText.innerText = `🎮 GPU (${gpuBackend})`;
                if (modalGpuVal) modalGpuVal.innerText = `🎮 ${gpuName} (${gpuBackend})`;
            } else {
                if (gpuHeaderBadge) gpuHeaderBadge.style.display = 'none';
                if (modalGpuVal) modalGpuVal.innerText = 'No activa (Fallback CPU SIMD)';
            }

            if (info.island) {
                const pillsHtml = (info.island.pills || []).map(p => {
                    let typeClass = '';
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
            return info.auto_load_model !== false;
        } catch (err) {
            console.log('Ambiente estático detectado (Vercel/Zero-Server). Activando modo WebAssembly In-Browser.');
            this.onEngineModeChange('wasm');
            return false;
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

        // En modo WASM (ej. Vercel), no hacemos llamada al backend
        if (this.engineMode === 'wasm') {
            this.setModelLoading(false);
            if (modelSelect) modelSelect.disabled = false;
            if (userInput) userInput.disabled = false;
            if (sendBtn) sendBtn.disabled = false;
            this.updateModelToggleState(true);
            window.ChatComposerController?.addMessage(`⚡ Organismo [${modelName}] listo para inferencia WebAssembly en tu navegador.`, 'system');
            return;
        }

        if (modelSelect) modelSelect.disabled = true;
        if (userInput) userInput.disabled = true;
        if (sendBtn) sendBtn.disabled = true;

        this.setModelLoading(true);
        window.ChatComposerController?.addMessage(`🧬 Cargando organismo genómico [${modelName}] en el servidor... Por favor espera.`, 'system');

        try {
            const response = await fetch('/api/load_model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelName })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.status === 'ok') {
                window.ChatComposerController?.addMessage(`✅ Organismo [${modelName}] cargado y listo en memoria.`, 'system');
                this.updateModelToggleState(true);
                await this.refreshModelMeta(modelName);
            } else {
                window.ChatComposerController?.addMessage(`❌ Error cargando el modelo: ${data.error}`, 'system');
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

        window.ChatComposerController?.addMessage('🛑 [KILL-SWITCH] Deteniendo inferencia y purgando TODOS los modelos GAJE de la sesión...', 'system');
        await this.unloadModels();
        this.updateModelToggleState(false);
    },

    async unloadModels() {
        const unloadModelBtn = document.getElementById('unload-model-btn');
        if (unloadModelBtn) unloadModelBtn.disabled = true;
        window.ChatComposerController?.addMessage(`🧬 Purgando por completo todos los modelos y buffers de la memoria RAM...`, 'system');
        try {
            const response = await fetch('/api/unload_model', { method: 'POST' });
            const data = await response.json();
            if (data.status === 'ok') {
                window.ChatComposerController?.addMessage(`✅ Memoria RAM del servidor liberada al 100%. Todos los modelos inactivos.`, 'system');
                window.ChatState.modelsData.forEach(m => { m.ram_mb = 0.0; });
                this.updateModelToggleState(false);
                this.updateModelMeta();
                this.loadEnvInfo();
            } else {
                window.ChatComposerController?.addMessage(`❌ Error liberando los modelos: ${data.error}`, 'bot');
            }
        } catch (err) {
            window.ChatComposerController?.addMessage(`❌ Error de conexión al intentar liberar la memoria.`, 'bot');
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

            if (modelSelect && (modelSelect.value === 'qwen2_5_3b.flat' || modelSelect.value === 'deepseek_r1_1_5b.flat')) {
                modelSelect.value = 'smollm2_135m.flat';
                this.updateModelMeta();
                window.ChatComposerController?.addMessage('⚡ [WASM] Seleccionado SmolLM2 135M (optimizado para memoria del navegador).', 'system');
            }

            window.ChatEngineController?.initWasmWorker();
            window.ChatComposerController?.addMessage('Modo In-Browser WASM (Zero-Server) activado.', 'system');
        } else {
            if (wasmHeaderBadge) wasmHeaderBadge.style.display = 'none';
            window.ChatEngineController?.stopAutonomicTick();
            if (window.ChatState.envData && window.ChatState.envData.gpu && gpuHeaderBadge) {
                gpuHeaderBadge.style.display = 'inline-flex';
            }
            window.ChatComposerController?.addMessage('Modo Servidor Nativo (AVX2/GPU) activado.', 'system');
        }
    },

    async onLocalFlatSelected(e) {
        const file = e.target.files[0];
        if (!file) return;

        const engineModeSelect = document.getElementById('engine-mode-select');
        if (engineModeSelect) {
            engineModeSelect.value = 'wasm';
            engineModeSelect.dispatchEvent(new Event('change'));
        }

        const worker = window.ChatEngineController?.initWasmWorker();
        this.setModelLoading(true);
        window.ChatComposerController?.addMessage(`📂 Cargando modelo local ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)...`, 'system');

        const reader = new FileReader();
        reader.onload = async (event) => {
            const buffer = event.target.result;
            const modelName = file.name;

            await new Promise((resolve, reject) => {
                const handler = async (ev) => {
                    if (ev.data.status === 'model_loaded') {
                        worker.removeEventListener('message', handler);
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
        };
        reader.readAsArrayBuffer(file);
    }
};
