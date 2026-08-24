# GAJE Web UI — Guía de Estilo Y2K Retro

## Propósito
Este documento describe el sistema de diseño **Y2K retro / Web 1.0** del header de la
web UI (GAJE), para que cualquier agente o persona mantenga coherencia al editarlo.

## Ubicación de estilos
- Tokens de tema: `static/css/base.css` → `:root` (oscuro) y `[data-theme="light"]`.
- Header/Footer compartidos: `static/partials/header.html`, `static/partials/footer.html`.
- JS del header (menú, tema): `static/js/ui.js`.

## Estructura del header (`.y2k-header`)
Es un `<header>` sticky, con ancho 95%, esquinas redondeadas (14px) y z-index alto.
Dentro:
- `.y2k-brand` → marca: `gaje-icon.svg` + texto SVG (estilo terminal con cursor
  parpadeante `.brand-underscore`).
- `.y2k-header-actions` → botones GitHub (icono) y menú hamburguesa (`.y2k-menu-btn`)
  que abre `.y2k-menu-dropdown` (panel desplegable con nav + toggle de tema).
- `.y2k-status` → marquee/ticker ciberpunk (oculto < 720px).

## Puntos críticos (IMPORTANTE)
1. **`overflow: hidden` está PROHIBIDO en `.y2k-header`**: recorta el dropdown del menú.
   Los pseudoelementos de brillo usan `border-radius: inherit` y NO necesitan clipping.
2. **El menú depende de `z-index`**: `.y2k-menu-dropdown` usa `z-index: 200`; el `.wrap`
   usa `z-index: 3` para quedar por encima del brillo glass. Mantener estas jerarquías.
3. **`.visually-hidden` vive en `base.css`** (NO en `chat.css`) para que funcione en
   todas las páginas (docs, architecture, index). No duplicarlo.
4. **Filosofía de Temas (Dark vs Light)**:
   - `y2k-dark = 'HIG-APPLE'`: Tema oscuro por defecto. Estética Apple Human Interface Guidelines (HIG) Dark Materials, fondos negros profundos (`#000000`), efecto glassmorphism/blur (20px), scanlines CRT y acentos neón Y2K.
   - `y2k-light = 'SCANDINAVIAN-DESIGN'`: Tema claro activado con `[data-theme="light"]`. Basado en principios nórdicos (funcionalismo, minimalismo cálido *hygge*, geometría 100% cuadrada / 0px radius, conexión botánica y maximización de la luz) fusionado con la estética de **Cuaderno de Aprendizaje & Notas de Laboratorio** (fondo marfil con cuadrícula *dot-grid*, margen de libreta ámbar, tarjetas de notas encuadernadas y acentos verde bosque/jade `#2c5234`).

## Capas visuales del header (orden de apilamiento)
- `.y2k-header::before` (z-index 1): scanlines CRT + sheen diagonal (efecto vidrio Apple).
- `.y2k-header::after` (z-index 2): banda de luz glass en el tercio superior.
- `.y2k-header .wrap` (z-index 3): contenido (marca, nav, botones).

## Fondo del header (modo oscuro)
Compuesto por capas en `background`:
1. Radial cian `#22d3ee` (izquierda).
2. Radial violeta `#a78bfa` (derecha).
3. Radial rosa `#f472b6` (arriba-centro).
4. Base azul-noche con gradiente vertical.

## Colores Y2K por icono del sprite
- chat `#22d3ee`, arch `#a78bfa`, docs `#f472b6`, folder `#34d399`, build `#fbbf24`,
  dna/grad/brain `#a78bfa/#f0abfc/#c084fc`, search/island `#22d3ee/#4ade80`,
  bolt `#fb7185`, sat `#fb923c`, sun `#fbbf24`, moon/clock `#67e8f9/#38bdf8`.

## Efectos de botón (Web 1.0)
Botones (`.y2k-github-icon-btn`, `.y2k-menu-btn`, `.y2k-theme-btn`) usan **bevel 3D**:
- `box-shadow: inset 1px 1px 0 rgba(255,255,255,.18), inset -1px -1px 0 rgba(0,0,0,.35)`.
- Estado `:active` invierte el bevel (efecto "pressed").
