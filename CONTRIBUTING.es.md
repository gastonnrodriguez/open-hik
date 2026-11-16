# Cómo contribuir a open-hik

🇬🇧 [Read in English](CONTRIBUTING.md)

open-hik existe porque un montón de hardware Hikvision en perfecto estado quedó
huérfano cuando murieron los plugins de navegador. Es un proyecto chico y
cualquier ayuda lo hace avanzar — no hace falta programar para contribuir.

Los issues y pull requests son bienvenidos en español o en inglés.

## Formas de ayudar

- **Contanos si funciona en tu equipo.** Hasta ahora el proyecto se probó en un
  solo modelo. Abrí un
  [reporte de compatibilidad](https://github.com/gastonnrodriguez/open-hik/issues/new?template=compatibility_report.yml)
  con tu modelo y firmware y qué anda o no anda. Es lo más valioso que podés
  hacer en cinco minutos.
- **Reportá un bug** con el formulario de
  [reporte de bug](https://github.com/gastonnrodriguez/open-hik/issues/new?template=bug_report.yml).
- **Implementá algo del roadmap.** El [Roadmap](README.es.md#roadmap) lista
  funciones que la API del DVR ya soporta y nadie construyó todavía, cada una con
  el endpoint ISAPI por donde empezar.
- **Proponé algo nuevo** con un
  [pedido de función](https://github.com/gastonnrodriguez/open-hik/issues/new?template=feature_request.yml).
- **Mejorá la documentación o traducí la UI** (i18n está en el roadmap).

## Tomar una función

1. Buscá si ya hay un issue; si no hay, abrilo.
2. Comentá que la tomás, así dos personas no hacen lo mismo.
3. Para algo más grande que un arreglo chico, contá tu enfoque en el issue antes
   de escribir mucho código. Le ahorra una reescritura a todos.

## Entorno de desarrollo

Necesitás un DVR/NVR Hikvision en tu red con RTSP habilitado. No hay simulador:
todo se desarrolla contra hardware real.

```bash
git clone https://github.com/gastonnrodriguez/open-hik.git
cd open-hik
cp .env.example .env    # completá DVR_HOST, DVR_USER, DVR_PASS
./scripts/dev.sh        # descarga go2rtc, levanta go2rtc + next dev
```

O levantá todo en Docker, como lo usan los usuarios:

```bash
./scripts/up.sh --build
```

Para el trabajo diario preferí un usuario del DVR que no sea admin, cuando la
función lo permita.

### Cómo está organizado el proyecto

| Ruta | Qué hay |
|---|---|
| `web/app/api/` | Rutas del servidor. El único lugar que habla con el DVR; las credenciales nunca llegan al navegador. |
| `web/lib/` | Cliente ISAPI (`isapi.ts`, digest auth), grabaciones, log de movimiento, línea de tiempo, exportación de clips, estado del DVR. |
| `web/components/` | UI en React: video wall, reproducción, búsqueda, settings. |
| `go2rtc/` | Configuración del servidor de streams (WebRTC/MSE, transcodificación H.265 → H.264). |
| `scripts/` | `up.sh` (Docker) y `dev.sh` (desarrollo local). |

### Cosas que conviene saber de estos DVR

Te van a ahorrar horas:

- **Las fechas son hora local etiquetada con `Z`.** Tratalas como fechas sin
  zona; no conviertas husos horarios.
- **El DVR tiene un presupuesto chico de sesiones.** Unas ocho sesiones RTSP en
  total; pasado eso responde `453 Not Enough Bandwidth`. Cerrá siempre lo que
  abrís y reutilizá los streams de go2rtc en vez de abrir conexiones RTSP nuevas.
- **Las búsquedas tienen tope.** La búsqueda en el log corta en 2000 entradas sin
  avisar; paginá retomando desde la última fecha (ver `web/lib/motionLog.ts`).
- **Los códecs informados pueden estar mal.** Verificá el stream real antes de
  confiar en lo que dice un resultado de búsqueda.
- **Los endpoints varían según modelo y firmware.** Preguntale al equipo qué
  soporta (`.../capabilities`) y degradá con elegancia cuando falte algo.
- **Nunca registres ni devuelvas credenciales**, y no commitees tu `.env`.

## Antes de abrir un pull request

- `cd web && npx tsc --noEmit` pasa. Todavía no hay suite de tests, así que:
- **Probá contra un equipo real** e indicá modelo y firmware en el PR.
- Mantené el cambio acotado: una función o arreglo por PR.
- Las funciones que *escriben* en el DVR (configuración de detección, ajustes de
  imagen…) deben decirlo claramente en la UI y nunca cambiar nada sin una acción
  del usuario.
- Seguí el estilo del código que lo rodea: TypeScript, sin dependencias nuevas
  salvo que hagan falta de verdad, comentarios que expliquen el *porqué*.
- Si agregás una función visible para el usuario, sumá una línea a la lista de
  funcionalidades en `README.md` y en `README.es.md`.

## Problemas de seguridad

Por favor no abras un issue público por una vulnerabilidad. Usá el
[reporte privado de vulnerabilidades](https://github.com/gastonnrodriguez/open-hik/security/advisories/new)
de GitHub.

## Licencia

Al contribuir aceptás que tu trabajo se publica bajo la
[licencia MIT](LICENSE) del proyecto.
