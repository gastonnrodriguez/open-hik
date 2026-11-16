# Contributing to open-hik

🇪🇸 [Leer en español](CONTRIBUTING.es.md)

open-hik exists because a lot of perfectly good Hikvision hardware was orphaned
when browser plugins died. It is a small project, and every kind of help moves
it forward — you don't need to write code to contribute.

Issues and pull requests are welcome in English or Spanish.

## Ways to help

- **Tell us if it works on your device.** The project has been tested on a
  single model so far. Open a
  [compatibility report](https://github.com/gastonnrodriguez/open-hik/issues/new?template=compatibility_report.yml)
  with your model and firmware and what works or doesn't. This is the most
  valuable thing you can do in five minutes.
- **Report a bug.** Use the
  [bug report](https://github.com/gastonnrodriguez/open-hik/issues/new?template=bug_report.yml)
  form.
- **Build something from the roadmap.** The
  [Roadmap](README.md#roadmap) lists features the DVR's API already supports and
  nobody has built yet, each with the ISAPI endpoint to start from.
- **Propose something new** with a
  [feature request](https://github.com/gastonnrodriguez/open-hik/issues/new?template=feature_request.yml).
- **Improve the docs or translate the UI** (i18n is on the roadmap).

## Picking up a feature

1. Look for an existing issue for it; if there is none, open one.
2. Comment that you're taking it, so two people don't build the same thing.
3. For anything bigger than a small fix, describe your approach in the issue
   before writing much code. It saves everyone a rewrite.

## Development setup

You need a Hikvision DVR/NVR on your network with RTSP enabled. There is no
simulator: everything is developed against real hardware.

```bash
git clone https://github.com/gastonnrodriguez/open-hik.git
cd open-hik
cp .env.example .env    # fill in DVR_HOST, DVR_USER, DVR_PASS
./scripts/dev.sh        # downloads go2rtc, starts go2rtc + next dev
```

Or run the full stack in Docker, the way users do:

```bash
./scripts/up.sh --build
```

Prefer a non-admin DVR user for day-to-day work when the feature allows it.

### How the project is laid out

| Path | What lives there |
|---|---|
| `web/app/api/` | Server routes. The only place that talks to the DVR; credentials never reach the browser. |
| `web/lib/` | ISAPI client (`isapi.ts`, digest auth), recordings, motion log, timeline, clip export, DVR status. |
| `web/components/` | React UI: live wall, playback, search, settings. |
| `go2rtc/` | Stream server configuration (WebRTC/MSE, H.265 → H.264 transcoding). |
| `scripts/` | `up.sh` (Docker) and `dev.sh` (local development). |

### Things worth knowing about these DVRs

They will save you hours:

- **Timestamps are local time labelled with `Z`.** Treat them as naive
  date-times; don't convert time zones.
- **The DVR has a small session budget.** Around eight RTSP sessions in total;
  past that it answers `453 Not Enough Bandwidth`. Always close what you open,
  and reuse go2rtc streams instead of opening new RTSP connections.
- **Searches are capped.** The log search silently stops at 2000 entries; page
  by resuming from the last timestamp (see `web/lib/motionLog.ts`).
- **Reported codecs can be wrong.** Check the actual stream before trusting
  what a search result says.
- **Endpoints vary by model and firmware.** Ask the device what it supports
  (`.../capabilities`) and degrade gracefully when something is missing.
- **Never log or return credentials**, and don't commit your `.env`.

## Before opening a pull request

- `cd web && npx tsc --noEmit` passes. There is no test suite yet, so:
- **Test against a real device** and say which model and firmware in the PR.
- Keep the change focused: one feature or fix per PR.
- Features that *write* to the DVR (detection settings, image settings…) must
  say so clearly in the UI and never change anything without a user action.
- Match the surrounding code: TypeScript, no new dependencies unless really
  needed, comments that explain *why*.
- If you add a user-facing feature, add a line to the Features list in both
  `README.md` and `README.es.md`.

## Security issues

Please don't open a public issue for a vulnerability. Use GitHub's
[private vulnerability reporting](https://github.com/gastonnrodriguez/open-hik/security/advisories/new)
instead.

## License

By contributing you agree that your work is released under the project's
[MIT license](LICENSE).
