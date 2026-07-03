# open-hik

**Vivo, reproducción de grabaciones y búsqueda inteligente de movimiento para DVR/NVR Hikvision en cualquier navegador moderno. Sin Internet Explorer, sin plugins, sin Windows.**

🇬🇧 [Read in English](README.md)

## Motivación

La web embebida de los Hikvision (V4.x y anteriores) depende de un plugin
ActiveX/NPAPI que ya no corre en ningún lado: Internet Explorer murió, las
extensiones de Chrome que lo emulaban fueron eliminadas de la tienda, y el plugin
de escritorio solo existió para Windows. El resultado es absurdo: un DVR que
funciona perfecto, grabando 24/7, que no podés mirar desde una computadora
moderna. Las opciones eran una app de escritorio solo para Windows o la app del
celular — y ninguna sirve cuando lo único que querés es dejar las cámaras en un
segundo monitor mientras trabajás.

open-hik reemplaza el plugin muerto con tecnología web abierta. Habla con el DVR
usando las dos interfaces que Hikvision sigue incluyendo en prácticamente todos
sus equipos — RTSP para el video y la API REST ISAPI para todo lo demás — y sirve
una web limpia que abrís desde cualquier navegador de tu red. Un
`docker compose up` y un wizard de configuración; nada de editar archivos.

## Arquitectura

```
┌───────────────┐  RTSP / ISAPI  ┌──────────┐  WebRTC / MSE  ┌───────────────┐
│ DVR Hikvision ├───────────────►│  go2rtc  ├───────────────►│  Navegador    │
│  192.168.1.x  │                │(restream)│                │ (UI Next.js)  │
└───────────────┘                └──────────┘                └───────────────┘
```

