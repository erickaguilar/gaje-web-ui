/**
 * 🧬 GAJE Helix — Configuración Global y Control Centralizado de Versiones
 * Punto Único de Verdad (Single Source of Truth) para la Web UI, Web Workers y Service Worker.
 */

(function (scope) {
  'use strict';

  var VERSION = '1.7.8';
  var BUILD_DATE = '2026-09-09';
  var BUILD_HASH = 'model-isolation-rag-fix';

  var CONFIG = {
    version: VERSION,
    buildDate: BUILD_DATE,
    appName: 'GAJE Helix',
    appDescription: 'Motor de inferencia LLM y compresión semántica genómica.',
    
    // CDN oficial de modelos binarios .flat
    cdnBaseUrl: 'https://huggingface.co/eaguilar/gaje-models/resolve/main/',
    
    // Modelo por defecto al iniciar
    defaultModel: 'max_512_pro.gaje',
    
    // Catálogo Maestro de Modelos Certificados (Unificado a formato .gaje y .flat)
    modelsCatalog: [
      {
        id: 'qwen2_5_0_5b.gaje',
        name: 'qwen2_5_0_5b.gaje',
        title: 'Qwen 2.5 0.5B Instruct',
        badge: 'Q4_0 ChatML 1.5GB',
        size_bytes: 1579376328,
        sizeMb: 1506.2,
        ramMb: 1800,
        blocks: 24,
        dim: 896,
        heads: '14 Heads / 2 KV (GQA 7x)',
        tokenizer: 'GTOK Qwen2.5 BPE 152k',
        mobileOptimized: false,
        arch: 'Qwen2.5-0.5B-Instruct (Q4_0 + GTOK ChatML)'
      },
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
        blocks: 8,
        dim: 256,
        heads: '8 Heads / 2 KV (GQA 4x)',
        tokenizer: 'GTOK v1.0 Nativo Incrustado',
        mobileOptimized: true,
        arch: 'Llama-256-8L (Q2_0 + GTOK)'
      },
      {
        id: 'gaje_pico_135m.flat',
        name: 'gaje_pico_135m.flat',
        title: 'SmolLM2 Pico 135M',
        badge: 'Q4_0 Zero-Copy',
        size_bytes: 145000000,
        sizeMb: 138.3,
        ramMb: 220,
        blocks: 30,
        dim: 576,
        heads: '9 Heads / 3 KV (GQA 3x)',
        tokenizer: 'HuggingFace BPE (SmolLM2)',
        mobileOptimized: true,
        arch: 'SmolLM2-135M (Q4_0)'
      },
      {
        id: 'gaje_coder_3b.flat',
        name: 'gaje_coder_3b.flat',
        title: 'Qwen 2.5 Coder 3B',
        badge: 'Q4_0 AVX2',
        size_bytes: 1950000000,
        sizeMb: 1860,
        ramMb: 2400,
        blocks: 36,
        dim: 2048,
        heads: '16 Heads / 2 KV (GQA 8x)',
        tokenizer: 'Qwen2.5 BPE 152k',
        mobileOptimized: false,
        arch: 'Qwen2.5-Coder-3B (Q4_0)'
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
