// Comprueba que la versión JavaScript da los mismos números que Python
// (tolerancia 0,0001 por el redondeo de los datos exportados).
// Uso: node web/test_paridad.js   (antes: python scripts/exportar_web.py)
const fs = require("fs");
const path = require("path");
const { predict } = require("./prediccion.js");
const M = JSON.parse(fs.readFileSync(path.join(__dirname, "modelo.json"), "utf8"));
const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "paridad.json"), "utf8"));
let worst = 0;
for (const c of cases) {
  const p = predict(M, c.home, c.away, { neutral: c.neutral, stage: c.stage, firstLegGd: c.firstLegGd });
  const got = [p.home, p.draw, p.away, p.xgHome, p.xgAway];
  const err = Math.max(...got.map((v, i) => Math.abs(v - c.expected[i])));
  worst = Math.max(worst, err);
  console.log(`${c.home} - ${c.away}: ${got.map(v => v.toFixed(4)).join(" ")}  (dif. máx ${err.toExponential(1)})`);
}
if (worst > 1e-4) { console.error("FALLO: la versión web no coincide con Python"); process.exit(1); }
console.log("OK: coincide con Python");
