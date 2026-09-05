# 🧬 GAJE Helix — Web UI & PWA Platform

[![Language: Español](https://img.shields.io/badge/Language-Espa%C3%B1ol-yellow.svg)](README.md) [![Language: 中文](https://img.shields.io/badge/Language-%E4%B8%AD%E6%96%87-red.svg)](README.zh.md)

<p align="center">
  <img src="static/icons/gaje-icon.svg" width="96" height="96" alt="GAJE Helix Logo">
  <br>
  <b>Sovereign Web Interface, PWA & In-Browser WebAssembly Inference for Genomic Models and LLMs</b>
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

## 🌟 Overview

**GAJE Helix Web UI** is the official interactive frontend for the **GAJE (Genetic Adaptive Joint Embedding)** ecosystem. It provides a multimodal chat experience, real-time HUD telemetry, an interactive architecture visualizer, and episodic memory management (`.gmem`), designed to operate in two complementary modes:

1. **Zero-Server Mode (In-Browser WebAssembly):** Runs language models (`.flat`) entirely inside a background browser Web Worker without requiring any backend or cloud server.
2. **Sovereign Native Server Mode (`gaje-cli serve`):** Ultra-high-performance streaming inference (SSE) connected directly to the compiled native Rust core (Zero-Python Runtime) with zero-copy `mmap` memory and an ultra-lightweight `--chat-only` profile.

---

## ✨ Key Features

### 📱 1. Progressive Web App (PWA) & Offline Capability
- **Native Installation:** Installs as a standalone application on **Android, iOS, macOS, and Windows** with full-screen support.
- **Intelligent Service Worker (`sw.js`):** *Network-First* strategy for instantaneous updates and *Cache-Fallback* for completely offline operation.
- **Smart Update Indicator:** Hides the install button when already installed and displays an automated pulsing **`[ 🔄 Update ]`** badge when a new release is deployed.

### ⚡ 2. Sovereign Local Storage (`GajeHelixDB v3`)
- Structured persistence in local **IndexedDB**:
  - 💬 **Messages & History:** Fast search, JSON export, and import.
  - 🏝️ **Memory Islands (.gmem):** Episodic, documentary, and conversational niches.
  - 📦 **Model Cache (Zero-Download):** Downloads the binary model (`.flat`) once and stores it in device flash storage for subsequent sub-50ms startups.

### 🎨 3. Y2K Tri-Theme System
- **`y2k-dark = 'HIG-APPLE'` (Dark):** Apple Human Interface Guidelines dark translucent materials (*Glassmorphism*), neon accents, and retro-futuristic CRT scanlines.
- **`y2k-light = 'SCANDINAVIAN-DESIGN'` (Light):** Warm Nordic minimalism (*Hygge*), laboratory research field notebook aesthetic (*Lab Research Notebook*), and pure square geometry (`border-radius: 0px`).
- **`y2k-zen = 'E-INK TECHNICAL MINIMALIST'` (Zen):** High-density paper-digital hybrid with deep matte carbon background, crisp ink contrast, and zero glare for fatigue-free extended reading.

### 📦 4. Certified Models Catalog (`static/js/config.js`)
Unified centralized configuration:
- **`gaje_pico_135m.flat` (471 MB):** Ultra-fast for mobile phones (~30 tokens/sec on ARM CPUs).
- **`gaje_nano_1.5b.flat` (1.2 GB):** Balanced model for web browsing and desktop.
- **`gaje_prime_3b.flat` (2.3 GB):** Standard advanced inference.
- **`gaje_ultra_7b.flat` (4.9 GB):** Deep reasoning model.

---

## 📂 Project Structure

```text
web_ui/
├── index.html                  # Interactive chat, HUD telemetry, and WASM console
├── architecture.html           # Interactive architecture diagram and system graph viewer
├── docs.html                   # Technical documentation hub and specifications
├── manifest.json               # PWA manifest for mobile and desktop installation
├── sw.js                       # Service Worker (Network-First, caching, and auto-update)
├── vercel.json                 # Deployment configuration and security headers
├── server.py                   # Lightweight Python stdlib development/research server
├── static/
│   ├── js/
│   │   ├── config.js           # 🧬 Global configuration, catalog, and version control
│   │   ├── storage.js          # Sovereign IndexedDB storage engine (GajeHelixDB v3)
│   │   ├── ui.js               # Theme controller, PWA, and partial loader
│   │   ├── wasm_worker.js      # Background WebAssembly inference Web Worker
│   │   ├── chat/               # Chat modules (Toolbar, Composer, Engine, Telemetry)
│   │   ├── architecture_view.js# Interactive SVG graph visualizer
│   │   └── docs.js             # Documentation navigation manager
│   ├── css/
│   │   ├── base.css            # Global layout, color variables, and Y2K components
│   │   ├── chat.css            # Chat, composer, and HUD telemetry styles
│   │   ├── docs.css            # Reader styles for technical documentation
│   │   ├── architecture.css    # Interactive visualizer styles
│   │   ├── y2k-dark.css        # HIG-Apple dark theme styles
│   │   ├── y2k-light.css       # Scandinavian lab notebook light theme styles
│   │   └── y2k-zen.css         # E-Ink technical minimalist theme styles
│   ├── partials/
│   │   ├── header.html         # Top navigation bar and PWA actions
│   │   ├── chat_toolbar.html   # macOS-inspired toolbar with telemetry and model picker
│   │   └── footer.html         # Interactive footer
│   └── wasm/
│       ├── _impl.js            # JavaScript wrapper generated by wasm-bindgen
│       └── _impl_bg.wasm       # Compiled native GAJE WebAssembly binary
```

---

## 🚀 Execution Guide

### Option 1: Static / Zero-Server Mode (Vercel, Cloudflare Pages, or Local)

Requires neither Python nor Rust; runs completely inside the user's browser:

```bash
# Using any local static HTTP server:
python3 -m http.server 8000 --directory .

# Or using Node:
npx serve .
```

Open `http://localhost:8000` in your web browser.

---

### Option 2: Sovereign Production Native Server (`gaje-cli serve` Zero-Python)

To leverage maximum native SIMD acceleration (AVX-512 / AVX2 / NEON) and zero-copy `mmap` memory without interpreter overhead or Python GIL:

```bash
# 1. Compile the optimized native Rust binary
cargo build --release --bin gaje-cli

# 2. Start the native server in ultra-lightweight mode
./target/release/gaje-cli serve --port 8080 --chat-only
```

#### Flags and options for `gaje-cli serve`:
- `--port <PORT>`: HTTP port to listen on (default `8080`).
- `--host <IP>`: Binding address (default `127.0.0.1`).
- `--chat-only`: Enables the lightweight profile optimized for mobile and edge devices (bypasses heavy laboratory telemetry endpoints to save memory).
- `--model <PATH>`: Preloads a specific binary organism at startup (automatically detects `born/max.gaje`, `gaje_coder_3b.flat`, or `gaje_pico_135m.flat` by default).

> **💡 Python Development Environment:** For rapid iteration in the Python research layer without compiling Rust, you can alternatively run `python3 server.py --port 8080` (uses the lightweight Python standard library `http.server`).

---

## ☁️ Deployment on Vercel

The project is pre-configured for instant deployments on Vercel via the included `vercel.json`:

1. Connect your GitHub repository to Vercel.
2. Root Directory: `./` (or the `examples/ui/web_ui` folder).
3. The `vercel.json` file automatically configures:
   - Isolation headers: `COEP: credentialless` and `COOP: same-origin`.
   - Anti-cache rules for the Service Worker and HTML files.
   - Native MIME types for WebAssembly (`application/wasm`).

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** to guarantee software sovereignty, freedom, and open-source availability in both local and networked environments. Refer to the root `LICENSE` file for the complete legal text.
