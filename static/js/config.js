/**
 * 🧬 GAJE Helix — Configuración Global y Control Centralizado de Versiones
 * Punto Único de Verdad (Single Source of Truth) para la Web UI, Web Workers y Service Worker.
 */

(function (scope) {
  'use strict';

  var VERSION = '1.7.4';
  var BUILD_DATE = '2026-09-05';
  var BUILD_HASH = 'd0a0ebb';

  var CONFIG = {
    version: VERSION,
    buildDate: BUILD_DATE,
    appName: 'GAJE Helix',
    appDescription: 'Motor de inferencia LLM y compresión semántica genómica.',
    
    // CDN oficial de modelos binarios .flat
    cdnBaseUrl: 'https://huggingface.co/eaguilar/gaje-models/resolve/main/',
    
    // Modelo por defecto al iniciar
    defaultModel: 'max_512_pro.gaje',
    
    // Catálogo Maestro de Modelos Certificados (Unificado a formato .gaje)
    modelsCatalog: [
      {
        id: 'max_512_pro.gaje',
        name: 'max_512_pro.gaje',
        title: 'GAJE Max Pro 512 (Born D=512)',
        badge: 'Pro 208MB GTOK',
        size_bytes: 217894512,
        sizeMb: 207.8,
        ramMb: 240,
        mobileOptimized: true,
        arch: 'Llama-512-12L (Q2_0 + GTOK)'
      },
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
    }
  };

  scope.GAJE_CONFIG = CONFIG;
})(typeof self !== 'undefined' ? self : this);
