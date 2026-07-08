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
- **Drag to rearrange** — grab the grip handle on any tile and drop it on another
  to reorder the grid, so cameras covering the same area sit side by side. The
  layout is saved and shared across every device that opens the app.
- **Works with H.265 cameras** — browsers can't decode H.265/HEVC over WebRTC or
  MSE, so go2rtc transcodes H.265 streams to H.264 on demand (H.264 streams pass
  through untouched). See [Troubleshooting](#troubleshooting) to tune or avoid it.
- **Smart search** — pick a time range and get a grid of snapshots for every
  motion event the DVR logged, **filtered by people or vehicles** on AcuSense
  devices. Click one to watch that moment; download it as MP4.
- **Recording playback** — browse and play what the DVR recorded, per camera and
  day, with transport controls: play/pause, slow motion (0.25x/0.5x), skip
  buttons and a scrubbable timeline. (The DVR streams recordings at real time,
  so fast-forward is done by skipping rather than 2x playback.)
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
./scripts/up.sh --build
```

`scripts/up.sh` is a thin wrapper around `docker compose up -d` that auto-detects
this machine's LAN IP and passes it to go2rtc as the WebRTC candidate, so **live
view works from other devices on the network**, not just the host. Re-run it any
time your IP changes (DHCP). Plain `docker compose up -d --build` also works, but
without the LAN IP other devices fall back to MSE (WebRTC needs the candidate).

Open `http://localhost:3000` (or `http://<host-ip>:3000` from another machine)
and follow the wizard: create an app password, point it at your DVR, done. The
header shows the address other devices should use — click it to copy.

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
| `HOST_LAN_IP` | LAN IP advertised as the WebRTC candidate so other devices can view. Auto-filled by `scripts/up.sh`; leave empty and it's detected for you. |

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
- **H.265 / HEVC cameras** — no browser decodes H.265 over WebRTC or MSE, so a
  camera left on H.265 shows nothing on most machines (a PC with hardware HEVC
  might play it, which is why "it works here but not there" happens). go2rtc
  transcodes H.265 to H.264 automatically: streams are wrapped in
  `ffmpeg:...#video=h264` in `go2rtc/go2rtc.yaml`. Transcoding is on demand (only
  while someone watches that camera) and cheap, but for **zero** CPU switch the
  camera's **sub-stream** to H.264 in the DVR (*Configuration → Video/Audio*, per
  camera — the setting is per channel, not global) and drop its `ffmpeg:` prefix.
- **Choppy / stuttering video on Wi-Fi clients** — re-encoding H.265→H.264 without
  a bitrate cap balloons each stream to ~2.5 Mbps (~10 Mbps for a 4-camera grid),
  which Wi-Fi drops. The `ffmpeg` block in `go2rtc.yaml` caps the H.264 bitrate
  (≈800 kbps sub / 2500 kbps main) and shortens the keyframe interval so loss
  recovers fast. Lower the `-maxrate` further if your Wi-Fi is still marginal.
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
