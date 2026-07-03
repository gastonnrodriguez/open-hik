# open-hik

**Live view, playback and smart motion search for Hikvision DVRs/NVRs in any modern browser. No Internet Explorer, no plugins, no Windows.**

🇪🇸 [Leer en español](README.es.md)

## Why this exists

Hikvision's embedded web UI (V4.x and older) depends on an ActiveX/NPAPI browser
plugin that no longer runs anywhere: Internet Explorer is dead, the Chrome
extensions that emulated it were removed from the store, and the desktop plugin
only ever existed for Windows. The result is absurd — a perfectly working DVR,
recording 24/7, that you cannot watch from a modern computer. Your options were a
Windows-only desktop app or a phone app, and neither is great when you just want
your cameras on a second monitor while you work.

open-hik replaces the dead plugin with open web tech. It talks to the DVR using
the two interfaces Hikvision still ships on practically every device — RTSP for
video and the ISAPI REST API for everything else — and serves a clean web UI you
can open from any browser on your network. One `docker compose up` and a setup
wizard; no config files to edit.

## Architecture

```
┌───────────────┐  RTSP / ISAPI  ┌──────────┐  WebRTC / MSE  ┌───────────────┐
│ Hikvision DVR ├───────────────►│  go2rtc  ├───────────────►│    Browser    │
│  192.168.1.x  │                │(restream)│                │ (Next.js UI)  │
└───────────────┘                └──────────┘                └───────────────┘
```

- [go2rtc](https://github.com/AlexxIT/go2rtc) pulls the DVR's RTSP streams and
  re-serves them as WebRTC (sub-second latency) with automatic MSE/HLS fallback.
- A Next.js app provides the UI and talks ISAPI to the DVR server-side (digest
  auth; credentials never reach the browser).

## Features

- **Setup wizard** — first visit walks you through creating an app password and
  connecting the DVR, with a connection test that shows what it found.
- **Live video wall** — every camera in a fullscreen grid, sub-second latency.
  The grid uses sub streams to respect the DVR's outgoing bandwidth budget;
  fullscreen (double-click) switches to the full-quality main stream.
- **Smart search** — pick a time range and get a grid of snapshots for every
  motion event the DVR logged, **filtered by people or vehicles** on AcuSense
  devices. Click one to watch that moment; download it as MP4.
- **Recording playback** — browse and play what the DVR recorded, per camera and day.
- **Live event alerts** — motion/tamper/video-loss highlights the affected camera
  in real time, straight from the DVR's alert stream.
- **Rename cameras** — edit a camera's name in the grid; it's saved to the DVR itself.
- **Snapshots** — save a full-quality JPEG of any camera with one click.
- **Login** — the app is protected by the password you set in the wizard.
- **Settings** — reconfigure the DVR connection anytime (IP, HTTP/RTSP ports,
  credentials — handy when the DVR has no static IP) and change the app password.

Everything beyond live video uses the DVR's ISAPI REST API through the web
container. If ISAPI is unreachable the live wall still works and the extras
degrade gracefully.

## Quick start

Requirements: Docker with the compose plugin, and a Hikvision device with RTSP
enabled (port 554) on your network.

```bash
git clone https://github.com/gastonnrodriguez/open-hik.git
cd open-hik
docker compose up -d --build
```

Open `http://localhost:3000` (or `http://<host-ip>:3000` from another machine)
and follow the wizard: create an app password, point it at your DVR, done.

Tested with an iDS-7204HQHI-M1/S (firmware V4.70.102, web V4.0.1), but it should
work with any Hikvision device that speaks RTSP + ISAPI — which is practically
all of them. Reports from other models are very welcome.

### Development without Docker

```bash
./scripts/dev.sh   # downloads the go2rtc binary, starts go2rtc + next dev
```

Uses `.env` for DVR credentials (see `.env.example`).

## Configuration

The wizard stores everything in `/data/openhik.json` inside the web container
(a named Docker volume). `.env` is optional:

| Variable | Meaning |
|---|---|
| `DVR_HOST` / `DVR_USER` / `DVR_PASS` | Pre-provision DVR credentials (URL-encode special characters). The wizard prefills from these. |
| `GO2RTC_PUBLIC_URL` | Only if the browser can't reach go2rtc at `<page-host>:1984` (reverse proxy, etc.) |

A read-only *operator* DVR user is recommended over admin — though renaming
cameras from the UI then won't be permitted by the DVR.

## Security notes

- The web app (port 3000) requires the wizard password. DVR credentials are
  stored server-side and never reach the browser.
- **go2rtc (port 1984) has no authentication.** Fine on a trusted home LAN;
  don't expose it to the internet. For remote access use a VPN (Tailscale,
  WireGuard) or a reverse proxy with auth in front of both ports. Proxying
  go2rtc through the authenticated app is on the roadmap.

## Troubleshooting

- **Streams connect but the video is garbage / won't decode** (ffmpeg says
  things like `vps_reserved_three_2bits is not three` or `non-intra slice in an
  IDR NAL unit`) — your device has **Stream Encryption** enabled (a Hik-Connect
  feature): the RTSP payload is encrypted and only Hikvision apps can decode it.
  Disable it in *Configuration → Network → Platform Access → Stream Encryption*.
  RTSP user/password auth stays active; this only removes the extra payload
  encryption. This is the #1 gotcha — it cost us a whole afternoon.
- **"453 Not Enough Bandwidth"** — these DVRs have a hard outgoing-bandwidth
  budget shared between live view, playback and smart-search thumbnails. open-hik
  already works around it (sub streams for the grid, serialized extraction), but
  if you run other RTSP consumers against the same DVR you may starve it.
- **Tiles stay "loading"** — check go2rtc's own diagnostics UI at
  `http://<host>:1984`. If go2rtc can't connect either, verify credentials and
  that RTSP is enabled on the DVR.
- **H.265 cameras on Firefox** — Firefox doesn't decode H.265; Chrome/Edge do on
  most hardware. Either use Chrome/Edge or switch the channels to H.264 in the DVR.
- **Password with special characters in `.env`** — must be URL-encoded
  (`@` → `%40`). The wizard doesn't have this restriction.

## Roadmap

- Proxy go2rtc through the authenticated web app
- Smart search by image region
- PTZ controls for cameras that support them
- Layout presets (1×1 cycling, custom grids)
- i18n for the UI (English/Spanish)

Contributions welcome — this project exists precisely because a lot of perfectly
good hardware was orphaned by the death of browser plugins.

## Credits & license

[MIT](LICENSE). Video streaming by [go2rtc](https://github.com/AlexxIT/go2rtc)
(MIT); its player component is vendored in `web/public/`.
