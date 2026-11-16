# open-hik

**Live view, playback and smart motion search for Hikvision DVRs/NVRs in any modern browser. No Internet Explorer, no plugins, no Windows.**

🇪🇸 [Leer en español](README.es.md)

> **Contributors wanted.** open-hik is tested on one DVR model and has a list of
> features the hardware already supports that nobody has built yet. Tell us
> [whether it works on your device](https://github.com/gastonnrodriguez/open-hik/issues/new?template=compatibility_report.yml),
> pick something from the [Roadmap](#roadmap), or read
> [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

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
- **Drag and drop to rearrange** — drag a camera and drop it on another to
  reorder the grid, so cameras covering the same area sit side by side. The
  layout is saved and shared across every device that opens the app.
- **Works with H.265 cameras** — browsers can't decode H.265/HEVC over WebRTC or
  MSE, so go2rtc transcodes H.265 streams to H.264 on demand (H.264 streams pass
  through untouched). See [Troubleshooting](#troubleshooting) to tune or avoid it.
- **Smart search** — pick a time range and get a grid of snapshots for every
  motion event the DVR logged, **filtered by people or vehicles** on AcuSense
  devices. Click one to watch that moment; download it as MP4.
- **Recording playback with a 24-hour timeline** — one bar per camera and day
  shows what was recorded and, on top of it, every motion event the DVR logged,
  coloured by what triggered it (person, vehicle, unclassified). Click anywhere
  to play from there, zoom from 24 h down to 10 minutes with the wheel or the
  presets, drag to pan, jump to the previous/next event, or type a time. Switching
  cameras keeps you on the same moment. Transport controls cover play/pause, slow
  motion (0.25x/0.5x) and skip buttons. (The DVR streams recordings at real time,
  so fast-forward is done by skipping rather than 2x playback.)
- **Recording calendar** — the date picker marks the days the DVR still has
  footage for, per camera, so you never pick an empty day.
- **Fast clip export** — save an MP4 of 30 seconds to 30 minutes starting at the
  playhead. Clips come through the DVR's file download instead of RTSP, roughly
  30x faster than real time on a LAN (a 5-minute clip in about 10 seconds), with
  the video untouched and the audio converted to AAC.
- **Audio** — a speaker button on every live camera (one audible at a time) and a
  volume control in playback, for DVRs that have a microphone wired in.
- **Disk and DVR status** — the header shows disk usage, free space and how many
  days of footage are kept, and turns red if the DVR reports a disk fault.
  *Settings* adds model, firmware, uptime, CPU/memory load and per-disk state.
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

### Tested devices

It should work with any Hikvision device that speaks RTSP + ISAPI — which is
practically all of them — but only what's in this table has been confirmed:

| Model | Firmware | Status | Reported by |
|---|---|---|---|
| iDS-7204HQHI-M1/S (4-channel AcuSense DVR) | V4.70.102 | Everything works | maintainer |

Have a different model? A
[compatibility report](https://github.com/gastonnrodriguez/open-hik/issues/new?template=compatibility_report.yml)
takes five minutes and gets your device added here.

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
| `WEB_PORT` | Host port for the web UI (default `3000`). Change it if another app already uses 3000. |

A read-only *operator* DVR user is recommended over admin — though renaming
cameras from the UI then won't be permitted by the DVR.

## Recommended DVR encoding (H.264 vs H.265)

Each camera has two streams in the DVR, and each has its own codec setting:

| Stream | Used for | Recommended codec | Why |
|---|---|---|---|
| **Main** (`x01`) | DVR recording + fullscreen | **H.265** | About half the disk space of H.264 at the same quality: roughly twice the days of recording history. |
| **Sub** (`x02`) | Live grid | **H.264** | Every browser plays it, so the grid needs no transcoding (no server CPU). The sub stream isn't recorded, so this costs no disk space. |

Browsers can't play H.265 over WebRTC/MSE, so open-hik transcodes any H.265
stream to H.264 on the server. That works, but with the sub streams left on
H.265 the server re-encodes every camera in the grid all the time. With the
recommended setup only the one camera open in fullscreen is transcoded.

You don't need to open the DVR's own web UI for this: go to **Settings →
Stream encoding** and click **Switch sub streams to H.264**. open-hik changes
only the codec on the DVR (resolution, frame rate and bitrate stay as they
were) and re-registers the streams. Stream codecs are detected automatically
whenever streams are registered (wizard or *Settings → DVR connection*).

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
  `ffmpeg:...#video=h264` (the wizard and *Settings* detect each stream's codec
  and do this for you). If the tiles are black but audio plays, a stream is H.265
  and isn't being transcoded: re-save *Settings → DVR connection* to re-register
  the streams. To avoid transcoding the grid at all, see
  [Recommended DVR encoding](#recommended-dvr-encoding-h264-vs-h265).
- **Choppy / stuttering video on Wi-Fi clients** — re-encoding H.265→H.264 without
  a bitrate cap balloons each stream to ~2.5 Mbps (~10 Mbps for a 4-camera grid),
  which Wi-Fi drops. The `ffmpeg` block in `go2rtc.yaml` caps the H.264 bitrate
  (≈800 kbps sub / 2500 kbps main) and shortens the keyframe interval so loss
  recovers fast. Lower the `-maxrate` further if your Wi-Fi is still marginal.
- **Password with special characters in `.env`** — must be URL-encoded
  (`@` → `%40`). The wizard doesn't have this restriction.

## Roadmap

The DVR's ISAPI exposes more than open-hik uses today. These were checked
against a real device (iDS-7204HQHI-M1/S) and are waiting for someone to build
them — roughly in order of usefulness:

- **System alerts** — surface disk errors, recording failures, illegal logins and
  IP conflicts. The app already listens to the DVR's alert stream
  (`/ISAPI/Event/notification/alertStream`) but only shows motion, tamper and
  video loss.
- **Line crossing and intrusion detection** — configure and display these events
  (`/ISAPI/Smart/LineDetection`, `/ISAPI/Smart/FieldDetection`). Far more precise
  than plain motion on a busy street-facing camera.
- **Motion detection settings** — edit the detection grid, sensitivity and the
  person/vehicle filter from the app
  (`/ISAPI/System/Video/inputs/channels/<id>/motionDetection`).
- **Smart search by image region** — find motion inside a drawn area of recorded
  footage (the DVR reports `isSupportSmartSearch`).
- **Zero channel** — one composite stream with every camera in a mosaic
  (`/ISAPI/ContentMgmt/ZeroVideo/channels`), which would bring the live grid down
  from one DVR session per camera to a single one.
- **Image settings** — brightness, contrast, OSD text and privacy masks
  (`/ISAPI/Image/channels/<id>`, `/ISAPI/System/Video/inputs/channels/<id>/overlays`).
- **Recording bookmarks** — tag moments and search them later (the DVR reports
  `isSupportSearchRecordLabelByUTC`).
- **Manual recording and alarm outputs** — start a recording by hand, trigger the
  relay outputs (`/ISAPI/System/IO/outputs`).

Beyond the DVR's API:

- Proxy go2rtc through the authenticated web app
- PTZ controls for cameras that support them
- Layout presets (1×1 cycling, custom grids)
- i18n for the UI (English/Spanish)

Want one of these? [Open an issue](https://github.com/gastonnrodriguez/open-hik/issues)
to discuss it or claim it, or send a pull request —
[CONTRIBUTING.md](CONTRIBUTING.md) covers the setup and what these DVRs are picky
about. Endpoints vary between models and firmware versions, so say which device
you tested on. Contributions welcome —
this project exists precisely because a lot of perfectly good hardware was
orphaned by the death of browser plugins.

## Credits & license

[MIT](LICENSE). Video streaming by [go2rtc](https://github.com/AlexxIT/go2rtc)
(MIT); its player component is vendored in `web/public/`.
