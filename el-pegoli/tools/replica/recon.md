# Recon map: El Pegolí (web pública del restaurante)

Scope: la web informativa del restaurante (presentación, cocina, horario, reservas, localización). Sin backend.
For: propuesta de web nueva para el restaurante El Pegolí (Les Rotes, Dénia).
Date: 2026-11-12

Reglas aplicadas: solo fuentes públicas, lectura a mano (sin rastreadores), nada de código ni
imágenes del sitio original. Las fotos del restaurante se miraron como referencia para modelar
la vista 3D y **no se han copiado al proyecto**.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | web del restaurante (blog WordPress) | https://restauranteelpegoli.wordpress.com/ | estructura de la carta, horario, reservas, distancias, galería "Entorno" |
| 2 | Guía Repsol | https://www.guiarepsol.com/es/fichas/restaurante/el-pegoli-332693/ | dirección, teléfono, 1943, familia Piera Sendra, "Recomendado", precio medio >60 € |
| 3 | Directo al Paladar (reseña) | https://www.directoalpaladar.com/viajes/restaurante-el-pegoli-70-anos-de-arroz-de-calidad-en-denia | platos citados, descripción del comedor y la terraza |
| 4 | Valencia Plaza | https://valenciaplaza.com/restaurantes-de-denia-para-comer-cerca-del-mediterraneo | origen como casa de comidas, Pepe Piera |
| 5 | Ortofoto PNOA (IGN) | https://www.ign.es/wms-inspire/pnoa-ma | planta real del edificio, costa, cala e islote; se usa como suelo de la vista 3D (CC BY 4.0) |
| 6 | OpenStreetMap | https://www.openstreetmap.org/way/442574827 | situación exacta (38.83373, 0.13739) y huellas de los edificios vecinos (ODbL) |
| 7 | Terrain Tiles (Mapzen/AWS) | https://registry.opendata.aws/terrain-tiles/ | relieve del Montgó y del cerro del castillo |
| 8 | Cuatro fotos aportadas por el cliente | — | muro con rótulo desde la cala, terraza de sombrillas, escalera de canto azul, comedor acristalado. Solo como referencia: no están en la web |

## Datos verificados

| dato | valor | fuente |
| --- | --- | --- |
| Apertura | 1943 | 1, 2, 3 |
| Familia | 3.ª y 4.ª generación Piera Sendra; Pepe Piera «El Pegolí» (de Pego) | 2, 3, 4 |
| Dirección | Carrer Fènix, 13 · Les Rotes · 03700 Dénia | 1, 2, 3 |
| Teléfono | +34 965 781 035 | 1, 2, 3 |
| Reservas | solo por teléfono ("No se admiten reservas on-line") | 1 |
| Horario oct–jun | martes a domingo, 12:00–16:00 | 1 |
| Horario jul–ago | + cenas jue/vie/sáb 20:30–22:30, en la terraza | 1 |
| Vacaciones | del 22/23 de diciembre al 1 de febrero | 1 (dos páginas dan 22 y 23) |
| Carta (secciones) | para abrir el apetito, del mar, de la tierra, arroces secos y melosos, postres, bodega | 1 |
| Platos citados | arròs a banda, gamba roja, sepionets, salazones y huevas de atún, sorbetes de cítricos | 3 |
| Distinción | Recomendado Guía Repsol | 2 |

## Sin verificar / a confirmar con el restaurante

- El horario es el publicado en su blog (antiguo). Septiembre no aparece. **Confirmar.**
- Precios: no publicados. No se ha inventado ninguno.
- Las coordenadas GPS del blog no corresponden a Dénia; no se usan (el botón abre una búsqueda en Google Maps).
- La planta del edificio y la posición de las sombrillas salen de la ortofoto. Las alturas, el interior del comedor y el mobiliario son una interpretación.

## Core loop

El visitante quiere saber si le apetece ir y cómo reservar: ver el sitio, ver qué se come, llamar.

## Screens

| ID | screen | route | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Inicio | #inicio | primera impresión y llamada | escena 3D, titular, CTA teléfono, selector de luz | cargando (imagen fija), en vivo, sin WebGL |
| S02 | Historia | #historia | quiénes son | texto, cita, hitos, cifras | — |
| S03 | Vista 3D | #vista-3d | recorrer el local | maqueta, puntos de vista, etiquetas, luz, zoom | activa, sin WebGL, sin JS |
| S04 | Cocina | #cocina | qué se come | tarjetas de la carta, nota de precios, celebraciones | — |
| S05 | Entorno | #entorno | dónde está | tres luces, distancias | — |
| S06 | Horario y reservas | #visita | cuándo y cómo | teléfono, tabla de horario, dirección, mapa | — |

## Flows

F01 Reservar mesa
    S01 -> botón "Reservar · 965 781 035" (o S06 "Llamar ahora")
    happy path clicks: 1
    edge: desde ordenador (el número se lee en pantalla), sin JS

F02 Explorar el restaurante en 3D
    S01 -> S03 -> elegir punto de vista / arrastrar / cambiar la luz
    happy path clicks: 2
    edge: sin WebGL, equipo lento (regulador de calidad), táctil (el gesto vertical sigue siendo scroll), teclado

F03 Consultar horario y cómo llegar
    S06 -> "Abrir en Google Maps"
    happy path clicks: 1

F05 Recorrido guiado al hacer scroll
    inicio -> llegada por mar (historia) -> terraza -> comedor -> mesa (carta) -> atardecer en la terraza -> Dénia al fondo -> vista aérea de noche (reservar) -> vista libre
    happy path clicks: 0 (solo scroll)
    edge: móvil (fichas abajo), movimiento reducido, sin WebGL (las fichas se leen igual sobre la imagen fija)

F04 Navegar por secciones
    menú -> sección
    edge: móvil (menú a pantalla completa), tecla Escape

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Botón | acento, tinta, cristal | reposo, hover, foco visible | todas |
| Control segmentado | luz del día, puntos de vista, zoom | pulsado (aria-pressed), hover, foco | S01, S03 |
| Etiqueta 3D | cercana, lejana | visible/oculta según cámara | S03 |
| Tarjeta de plato | destacada (arroz, gamba), normal | reposo, hover con inclinación | S04 |
| Tarjeta de dato | reserva, horario, dirección | — | S06 |

## Inferred data model

No hay base de datos. Los datos de la casa están en el HTML y en `lib/manifest.js` (textos de la vista 3D).

## Feature matrix

See `features.csv`. Must: 10, should: 7, could: 4; de ellas, 4 marcadas `skip` con su motivo.

## Out of scope (cannot or should not be cloned)

- Fotografías, logotipo y textos del sitio original: son del restaurante.
- Reserva online: el restaurante no la ofrece.
- Carta con precios: no publicada.

## Size

Screens 6, flows 4, entities 0. Hard parts: escena 3D sin dependencias de compilación, rendimiento en equipos sin GPU. Size: S.

## Qué partes del pack Replica se han usado

| skill | uso |
| --- | --- |
| replica-recon | este documento y `features.csv` |
| replica-design | `design/tokens.json` y comprobación de contraste (`design/contrast.py`, 0 fallos AA) |
| replica-build | construcción por secciones con todos los estados (sin JS, sin WebGL, móvil) |
| replica-test | `test-plan.md` y `../e2e/pegoli.spec.js` |
| replica-diff | columna `clone` de `features.csv` |
| replica-architect, replica-backend | no aplican: es una web estática sin servidor |
| replica-brand, replica-entrepreneur, replica-launch, replica-deploy | no aplican aquí: están pensadas para clonar y lanzar una app propia, no para la web de un negocio existente |
