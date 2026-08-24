/**
 * 🧬 GAJE Helix — Configuración Global y Control Centralizado de Versiones
 * Punto Único de Verdad (Single Source of Truth) para la Web UI, Web Workers y Service Worker.
 */

(function (scope) {
  'use strict';

  var VERSION = '1.7.5';
  var BUILD_DATE = '2026-08-24';

  var CONFIG = {
    version: VERSION,
    buildDate: BUILD_DATE,
    appName: 'GAJE Helix',
    appDescription: 'Motor de inferencia LLM y compresión semántica genómica.',
    
    // CDN oficial de modelos binarios .flat
    cdnBaseUrl: 'https://huggingface.co/eaguilar/gaje-models/resolve/main/',
    
    // Modelo por defecto al iniciar
    defaultModel: 'gaje_pico_135m.flat',
    
    // Catálogo Maestro de Modelos Certificados
    modelsCatalog: [
      {
        id: 'gaje_pico_135m.flat',
        name: 'gaje_pico_135m.flat',
        title: 'GAJE Pico 135M',
        badge: 'Móvil Ultra-Rápido 470MB',
        size_bytes: 494280704,
        sizeMb: 471.4,
        ramMb: 220,
        mobileOptimized: true,
        arch: 'SmolLM2-135M (Q4_0+FP32)'
      },
      {
        id: 'gaje_nano_1.5b.flat',
        name: 'gaje_nano_1.5b.flat',
        title: 'GAJE Nano 1.5B',
        badge: 'WASM 1.2GB',
        size_bytes: 1324845056,
        sizeMb: 1263.5,
        ramMb: 1400,
        mobileOptimized: false,
        arch: 'Qwen2.5-1.5B (Q4_0+FP32)'
      },
      {
        id: 'gaje_prime_3b.flat',
        name: 'gaje_prime_3b.flat',
        title: 'GAJE Prime 3B',
        badge: 'Desktop 2.2GB',
        size_bytes: 2410702683,
        sizeMb: 2299.0,
        ramMb: 2600,
        mobileOptimized: false,
        arch: 'Qwen2.5-3B (Q4_0+FP32)'
      },
      {
        id: 'gaje_ultra_7b.flat',
        name: 'gaje_ultra_7b.flat',
        title: 'GAJE Ultra 7B',
        badge: 'Cloud 4.9GB',
        size_bytes: 5247000000,
        sizeMb: 5003.9,
        ramMb: 5400,
        mobileOptimized: false,
        arch: 'Qwen2.5-7B (Q4_0+FP32)'
      }
    ],

    /**
     * Retorna una URL con el parámetro de versión inyectado para control de caché
     */
    assetUrl: function (path) {
      if (!path) return '';
      var sep = path.indexOf('?') === -1 ? '?' : '&';
      return path + sep + 'v=' + encodeURIComponent(VERSION);
    },

    /**
     * Busca los metadatos de un modelo por su nombre/id
     */
    getModelMeta: function (modelId) {
      if (!modelId) return null;
      for (var i = 0; i < this.modelsCatalog.length; i++) {
        if (this.modelsCatalog[i].id === modelId || this.modelsCatalog[i].name === modelId) {
          return this.modelsCatalog[i];
        }
      }
      return null;
    }
  };

  scope.GAJE_CONFIG = CONFIG;
})(typeof self !== 'undefined' ? self : this);
