# Test plan: web El Pegolí

Build: rama `claude/gracious-cerf-56kjgw`  Date: 2026-11-12  Env: local (`python3 -m http.server`), Chromium sin GPU

Ejecutar: `playwright test -c tools/e2e --trace off` desde la carpeta `el-pegoli`.

| case | flow | type | steps | expected | auto | result |
| --- | --- | --- | --- | --- | --- | --- |
| F01-H1 | reservar | happy | abrir la web | los tres botones de reserva marcan +34 965 781 035; se avisa de que no hay reserva online | e2e | pasa |
| F02-H1 | vista 3D | happy | abrir la web | la escena 3D arranca y sustituye a la imagen fija | e2e | pasa |
| F02-H2 | vista 3D | happy | ir a la vista 3D, pulsar "La terraza" | la cámara baja a la terraza y cambia el texto descriptivo | e2e | pasa |
| F02-H3 | vista 3D | happy | pulsar "Noche" | cambia la luz y se sincronizan los dos selectores | e2e | pasa |
| F02-H4 | vista 3D | happy | arrastrar con el ratón | la maqueta gira | e2e | pasa |
| F02-E1 | vista 3D | edge: solo teclado | foco en la maqueta, flechas y + | gira y acerca | e2e | pasa |
| F02-N1 | vista 3D | negative: sin WebGL | abrir sin soporte WebGL | imagen de la recreación y aviso; el resto de la web intacto | e2e | pasa |
| F03-H1 | horario | happy | ir a horario | tabla por temporada, dirección y enlace a Google Maps | e2e | pasa |
| F04-H1 | navegación | happy | pulsar "Cocina" en el menú | la sección queda a la vista | e2e | pasa |
| F04-E1 | navegación | edge: móvil 390 px | abrir menú, ir a horario | menú se cierra, sin desbordes horizontales | e2e | pasa |
| R01 | robustez | sin JavaScript | abrir con JS desactivado | todos los titulares y el contenido se leen | e2e | pasa |
| R02 | robustez | movimiento reducido | emular prefers-reduced-motion | el contenido sigue apareciendo | e2e | pasa |
| R03 | accesibilidad | axe WCAG 2.1 AA | escanear la página completa | 0 infracciones | e2e | pasa |
| M01 | rendimiento | manual | abrir en un móvil y un portátil reales | la escena va fluida; si no, baja de calidad sola | manual | pendiente (aquí solo hay navegador sin GPU) |
| M02 | contenido | manual | el restaurante revisa horario, textos y carta | datos confirmados | manual | pendiente |

Todas las pruebas fallan si hay errores de consola o respuestas 4xx/5xx.