- [go2rtc](https://github.com/AlexxIT/go2rtc) toma los streams RTSP del DVR y los
  re-sirve como WebRTC (latencia sub-segundo) con fallback automático a MSE/HLS.
- Una app Next.js provee la UI y habla ISAPI con el DVR del lado del servidor
  (digest auth; las credenciales nunca llegan al navegador).

## Funcionalidades

- **Wizard de configuración** — la primera visita te guía: creás una contraseña
  para la app y conectás el DVR, con prueba de conexión que muestra qué encontró.
- **Video wall en vivo** — todas las cámaras en una grilla a pantalla completa,
  latencia menor a un segundo. La grilla usa los substreams para respetar el
  presupuesto de ancho de banda del DVR; pantalla completa (doble click) cambia
  automáticamente al main stream de calidad completa.
- **Búsqueda inteligente** — elegís un rango de tiempo y te muestra una grilla de
  snapshots de cada evento de movimiento que registró el DVR, **filtrable por
  personas o vehículos** en equipos AcuSense. Click para ver ese momento;
  descargalo como MP4.
- **Reproducción de grabaciones** — navegá y reproducí lo grabado, por cámara y día.
- **Alertas en tiempo real** — movimiento/sabotaje/pérdida de video resaltan la
  cámara afectada al instante, directo del stream de alertas del DVR.
- **Renombrar cámaras** — editás el nombre en la grilla y se guarda en el DVR mismo.
- **Snapshots** — guardá un JPEG de calidad completa de cualquier cámara con un click.
- **Login** — la app queda protegida por la contraseña que definís en el wizard.

Todo lo que no es video en vivo usa la API ISAPI del DVR a través del contenedor
web. Si ISAPI no está disponible, el vivo sigue funcionando y los extras degradan
con gracia.

## Inicio rápido

Requisitos: Docker con el plugin compose, y un equipo Hikvision con RTSP
habilitado (puerto 554) en tu red.

```bash
git clone https://github.com/gastonnrodriguez/open-hik.git
cd open-hik
docker compose up -d --build
```

Abrí `http://localhost:3000` (o `http://<ip-del-host>:3000` desde otra máquina)
y seguí el wizard: contraseña para la app, datos del DVR, listo.

Probado con un iDS-7204HQHI-M1/S (firmware V4.70.102, web V4.0.1), pero debería
funcionar con cualquier Hikvision que hable RTSP + ISAPI — es decir, casi todos.
Los reportes desde otros modelos son muy bienvenidos.

### Desarrollo sin Docker

```bash
./scripts/dev.sh   # descarga el binario de go2rtc, levanta go2rtc + next dev
```

Usa `.env` para las credenciales del DVR (ver `.env.example`).

## Configuración

El wizard guarda todo en `/data/openhik.json` dentro del contenedor web (un
volumen Docker con nombre). El `.env` es opcional:

| Variable | Significado |
|---|---|
| `DVR_HOST` / `DVR_USER` / `DVR_PASS` | Pre-cargar credenciales del DVR (URL-encodear caracteres especiales). El wizard las usa para prellenar. |
| `GO2RTC_PUBLIC_URL` | Solo si el navegador no llega a go2rtc en `<host-de-la-página>:1984` (reverse proxy, etc.) |

Se recomienda un usuario *operator* de solo lectura en el DVR en vez de admin —
aunque en ese caso el DVR no va a permitir renombrar cámaras desde la UI.

## Notas de seguridad

- La web (puerto 3000) requiere la contraseña del wizard. Las credenciales del
  DVR se guardan del lado del servidor y nunca llegan al navegador.
- **go2rtc (puerto 1984) no tiene autenticación.** En una LAN doméstica de
  confianza está bien; no lo expongas a internet. Para acceso remoto usá una VPN
  (Tailscale, WireGuard) o un reverse proxy con auth delante de ambos puertos.
  Proxear go2rtc a través de la app autenticada está en el roadmap.

## Solución de problemas

- **El stream conecta pero el video sale corrupto / no decodifica** (ffmpeg dice
  cosas como `vps_reserved_three_2bits is not three`) — tu equipo tiene activada
  la **encriptación de stream** (función de Hik-Connect): el payload RTSP va
  cifrado y solo las apps de Hikvision pueden decodificarlo. Desactivala en
  *Configuración → Red → Acceso a plataforma → Stream Encryption*. La
  autenticación por usuario/contraseña del RTSP sigue activa; solo se quita el
  cifrado extra. Es EL problema clásico — a nosotros nos costó una tarde entera.
- **"453 Not Enough Bandwidth"** — estos DVR tienen un presupuesto duro de ancho
  de banda saliente compartido entre vivo, playback y thumbnails. open-hik ya lo
  contempla (substreams en la grilla, extracción serializada), pero si corrés
  otros consumidores RTSP contra el mismo DVR podés dejarlo sin cupo.
- **Las cámaras quedan en "loading"** — mirá el panel de diagnóstico de go2rtc en
  `http://<host>:1984`. Si go2rtc tampoco conecta, verificá credenciales y que
  RTSP esté habilitado en el DVR.
- **Cámaras H.265 en Firefox** — Firefox no decodifica H.265; Chrome/Edge sí en
  la mayoría del hardware. Usá Chrome/Edge o pasá los canales a H.264 en el DVR.
- **Contraseña con caracteres especiales en `.env`** — deben ir URL-encodeados
  (`@` → `%40`). El wizard no tiene esta restricción.

## Roadmap

- Proxear go2rtc a través de la app autenticada
- Búsqueda inteligente por región de la imagen
- Controles PTZ para las cámaras que lo soporten
- Presets de layout (ciclado 1×1, grillas custom)
- i18n de la UI (inglés/español)

Las contribuciones son bienvenidas — este proyecto existe justamente porque un
montón de hardware en perfecto estado quedó huérfano cuando murieron los plugins
de navegador.

## Créditos y licencia

[MIT](LICENSE). El streaming de video es de
[go2rtc](https://github.com/AlexxIT/go2rtc) (MIT); su player está vendoreado en
`web/public/`.
