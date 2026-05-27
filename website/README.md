# Monolith Landing Page

Live ASCII-textured rotating cube. Vite + React + p5.js.

## Quick Start

```bash
npm install
npm run dev          # http://localhost:8080
```

## How it works

A hidden p5 WEBGL graphics buffer renders a morphing 3D cube at character-grid resolution; the visible 2D canvas reads back those pixels and draws one colored monospace character per cell, picked from Paul Bourke's 70-step luminance ramp. See [CLAUDE.md](CLAUDE.md) for the full breakdown — including the StrictMode workaround that keeps the cube from rendering twice.

## Scripts

```bash
npm run dev          # Dev server (port 8080)
npm run build        # Production build
npm run preview      # Preview the production build
npm run lint         # ESLint
npm run format       # Prettier
```
