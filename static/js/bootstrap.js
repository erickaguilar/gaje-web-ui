/* =============================================================================
   🧬 GAJE — static/js/bootstrap.js
   Inicialización temprana de tema visual y captura global de diagnósticos.
   ============================================================================= */

(function() {
            const theme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', theme);

            // 🧬 Consola Móvil DevTools GAJE para Android
            window.gajeDevLogs = [];
            const pushEntry = (type, args) => {
                const text = Array.from(args).map(a => {
                    if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack || ''}`;
                    if (typeof a === 'object') {
                        try { return JSON.stringify(a, null, 2); } catch (_) { return String(a); }
                    }
                    return String(a);
                }).join(' ');
                window.gajeDevLogs.push({ type, time: new Date().toLocaleTimeString(), text });
                if (window.gajeDevLogs.length > 300) window.gajeDevLogs.shift();
                if (window.renderDevLogs) window.renderDevLogs();
            };

            const _log = console.log, _warn = console.warn, _err = console.error;
            console.log = function(...a) { pushEntry('info', a); _log.apply(console, a); };
            console.warn = function(...a) { pushEntry('warn', a); _warn.apply(console, a); };
            console.error = function(...a) { pushEntry('error', a); _err.apply(console, a); };

            window.onerror = function(msg, url, line, col, err) {
                const src = url ? url.split('/').pop() : 'inline';
                pushEntry('error', [`[CRASH ${src}:${line}:${col}] ${msg}`]);
            };
            window.addEventListener('unhandledrejection', function(e) {
                pushEntry('error', [`[PROMISE ERROR] ${e.reason}`]);
            });
        })();
