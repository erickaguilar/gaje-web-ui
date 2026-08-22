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
    var toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-label', theme === 'light' ? 'Activar Tema Oscuro' : 'Activar Tema Claro');
    }
  }

  function initTheme() {
    var toggle = document.getElementById('theme-toggle');
    if (!toggle) return;
    applyTheme(localStorage.getItem('theme') || 'dark');
    toggle.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', next);
      applyTheme(next);
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
    fetch('static/partials/header.html?v=1.6.2')
      .then(function (r) { return r.text(); })
      .then(function (html) {
        host.innerHTML = html;
        var page = host.getAttribute('data-page') || 'index';
        var map = { index: 'index.html', chat: 'index.html', architecture: 'architecture.html', docs: 'docs.html' };
        var target = map[page] || page;
        var links = host.querySelectorAll('.y2k-dropdown-item');
        links.forEach(function (a) {
          if (a.getAttribute('href') === target) {
            a.classList.add('active');
            a.setAttribute('aria-current', 'page');
          }
        });
        initHeaderMenu(host);
        initTheme();

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
    fetch('static/partials/footer.html?v=1.6.2')
      .then(function (r) { return r.text(); })
      .then(function (html) {
        host.innerHTML = html;
        host.classList.add('y2k-footer');
      })
      .catch(function (e) { console.warn('No se pudo cargar footer parcial:', e); });
  }

  /* ── Boot ── */
  function boot() {
    initReveal();
    initCopyButtons();
    initTheme();
    initHeader();
    initFooter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.GajeUI = { initReveal: initReveal, initTheme: initTheme, initCopyButtons: initCopyButtons, initHeader: initHeader, initFooter: initFooter };
})(window);
