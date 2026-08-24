/* =============================================================================
   🧬 GAJE — static/js/chat/telemetry.js
   Controlador del HUD de Telemetría, Épocas de Memoria y Respaldo de BD.
   ============================================================================= */

window.ChatTelemetryController = {
    init() {
        const modal = document.getElementById('metrics-monitor-modal');
        if (!modal) return;

        const openHeaderBtn = document.getElementById('y2k-open-monitor-btn');
        const openSidebarBtn = document.getElementById('sidebar-open-monitor-btn');

        if (openHeaderBtn) openHeaderBtn.addEventListener('click', () => this.openModal(modal));
        if (openSidebarBtn) openSidebarBtn.addEventListener('click', () => this.openModal(modal));

        if (!('closedBy' in HTMLDialogElement.prototype)) {
            modal.addEventListener('click', (event) => {
                if (event.target !== modal) return;
                const rect = modal.getBoundingClientRect();
                const isInside = (
                    rect.top <= event.clientY &&
                    event.clientY <= rect.top + rect.height &&
                    rect.left <= event.clientX &&
                    event.clientX <= rect.left + rect.width
                );
                if (!isInside) this.closeModal(modal);
            });
        }

        const closeDot = document.getElementById('modal-close-dot');
        const closeBtn = document.getElementById('modal-close-btn');
        if (closeDot) closeDot.addEventListener('click', () => this.closeModal(modal));
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal(modal));

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
                if (targetId === 'tab-storage') this.updateStorageTabStats();
                if (targetId === 'tab-island') this.updateEpochsTab();
            });
        });

        window.addEventListener('gaje:db:changed', () => this.updateStorageTabStats());

        this.bindStorageActions();
        this.bindEpochActions();
    },

    openModal(modal) {
        this.updateStorageTabStats();
        this.updateEpochsTab();
        if (typeof modal.showModal === 'function') {
            modal.showModal();
        } else {
            modal.setAttribute('open', '');
        }
    },

    closeModal(modal) {
        if (typeof modal.close === 'function') {
            modal.close();
        } else {
            modal.removeAttribute('open');
        }
    },

    async updateStorageTabStats() {
        if (!window.GajeDB) return;
        const countEl = document.getElementById('modal-storage-msg-count');
        const usageEl = document.getElementById('modal-storage-usage-val');
        const quotaEl = document.getElementById('modal-storage-quota-val');

        const count = await window.GajeDB.getMessageCount();
        const est = await window.GajeDB.getStorageEstimate();

        if (countEl) countEl.innerText = `${count} mensajes`;
        if (usageEl) usageEl.innerText = est.usageFormatted;
        if (quotaEl) quotaEl.innerText = est.quotaFormatted !== 'N/A' ? `${est.quotaFormatted} (${est.percentUsed}% en uso)` : 'Ilimitada / No restringida';
    },

    async updateEpochsTab() {
        const tableBody = document.getElementById('modal-epochs-table-body');
        const feedback = document.getElementById('epoch-action-feedback');
        const modelSelect = document.getElementById('model-select');
        if (!tableBody) return;

        const selectedModel = modelSelect ? modelSelect.value : (window.ChatState?.activeModel || 'qwen2_5_3b.flat');
        const organism = selectedModel.replace('.flat', '').replace('.gaje', '');

        try {
            const res = await fetch(`/api/memory/epochs?organism=${encodeURIComponent(organism)}`);
            const data = await res.json();
            if (!data || data.error || !data.epochs) {
                tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 0.8rem; color: var(--text-muted);">${data?.error || 'Sin épocas registradas'}</td></tr>`;
                return;
            }

            tableBody.innerHTML = '';
            data.epochs.forEach(ep => {
                const isActive = ep.epoch_id === data.active_epoch_id;
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid rgba(255,255,255,0.04)';
                if (isActive) tr.style.background = 'rgba(56, 189, 248, 0.08)';

                const verdictColor = ep.verdict === 'PROMOTED' || ep.verdict === 'SEALED' ? '#4ade80' : (ep.verdict === 'REJECTED' ? '#f87171' : '#38bdf8');
                const badge = `<span style="display: inline-block; padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.65rem; background: ${verdictColor}22; color: ${verdictColor}; border: 1px solid ${verdictColor}55;">${ep.verdict}</span>`;
                const dateStr = ep.created_at ? ep.created_at.substring(0, 19).replace('T', ' ') : '—';

                tr.innerHTML = `
                    <td style="padding: 0.4rem; font-weight: ${isActive ? 'bold' : 'normal'}; color: ${isActive ? 'var(--neon-cyan)' : 'inherit'};">
                        ${isActive ? '★ ' : ''}${ep.epoch_id}
                    </td>
                    <td style="padding: 0.4rem; color: var(--text-muted);">${ep.parent_epoch}</td>
                    <td style="padding: 0.4rem;">${badge}</td>
                    <td style="padding: 0.4rem;">${ep.entries_count}</td>
                    <td style="padding: 0.4rem; font-family: monospace; font-size: 0.68rem; color: var(--text-muted);">${dateStr}</td>
                    <td style="padding: 0.4rem; color: var(--text-muted); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${ep.comment}">${ep.comment}</td>
                    <td style="padding: 0.4rem; text-align: center;">
                        ${isActive ? '<span style="font-size: 0.65rem; color: var(--neon-cyan);">ACTIVA</span>' : `<button class="apple-pill-btn btn-rollback-epoch" data-epoch-id="${ep.epoch_id}" style="font-size: 0.62rem; padding: 0.15rem 0.45rem;">⚡ Rollback</button>`}
                    </td>
                `;
                tableBody.appendChild(tr);
            });

            tableBody.querySelectorAll('.btn-rollback-epoch').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const epId = parseInt(e.target.getAttribute('data-epoch-id'), 10);
                    if (!epId) return;
                    if (feedback) {
                        feedback.style.display = 'block';
                        feedback.innerText = `Ejecutando rollback determinista a Época ${epId}...`;
                    }
                    try {
                        const rbRes = await fetch('/api/memory/epochs/rollback', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ organism, epoch_id: epId })
                        });
                        const rbData = await rbRes.json();
                        if (feedback) {
                            feedback.innerText = `✓ Rollback completado a Época ${rbData.active_epoch_id}`;
                            setTimeout(() => { feedback.style.display = 'none'; }, 3000);
                        }
                        this.updateEpochsTab();
                    } catch (err) {
                        if (feedback) feedback.innerText = `Error: ${err.message}`;
                    }
                });
            });
        } catch (err) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 0.8rem; color: #f87171;">Error cargando épocas: ${err.message}</td></tr>`;
        }
    },

    bindEpochActions() {
        const btnSnapshot = document.getElementById('btn-epoch-snapshot');
        const btnSleep = document.getElementById('btn-epoch-sleep');
        const btnRefresh = document.getElementById('btn-epoch-refresh');
        const feedback = document.getElementById('epoch-action-feedback');
        const modelSelect = document.getElementById('model-select');
        const engineModeSelect = document.getElementById('engine-mode-select');

        if (btnRefresh) btnRefresh.addEventListener('click', () => this.updateEpochsTab());

        if (btnSnapshot) {
            btnSnapshot.addEventListener('click', async () => {
                const selectedModel = modelSelect ? modelSelect.value : (window.ChatState?.activeModel || 'qwen2_5_3b.flat');
                const organism = selectedModel.replace('.flat', '').replace('.gaje', '');
                const comment = prompt('Comentario para el Snapshot de Memoria:', 'Snapshot Manual Web UI');
                if (comment === null) return;
                if (feedback) {
                    feedback.style.display = 'block';
                    feedback.innerText = 'Creando snapshot inmutable de memoria...';
                }
                try {
                    const res = await fetch('/api/memory/epochs/snapshot', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ organism, comment })
                    });
                    const data = await res.json();
                    if (feedback) {
                        feedback.innerText = `✓ Snapshot creado: Época ID ${data.epoch_id}`;
                        setTimeout(() => { feedback.style.display = 'none'; }, 3500);
                    }
                    this.updateEpochsTab();
                } catch (err) {
                    if (feedback) feedback.innerText = `Error: ${err.message}`;
                }
            });
        }

        if (btnSleep) {
            btnSleep.addEventListener('click', async () => {
                const selectedModel = modelSelect ? modelSelect.value : (window.ChatState?.activeModel || 'qwen2_5_3b.flat');
                const organism = selectedModel.replace('.flat', '').replace('.gaje', '');
                if (feedback) {
                    feedback.style.display = 'block';
                    feedback.innerText = '💤 Ejecutando Ciclo de Sueño: Consolidando y podando memoria volátil...';
                }
                try {
                    if (engineModeSelect && engineModeSelect.value === 'wasm') {
                        const worker = window.ChatEngineController?.initWasmWorker();
                        const sleepResult = await new Promise((resolve, reject) => {
                            const handler = (ev) => {
                                if (ev.data.status === 'sleep_cycle_completed') {
                                    worker.removeEventListener('message', handler);
                                    resolve(ev.data);
                                } else if (ev.data.status === 'error') {
                                    worker.removeEventListener('message', handler);
                                    reject(new Error(ev.data.error));
                                }
                            };
                            worker.addEventListener('message', handler);
                            worker.postMessage({ action: 'sleep_cycle', payload: { dedupThreshold: 0.95 } });
                        });

                        worker.postMessage({ action: 'export_memory', payload: { niche: 'documental' } });
                        const expHandler = async (ev) => {
                            if (ev.data.status === 'memory_exported' && window.GajeDB) {
                                worker.removeEventListener('message', expHandler);
                                await window.GajeDB.saveMemoryIsland(selectedModel, 'documental', ev.data.buffer);
                            }
                        };
                        worker.addEventListener('message', expHandler);

                        if (feedback) {
                            const s = sleepResult.stats || {};
                            feedback.innerText = `✓ [WASM] Ciclo de Sueño completado: ${s.episodic_transferred || 0} transferidos, ${s.duplicates_pruned || 0} podados (Total: ${s.total_documental_entries || 0} docs)`;
                            setTimeout(() => { feedback.style.display = 'none'; }, 4500);
                        }
                        return;
                    }

                    const res = await fetch('/api/memory/epochs/consolidate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ organism, dedup_threshold: 0.95 })
                    });
                    const data = await res.json();
                    if (feedback) {
                        const s = data.stats || {};
                        feedback.innerText = `✓ Ciclo de Sueño completado: Época ${data.epoch_id} (${s.episodic_transferred || 0} transferidos, ${s.duplicates_pruned || 0} podados)`;
                        setTimeout(() => { feedback.style.display = 'none'; }, 4500);
                    }
                    this.updateEpochsTab();
                } catch (err) {
                    if (feedback) feedback.innerText = `Error: ${err.message}`;
                }
            });
        }
    },

    bindStorageActions() {
        const chatWindow = document.getElementById('chat-window');
        const exportDbBtn = document.getElementById('modal-export-db-btn');
        if (exportDbBtn) {
            exportDbBtn.addEventListener('click', async () => {
                if (window.GajeDB) await window.GajeDB.exportFullDatabase();
            });
        }

        const importDbBtn = document.getElementById('modal-import-db-btn');
        const importDbFile = document.getElementById('modal-import-db-file');
        if (importDbBtn && importDbFile) {
            importDbBtn.addEventListener('click', () => importDbFile.click());
            importDbFile.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = async (evt) => {
                    if (window.GajeDB) {
                        const res = await window.GajeDB.importFullDatabase(evt.target.result);
                        if (res.success) {
                            alert(`✅ Base de datos restaurada con éxito: ${res.count} mensajes.`);
                            if (chatWindow) chatWindow.innerHTML = '';
                            await window.ChatStorage?.renderHistory();
                        } else {
                            alert(`❌ Error al importar backup: ${res.error}`);
                        }
                    }
                };
                reader.readAsText(file);
                importDbFile.value = '';
            });
        }

        const clearDbBtn = document.getElementById('modal-clear-db-btn');
        if (clearDbBtn) {
            clearDbBtn.addEventListener('click', async () => {
                if (confirm('¿Estás seguro de que deseas vaciar completamente la base de datos local IndexedDB? Esta acción es irreversible.')) {
                    if (window.GajeDB) {
                        await window.GajeDB.clearAllMessages();
                        if (chatWindow) chatWindow.innerHTML = '';
                        this.updateStorageTabStats();
                    }
                }
            });
        }
    }
};
