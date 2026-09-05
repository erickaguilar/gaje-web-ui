# 🧬 GAJE Helix — Web UI 与 PWA 平台

[![Language: Español](https://img.shields.io/badge/Language-Espa%C3%B1ol-yellow.svg)](README.md) [![Language: English](https://img.shields.io/badge/Language-English-blue.svg)](README.en.md)

<p align="center">
  <img src="static/icons/gaje-icon.svg" width="96" height="96" alt="GAJE Helix Logo">
  <br>
  <b>面向基因组模型与 LLM 的主权 Web 界面、PWA 及浏览器内 WebAssembly 推理引擎</b>
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

## 🌟 平台概述

**GAJE Helix Web UI** 是 **GAJE (Genetic Adaptive Joint Embedding)** 生态系统的官方交互式前端。它提供多模态聊天交互、实时 HUD 遥测监控、交互式架构可视化图谱以及情景记忆管理 (`.gmem`)，专为两种互补的运行模式而设计：

1. **零服务器模式 (浏览器端 WebAssembly):** 在浏览器的后台线程 (Web Worker) 中完全独立运行语言模型 (`.flat`)，无需任何后端或云端服务器。
2. **主权原生服务器模式 (`gaje-cli serve`):** 直接连接至以 Rust 编译的高性能原生内核 (Zero-Python 纯原生运行时)，借助零拷贝 `mmap` 虚拟内存和超轻量级 `--chat-only` 模式实现超低延迟流式推理 (SSE)。

---

## ✨ 核心特性

### 📱 1. 渐进式 Web 应用 (PWA) 与离线支持
- **原生安装体验:** 可作为独立应用程序直接安装在 **Android、iOS、macOS 和 Windows** 上，支持沉浸式全屏运行 (*standalone*)。
- **智能 Service Worker (`sw.js`):** 采用 *Network-First* 策略实现即时版本更新，结合 *Cache-Fallback* 保障无网络环境下的全离线运行。
- **自动更新提醒徽章:** 已安装时自动隐藏安装按钮；当检测到新版本发布时，自动展示脉冲发光的 **`[ 🔄 更新 ]`** 徽章。

### ⚡ 2. 本地主权存储 (`GajeHelixDB v3`)
- 基于本地 **IndexedDB** 的结构化持久化：
  - 💬 **会话与历史记录:** 高性能即时检索、JSON 导入与导出。
  - 🏝️ **记忆岛屿 (.gmem):** 情景记忆、文献记忆与交互记忆的独立生态位存储。
  - 📦 **模型高速缓存 (Zero-Download):** 仅需首次下载模型二进制文件 (`.flat`)，即持久保存在设备闪存中，后续冷启动时间小于 50 ms。

### 🎨 3. Y2K 三主题设计系统
- **`y2k-dark = 'HIG-APPLE'` (深色):** 融合 Apple 人机界面指南 (HIG) 深色半透明材质 (*Glassmorphism*)、霓虹色彩与复古未来主义 CRT 扫描线。
- **`y2k-light = 'SCANDINAVIAN-DESIGN'` (浅色):** 温暖北欧极简主义 (*Hygge*) 与实验室研究工作笔记 (*Lab Research Notebook*) 风格，采用严格直角几何设计 (`border-radius: 0px`)。
- **`y2k-zen = 'E-INK TECHNICAL MINIMALIST'` (极简禅意):** 电子墨水屏 (E-Ink) 纸质感极简设计，磨砂碳黑底色搭配清晰字迹对比度，彻底去除眩光与模糊特效，适合长时间无疲劳技术阅读。

### 📦 4. 认证模型目录 (`static/js/config.js`)
统一集中的模型配置：
- **`gaje_pico_135m.flat` (471 MB):** 移动端极速模型 (~30 tokens/秒 ARM CPU)。
- **`gaje_nano_1.5b.flat` (1.2 GB):** 适合网页端与桌面端的均衡型模型。
- **`gaje_prime_3b.flat` (2.3 GB):** 标准进阶推理模型。
- **`gaje_ultra_7b.flat` (4.9 GB):** 深度推理模型。

---

## 📂 项目结构

```text
web_ui/
├── index.html                  # 交互式聊天界面、HUD 遥测监控与 WASM 控制台
├── architecture.html           # 系统交互式架构图与图谱查看器
├── docs.html                   # 技术文档中心与规范说明
├── manifest.json               # 用于移动端与桌面端的 PWA 安装清单
├── sw.js                       # Service Worker (Network-First、离线缓存与自动更新)
├── vercel.json                 # Vercel 部署配置与安全隔离响应头
├── server.py                   # Python 标准库实现的轻量级研发与调试服务器
├── static/
│   ├── js/
│   │   ├── config.js           # 🧬 全局配置、模型目录与版本控制
│   │   ├── storage.js          # 主权 IndexedDB 存储引擎 (GajeHelixDB v3)
│   │   ├── ui.js               # 主题控制器、PWA 支持与页面局部加载器
│   │   ├── wasm_worker.js      # 后台 WebAssembly 推理 Web Worker
│   │   ├── chat/               # 聊天核心模块 (工具栏、输入框、引擎、遥测)
│   │   ├── architecture_view.js# 交互式 SVG 架构图渲染器
│   │   └── docs.js             # 文档导航与章节控制器
│   ├── css/
│   │   ├── base.css            # 全局布局、色彩变量与 Y2K 核心样式
│   │   ├── chat.css            # 聊天气泡、输入框与 HUD 遥测样式
│   │   ├── docs.css            # 技术文档阅读排版样式
│   │   ├── architecture.css    # 交互式架构图样式
│   │   ├── y2k-dark.css        # HIG-Apple 深色主题
│   │   ├── y2k-light.css       # 斯堪的纳维亚实验笔记浅色主题
│   │   └── y2k-zen.css         # E-Ink 电子墨水屏极简主题
│   ├── partials/
│   │   ├── header.html         # 顶部导航栏与 PWA 操作项
│   │   ├── chat_toolbar.html   # macOS 风格工具栏 (遥测与模型选择)
│   │   └── footer.html         # 交互式底部栏
│   └── wasm/
│       ├── _impl.js            # wasm-bindgen 生成的 JavaScript 包装层
│       └── _impl_bg.wasm       # 编译生成的 GAJE 原生 WebAssembly 二进制内核
```

---

## 🚀 启动与运行指南

### 方式 1: 静态零服务器模式 (Vercel、Cloudflare Pages 或本地)

无需安装 Python 或 Rust，模型推理完全在用户本地浏览器内运行：

```bash
# 使用任何本地静态 HTTP 服务器:
python3 -m http.server 8000 --directory .

# 或者使用 Node.js:
npx serve .
```

在浏览器中访问 `http://localhost:8000`。

---

### 方式 2: 生产级原生主权服务器 (`gaje-cli serve` 纯 Rust)

如需发挥最高硬件原生 SIMD 加速 (AVX-512 / AVX2 / NEON) 并享受零拷贝 `mmap` 虚拟内存，彻底免除解释器与 Python GIL 损耗：

```bash
# 1. 编译优化版原生 Rust 二进制
cargo build --release --bin gaje-cli

# 2. 启动超轻量级原生聊天服务
./target/release/gaje-cli serve --port 8080 --chat-only
```

#### `gaje-cli serve` 命令行参数说明：
- `--port <PORT>`: 监听的 HTTP 端口（默认 `8080`）。
- `--host <IP>`: 绑定 IP 地址（默认 `127.0.0.1`）。
- `--chat-only`: 启用针对移动端与边缘设备的超轻量模式（跳过重度实验室遥测端点，最大化缩减内存开销）。
- `--model <PATH>`: 启动时预加载指定的模型文件（默认自动探测 `born/max.gaje`、`gaje_coder_3b.flat` 或 `gaje_pico_135m.flat`）。

> **💡 Python 研发模式提示:** 若在 Python 研究层快速迭代实验，可替代执行 `python3 server.py --port 8080`（仅依赖 Python 标准库内置的 `http.server`，无额外第三方包要求）。

---

## ☁️ 部署至 Vercel

项目已通过内置的 `vercel.json` 针对 Vercel 自动化部署完成完整配置：

1. 将 GitHub 仓库连接至 Vercel。
2. 根目录设置为 `./`（或 `examples/ui/web_ui` 目录）。
3. `vercel.json` 将自动注入：
   - 跨源隔离响应头：`COEP: credentialless` 与 `COOP: same-origin`。
   - 针对 Service Worker 和 HTML 资源的防缓存策略。
   - 针对 WebAssembly 的原生 MIME 类型 (`application/wasm`)。

---

## 📄 开源协议

本项目采用 **GNU Affero General Public License v3.0 (AGPL-3.0)** 授权，旨在保障软件在本地与网络服务场景下的完整自主性、自由度与开源透明性。请参阅仓库根目录下的 `LICENSE` 查看完整法律条款。
