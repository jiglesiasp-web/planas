# El Pegolí — web estática con vista 3D

Web de una página para el restaurante El Pegolí (Les Rotes, Dénia). HTML, CSS y JavaScript sin
compilación: se sube tal cual a Hostinger o a cualquier hosting estático.

## Ver en local

```
cd el-pegoli
python3 -m http.server 8765
```

y abrir http://localhost:8765/. También funciona abriendo `index.html` con doble clic.

## Publicar

Subir el contenido de esta carpeta (incluido `.htaccess`) a `public_html`. La carpeta `tools/`
es solo de desarrollo y no hace falta subirla. En cada nueva subida, cambiar el número de
`?v=20261112` en `index.html` para que los navegadores no usen la versión antigua.

## Qué hay

| archivo | para qué |
| --- | --- |
| `index.html` | todo el contenido (se lee aunque falle el JavaScript) |
| `styles.css` | diseño |
| `main.js` | interacción: menú, apariciones, luz del día, controles de la vista 3D |
| `lib/scene3d.js` | la recreación 3D del restaurante (Three.js, hecha con formas simples) |
| `lib/three.min.js` | motor 3D, copia local |
| `assets/img/` | imágenes de la recreación (se muestran mientras carga el 3D o si no hay WebGL) |
| `tools/replica/` | mapa de fuentes, lista de funciones, tokens de diseño y plan de pruebas |
| `tools/e2e/` | pruebas automáticas (Playwright) |

## Antes de publicar: pendiente de confirmar con el restaurante

- **Horario.** Es el que publica el restaurante en su blog; puede estar desactualizado.
- **Textos de historia y cocina.** Salen de la web del restaurante, Guía Repsol y Directo al Paladar.
- **Precios y carta.** No están publicados y no se ha inventado ninguno.
- **Fotos.** La web no usa fotografías reales: las imágenes son de la recreación 3D y así se indica.
- **Vista 3D.** Es una recreación orientativa hecha a partir de fotos públicas, no un plano a escala.

Fuentes y detalle en `tools/replica/recon.md`.
