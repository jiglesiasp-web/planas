# Evaluación de los modelos

Prueba: 1247 partidos de Champions de 2017-18 a 2025-26. Cada temporada se predice con un modelo entrenado solo con las temporadas anteriores.

Métricas: **acierto** (más alto, mejor); **log loss**, **Brier** y **RPS** miden la calidad de las probabilidades (más bajo, mejor).

## Resultado global

| modelo | acierto | log_loss | brier | rps |
|---|---|---|---|---|
| Combinado (logística + Poisson) | 58.8% | 0.9221 | 0.5425 | 0.1947 |
| Poisson (goles) | 58.5% | 0.9222 | 0.5427 | 0.1946 |
| Regresión logística (todas las variables) | 58.9% | 0.9276 | 0.5453 | 0.1959 |
| Elo + regresión logística | 58.6% | 0.9354 | 0.5500 | 0.1979 |
| Gradient boosting | 56.5% | 0.9690 | 0.5702 | 0.2044 |
| Frecuencias históricas | 46.8% | 1.0403 | 0.6291 | 0.2369 |
| Siempre gana el local | 46.8% | 3.9885 | 1.0510 | 0.4297 |

## Acierto por temporada

| temporada | Combinado (logística + Poisson) | Poisson (goles) | Regresión logística (todas las variables) | Elo + regresión logística | Gradient boosting | Frecuencias históricas | Siempre gana el local |
|---|---|---|---|---|---|---|---|
| 2017-18 | 54.4% | 52.0% | 53.6% | 52.0% | 46.4% | 44.8% | 44.8% |
| 2018-19 | 61.6% | 59.2% | 61.6% | 56.8% | 56.8% | 45.6% | 45.6% |
| 2019-20 | 60.5% | 61.3% | 60.5% | 63.9% | 59.7% | 43.7% | 43.7% |
| 2020-21 | 60.0% | 58.4% | 59.2% | 62.4% | 64.0% | 40.8% | 40.8% |
| 2021-22 | 57.6% | 58.4% | 58.4% | 60.0% | 52.8% | 44.8% | 44.8% |
| 2022-23 | 56.8% | 56.0% | 57.6% | 57.6% | 54.4% | 48.8% | 48.8% |
| 2023-24 | 58.4% | 60.0% | 59.2% | 56.8% | 55.2% | 48.0% | 48.0% |
| 2024-25 | 60.3% | 60.3% | 59.8% | 58.7% | 60.8% | 51.3% | 51.3% |
| 2025-26 | 58.7% | 59.3% | 59.3% | 59.3% | 56.6% | 49.7% | 49.7% |

## ¿Son fiables las probabilidades? (modelo: Combinado (logística + Poisson))

Partidos agrupados según la probabilidad del resultado favorito. Si el modelo está bien calibrado, `prob_media` y `acierto_real` deben parecerse.

| pmax | partidos | prob_media | acierto_real |
|---|---|---|---|
| (0.0, 0.4] | 77 | 38.5% | 42.9% |
| (0.4, 0.5] | 330 | 45.0% | 44.5% |
| (0.5, 0.6] | 317 | 55.1% | 54.6% |
| (0.6, 0.7] | 241 | 65.0% | 66.0% |
| (0.7, 0.8] | 181 | 74.8% | 73.5% |
| (0.8, 1.0] | 101 | 85.0% | 87.1% |

|  | prob_media_predicha | frecuencia_real |
|---|---|---|
| Gana local | 47.3% | 46.8% |
| Empate | 20.7% | 19.2% |
| Gana visitante | 32.0% | 34.0% |

El modelo eligió el empate como resultado más probable en 0 de 1247 partidos; hubo 239 empates.
