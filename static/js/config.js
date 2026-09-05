/**
 * 🧬 GAJE Helix — Configuración Global y Control Centralizado de Versiones
 * Punto Único de Verdad (Single Source of Truth) para la Web UI, Web Workers y Service Worker.
 */

(function (scope) {
  'use strict';

  var VERSION = '1.7.0-alpha';
  var BUILD_DATE = '2026-08-27';

  var CONFIG = {
    version: VERSION,
    buildDate: BUILD_DATE,
    appName: 'GAJE Helix',
    appDescription: 'Motor de inferencia LLM y compresión semántica genómica.',
    
    // CDN oficial de modelos binarios .flat
    cdnBaseUrl: 'https://huggingface.co/eaguilar/gaje-models/resolve/main/',
    
    // Modelo por defecto al iniciar
    defaultModel: 'max.gaje',
    
    // Catálogo Maestro de Modelos Certificados (Unificado a formato .gaje)
    modelsCatalog: [
      {
        id: 'max.gaje',
        name: 'max.gaje',
        title: 'GAJE Max (Llama-Born)',
        badge: 'Insignia 99MB GTOK',
        size_bytes: 104409712,
        sizeMb: 99.6,
        ramMb: 120,
        mobileOptimized: true,
        arch: 'Llama-256-8L (Q2_0 + GTOK)'
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
    },

    /**
     * Evalúa el perfil de hardware del cliente (RAM, concurrencia, soporte SIMD128)
     */
    getHardwareProfile: function () {
      var memGb = (typeof navigator !== 'undefined' && navigator.deviceMemory) ? navigator.deviceMemory : null;
      var cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 2;
      var hasSimd = false;
      try {
        hasSimd = typeof WebAssembly !== 'undefined' && WebAssembly.validate(
          new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 26, 11])
        );
      } catch (e) {
        hasSimd = false;
      }
      return {
        deviceMemoryGb: memGb,
        hardwareConcurrency: cores,
        hasSimd: hasSimd,
        isLowMemory: memGb !== null && memGb < 4
      };
    }
  };

  scope.GAJE_CONFIG = CONFIG;
})(typeof self !== 'undefined' ? self : this);
