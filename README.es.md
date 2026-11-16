# open-hik

**Vivo, reproducción de grabaciones y búsqueda inteligente de movimiento para DVR/NVR Hikvision en cualquier navegador moderno. Sin Internet Explorer, sin plugins, sin Windows.**

🇬🇧 [Read in English](README.md)

> **Se buscan contribuciones.** open-hik está probado en un solo modelo de DVR y
> tiene una lista de funciones que el hardware ya soporta y nadie construyó
> todavía. Contanos
> [si funciona en tu equipo](https://github.com/gastonnrodriguez/open-hik/issues/new?template=compatibility_report.yml),
> elegí algo del [Roadmap](#roadmap) o leé
> [CONTRIBUTING.es.md](CONTRIBUTING.es.md) para empezar.

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
- **Reordenar con drag and drop** — arrastrá una cámara y soltala sobre otra para
  reordenar la grilla, así las cámaras que cubren la misma zona quedan una al lado
  de la otra. La disposición se guarda y se comparte entre
  todos los dispositivos que abren la app.
- **Funciona con cámaras H.265** — los navegadores no decodifican H.265/HEVC por
  WebRTC ni MSE, así que go2rtc transcodifica los streams H.265 a H.264 bajo
  demanda (los que ya son H.264 pasan sin tocar). Ver
  [Solución de problemas](#solución-de-problemas) para ajustarlo o evitarlo.
- **Búsqueda inteligente** — elegís un rango de tiempo y te muestra una grilla de
  snapshots de cada evento de movimiento que registró el DVR, **filtrable por
  personas o vehículos** en equipos AcuSense. Click para ver ese momento;
  descargalo como MP4.
- **Reproducción con línea de tiempo de 24 horas** — una sola barra por cámara y
  día muestra lo grabado y, encima, cada evento de movimiento que registró el DVR,
  coloreado según qué lo disparó (persona, vehículo, sin clasificar). Click en
  cualquier punto para reproducir desde ahí, zoom de 24 h a 10 minutos con la
  rueda o los presets, arrastrar para desplazar, saltar al evento anterior o
  siguiente, o escribir una hora. Al cambiar de cámara se mantiene el mismo
  momento. Los controles incluyen play/pausa, cámara lenta (0.25x/0.5x) y botones
  de salto. (El DVR transmite las grabaciones a velocidad real, así que el avance
  rápido se hace saltando en vez de reproducir a 2x.)
- **Calendario de grabaciones** — el selector de fecha marca los días que el DVR
  todavía tiene grabados, por cámara, así no elegís un día vacío.
- **Exportación rápida de clips** — guardá un MP4 de 30 segundos a 30 minutos
  desde el punto de reproducción. Los clips salen por la descarga de archivos del
  DVR en lugar de RTSP, unas 30 veces más rápido que el tiempo real en LAN (un
  clip de 5 minutos en unos 10 segundos), con el video sin recomprimir y el audio
  convertido a AAC.
- **Audio** — un botón de parlante en cada cámara en vivo (suena una a la vez) y
  control de volumen en la reproducción, para DVRs con micrófono conectado.
- **Estado del disco y del DVR** — el encabezado muestra el uso del disco, el
  espacio libre y cuántos días de grabación se conservan, y se pone rojo si el DVR
  informa una falla de disco. *Settings* agrega modelo, firmware, tiempo
  encendido, carga de CPU/memoria y estado de cada disco.
- **Alertas en tiempo real** — movimiento/sabotaje/pérdida de video resaltan la
  cámara afectada al instante, directo del stream de alertas del DVR.
- **Renombrar cámaras** — editás el nombre en la grilla y se guarda en el DVR mismo.
- **Snapshots** — guardá un JPEG de calidad completa de cualquier cámara con un click.
- **Login** — la app queda protegida por la contraseña que definís en el wizard.
- **Settings** — reconfigurá la conexión al DVR cuando quieras (IP, puertos
  HTTP/RTSP, credenciales — útil cuando el DVR no tiene IP fija) y cambiá la
  contraseña de la app.

Todo lo que no es video en vivo usa la API ISAPI del DVR a través del contenedor
web. Si ISAPI no está disponible, el vivo sigue funcionando y los extras degradan
con gracia.

## Inicio rápido

Requisitos: Docker con el plugin compose, y un equipo Hikvision con RTSP
habilitado (puerto 554) en tu red.

```bash
git clone https://github.com/gastonnrodriguez/open-hik.git
cd open-hik
./scripts/up.sh --build
```

`scripts/up.sh` es un envoltorio de `docker compose up -d` que autodetecta la IP
LAN de esta máquina y se la pasa a go2rtc como candidate de WebRTC, para que **el
vivo se vea desde otros dispositivos de la red**, no solo desde el host. Volvé a
correrlo si te cambia la IP (DHCP). `docker compose up -d --build` también sirve,
pero sin la IP los otros dispositivos caen a MSE (WebRTC necesita el candidate).

Abrí `http://localhost:3000` (o `http://<ip-del-host>:3000` desde otra máquina)
y seguí el wizard: contraseña para la app, datos del DVR, listo. El header muestra
la dirección que deben usar los otros dispositivos — click para copiarla.

### Equipos probados

Debería funcionar con cualquier Hikvision que hable RTSP + ISAPI — es decir, casi
todos — pero solo está confirmado lo que figura en esta tabla:

| Modelo | Firmware | Estado | Reportado por |
|---|---|---|---|
| iDS-7204HQHI-M1/S (DVR AcuSense de 4 canales) | V4.70.102 | Funciona todo | mantenedor |

¿Tenés otro modelo? Un
[reporte de compatibilidad](https://github.com/gastonnrodriguez/open-hik/issues/new?template=compatibility_report.yml)
lleva cinco minutos y suma tu equipo a esta lista.

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
| `HOST_LAN_IP` | IP LAN anunciada como candidate de WebRTC para que otros dispositivos puedan ver. La completa `scripts/up.sh`; dejala vacía y se detecta sola. |
| `WEB_PORT` | Puerto del host para la web (por defecto `3000`). Cambialo si otra app ya usa el 3000. |

Se recomienda un usuario *operator* de solo lectura en el DVR en vez de admin —
aunque en ese caso el DVR no va a permitir renombrar cámaras desde la UI.

## Codificación recomendada en el DVR (H.264 vs H.265)

Cada cámara tiene dos streams en el DVR, y cada uno tiene su propio códec:

| Stream | Se usa para | Códec recomendado | Por qué |
|---|---|---|---|
| **Principal** (`x01`) | Grabación del DVR + pantalla completa | **H.265** | Ocupa más o menos la mitad que H.264 con la misma calidad: aproximadamente el doble de días de historial grabado. |
| **Secundario** (`x02`) | Grilla en vivo | **H.264** | Lo reproduce cualquier navegador, así que la grilla no necesita transcodificar (cero CPU en el servidor). El secundario no se graba, así que no cuesta espacio en disco. |

Los navegadores no reproducen H.265 por WebRTC/MSE, así que open-hik transcodifica
a H.264 en el servidor cualquier stream en H.265. Funciona, pero con los
secundarios en H.265 el servidor re-encodea todas las cámaras de la grilla todo el
tiempo. Con la configuración recomendada solo se transcodifica la cámara que está
en pantalla completa.

No hace falta entrar a la web del DVR: en **Settings → Stream encoding** tocá
**Switch sub streams to H.264**. open-hik cambia solo el códec en el DVR
(resolución, fps y bitrate quedan igual) y vuelve a registrar los streams. El
códec de cada stream se detecta solo cada vez que se registran (wizard o
*Settings → DVR connection*).

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
- **Cámaras H.265 / HEVC** — ningún navegador decodifica H.265 por WebRTC ni MSE,
  así que una cámara en H.265 no se ve en la mayoría de las máquinas (una PC con
  HEVC por hardware quizás sí la reproduce — por eso pasa el clásico "acá anda y
  allá no"). go2rtc transcodifica H.265 a H.264 automáticamente: los streams se
  envuelven en `ffmpeg:...#video=h264` (el wizard y *Settings* detectan el códec
  de cada stream y lo hacen solos). Si las cámaras se ven en negro pero hay audio,
  algún stream está en H.265 y no se está transcodificando: volvé a guardar
  *Settings → DVR connection* para re-registrar los streams. Para no transcodificar
  la grilla, ver [Codificación recomendada en el
  DVR](#codificación-recomendada-en-el-dvr-h264-vs-h265).
- **Video cortado / a tirones en clientes por Wi-Fi** — re-encodear H.265→H.264 sin
  tope de bitrate infla cada stream a ~2,5 Mbps (~10 Mbps para una grilla de 4),
  que el Wi-Fi pierde. El bloque `ffmpeg` de `go2rtc.yaml` capa el bitrate del
  H.264 (≈800 kbps sub / 2500 kbps main) y acorta el intervalo de keyframes para
  que la pérdida se recupere rápido. Bajá más el `-maxrate` si tu Wi-Fi sigue justo.
- **Contraseña con caracteres especiales en `.env`** — deben ir URL-encodeados
  (`@` → `%40`). El wizard no tiene esta restricción.

## Roadmap

La API ISAPI del DVR ofrece más de lo que open-hik usa hoy. Esto se verificó
contra un equipo real (iDS-7204HQHI-M1/S) y está esperando que alguien lo
implemente — más o menos en orden de utilidad:

- **Alertas de sistema** — mostrar errores de disco, fallas de grabación, accesos
  ilegales y conflictos de IP. La app ya escucha el stream de alertas del DVR
  (`/ISAPI/Event/notification/alertStream`) pero solo muestra movimiento,
  sabotaje y pérdida de video.
- **Cruce de línea e intrusión** — configurar y mostrar estos eventos
  (`/ISAPI/Smart/LineDetection`, `/ISAPI/Smart/FieldDetection`). Mucho más
  precisos que el movimiento general en una cámara que mira a la calle.
- **Configuración de detección de movimiento** — editar la grilla de detección,
  la sensibilidad y el filtro persona/vehículo desde la app
  (`/ISAPI/System/Video/inputs/channels/<id>/motionDetection`).
- **Búsqueda inteligente por región de la imagen** — encontrar movimiento dentro
  de una zona dibujada sobre lo grabado (el DVR informa `isSupportSmartSearch`).
- **Canal cero** — un solo stream compuesto con todas las cámaras en mosaico
  (`/ISAPI/ContentMgmt/ZeroVideo/channels`), que bajaría la grilla en vivo de una
  sesión del DVR por cámara a una sola.
- **Ajustes de imagen** — brillo, contraste, texto en pantalla y máscaras de
  privacidad (`/ISAPI/Image/channels/<id>`,
  `/ISAPI/System/Video/inputs/channels/<id>/overlays`).
- **Marcadores en grabaciones** — etiquetar momentos y buscarlos después (el DVR
  informa `isSupportSearchRecordLabelByUTC`).
- **Grabación manual y salidas de alarma** — iniciar una grabación a mano,
  activar las salidas de relé (`/ISAPI/System/IO/outputs`).

Fuera de la API del DVR:

- Proxear go2rtc a través de la app autenticada
- Controles PTZ para las cámaras que lo soporten
- Presets de layout (ciclado 1×1, grillas custom)
- i18n de la UI (inglés/español)

¿Querés alguna? [Abrí un issue](https://github.com/gastonnrodriguez/open-hik/issues)
para discutirla o tomarla, o mandá un pull request —
[CONTRIBUTING.es.md](CONTRIBUTING.es.md) explica el entorno y las mañas de estos
DVR. Los endpoints varían entre
modelos y versiones de firmware, así que indicá en qué equipo probaste. Las
contribuciones son bienvenidas — este proyecto existe justamente porque un
montón de hardware en perfecto estado quedó huérfano cuando murieron los plugins
de navegador.

## Créditos y licencia

[MIT](LICENSE). El streaming de video es de
[go2rtc](https://github.com/AlexxIT/go2rtc) (MIT); su player está vendoreado en
`web/public/`.
