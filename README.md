# 🧬 GAJE Helix — Web UI & PWA Platform

[![Language: English](https://img.shields.io/badge/Language-English-blue.svg)](README.en.md) [![Language: 中文](https://img.shields.io/badge/Language-%E4%B8%AD%E6%96%87-red.svg)](README.zh.md)

<p align="center">
  <img src="static/icons/gaje-icon.svg" width="96" height="96" alt="GAJE Helix Logo">
  <br>
  <b>Interfaz Web Soberana, PWA e Inferencia WebAssembly In-Browser para Modelos Genómicos y LLMs</b>
  <br>
  <code>v1.7.1-alpha</code> · <i>Zero-Server Client-Side & Native Streaming Server</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/PWA-Ready-30d158?style=flat-square&logo=pwa" alt="PWA Ready">
  <img src="https://img.shields.io/badge/WebAssembly-SIMD128-0a84ff?style=flat-square&logo=webassembly" alt="WASM SIMD">
  <img src="https://img.shields.io/badge/IndexedDB-GajeHelixDB_v3-5e5ce6?style=flat-square" alt="IndexedDB">
  <img src="https://img.shields.io/badge/Theme-HIG_Apple_%26_Scandinavian-f472b6?style=flat-square" alt="Themes">
  <img src="https://img.shields.io/badge/License-GNU_AGPL--3.0-ffd60a?style=flat-square" alt="License">
</p>

---

## 🌟 Visión General

**GAJE Helix Web UI** es la interfaz interactiva oficial para el ecosistema **GAJE (Genetic Adaptive Joint Embedding)**. Ofrece una experiencia de chat multimodal, telemetría HUD en tiempo real, visualizador de arquitectura interactivo y gestión de memoria episódica (`.gmem`), diseñada para funcionar en dos modalidades complementarias:

1. **Modo Zero-Server (In-Browser WebAssembly):** Ejecuta modelos de lenguaje (`.flat`) íntegramente dentro del hilo secundario del navegador (Web Worker) sin necesidad de un backend o servidor en la nube.
2. **Modo Servidor Nativo Soberano (`gaje-cli serve`):** Inferencia de ultra-alto rendimiento en streaming (SSE) conectada al núcleo nativo compilado en Rust (Zero-Python Runtime) con memoria `mmap` zero-copy y modo ultra-ligero `--chat-only`.

---

## ✨ Características Principales

### 📱 1. Progressive Web App (PWA) & Modo Offline
- **Instalación Nativa:** Se instala como aplicación independiente en **Android, iOS, macOS y Windows** con soporte de pantalla completa (*standalone*).
- **Service Worker Inteligente (`sw.js`):** Estrategia *Network-First* para recibir actualizaciones instantáneas y *Cache-Fallback* para carga sin conexión a internet.
- **Botón Inteligente de Actualización:** Oculta el botón de instalación si la app ya está instalada y muestra automáticamente un indicador pulsante **`[ 🔄 Actualizar ]`** cuando se despliega una nueva versión.

### ⚡ 2. Almacenamiento Soberano (`GajeHelixDB v3`)
- Persistencia estructurada en **IndexedDB** local:
  - 💬 **Mensajes e Historial:** Búsqueda rápida, exportación e importación JSON.
  - 🏝️ **Islas de Memoria (.gmem):** Módulos episódico, documental y conversacional.
  - 📦 **Model Cache (Zero-Download):** Descarga el modelo binario (`.flat`) una sola vez y lo almacena localmente en la memoria flash del dispositivo para inicios en menos de 50 ms.

### 🎨 3. Sistema Dual-Theme Y2K
- **`y2k-dark = 'HIG-APPLE'` (Oscuro):** Materiales oscuros translúcidos (*Glassmorphism*), acentos neón y scanlines CRT retro-futuristas.
- **`y2k-light = 'SCANDINAVIAN-DESIGN'` (Claro):** Diseño nórdico minimalista (*Hygge*), estética de cuaderno de campo de laboratorio (*Lab Research Notebook*) y geometría pura (`border-radius: 0px`).

### 📦 4. Catálogo de Modelos Certificados (`static/js/config.js`)
Configuración centralizada y unificada:
- **`gaje_pico_135m.flat` (471 MB):** Ultra-rápido para teléfonos móviles (~30 tokens/seg en CPU ARM).
- **`gaje_nano_1.5b.flat` (1.2 GB):** Modelo balanceado para navegación web y escritorio.
- **`gaje_prime_3b.flat` (2.3 GB):** Inferencia avanzada estándar.
- **`gaje_ultra_7b.flat` (4.9 GB):** Razonamiento profundo.

---

## 📂 Estructura del Proyecto

```text
web_ui/
├── index.html                  # Chat interactivo, telemetría HUD y consola WASM
├── architecture.html           # Diagrama interactivo y visor de grafos del sistema
├── docs.html                   # Centro de documentación técnica y especificaciones
├── manifest.json               # Manifiesto PWA para instalación en dispositivos móviles y PC
├── sw.js                       # Service Worker (Network-First, caché y auto-actualización)
├── vercel.json                 # Configuración de despliegue y cabeceras de seguridad
├── server.py                   # Servidor de desarrollo/investigación Python stdlib
├── static/
│   ├── js/
│   │   ├── config.js           # 🧬 Configuración global, catálogo y control de versiones
│   │   ├── storage.js          # Motor IndexedDB soberano (GajeHelixDB v3)
│   │   ├── ui.js               # Control de temas, PWA y carga modular de parciales
│   │   ├── wasm_worker.js      # Web Worker de inferencia WebAssembly en segundo plano
│   │   ├── chat/               # Módulos del Chat (Toolbar, Composer, Engine, Telemetry)
│   │   ├── architecture_view.js# Grafo interactivo SVG
│   │   └── docs.js             # Gestor de navegación de documentación
│   ├── css/
│   │   ├── base.css            # Layout global, variables de color y componentes Y2K
│   │   ├── chat.css            # Estilos de chat, composer y HUD de telemetría
│   │   ├── docs.css            # Estilos de lectura para documentación
│   │   └── architecture.css    # Estilos del visualizador interactivo
│   ├── partials/
│   │   ├── header.html         # Barra de navegación superior y acciones PWA
│   │   ├── chat_toolbar.html   # Toolbar macOS con telemetría y selector de modelo
│   │   └── footer.html         # Pie de página interactivo
│   └── wasm/
│       ├── _impl.js            # Wrapper JavaScript generado por wasm-bindgen
│       └── _impl_bg.wasm       # Binario nativo GAJE compilado para WebAssembly
```

---

## 🚀 Guía de Ejecución

### Opción 1: Modo Estático / Zero-Server (Vercel, Cloudflare Pages o Local)

No requiere Python ni Rust; todo se ejecuta directamente en el navegador del usuario:

```bash
# Con cualquier servidor estático local:
python3 -m http.server 8000 --directory .

# O usando Node:
npx serve .
```

Abre `http://localhost:8000` en tu navegador.

---

### Opción 2: Modo Servidor Nativo de Producción (`gaje-cli serve` Zero-Python)

Para utilizar la máxima aceleración SIMD nativa (AVX-512 / AVX2 / NEON) y memoria `mmap` zero-copy sin sobrecarga de intérpretes ni GIL de Python:

```bash
# 1. Compilar el binario nativo optimizado
cargo build --release --bin gaje-cli

# 2. Iniciar el servidor nativo en modo ultra-ligero
./target/release/gaje-cli serve --port 8080 --chat-only
```

#### Flags y opciones de `gaje-cli serve`:
- `--port <PUERTO>`: Puerto HTTP a escuchar (por defecto `8080`).
- `--host <IP>`: Dirección de enlace (por defecto `127.0.0.1`).
- `--chat-only`: Activa el modo ligero optimizado para móviles y terminales edge (desactiva telemetría pesada de laboratorio y optimiza memoria).
- `--model <RUTA>`: Precarga un organismo binario específico al arrancar (por defecto auto-detecta `born/max.gaje`, `gaje_coder_3b.flat` o `gaje_pico_135m.flat`).

> **💡 Entorno de desarrollo Python alternativo:** Para iteración rápida en la capa de investigación Python sin compilar en Rust, se puede ejecutar `python3 server.py --port 8080` (utiliza el servidor ligero nativo de la biblioteca estándar `http.server`).

---

## ☁️ Despliegue en Vercel

El proyecto está 100% optimizado para despliegues instantáneos en Vercel con el archivo `vercel.json` incluido:

1. Conecta tu repositorio de GitHub a Vercel.
2. Directorio raíz: `./` (o la carpeta `examples/ui/web_ui`).
3. El archivo `vercel.json` configurará automáticamente:
   - Cabeceras de aislamiento `COEP: credentialless` y `COOP: same-origin`.
   - Reglas anti-caché para el Service Worker y el HTML.
   - Tipos MIME nativos para WebAssembly.

---

## 📄 Licencia

Este proyecto está licenciado bajo la **GNU Affero General Public License v3.0 (AGPL-3.0)** para garantizar la soberanía, libertad y código abierto del software tanto en uso local como en servicios de red. Consulta el archivo `LICENSE` en la raíz del repositorio para el texto legal completo.
