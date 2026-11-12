// Pruebas de la web (solo desarrollo; no se sube al hosting).
// Ejecutar desde la carpeta el-pegoli:  playwright test -c tools/e2e --trace off
const path = require("path");
module.exports = {
  testDir: __dirname,
  timeout: 90000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8766",
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] }
  },
  webServer: {
    command: "python3 -m http.server 8766",
    cwd: path.resolve(__dirname, "../.."),
    url: "http://localhost:8766/index.html",
    reuseExistingServer: true
  }
};
