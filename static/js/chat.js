document.addEventListener('DOMContentLoaded', () => {
    const chatWindow = document.getElementById('chat-window');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const metricsContent = document.getElementById('metrics-content');
    const dnaStrand = document.getElementById('dna-strand');
    const modelSelect = document.getElementById('model-select');
    const modelDate = document.getElementById('model-date');
    const modelSize = document.getElementById('model-size');
    const modelRam = document.getElementById('model-ram');
    const modelLoadBar = document.getElementById('model-load-bar');
    let envData = null;
    let systemAlertsHistory = [
        `[${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] Núcleo GAJE iniciado. Listo para compresión semántica.`
    ];
    let modelsData = [
        { name: 'qwen2_5_3b.flat', size_bytes: 2405756928, date: '2026-08-09 22:57', ram_mb: 0.0 },
        { name: 'deepseek_r1_1_5b.flat', size_bytes: 1324845056, date: '2026-08-21 23:28', ram_mb: 0.0 },
        { name: 'qwen2_0_5b.flat', size_bytes: 522679808, date: '2026-08-09 14:17', ram_mb: 0.0 },
        { name: 'smollm2_135m.flat', size_bytes: 496182528, date: '2026-08-19 00:33', ram_mb: 0.0 }
    ];

    // Cargar modelos disponibles
    async function loadModels(autoLoadEnabled = true) {
        try {
            const response = await fetch('/api/models');
            const data = await response.json();
            if (data && data.models && data.models.length > 0) {
                modelsData = data.models;
                modelSelect.innerHTML = '';
                modelsData.forEach(model => {
                    const opt = document.createElement('option');
                    opt.value = model.name;
                    let label = model.name;
                    if (label === 'qwen2_5_3b.flat') {
                        label = '⚡ QWEN 2.5 3B (qwen2_5_3b.flat · Transmutado Mmap)';
                    } else if (label === 'deepseek_r1_1_5b.flat') {
                        label = '⚡ DEEPSEEK-R1 1.5B (deepseek_r1_1_5b.flat · CoT Razonamiento)';
                    } else if (label === 'qwen2_0_5b.flat') {
                        label = '⚡ QWEN 2 0.5B (qwen2_0_5b.flat · Micro-Rápido)';
                    } else if (label === 'smollm2_135m.flat') {
                        label = '⚡ SMOLLM2 135M (smollm2_135m.flat · Nano-Edge)';
                    } else if (label.endsWith('.gaje')) {
                        label = '🧬 ' + label.replace('.gaje', '').toUpperCase() + ' (Nacido por GAJE)';
                    } else if (label.endsWith('.flat')) {
                        label = '⚡ ' + label.replace('.flat', '').toUpperCase() + ' (Transmutado Mmap)';
                    } else {
                        label = '⚡ ' + label;
                    }
                    opt.innerText = label;
                    modelSelect.appendChild(opt);
                });
                updateModelMeta();

                // Verificar bandera de carga automática por URL o por configuración del servidor
                const urlParams = new URLSearchParams(window.location.search);
                const preloadUrl = urlParams.get('preload');
                const shouldPreload = (preloadUrl !== 'false' && preloadUrl !== '0') && autoLoadEnabled;

                if (modelSelect.value && shouldPreload) {
                    preloadModel(modelSelect.value);
                }
            } else {
                updateModelMeta();
            }
        } catch (err) {
            console.log('Usando modelos por defecto certificados.');
            updateModelMeta();
        }
    }

    // Detectar entorno real de ejecución (arquitectura, CPU, SIMD, Island)
    async function loadEnvInfo() {
        try {
            const response = await fetch('/api/info');
            const info = await response.json();
            if (!info || info.error) return true;
            envData = info;
            const sfEl = document.getElementById('sf-val');
            if (sfEl) sfEl.innerText = info.software || '---';
            const hdEl = document.getElementById('hd-val');
            if (hdEl) hdEl.innerText = info.hardware || '---';
            const archEl = document.getElementById('arch-val');
            if (archEl && info.architecture) archEl.innerText = info.architecture;
            const simdEl = document.getElementById('simd-val');
            if (simdEl && info.simd) simdEl.innerText = info.simd;
            const coresEl = document.getElementById('cores-val');
            if (coresEl && info.cores) coresEl.innerText = info.cores;
            const status = document.querySelector('.status-text');
            if (status && info.simd) status.innerText = info.simd + ' Optimized';

            // Mirror to Modal
            const mSf = document.getElementById('modal-sf-val');
            const mHd = document.getElementById('modal-hd-val');
            const mArch = document.getElementById('modal-arch-val');
            const mSimd = document.getElementById('modal-simd-val');
            const mCores = document.getElementById('modal-cores-val');
            if (mSf) mSf.innerText = info.software || '---';
            if (mHd) mHd.innerText = info.hardware || '---';
            if (mArch && info.architecture) mArch.innerText = info.architecture;
            if (mSimd && info.simd) mSimd.innerText = info.simd;
            if (mCores && info.cores) mCores.innerText = info.cores;

            // Island Model (.gmem) — valores desde el servidor, no hardcodeados
            if (info.island) {
                const pillsHtml = (info.island.pills || [])
                    .map(p => {
                        let typeClass = '';
                        const lower = p.toLowerCase();
                        if (lower.includes('episod') || lower.includes('episodic')) typeClass = 'pill-episodic';
                        else if (lower.includes('doc')) typeClass = 'pill-documental';
                        else if (lower.includes('convers')) typeClass = 'pill-conversational';
                        return `<span class="island-pill ${typeClass}">${p}</span>`;
                    })
                    .join('');

                const pillsEl = document.getElementById('island-pills');
                if (pillsEl) pillsEl.innerHTML = pillsHtml;
                const mPillsEl = document.getElementById('modal-island-pills');
                if (mPillsEl) mPillsEl.innerHTML = pillsHtml;

                if (info.island.memory_type) {
                    document.getElementById('island-mem-val').innerText = info.island.memory_type;
                    const mMem = document.getElementById('modal-island-mem-val');
                    if (mMem) mMem.innerText = info.island.memory_type;
                }
                if (info.island.retrieval_latency_ms != null) {
                    document.getElementById('island-lat-val').innerText = `${info.island.retrieval_latency_ms} ms`;
                    const mLat = document.getElementById('modal-island-lat-val');
                    if (mLat) mLat.innerText = `${info.island.retrieval_latency_ms} ms`;
                }
                if (info.island.context_budget != null) {
                    document.getElementById('island-budget-val').innerText = `${info.island.context_budget} tokens`;
                    const mBud = document.getElementById('modal-island-budget-val');
                    if (mBud) mBud.innerText = `${info.island.context_budget} tokens`;
                }
            }
            return info.auto_load_model !== false;
        } catch (err) {
            console.log('No se pudo detectar el entorno de ejecución.');
            return true;
        }
    }

    function formatBytes(bytes) {
        if (!bytes && bytes !== 0) return '—';
        const gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) return gb.toFixed(2) + ' GB';
        const mb = bytes / (1024 * 1024);
        if (mb >= 1) return mb.toFixed(0) + ' MB';
        return Math.round(bytes) + ' B';
    }

    function updateModelMeta() {
        const selected = modelSelect.value;
        const model = modelsData.find(m => m.name === selected);
        if (!model) return;
        if (model.date) modelDate.innerText = `Nacido el: ${model.date}`;
        if (model.size_bytes != null) modelSize.innerText = `Peso HD: ${formatBytes(model.size_bytes)}`;
        modelRam.innerText = `RAM: ${(model.ram_mb || 0) > 0 ? model.ram_mb.toFixed(1) + ' MB' : '—'}`;
    }

    async function refreshModelMeta(modelName) {
        try {
            const response = await fetch('/api/models');
            const data = await response.json();
            if (data && data.models && data.models.length > 0) {
                modelsData = data.models;
                updateModelMeta();
            }
        } catch (err) {
            console.log('No se pudo refrescar los metadatos del modelo.');
        }
    }

    function setModelLoading(active) {
        if (!modelLoadBar) return;
        if (active) {
            modelLoadBar.hidden = false;
            modelLoadBar.setAttribute('aria-valuetext', 'cargando');
            modelLoadBar.setAttribute('aria-valuenow', '');
        } else {
            modelLoadBar.hidden = true;
            modelLoadBar.setAttribute('aria-valuetext', 'inactivo');
        }
        if (chatWindow) chatWindow.setAttribute('aria-busy', active ? 'true' : 'false');
    }

    async function preloadModel(modelName) {
        if (!modelName) return;

        modelSelect.disabled = true;
        userInput.disabled = true;
        sendBtn.disabled = true;

        updateModelMeta();
        setModelLoading(true);
        addMessage(`🧬 Cargando organismo genómico [${modelName}] en el servidor... Por favor espera.`, 'system');

        try {
            const response = await fetch('/api/load_model', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelName })
            });

            const data = await response.json();
            if (data.status === 'ok') {
                addMessage(`✅ Organismo [${modelName}] cargado y listo en memoria.`, 'system');
                await refreshModelMeta(modelName); // refrescar RAM real tras la carga
            } else {
                addMessage(`❌ Error cargando el modelo: ${data.error}`, 'bot');
            }
        } catch (err) {
            addMessage(`❌ Error de conexión al cargar [${modelName}].`, 'bot');
            console.error(err);
        } finally {
            setModelLoading(false);
            modelSelect.disabled = false;
            userInput.disabled = false;
            sendBtn.disabled = false;
            userInput.focus();
            // Actualizar el entorno real de ejecución al terminar de cargar el modelo
            loadEnvInfo();
        }
    }

    modelSelect.addEventListener('change', () => {
        preloadModel(modelSelect.value);
    });

    async function init() {
        const autoLoadEnabled = await loadEnvInfo();
        await loadModels(autoLoadEnabled);
    }
    init();

    const clearHistoryBtn = document.getElementById('clear-history-btn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            clearHistory();
            const messages = chatWindow.querySelectorAll('.message');
            messages.forEach(m => { if (!m.classList.contains('system')) m.remove(); });
        });
    }

    const unloadModelBtn = document.getElementById('unload-model-btn');
    if (unloadModelBtn) {
        unloadModelBtn.addEventListener('click', async () => {
            unloadModelBtn.disabled = true;
            addMessage(`🧬 Liberando modelo activo de la memoria RAM del servidor...`, 'system');
            try {
                const response = await fetch('/api/unload_model', {
                    method: 'POST'
                });
                const data = await response.json();
                if (data.status === 'ok') {
                    addMessage(`✅ Memoria RAM del servidor liberada con éxito.`, 'system');
                    // Buscamos el modelo seleccionado y ponemos su ram_mb a 0
                    const selected = modelSelect.value;
                    const model = modelsData.find(m => m.name === selected);
                    if (model) {
                        model.ram_mb = 0.0;
                    }
                    updateModelMeta();
                    loadEnvInfo();
                } else {
                    addMessage(`❌ Error liberando el modelo: ${data.error}`, 'bot');
                }
            } catch (err) {
                addMessage(`❌ Error de conexión al intentar liberar el modelo.`, 'bot');
                console.error(err);
            } finally {
                unloadModelBtn.disabled = false;
            }
        });
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function formatLatency(ms) {
        if (!ms && ms !== 0) return '00:00:00::000';
        const totalMs = Math.round(ms);
        const hours = Math.floor(totalMs / 3600000);
        const minutes = Math.floor((totalMs % 3600000) / 60000);
        const seconds = Math.floor((totalMs % 60000) / 1000);
        const milli = totalMs % 1000;

        const hh = String(hours).padStart(2, '0');
        const mm = String(minutes).padStart(2, '0');
        const ss = String(seconds).padStart(2, '0');
        const mmm = String(milli).padStart(3, '0');

        return `${hh}:${mm}:${ss}::${mmm}`;
    }

    function copyTextToClipboard(rawText, btnElement) {
        if (!rawText) return;
        
        let textToCopy = rawText;
        if (textToCopy.includes('<think>')) {
            textToCopy = textToCopy.replace(/<think>([\s\S]*?)<\/think>/i, (m, thought) => {
                return `--- [RAZONAMIENTO] ---\n${thought.trim()}\n----------------------\n\n`;
            }).trim();
        }
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalHtml = btnElement.innerHTML;
            btnElement.classList.add('copied');
            btnElement.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span style="color:#10b981; font-weight:600;">¡Copiado!</span>
            `;
            setTimeout(() => {
                btnElement.classList.remove('copied');
                btnElement.innerHTML = originalHtml;
            }, 2000);
        }).catch(err => {
            console.error('Error al copiar al portapapeles:', err);
        });
    }

    function copyEntireChat(btnElement) {
        const messages = chatWindow.querySelectorAll('.message:not(.system)');
        if (!messages.length) return;
        
        let transcript = `=== CONVERSACIÓN GAJE HELIX ===\nFecha: ${new Date().toLocaleString()}\n\n`;
        messages.forEach(msg => {
            const isUser = msg.classList.contains('user');
            const msgModel = msg.getAttribute('data-model');
            const shortModel = msgModel ? msgModel.replace('.gaje.flat', '').replace('.flat', '').replace('.gaje', '') : '';
            const role = isUser ? '👤 USUARIO' : (shortModel ? `🧬 GAJE LLM (${shortModel})` : '🧬 GAJE LLM');
            
            let content = '';
            if (isUser) {
                const p = msg.querySelector('p');
                content = p ? p.innerText.trim() : msg.innerText.trim();
            } else {
                const thoughtBox = msg.querySelector('.apple-thought-content');
                if (thoughtBox) {
                    const rawThought = thoughtBox.innerText.trim();
                    if (rawThought) {
                        content += `[Razonamiento]:\n${rawThought}\n\n`;
                    }
                }
                const responseBody = msg.querySelector('.response-body');
                if (responseBody) {
                    content += responseBody.innerText.trim();
                } else {
                    const pClone = msg.cloneNode(true);
                    const box = pClone.querySelector('.apple-thought-box');
                    if (box) box.remove();
                    const meta = pClone.querySelector('.message-meta');
                    if (meta) meta.remove();
                    content += pClone.innerText.trim();
                }
                // Limpieza de etiquetas residuales
                content = content.replace(/<\/?(thinks?|answers?|p|div|content)[^>]*>/gi, '').trim();
            }
            
            transcript += `[${role}]:\n${content}\n\n`;
        });
        
        navigator.clipboard.writeText(transcript.trim()).then(() => {
            const originalHtml = btnElement.innerHTML;
            const originalTitle = btnElement.getAttribute('title');
            btnElement.classList.add('copied');
            btnElement.setAttribute('title', '¡Chat copiado!');
            btnElement.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span class="visually-hidden">¡Chat Copiado!</span>
            `;
            setTimeout(() => {
                btnElement.classList.remove('copied');
                btnElement.setAttribute('title', originalTitle);
                btnElement.innerHTML = originalHtml;
            }, 2000);
        });
    }

    function generateProjectLog(btnElement) {
        const now = new Date().toLocaleString('es-ES', { dateStyle: 'full', timeStyle: 'medium' });
        
        // 1. Metadatos del Modelo Activo
        const selectedModelName = modelSelect.value || 'Desconocido';
        const modelDateText = modelDate ? modelDate.innerText : '—';
        const modelSizeText = modelSize ? modelSize.innerText : '—';
        const modelRamText = modelRam ? modelRam.innerText : '—';

        // 2. Island Model (.gmem)
        const islandMem = (envData && envData.island && envData.island.memory_type) || document.getElementById('island-mem-val')?.innerText || '.gmem (Zero-Copy Mmap)';
        const islandLat = (envData && envData.island && envData.island.retrieval_latency_ms != null) ? `${envData.island.retrieval_latency_ms} ms` : (document.getElementById('island-lat-val')?.innerText || '0.75 ms');
        const islandBudget = (envData && envData.island && envData.island.context_budget != null) ? `${envData.island.context_budget} tokens` : (document.getElementById('island-budget-val')?.innerText || '512 tokens');
        const islandPills = Array.from(document.querySelectorAll('#island-pills .island-pill'))
            .map(p => p.innerText.trim())
            .filter(Boolean)
            .join(' | ') || '⚡ Episódica | 📚 Documental | 💬 Conversación';

        // 3. Entorno de Ejecución y Hardware
        const sfVal = (envData && envData.software) || document.getElementById('sf-val')?.innerText || 'Rust 2021 (AVX2/FMA/AVX/SSE4.2) + PyO3 / Python 3.14.6';
        const hdVal = (envData && envData.hardware) || document.getElementById('hd-val')?.innerText || 'AMD Ryzen 7 5800H with Radeon Graphics - x86_64 (16 cores)';
        const archVal = (envData && envData.architecture) || document.getElementById('arch-val')?.innerText || 'x86_64';
        const simdVal = (envData && envData.simd) || document.getElementById('simd-val')?.innerText || 'AVX2/FMA/AVX/SSE4.2';
        const coresVal = (envData && envData.cores) || document.getElementById('cores-val')?.innerText || '16';
        let latencyVal = document.getElementById('latency-val')?.innerText || '';
        if (!latencyVal || latencyVal.trim() === '—') latencyVal = 'Optimizado para baja latencia SIMD AVX2';

        // 4. Registro Histórico de Alertas del Sistema
        let alertItems = '';
        if (systemAlertsHistory && systemAlertsHistory.length > 0) {
            alertItems = systemAlertsHistory.map(a => `• ${a}`).join('\n');
        } else {
            const domAlerts = Array.from(document.querySelectorAll('#system-alerts-container .system-alert-item'))
                .map(a => a.innerText.trim())
                .filter(Boolean);
            alertItems = domAlerts.length > 0 ? domAlerts.map(a => `• ${a}`).join('\n') : '• [00:00:00] Núcleo GAJE iniciado. Listo para compresión semántica.';
        }

        // 5. Transcripción Secuencial del Chat con Marcas de Tiempo
        const messages = chatWindow.querySelectorAll('.message:not(.system)');
        let chatTranscript = '';

        if (messages.length === 0) {
            chatTranscript = '(No hay mensajes en esta sesión aún)';
        } else {
            messages.forEach((msg) => {
                const isUser = msg.classList.contains('user');
                const time = msg.getAttribute('data-time') || '—';
                const msgModel = msg.getAttribute('data-model') || selectedModelName;
                const role = isUser ? '👤 USUARIO' : `🧬 GAJE LLM [${msgModel}]`;

                if (isUser) {
                    const p = msg.querySelector('p');
                    const userText = p ? p.innerText.trim() : msg.innerText.trim();
                    chatTranscript += `--------------------------------------------------------------------------------\n`;
                    chatTranscript += `[${time}] ${role}:\n`;
                    chatTranscript += `💬 [MENSAJE]:\n${userText}\n\n`;
                } else {
                    let thoughtText = '';
                    const thoughtEl = msg.querySelector('.apple-thought-content');
                    if (thoughtEl) {
                        const rawT = thoughtEl.innerText.trim();
                        if (rawT) thoughtText = `💡 [PROCESO DE RAZONAMIENTO / THINK]:\n${rawT}\n\n`;
                    }

                    let bodyText = '';
                    const respBody = msg.querySelector('.response-body');
                    if (respBody) {
                        bodyText = respBody.innerText.trim();
                    } else {
                        const pClone = msg.cloneNode(true);
                        const box = pClone.querySelector('.apple-thought-box');
                        if (box) box.remove();
                        const meta = pClone.querySelector('.message-meta');
                        if (meta) meta.remove();
                        bodyText = pClone.innerText.trim();
                    }
                    bodyText = bodyText.replace(/<\/?thinks?>/gi, '').trim();

                    let metaText = '';
                    const metaBadges = Array.from(msg.querySelectorAll('.message-meta .meta-badge:not(.meta-copy-btn)'))
                        .map(b => b.innerText.trim())
                        .filter(Boolean)
                        .join(' | ');
                    if (metaBadges) {
                        metaText = `\n📊 [Métricas del Turno]: ${metaBadges}`;
                    }

                    chatTranscript += `--------------------------------------------------------------------------------\n`;
                    chatTranscript += `[${time}] ${role}:\n`;
                    if (thoughtText) chatTranscript += `${thoughtText}`;
                    chatTranscript += `💬 [RESPUESTA]:\n${bodyText}`;
                    if (metaText) chatTranscript += `${metaText}`;
                    chatTranscript += `\n\n`;
                }
            });
        }

        // Construir el reporte completo del proyecto
        const logContent = `================================================================================
🧬 GAJE HELIX — BITÁCORA Y REGISTRO COMPLETO DEL PROYECTO (SYSTEM AUDIT LOG)
Fecha y Hora de Generación: ${now}
================================================================================

📦 1. MODELO GENÓMICO ACTIVO
--------------------------------------------------------------------------------
• Archivo del Modelo: ${selectedModelName}
• ${modelDateText}
• ${modelSizeText}
• ${modelRamText}

🏝️ 2. MEMORIA ISLAND MODEL (.gmem)
--------------------------------------------------------------------------------
• Persistencia: ${islandMem}
• Latencia de Retrieval: ${islandLat}
• Presupuesto de Contexto: ${islandBudget}
• Módulos de Memoria: ${islandPills}

⚙️ 3. ENTORNO DE EJECUCIÓN Y HARDWARE
--------------------------------------------------------------------------------
• Software: ${sfVal}
• Hardware: ${hdVal}
• Arquitectura CPU: ${archVal} (Cores: ${coresVal})
• Instrucciones SIMD: ${simdVal}
• Rendimiento Inferencia: ${latencyVal}

🔔 4. REGISTRO DE ALERTAS DEL SISTEMA
--------------------------------------------------------------------------------
${alertItems}

💬 5. TRANSCRIPCIÓN SECUENCIAL DEL CHAT (CON HORAS EXACTAS)
================================================================================
${chatTranscript.trim()}
================================================================================
FIN DE LA BITÁCORA — GAJE NATIVE RUNTIME
================================================================================`;

        navigator.clipboard.writeText(logContent).then(() => {
            const originalHtml = btnElement.innerHTML;
            const originalTitle = btnElement.getAttribute('title');
            btnElement.classList.add('copied');
            btnElement.setAttribute('title', '¡Log copiado al portapapeles!');
            btnElement.innerHTML = `
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span class="visually-hidden">¡Log Copiado!</span>
            `;
            setTimeout(() => {
                btnElement.classList.remove('copied');
                btnElement.setAttribute('title', originalTitle);
                btnElement.innerHTML = originalHtml;
            }, 2500);
        }).catch(err => {
            console.error('Error al copiar el log del proyecto:', err);
        });
    }

    function parseMarkdown(text) {
        if (!text) return '';

        // Renderizar pensamiento <think>...</think> al estilo Apple HIG (Cupertino Thought Disclosure)
        let thoughtHtml = '';
        let cleanText = text;

        const thinkMatch = cleanText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
        if (thinkMatch) {
            const rawThought = thinkMatch[1].trim();
            cleanText = cleanText.replace(/<think>[\s\S]*?(?:<\/think>|$)/i, '').trim();
            
            if (rawThought) {
                const isFinished = text.includes('</think>');
                let formattedThought = escapeHtml(rawThought);
                formattedThought = formattedThought.replace(/```(\w*)\n([\s\S]*?)\n```/g, '<pre class="code-block"><code class="$1">$2</code></pre>');
                formattedThought = formattedThought.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
                formattedThought = formattedThought.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                formattedThought = formattedThought.replace(/\*([^*]+)\*/g, '<em>$1</em>');
                formattedThought = formattedThought.replace(/\n[-*]\s+([^\n]+)/g, '<br>• $1');
                formattedThought = formattedThought.replace(/\n/g, '<br>');

                thoughtHtml = `
                    <details class="apple-thought-box" ${isFinished ? '' : 'open'}>
                        <summary class="apple-thought-summary">
                            <div class="apple-thought-header">
                                <span class="apple-thought-icon">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5.1 7.4.3.1.5.4.5.7v1.9c0 .6.4 1 1 1h6.8c.6 0 1-.4 1-1V18c0-.3.2-.6.5-.7 3-1.1 5.1-4 5.1-7.4a8 8 0 0 0-8-8z"/>
                                        <path d="M9 22h6"/>
                                    </svg>
                                </span>
                                <span class="apple-thought-title">Proceso de Razonamiento (${isFinished ? 'completado' : 'pensando...'})</span>
                                <span class="apple-thought-chevron">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="6 9 12 15 18 9"/>
                                    </svg>
                                </span>
                            </div>
                        </summary>
                        <div class="apple-thought-content">
                            ${formattedThought}
                        </div>
                    </details>
                `;
            }
        }

        let html = escapeHtml(cleanText);
        
        // Parse code blocks: ```javascript\ncode\n```
        html = html.replace(/```(\w*)\n([\s\S]*?)\n```/g, (match, lang, code) => {
            return `<pre class="code-block"><code class="${lang}">${code}</code></pre>`;
        });
        
        // Parse inline code: `code`
        html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
        
        // Parse bold: **text**
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        
        // Parse italic: *text*
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        
        // Parse bullet points: \n- item or \n* item
        html = html.replace(/\n[-*]\s+([^\n]+)/g, '<br>• $1');
        
        // Parse line breaks
        html = html.replace(/\n/g, '<br>');
        
        return thoughtHtml + (html ? (thoughtHtml ? '<div class="response-body">' + html + '</div>' : html) : '');
    }

    function addMessage(text, type, meta = null, explicitTime = null, modelName = null) {
        if (type === 'system') {
            const nowTime = explicitTime || new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            systemAlertsHistory.push(`[${nowTime}] ${text}`);
            const alertsContainer = document.getElementById('system-alerts-container');
            if (alertsContainer) {
                const item = document.createElement('div');
                item.className = 'system-alert-item';
                item.innerText = `[${nowTime}] ${text}`;
                alertsContainer.appendChild(item);
                alertsContainer.scrollTop = alertsContainer.scrollHeight;
            }
            const modalAlerts = document.getElementById('modal-system-alerts-container');
            if (modalAlerts) {
                const itemM = document.createElement('div');
                itemM.className = 'system-alert-item';
                itemM.innerText = `[${nowTime}] ${text}`;
                modalAlerts.appendChild(itemM);
                modalAlerts.scrollTop = modalAlerts.scrollHeight;
            }
            return;
        }

        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${type}`;
        const msgTime = explicitTime || new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        msgDiv.setAttribute('data-time', msgTime);
        if (type === 'bot') {
            const mName = modelName || modelSelect.value || 'gaje-model';
            msgDiv.setAttribute('data-model', mName);
            if (/^❌|^Error/.test(text)) {
                msgDiv.classList.add('error');
            }
        }

        let html = `<p>${parseMarkdown(text)}</p>`;
        if (type === 'bot') {
            const mName = msgDiv.getAttribute('data-model') || '';
            const shortModel = mName ? mName.replace('.gaje.flat', '').replace('.flat', '').replace('.gaje', '') : '';
            const modelBadge = shortModel ? `<span class="meta-badge meta-model">🧬 ${escapeHtml(shortModel)}</span>` : '';
            let islandBadge = '';
            if (meta && meta.island) {
                islandBadge = `<span class="meta-badge meta-island">🏝️ Island .gmem: ${escapeHtml(meta.island.retrieval_ms)} ms | +${escapeHtml(meta.island.budget_tokens)} tok (CosSim ${escapeHtml(meta.island.cossim)})</span>`;
            }
            const tokensCount = meta ? escapeHtml(meta.tokens_count || 0) : '—';
            const latencyStr = meta ? `${formatLatency(meta.latency_ms)} (${escapeHtml(meta.tokens_sec || 0)} tok/s)` : '';
            
            html += `
                <div class="message-meta">
                    ${modelBadge}
                    ${islandBadge}
                    ${meta ? `<span class="meta-badge">🔢 ${tokensCount} tokens</span>` : ''}
                    ${latencyStr ? `
                    <span class="meta-badge meta-latency">
                        <svg class="y2k-icon"><use href="static/icons/y2k/sprite.svg#i-clock"/></svg>
                        <span>${latencyStr}</span>
                    </span>` : ''}
                    <button class="meta-badge meta-copy-btn" title="Copiar texto de esta respuesta" aria-label="Copiar texto de esta respuesta">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        <span>Copiar</span>
                    </button>
                </div>
            `;
        }

        msgDiv.innerHTML = html;
        const copyBtn = msgDiv.querySelector('.meta-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => copyTextToClipboard(text, copyBtn));
        }
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function updateMetrics(metrics) {
        const sizeLabel = metrics.bit_depth === 4 ? "Compressed:" : "DNA Size:";
        metricsContent.innerHTML = `
            <div class="metric-row"><span>Dims:</span> <span class="metric-val">${metrics.dims}</span></div>
            <div class="metric-row"><span>Original:</span> <span class="metric-val">${metrics.original_size}B</span></div>
            <div class="metric-row"><span>${sizeLabel}</span> <span class="metric-val">${metrics.dna_size}B (${metrics.bit_depth || 4}-bit)</span></div>
            <div class="metric-row"><span>Ratio:</span> <span class="metric-val">${metrics.ratio.toFixed(1)}x</span></div>
            <div class="metric-row"><span>Ahorro:</span> <span class="metric-val">${metrics.saved.toFixed(2)}%</span></div>
            <div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${metrics.saved}%"></div></div>
            <div class="metric-row"><span>Tokens Usados:</span> <span class="metric-val">${metrics.tokens_count || 0} tok</span></div>
            <div class="metric-row"><span>Tiempo Resp:</span> <span class="metric-val">${formatLatency(metrics.latency_ms)}</span></div>
        `;

        const modalMetrics = document.getElementById('modal-metrics-content');
        if (modalMetrics) {
            modalMetrics.innerHTML = metricsContent ? metricsContent.innerHTML : `
                <div class="metric-row"><span>Dims:</span> <span class="metric-val">${metrics.dims}</span></div>
                <div class="metric-row"><span>Original:</span> <span class="metric-val">${metrics.original_size}B</span></div>
                <div class="metric-row"><span>${sizeLabel}</span> <span class="metric-val">${metrics.dna_size}B (${metrics.bit_depth || 4}-bit)</span></div>
                <div class="metric-row"><span>Ratio:</span> <span class="metric-val">${metrics.ratio.toFixed(1)}x</span></div>
                <div class="metric-row"><span>Ahorro:</span> <span class="metric-val">${metrics.saved.toFixed(2)}%</span></div>
                <div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${metrics.saved}%"></div></div>
                <div class="metric-row"><span>Tokens Usados:</span> <span class="metric-val">${metrics.tokens_count || 0} tok</span></div>
                <div class="metric-row"><span>Tiempo Resp:</span> <span class="metric-val">${formatLatency(metrics.latency_ms)}</span></div>
            `;
        }

        if (metrics.sf_info) {
            const sf = document.getElementById('sf-val');
            if (sf) sf.innerText = metrics.sf_info;
            const mSf = document.getElementById('modal-sf-val');
            if (mSf) mSf.innerText = metrics.sf_info;
        }
        if (metrics.hd_info) {
            const hd = document.getElementById('hd-val');
            if (hd) hd.innerText = metrics.hd_info;
            const mHd = document.getElementById('modal-hd-val');
            if (mHd) mHd.innerText = metrics.hd_info;
        }
        if (metrics.latency_ms) {
            const latText = `${formatLatency(metrics.latency_ms)} (${metrics.tokens_sec || 0} tok/s)`;
            const lat = document.getElementById('latency-val');
            if (lat) lat.innerText = latText;
            const mLat = document.getElementById('modal-latency-val');
            if (mLat) mLat.innerText = latText;
        }
    }

    function updateDNA(strand) {
        if (dnaStrand) dnaStrand.innerHTML = '';
        const modalStrand = document.getElementById('modal-dna-strand');
        if (modalStrand) modalStrand.innerHTML = '';

        strand.split('').forEach(base => {
            if (dnaStrand) {
                const span = document.createElement('span');
                span.className = `dna-char-${base}`;
                span.innerText = base;
                dnaStrand.appendChild(span);
            }

            if (modalStrand) {
                const spanM = document.createElement('span');
                spanM.className = `dna-char-${base}`;
                spanM.innerText = base;
                modalStrand.appendChild(spanM);
            }
        });
    }

    async function sendMessage() {
        const text = userInput.value.trim();
        const modelSelect = document.getElementById('model-select');
        const modelValue = modelSelect.value;

        if (!text) return;
        if (!modelValue || modelValue === 'none' || modelValue === '') {
            addMessage('Por favor, selecciona un modelo válido.', 'bot');
            return;
        }

        addMessage(text, 'user');
        pushHistory({ role: 'user', content: text });
        userInput.value = '';
        userInput.disabled = true;
        sendBtn.disabled = true;

        // Vínculo contextual (Fase 1): resaltar el flujo de inferencia en el diagrama
        if (window.ArchView && window.ArchView.isLoaded()) {
            window.ArchView.setFlow('inference');
        }

        const ok = await streamChat(text, modelValue);
        if (!ok) {
            await fallbackChat(text, modelValue);
        }

        userInput.disabled = false;
        sendBtn.disabled = false;
        userInput.focus();
    }

    // Fallback no-streaming con métricas (si el stream falla)
    async function fallbackChat(text, modelName) {
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, model: modelName })
            });
            const data = await response.json();
            if (data.error) {
                addMessage(`Error: ${data.error}`, 'bot', null, null, modelName);
            } else {
                addMessage(data.response, 'bot', data.metrics, null, modelName);
                pushHistory({ role: 'assistant', content: data.response, model: modelName });
                updateMetrics(data.metrics);
                updateDNA(data.dna);
            }
        } catch (err) {
            addMessage('Error de conexión con el núcleo GAJE.', 'bot', null, null, modelName);
            console.error(err);
        }
    }

    // ===== Streaming SSE (Fase 2.2) =====
    let abortController = null;

    function streamChat(message, modelName) {
        const botMsg = createBotMessage(modelName);
        botMsg.classList.add('streaming');
        const statusEl = document.createElement('span');
        statusEl.className = 'stream-status';
        statusEl.textContent = 'Generando';
        const statusAnchor = document.createElement('div');
        statusAnchor.className = 'stream-status-row';
        statusAnchor.appendChild(statusEl);
        botMsg.appendChild(statusAnchor);

        const contentEl = document.createElement('p');
        contentEl.className = 'stream-text';
        botMsg.appendChild(contentEl);
        chatWindow.appendChild(botMsg);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        abortController = new AbortController();
        const stopBtn = document.getElementById('stop-btn');
        stopBtn.hidden = false;
        if (chatWindow) chatWindow.setAttribute('aria-busy', 'true');

        let fullText = '';
        let started = Date.now();
        let done = false;

        const finish = (aborted) => {
            if (done) return;
            done = true;
            abortController = null;
            stopBtn.hidden = true;
            if (chatWindow) chatWindow.setAttribute('aria-busy', 'false');
            botMsg.classList.remove('streaming');
            statusAnchor.remove(); // Elimina el indicador "Generando" de la UI
            const elapsed = Date.now() - started;
            if (aborted && fullText) {
                addMetaTo(botMsg, elapsed, '⏹️ detenido', fullText, modelName);
            } else if (!aborted) {
                addMetaTo(botMsg, elapsed, '', fullText, modelName);
            }
            if (fullText) pushHistory({ role: 'assistant', content: fullText, model: modelName });
            chatWindow.scrollTop = chatWindow.scrollHeight;
        };

        const onStop = () => {
            if (abortController) abortController.abort();
        };
        stopBtn.onclick = onStop;

        return fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message, model: modelName }),
            signal: abortController.signal
        }).then(async (response) => {
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                botMsg.remove();
                addMessage(`Error: ${data.error || 'Fallo en el stream'}`, 'bot');
                finish(true);
                return false;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { value, done: rdDone } = await reader.read();
                if (rdDone) break;
                buffer += decoder.decode(value, { stream: true });
                // parse SSE lines: data: ...
                let idx;
                while ((idx = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, idx).trim();
                    buffer = buffer.slice(idx + 1);
                    if (line.startsWith('data: ')) {
                        const payload = line.slice(6);
                        if (payload === '[DONE]') {
                            reader.releaseLock();
                            finish(false);
                            return true;
                        }
                        try {
                            const token = JSON.parse(payload);
                            if (token && typeof token === 'object' && token.error) {
                                throw new Error(token.error);
                            }
                            fullText += token;
                            contentEl.innerHTML = parseMarkdown(fullText);
                            chatWindow.scrollTop = chatWindow.scrollHeight;
                        } catch (e) {
                            // payload no JSON o error
                            if (e.message) {
                                botMsg.remove();
                                addMessage(`Error: ${e.message}`, 'bot');
                                finish(true);
                                return false;
                            }
                        }
                    }
                }
            }
            finish(false);
            return true;
        }).catch((err) => {
            if (err && err.name === 'AbortError') {
                finish(true);
                return true;
            }
            botMsg.remove();
            addMessage('Error de conexión con el núcleo GAJE (streaming).', 'bot');
            finish(true);
            return false;
        });
    }

    function createBotMessage(modelName = null) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot';
        const msgTime = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        msgDiv.setAttribute('data-time', msgTime);
        const mName = modelName || modelSelect.value || 'gaje-model';
        msgDiv.setAttribute('data-model', mName);
        return msgDiv;
    }

    function addMetaTo(msgEl, elapsed, prefix = '', fullText = '', modelName = '') {
        const mName = modelName || msgEl.getAttribute('data-model') || '';
        const shortModel = mName ? mName.replace('.gaje.flat', '').replace('.flat', '').replace('.gaje', '') : '';
        const modelBadge = shortModel ? `<span class="meta-badge meta-model">🧬 ${escapeHtml(shortModel)}</span>` : '';
        const meta = document.createElement('div');
        meta.className = 'message-meta';
        meta.innerHTML = `
            ${modelBadge}
            <span class="meta-badge meta-latency">
                <svg class="y2k-icon"><use href="static/icons/y2k/sprite.svg#i-clock"/></svg>
                <span>${formatLatency(elapsed)} ${prefix ? '(' + escapeHtml(prefix) + ')' : ''}</span>
            </span>
            <button class="meta-badge meta-copy-btn" title="Copiar texto de esta respuesta" aria-label="Copiar texto de esta respuesta">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                <span>Copiar</span>
            </button>
        `;
        const copyBtn = meta.querySelector('.meta-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const textToCopy = fullText || msgEl.innerText;
                copyTextToClipboard(textToCopy, copyBtn);
            });
        }
        msgEl.appendChild(meta);
    }

    // ===== Historial local (Fase 2.3) =====
    const HISTORY_KEY = 'gaje_chat_history';

    function loadHistory() {
        try {
            const raw = localStorage.getItem(HISTORY_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr : [];
        } catch (e) {
            return [];
        }
    }

    function pushHistory(entry) {
        if (!entry.time) {
            entry.time = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        if (entry.role === 'assistant' && !entry.model) {
            entry.model = modelSelect.value;
        }
        const arr = loadHistory();
        arr.push(entry);
        if (arr.length > 100) arr.splice(0, arr.length - 100);
        try {
            localStorage.setItem(HISTORY_KEY, JSON.stringify(arr));
        } catch (e) { /* almacenamiento lleno */ }
    }

    function clearHistory() {
        try {
            localStorage.removeItem(HISTORY_KEY);
        } catch (e) { /* ignore */ }
    }

    function renderHistory() {
        const arr = loadHistory();
        if (arr.length === 0) return;
        arr.forEach(entry => {
            if (entry.role === 'user') addMessage(entry.content, 'user', null, entry.time);
            else if (entry.role === 'assistant') addMessage(entry.content, 'bot', entry.meta || null, entry.time, entry.model);
            else if (entry.role === 'system') addMessage(entry.content, 'system', null, entry.time);
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    // ===== Telemetría & Modal HUD (Y2K + Apple HIG) =====
    function initTelemetryModal() {
        const modal = document.getElementById('metrics-monitor-modal');
        if (!modal) return;

        const openHeaderBtn = document.getElementById('y2k-open-monitor-btn');
        const openSidebarBtn = document.getElementById('sidebar-open-monitor-btn');

        function openModal() {
            if (typeof modal.showModal === 'function') {
                modal.showModal();
            } else {
                modal.setAttribute('open', '');
            }
        }

        function closeModal() {
            if (typeof modal.close === 'function') {
                modal.close();
            } else {
                modal.removeAttribute('open');
            }
        }

        if (openHeaderBtn) openHeaderBtn.addEventListener('click', openModal);
        if (openSidebarBtn) openSidebarBtn.addEventListener('click', openModal);

        // Fallback para cerrar al hacer clic en el backdrop
        if (!('closedBy' in HTMLDialogElement.prototype)) {
            modal.addEventListener('click', (event) => {
                if (event.target !== modal) return;
                const rect = modal.getBoundingClientRect();
                const isDialogContent = (
                    rect.top <= event.clientY &&
                    event.clientY <= rect.top + rect.height &&
                    rect.left <= event.clientX &&
                    event.clientX <= rect.left + rect.width
                );
                if (!isDialogContent) {
                    closeModal();
                }
            });
        }

        // Botones de cierre (Traffic lights y footer)
        const closeDot = document.getElementById('modal-close-dot');
        const closeBtn = document.getElementById('modal-close-btn');
        if (closeDot) closeDot.addEventListener('click', closeModal);
        if (closeBtn) closeBtn.addEventListener('click', closeModal);

        // Controles de ventana macOS (Min / Max)
        const minDot = document.getElementById('modal-min-dot');
        const maxDot = document.getElementById('modal-max-dot');
        if (minDot) {
            minDot.addEventListener('click', () => {
                modal.style.maxWidth = '860px';
                modal.style.width = '92vw';
            });
        }
        if (maxDot) {
            maxDot.addEventListener('click', () => {
                if (modal.style.maxWidth === '98vw') {
                    modal.style.maxWidth = '860px';
                    modal.style.width = '92vw';
                } else {
                    modal.style.maxWidth = '98vw';
                    modal.style.width = '98vw';
                }
            });
        }

        // Apple HIG Segmented Bar (Tabs)
        const tabs = modal.querySelectorAll('.seg-tab');
        const panes = modal.querySelectorAll('.tab-pane');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                panes.forEach(p => {
                    p.classList.remove('active');
                    p.setAttribute('hidden', '');
                });

                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                const targetId = tab.getAttribute('data-tab');
                const targetPane = document.getElementById(targetId);
                if (targetPane) {
                    targetPane.classList.add('active');
                    targetPane.removeAttribute('hidden');
                }
            });
        });
    }

    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    const exportLogBtn = document.getElementById('export-log-btn');
    if (exportLogBtn) {
        exportLogBtn.addEventListener('click', () => generateProjectLog(exportLogBtn));
    }

    const copyAllBtn = document.getElementById('copy-all-btn');
    if (copyAllBtn) {
        copyAllBtn.addEventListener('click', () => copyEntireChat(copyAllBtn));
    }

    initTelemetryModal();
    renderHistory();
});
