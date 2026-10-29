# Coderot

Co-op neon arcade shooter. Static site: no build step, no server.

## Run locally

```bash
python -m http.server 5173
```

Open http://localhost:5173

## Deploy to Vercel

```bash
npx vercel --prod
```

Accept the defaults (no framework, no build command, output = project root). Share the URL with friends.

## Online play

Rooms use WebRTC through [PeerJS](https://peerjs.com) and its free public broker, so the Vercel deploy needs nothing else.
The player who creates a room hosts the game; up to 8 players. Pause menu → **Copy invite link** gives a `?room=CODE` link.
If the host leaves, the room ends. Very strict networks (some school/office Wi-Fi) can block WebRTC; a TURN server fixes that if it ever comes up.

## Files

| File | What |
|---|---|
| `index.html` | Markup, menu, script order |
| `css/style.css` | Menu styling |
| `js/config.js` | Constants and data: enemies, bosses, classes, upgrades, power-ups |
| `js/state.js` | Shared game state, canvas, effect helpers |
| `js/audio.js` | Synth sound effects |
| `js/input.js` | Keyboard, mouse, touch, gamepad |
| `js/world.js` | Host simulation: enemies, rot, waves, damage |
| `js/bosses.js` | The 6 bosses: attacks, signature mechanics, boss parts (pillars, QR code, arms, body, pods, decoys) |
| `js/player.js` | Local player: classes, weapons, skills, power-ups, upgrades |
| `js/net.js` | PeerJS rooms, snapshots |
| `js/render.js` | All drawing |
| `js/main.js` | Menu wiring, settings, game flow, main loop |
| `js/admin.js` | Sandbox admin panel: spawn enemies/bosses, jump waves, swap classes, cheats |
