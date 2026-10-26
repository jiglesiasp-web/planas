# Predicción de partidos de la Champions League con machine learning

Modelo que da la probabilidad de **victoria local, empate o victoria visitante**
(1X2, resultado a los 90 minutos) en partidos de la UEFA Champions League, además
de los goles esperados y los marcadores más probables.

## Resultados

Prueba "como en directo": cada temporada de 2017-18 a 2025-26 se predice con un
modelo entrenado **solo con las temporadas anteriores**. Total: 1.247 partidos.

| Modelo | Acierto | Log loss ↓ |
|---|---|---|
| **Combinado (regresión logística + Poisson)** | **58,8 %** | **0,922** |
| Poisson (goles) | 58,5 % | 0,922 |
| Regresión logística (todas las variables) | 58,9 % | 0,928 |
| Solo Elo + regresión logística | 58,6 % | 0,935 |
| Gradient boosting | 56,5 % | 0,969 |
| Referencia: siempre gana el local | 46,8 % | — |

Qué se puede leer de esto:

- El modelo acierta el resultado en **casi 6 de cada 10 partidos**, frente al 47 %
  de apostar siempre por el local.
- Las **probabilidades están bien calibradas**: cuando el modelo da un 65 % al
  favorito, este gana un 66 % de las veces (tabla completa en
  [`reports/evaluacion.md`](reports/evaluacion.md)).
- El acierto es más alto que en una liga nacional porque en la Champions hay
  muchos partidos desiguales (un grande contra un equipo modesto en la fase
  inicial).
- La mayor parte de la información la aporta el **rating Elo**. El resto de variables
  mejora las probabilidades (log loss), pero apenas cambia el acierto.
- El modelo más complejo (gradient boosting) es el peor: con unos 2.000 partidos se
  sobreajusta. Con pocos datos, los modelos sencillos funcionan mejor.

## Limitaciones

- **No se ha comparado con las casas de apuestas** porque estos datos no incluyen
  cuotas. No hay ninguna prueba de que este modelo les gane, así que no sirve como
  sistema de apuestas.
- **El empate nunca sale como resultado más probable** (en la Champions se dan en
  torno al 20 % de los partidos y casi nunca son la opción favorita). Sí se le
  asigna su probabilidad.
- Solo usa partidos **europeos** (Champions, Europa League, Conference y fases
  previas). No conoce las ligas nacionales, las lesiones, las alineaciones ni los
  fichajes. Un equipo que juega poco en Europa tiene un Elo poco fiable.
- Las competiciones menores solo están disponibles desde 2020-21 (Europa League) y
  2021-22 (Conference).
- Los datos llegan hasta la **final del 30/05/2026** (temporada 2025-26). La
  temporada 2026-27 todavía no está publicada en la fuente; cuando lo esté, basta con
  ejecutar `scripts/descargar_datos.py`.
- Algunos partidos "en casa" no lo fueron de verdad (sedes cambiadas por la COVID en
  2020-21, equipos ucranianos jugando fuera de su país). Se tratan como partidos
  normales.

## Uso

```bash
pip install -r requirements.txt

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

# Tests
python -m pytest -q
```

Ejemplo de salida:

```
Real Madrid (ESP)  vs  Bayern München (GER)
  Elo: 1825 vs 1926

  Gana local      40.3%  ████████████
  Empate          19.7%  ██████
  Gana visitante  40.0%  ████████████

  Goles esperados: 1.60 - 1.56
  Marcadores más probables: 1-1 (11%), 2-1 (8%), 1-2 (8%), 1-0 (7%), 2-2 (7%)
```

Los nombres se buscan de forma aproximada ("bayern", "atletico madrid", "psg"). Si
un nombre es ambiguo ("madrid"), el programa muestra las opciones.

## Cómo funciona

1. **Datos** ([openfootball/champions-league](https://github.com/openfootball/champions-league),
   dominio público): 4.244 partidos europeos de 2011-12 a 2025-26, de los cuales
   1.997 son de la fase final de la Champions. Están incluidos en `data/raw/`.
2. **Lectura** (`clml/parse.py`): convierte el formato de texto de openfootball en
   partidos. Para la prórroga y los penaltis se toma el resultado a los 90 minutos.
3. **Nombres** (`clml/teams.py`): unifica variantes del mismo club ("Real Madrid" /
   "Real Madrid CF").
4. **Variables** (`clml/features.py`), calculadas solo con partidos anteriores
   (un test lo comprueba):
   - **Elo** de cada equipo con todos los partidos europeos. Los parámetros
     (K = 35, ventaja de campo = 80 puntos) se ajustaron con las temporadas 2012-13 a
     2016-17, antes del periodo de prueba (`scripts/ajustar_elo.py`).
   - **Forma**: puntos y diferencia de goles en los últimos 6 partidos europeos.
   - **Fuerza del país**: puntos por partido de sus clubes en Europa en las 3
     temporadas anteriores.
   - **Experiencia** en la Champions, **fase**, **campo neutral**, **ida o vuelta** y
     **resultado de la ida**.
5. **Modelos** (`clml/models.py`): regresión logística multinomial, regresión de
   Poisson para los goles de cada equipo y la media de ambos (el modelo final).
   En campo neutral se promedia la predicción con la de los equipos intercambiados,
   para que el orden en que se escriben no influya.

## Ideas para mejorarlo

- Añadir las ligas nacionales (por ejemplo, con [football.json](https://github.com/openfootball/football.json))
  para tener un Elo más completo.
- Añadir cuotas de apuestas, tanto como variable como para comparar el modelo con el mercado.
- Añadir datos de goles esperados (xG), lesiones y alineaciones.
