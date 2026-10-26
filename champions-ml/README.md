# Predicción de partidos de la Champions League con machine learning

Modelo que da la probabilidad de **victoria local, empate o victoria visitante**
(1X2, resultado a los 90 minutos) en partidos de la UEFA Champions League, además
de los goles esperados y los marcadores más probables.

Usa partidos europeos (Champions, Europa League, Conference y fases previas) y
partidos nacionales de los equipos (ligas y copas).

## Resultados

Prueba "como en directo": cada temporada de 2017-18 a 2025-26 se predice con un
modelo entrenado **solo con las temporadas anteriores**. Total: 1.247 partidos.

| Modelo | Acierto | Log loss ↓ |
|---|---|---|
| **Combinado (regresión logística + Poisson), con ligas y copas** | **59,1 %** | **0,912** |
| Poisson (goles), con ligas y copas | 58,5 % | 0,912 |
| Regresión logística, con ligas y copas | 58,6 % | 0,919 |
| Combinado, solo datos europeos (versión anterior) | 58,9 % | 0,922 |
| Solo Elo europeo + regresión logística | 58,6 % | 0,935 |
| Gradient boosting, con ligas y copas | 57,7 % | 0,957 |
| Referencia: siempre gana el local | 46,8 % | — |

Qué se puede leer de esto:

- El modelo acierta el resultado en **casi 6 de cada 10 partidos**, frente al 47 %
  de apostar siempre por el local.
- **Añadir ligas y copas mejora las probabilidades** (log loss de 0,922 a 0,912).
  La mejora es pequeña pero no es casualidad: el intervalo de confianza del 95 %
  (remuestreo de partidos) va de 0,002 a 0,018 y mejora en 7 de las 9 temporadas.
  **En aciertos casi no cambia** (737 frente a 734 partidos).
- Las **probabilidades están bien calibradas**: cuando el modelo da un 75 % al
  favorito, este gana un 77 % de las veces (tabla completa en
  [`reports/evaluacion.md`](reports/evaluacion.md)).
- El acierto es más alto que en una liga nacional porque en la Champions hay
  muchos partidos desiguales.
- El modelo más complejo (gradient boosting) es el peor: con unos 2.000 partidos de
  Champions se sobreajusta.

## Pronóstico de la Champions 2026-27

`python scripts/simular_champions.py --actualizar` descarga de Wikipedia el
calendario y los resultados de la fase de liga, entrena el modelo con todo lo
disponible y juega 20.000 veces lo que queda de temporada (fase de liga y
eliminatorias con el formato de la UEFA desde 2024-25; los sorteos se simulan al
azar). Resultado en [`reports/simulacion_2026_27.md`](reports/simulacion_2026_27.md)
y en la página web.

Con 54 de 144 partidos jugados (hasta el 21/10/2026), los favoritos son Bayern
(20,0 %), PSG (19,8 %), Barcelona (17,7 %), Arsenal (15,9 %) y Real Madrid (9,9 %).

Límites de la simulación: la fuerza de cada equipo no cambia durante la temporada
simulada (no hay lesiones, fichajes ni rachas), y el modelo se ha validado partido a
partido, no en torneos completos.

## Limitaciones

- **No se ha comparado con las casas de apuestas** en la Champions: no hay cuotas
  gratuitas de esta competición. No hay ninguna prueba de que este modelo les gane,
  así que no sirve como sistema de apuestas.
- **El empate nunca sale como resultado más probable** (pasa en uno de cada cinco
  partidos, pero casi nunca es la opción favorita). Sí se le asigna su probabilidad.
- No conoce lesiones, alineaciones ni fichajes.
- Las copas solo están disponibles en los últimos años (ver tabla de datos), así que
  aportan poco. Los partidos de copa contra equipos sin historial (amateurs) se ignoran.
- Los datos de openfootball llegan hasta la final del 30/05/2026; la fase de liga
  de 2026-27 se lee de Wikipedia (`data/champions_2026_27.csv`). Ligas y copas, hasta
  el **21/10/2026**. No están la Europa League ni la Conference de 2025-26 ni las
  fases previas de 2026-27, porque la fuente aún no las publica.
- Algunos partidos "en casa" no lo fueron de verdad (sedes cambiadas por la COVID en
  2020-21, equipos ucranianos jugando fuera de su país).

## Datos

