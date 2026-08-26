/* ============================================================
   GAJE UI — utilidades compartidas entre páginas
   Reveal on scroll · Botones copiar · Toggle de tema
   ============================================================ */
(function (global) {
  'use strict';

  /* ── Reveal on scroll ── */
  function initReveal() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              e.target.classList.add('visible');
              io.unobserve(e.target);
            }
          });
        },
        { threshold: 0.12 }
      );
      els.forEach(function (el) { io.observe(el); });
    } else {
      els.forEach(function (el) { el.classList.add('visible'); });
    }
  }

  /* ── Copiar texto ── */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function initCopyButtons() {
    document.querySelectorAll('.copy-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-target');
        var src = targetId === 'term'
          ? document.getElementById('term')
          : document.getElementById(targetId);
        if (!src) return;
        var old = btn.textContent;
        copyText(src.textContent).then(function () {
          btn.textContent = '✓ Copiado';
          setTimeout(function () { btn.textContent = old; }, 1600);
        });
      });
    });
  }

  /* ── Toggle de tema claro/oscuro ── */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var toggles = document.querySelectorAll('#theme-toggle, #direct-theme-toggle');
    toggles.forEach(function (toggle) {
      if (toggle) {
        toggle.setAttribute('aria-label', theme === 'light' ? 'Activar Tema Oscuro' : 'Activar Tema Claro');
      }
    });
  }

  function initTheme() {
    var toggles = document.querySelectorAll('#theme-toggle, #direct-theme-toggle');
    if (!toggles.length) return;
    applyTheme(localStorage.getItem('theme') || 'light');
    toggles.forEach(function (toggle) {
      // Evitar duplicación de listeners
      if (toggle._hasThemeListener) return;
      toggle._hasThemeListener = true;
      toggle.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme') || 'light';
        var next = current === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', next);
        applyTheme(next);
      });
    });
  }

  /* ── Header Y2K compartido (parcial) ── */
  function initHeaderMenu(host) {
    var menuBtn = host.querySelector('#y2k-menu-btn');
    var dropdown = host.querySelector('#y2k-menu-dropdown');
    if (!menuBtn || !dropdown) return;

    menuBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = dropdown.classList.contains('open');
      if (isOpen) {
        dropdown.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      } else {
        dropdown.classList.add('open');
        menuBtn.setAttribute('aria-expanded', 'true');
      }
    });

    document.addEventListener('click', function (e) {
      if (!host.contains(e.target)) {
        dropdown.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function initHeader() {
    var host = document.getElementById('gaje-header');
    if (!host) return;
    var url = window.GAJE_CONFIG ? window.GAJE_CONFIG.assetUrl('static/partials/header.html') : 'static/partials/header.html';
    fetch(url)
      .then(function (r) { return r.text(); })
      .then(function (html) {
        host.innerHTML = html;
        var page = host.getAttribute('data-page') || 'index';
        var map = { index: 'index.html', chat: 'index.html', architecture: 'architecture.html', docs: 'docs.html' };
        var target = map[page] || page;
        
        // Activar enlaces en navegación segmentada y dropdown
        var links = host.querySelectorAll('.segmented-tab, .y2k-dropdown-item');
        links.forEach(function (a) {
          if (a.getAttribute('href') === target || a.getAttribute('data-page') === page) {
            a.classList.add('active');
            a.setAttribute('aria-current', 'page');
            a.setAttribute('aria-selected', 'true');
          } else if (a.classList.contains('segmented-tab')) {
            a.setAttribute('aria-selected', 'false');
          }
        });
        initHeaderMenu(host);
        initTheme();
        updateVersionLabels();

        var monitorBtn = host.querySelector('#y2k-open-monitor-btn');
        if (monitorBtn) {
          monitorBtn.addEventListener('click', function () {
            var modal = document.getElementById('metrics-monitor-modal');
            if (modal && typeof modal.showModal === 'function') {
              modal.showModal();
            } else if (modal) {
              modal.setAttribute('open', '');
            } else {
              window.location.href = 'index.html';
            }
          });
        }
      })
      .catch(function (e) { console.warn('No se pudo cargar header parcial:', e); });
  }

  /* ── Footer Y2K compartido (parcial) ── */
  function initFooter() {
    var host = document.getElementById('gaje-footer');
    if (!host) return;
    var url = window.GAJE_CONFIG ? window.GAJE_CONFIG.assetUrl('static/partials/footer.html') : 'static/partials/footer.html';
    fetch(url)
      .then(function (r) { return r.text(); })
      .then(function (html) {
        host.innerHTML = html;
        host.classList.add('y2k-footer');
        updateVersionLabels();
      })
      .catch(function (e) { console.warn('No se pudo cargar footer parcial:', e); });
  }

  /* ── Chat Toolbar compartida (parcial) ── */
  function initChatToolbar() {
    var host = document.getElementById('chat-toolbar');
    if (!host || host.children.length) return Promise.resolve();
    var url = window.GAJE_CONFIG ? window.GAJE_CONFIG.assetUrl('static/partials/chat_toolbar.html') : 'static/partials/chat_toolbar.html';
    return fetch(url)
      .then(function (r) { return r.text(); })
      .then(function (html) {
        host.innerHTML = html;
        updateVersionLabels();
        if (global.GajeChat && typeof global.GajeChat.reloadToolbar === 'function') {
          global.GajeChat.reloadToolbar();
        }
      })
      .catch(function (e) { console.warn('No se pudo cargar toolbar parcial:', e); });
  }

  /* ── PWA & Instalación / Actualización como Aplicación Nativa ── */
  var deferredPwaPrompt = null;
  var swRegistration = null;

  function isStandaloneApp() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true ||
           (typeof document !== 'undefined' && document.referrer && document.referrer.includes('android-app://'));
  }

  function showUpdateButtons() {
    var updateBtns = document.querySelectorAll('.pwa-update-btn');
    updateBtns.forEach(function (btn) {
      btn.style.display = 'inline-flex';
    });
  }

  function hideInstallButtons() {
    var installBtns = document.querySelectorAll('.pwa-install-btn');
    installBtns.forEach(function (btn) {
      btn.style.display = 'none';
    });
  }

  function initPwa() {
    if (isStandaloneApp()) {
      hideInstallButtons();
    }

    if ('serviceWorker' in navigator) {
      var swUrl = window.GAJE_CONFIG ? window.GAJE_CONFIG.assetUrl('sw.js') : 'sw.js';
      navigator.serviceWorker.register(swUrl).then(function (reg) {
        swRegistration = reg;
        
        if (reg.waiting) {
          showUpdateButtons();
        }

        reg.addEventListener('updatefound', function () {
          var newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', function () {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('⚡ [GAJE-PWA] Nueva versión lista para activar.');
              showUpdateButtons();
            }
          });
        });

        reg.update();
      }).catch(function (err) {
        console.log('[GAJE-PWA] Service Worker no registrado:', err);
      });

      var refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }

    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      if (isStandaloneApp()) {
        hideInstallButtons();
        return;
      }
      deferredPwaPrompt = e;
      var installBtns = document.querySelectorAll('.pwa-install-btn');
      installBtns.forEach(function (btn) {
        btn.style.display = 'inline-flex';
      });
    });

    window.addEventListener('appinstalled', function () {
      console.log('[GAJE-PWA] Aplicación instalada exitosamente.');
      deferredPwaPrompt = null;
      hideInstallButtons();
    });

    document.addEventListener('click', function (e) {
      // 1. Botón Actualizar
      var updateBtn = e.target.closest('.pwa-update-btn');
      if (updateBtn) {
        e.preventDefault();
        updateBtn.innerHTML = '<span>Actualizando...</span>';
        if (swRegistration && swRegistration.waiting) {
          swRegistration.waiting.postMessage({ action: 'skipWaiting' });
        } else if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ action: 'skipWaiting' });
          setTimeout(function () { window.location.reload(true); }, 300);
        } else {
          window.location.reload(true);
        }
        return;
      }

      // 2. Botón Instalar
      var installBtn = e.target.closest('.pwa-install-btn');
      if (installBtn) {
        e.preventDefault();
        if (deferredPwaPrompt) {
          deferredPwaPrompt.prompt();
          deferredPwaPrompt.userChoice.then(function (choiceResult) {
            if (choiceResult.outcome === 'accepted') {
              console.log('[GAJE-PWA] El usuario aceptó la instalación.');
              hideInstallButtons();
            }
            deferredPwaPrompt = null;
          });
        } else {
          var isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
          if (isIos) {
            alert('📱 Para instalar GAJE Helix en tu iPhone/iPad:\n\n1. Toca el botón "Compartir" en Safari (icono con flecha hacia arriba ⎋).\n2. Desliza hacia abajo y selecciona "Agregar a la pantalla de inicio" (+).\n3. Toca "Agregar".');
          } else {
            alert('📱 Para instalar GAJE Helix:\n\nToca el menú de opciones de tu navegador (los tres puntos ⋮ arriba a la derecha) y selecciona "Instalar aplicación" o "Agregar a la pantalla principal".');
          }
        }
      }
    });
  }

  /* ── Inyección Dinámica de Versión en HTML ── */
  function updateVersionLabels() {
    var version = (window.GAJE_CONFIG && window.GAJE_CONFIG.version) ? 'v' + window.GAJE_CONFIG.version : 'v1.7.2';
    var fullVer = (window.GAJE_CONFIG && window.GAJE_CONFIG.version) ? 'v' + window.GAJE_CONFIG.version + '-alpha' : 'v1.7.2-alpha';

    document.querySelectorAll('.gaje-version-display').forEach(function (el) {
      el.textContent = version;
    });

    document.querySelectorAll('.gaje-version-full').forEach(function (el) {
      el.textContent = fullVer;
    });

    document.querySelectorAll('[data-gaje-version-tooltip]').forEach(function (el) {
      el.setAttribute('data-tooltip', 'GAJE Helix ' + version);
    });
  }

  /* ── Boot ── */
  function boot() {
    initReveal();
    initCopyButtons();
    initTheme();
    initHeader();
    initFooter();
    initPwa();
    updateVersionLabels();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.GajeUI = {
    initReveal: initReveal,
    initTheme: initTheme,
    initCopyButtons: initCopyButtons,
    initHeader: initHeader,
    initFooter: initFooter,
    initChatToolbar: initChatToolbar,
    initPwa: initPwa,
    updateVersionLabels: updateVersionLabels
  };
})(window);
