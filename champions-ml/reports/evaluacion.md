# Evaluación de los modelos

Prueba: 1247 partidos de Champions de 2017-18 a 2025-26. Cada temporada se predice con un modelo entrenado solo con las temporadas anteriores.

Métricas: **acierto** (más alto, mejor); **log loss**, **Brier** y **RPS** miden la calidad de las probabilidades (más bajo, mejor).

Todos los modelos usan Europa + ligas + copas salvo el marcado como "versión anterior".

## Resultado global

| modelo | acierto | log_loss | brier | rps |
|---|---|---|---|---|
| Poisson (goles) | 58.5% | 0.9115 | 0.5351 | 0.1912 |
| Combinado (logística + Poisson) | 59.1% | 0.9122 | 0.5356 | 0.1915 |
| Regresión logística (todas las variables) | 58.6% | 0.9186 | 0.5392 | 0.1930 |
| Combinado, solo datos europeos (versión anterior) | 58.9% | 0.9220 | 0.5424 | 0.1946 |
| Elo + regresión logística | 58.6% | 0.9354 | 0.5500 | 0.1979 |
| Gradient boosting | 57.5% | 0.9553 | 0.5594 | 0.1999 |
| Frecuencias históricas | 46.8% | 1.0403 | 0.6291 | 0.2369 |
| Siempre gana el local | 46.8% | 3.9885 | 1.0510 | 0.4297 |

## Acierto por temporada

| temporada | Poisson (goles) | Combinado (logística + Poisson) | Regresión logística (todas las variables) | Combinado, solo datos europeos (versión anterior) | Elo + regresión logística | Gradient boosting | Frecuencias históricas | Siempre gana el local |
|---|---|---|---|---|---|---|---|---|
| 2017-18 | 54.4% | 54.4% | 52.8% | 54.4% | 52.0% | 49.6% | 44.8% | 44.8% |
| 2018-19 | 59.2% | 60.8% | 60.8% | 61.6% | 56.8% | 57.6% | 45.6% | 45.6% |
| 2019-20 | 62.2% | 60.5% | 60.5% | 60.5% | 63.9% | 62.2% | 43.7% | 43.7% |
| 2020-21 | 57.6% | 57.6% | 56.8% | 60.0% | 62.4% | 64.0% | 40.8% | 40.8% |
| 2021-22 | 59.2% | 59.2% | 59.2% | 57.6% | 60.0% | 56.8% | 44.8% | 44.8% |
| 2022-23 | 60.8% | 60.8% | 60.8% | 56.8% | 57.6% | 56.8% | 48.8% | 48.8% |
| 2023-24 | 56.8% | 57.6% | 58.4% | 58.4% | 56.8% | 54.4% | 48.0% | 48.0% |
| 2024-25 | 58.2% | 59.8% | 58.7% | 60.8% | 58.7% | 58.7% | 51.3% | 51.3% |
| 2025-26 | 58.7% | 60.3% | 59.3% | 58.7% | 59.3% | 57.1% | 49.7% | 49.7% |

## ¿Son fiables las probabilidades? (modelo: Combinado (logística + Poisson))

Partidos agrupados según la probabilidad del resultado favorito. Si el modelo está bien calibrado, `prob_media` y `acierto_real` deben parecerse.

| pmax | partidos | prob_media | acierto_real |
|---|---|---|---|
| (0.0, 0.4] | 80 | 38.4% | 35.0% |
| (0.4, 0.5] | 332 | 44.9% | 43.7% |
| (0.5, 0.6] | 286 | 55.2% | 57.3% |
| (0.6, 0.7] | 262 | 64.6% | 63.7% |
| (0.7, 0.8] | 183 | 75.1% | 77.0% |
| (0.8, 1.0] | 104 | 84.8% | 88.5% |

|  | prob_media_predicha | frecuencia_real |
|---|---|---|
| Gana local | 47.2% | 46.8% |
| Empate | 20.7% | 19.2% |
| Gana visitante | 32.1% | 34.0% |

El modelo eligió el empate como resultado más probable en 0 de 1247 partidos; hubo 239 empates.