| Fuente | Qué | Licencia |
|---|---|---|
| [openfootball/champions-league](https://github.com/openfootball/champions-league) | Champions (desde 2011-12), Europa League (desde 2020-21), Conference (desde 2021-22), fases previas (desde 2024-25) | Dominio público, incluido en `data/raw/` |
| [football-data.co.uk](https://www.football-data.co.uk) | Ligas de 21 países desde 2011-12 o 2012-13: 1.ª división de Inglaterra, España, Alemania, Italia, Francia, Países Bajos, Bélgica, Portugal, Turquía, Grecia, Escocia, Austria, Suiza, Dinamarca, Noruega, Suecia, Polonia, Rumanía, Rusia, Irlanda y Finlandia, y 2.ª división de las cinco grandes | No se incluye: se descarga con `scripts/descargar_datos.py` |
| [openfootball](https://github.com/openfootball) (england, espana, deutschland, italy, europe) | FA Cup y Copa de la Liga y DFB-Pokal (desde 2018-19), Copa del Rey y Coppa Italia (desde 2020-21), copas de otros 16 países (2024-25) y ligas de otros 31 países (últimas 1-5 temporadas) | Dominio público, incluido en `data/openfootball_nacional/` |

En total, unos 140.000 partidos.

**Nombres de equipos.** Cada fuente escribe los nombres a su manera ("Ath Madrid",
"Atlético Madrid", "Club Atlético de Madrid"). Se unifican así:

1. Tabla manual en [`data/equipos_mapeo.csv`](data/equipos_mapeo.csv): equivalencias
   que no se pueden deducir ("Austria Vienna" = "Austria Wien") y nombres que **no**
   deben unirse aunque se parezcan ("Oxford City" no es el Oxford United).
2. Coincidencia estricta (`clml/similitud.py`): todas las palabras del nombre corto
   deben estar en el largo (se admiten abreviaturas de hasta 4 letras: "Man" →
   "Manchester") y las que sobran deben ser genéricas ("FC", "City", "Real"...).
   Así "TSV Schott Mainz" (amateur) no se confunde con el Mainz.

## Uso

```bash
pip install -r requirements.txt
python scripts/descargar_datos.py      # necesario la primera vez (ligas nacionales)

# Un partido
python scripts/predecir.py "Real Madrid" "Bayern"

# Final (campo neutral)
python scripts/predecir.py psg arsenal --neutral --fase final

# Partido de vuelta: --ida es el resultado de la ida, con el local de la ida primero
python scripts/predecir.py barcelona inter --fase semifinal --ida 3-1

# Varios partidos desde un CSV con columnas local,visitante[,neutral,fase,ida]
python scripts/predecir.py --partidos jornada.csv

# Ranking Elo actual
python scripts/predecir.py --ranking

# Repetir la evaluación y regenerar reports/
python scripts/evaluar.py

# Volver a ajustar los parámetros del Elo (con 2012-13 a 2016-17)
python scripts/ajustar_elo.py

# Tests
python -m pytest -q
```

Los nombres se buscan de forma aproximada ("bayern", "atletico madrid", "psg"). Si
un nombre es ambiguo ("madrid"), el programa muestra las opciones.

## Página web (para el móvil)

`web/index.html` es una página que funciona sola, sin servidor: lleva dentro el
modelo y calcula las predicciones en el propio navegador. Muestra las
probabilidades 1X2, los goles esperados, la cuadrícula de marcadores y el ranking Elo.
Tiene un buscador de equipos y ligas (sin tildes ni mayúsculas: "barca", "bundesliga") y
una sección de ligas ordenadas por nivel, con sus equipos de la última temporada.

- Para regenerarla tras actualizar los datos: `python scripts/exportar_web.py`
- Para comprobar que da los mismos números que Python: `node web/test_paridad.js`

## Cómo funciona

1. **Lectura** (`clml/parse.py`, `clml/domestic.py`): convierte los ficheros de
   openfootball y football-data en partidos. Para la prórroga y los penaltis se toma
   el resultado a los 90 minutos.
2. **Variables** (`clml/features.py`), calculadas solo con partidos anteriores
   (dos tests lo comprueban):
   - **Elo europeo**: solo con partidos europeos (el de la versión anterior).
   - **Elo combinado**: con todos los partidos. El Elo de un equipo es su nivel
     dentro de su país más el nivel de su país. Los partidos nacionales mueven solo
     lo primero y los europeos, las dos cosas; así una liga débil no infla a su
     campeón. Para que el punto de partida no sea igual para todas las ligas, la
     temporada 2011-12 se recorre tres veces antes de empezar (esa temporada no se
     usa ni para entrenar ni para evaluar).
   - **Forma** en Europa y **forma en liga** (últimos 6 partidos), **días de
     descanso**, **fuerza del país** en Europa, **experiencia** en la Champions,
     **fase**, **campo neutral**, **ida o vuelta** y **resultado de la ida**.
   - Los parámetros del Elo se ajustaron con las temporadas 2012-13 a 2016-17,
     antes del periodo de prueba (`scripts/ajustar_elo.py`).
3. **Modelos** (`clml/models.py`): regresión logística multinomial, regresión de
   Poisson para los goles de cada equipo y la media de ambos (el modelo final).
   En campo neutral se promedia la predicción con la de los equipos intercambiados,
   para que el orden en que se escriben no influya.

## Ideas para mejorarlo

- Datos de jugadores (alineaciones, lesiones), por ejemplo con una API de pago.
- Cuotas de apuestas de la Champions, para comparar el modelo con el mercado.
- Datos de goles esperados (xG).
