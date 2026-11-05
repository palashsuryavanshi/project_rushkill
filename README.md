<div align="center">
<h1>Project Rushkill</h1>
<p><em>Fast-paced 3D browser FPS with arcade-style movement</em></p>
</div>

A single-player arena FPS built with React, Three.js, and TypeScript. Fight AI bots on a Hijacked-inspired yacht map with a custom arsenal.

## Features

- **15 weapons** across 4 categories (AR, SMG, Shotgun, Sniper) with authentic ballistics
- **Arcade-style movement**: bunny-hop, slide-hop, air-strafe, coyote/jump buffering
- **Advanced bot AI** with 6 personalities × 4 difficulties, perception system (FOV, LOS, hearing)
- **Procedural audio** via Web Audio API — zero external audio files
- **Score streaks** (Double Kill → Bloodthirsty → Merciless → Relentless)
- **Custom match config**: time limit, score limit, bot count/difficulty, weapon filters

## Run Locally

**Prerequisites:** Node.js 18+ (or Bun)

```bash
# Install dependencies
npm install

# Start dev server on http://localhost:3000
npm run dev
```

## Controls

| Action | Key |
|--------|-----|
| Move | WASD |
| Jump | Space |
| Slide | Shift / C (while sprinting) |
| Aim (ADS) | Right Click |
| Fire | Left Click |
| Reload | R |
| Pause | Esc / P |
| Mute | M |

## Tech Stack

- **React 19** + **TypeScript** (UI)
- **Three.js** (WebGL rendering)
- **Vite** (build tool)
- **Tailwind CSS v4** (styling)
- **Web Audio API** (procedural sound synthesis)
