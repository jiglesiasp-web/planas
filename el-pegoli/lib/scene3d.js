/* ==========================================================================
   El Pegolí — vista 3D del restaurante sobre datos reales (Three.js r160, sin módulos).
   - Suelo y costa: ortofoto PNOA del Instituto Geográfico Nacional (CC BY 4.0).
   - Relieve (Montgó, cerro del castillo de Dénia): modelo digital del terreno.
   - Edificios vecinos: huellas de OpenStreetMap con la cubierta de la ortofoto.
   - Restaurante: modelado a mano sobre su planta real y fotografías del local.
   Las alturas, los interiores y el mobiliario son una interpretación.
   Expone window.__PEGOLI__.createScene(host, options).
   ========================================================================== */
(function () {
  "use strict";

  var NS = (window.__PEGOLI__ = window.__PEGOLI__ || {});

  NS.hasWebGL = function () {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
    } catch (e) {
      return false;
    }
  };

  /* ---------- utilidades numéricas ---------- */
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  // generador pseudoaleatorio con semilla: la escena es idéntica en cada visita
  function makeRng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, z) {
    var n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function vnoise(x, z) {
    var xi = Math.floor(x), zi = Math.floor(z);
    var xf = x - xi, zf = z - zi;
    var u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    return lerp(lerp(hash2(xi, zi), hash2(xi + 1, zi), u), lerp(hash2(xi, zi + 1), hash2(xi + 1, zi + 1), u), v);
  }
  function fbm(x, z) {
    return vnoise(x, z) * 0.55 + vnoise(x * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, z * 4.3) * 0.15;
  }

  /* ---------- momentos del día ---------- */
  var TIMES = {
    dia: {
      top: 0x145fcb, hor: 0xa9d6f5, glow: 0xffffff, glowAmt: 0.3,
      cloud: 0.44, cloudLit: 0xffffff, cloudDark: 0xc3d2e2,
      sunDir: [-0.7, 0.68, -0.12], sunCol: 0xfff0d2, sunInt: 4.0, disc: 30, discCos: 0.9996,
      hemiSky: 0xcfe4ff, hemiGnd: 0xb39b7a, hemiInt: 0.3,
      skyBoost: 1.3, envBoost: 1.45, ground: 0x4f6f86,
      fog: 0xbfdff1, fogD: 0.00016,
      deep: 0x0b4a7c, shallow: 0x2aa9a6, waterLight: 0xffffff,
      exposure: 1.0, lamps: 0, stars: 0
    },
    atardecer: {
      top: 0x26356f, hor: 0xff9a58, glow: 0xffd28c, glowAmt: 0.95,
      cloud: 0.52, cloudLit: 0xffab73, cloudDark: 0x64456b,
      sunDir: [-0.9, 0.13, -0.42], sunCol: 0xffb07a, sunInt: 1.75, disc: 22, discCos: 0.9994,
      hemiSky: 0xb7a6d6, hemiGnd: 0x7c5340, hemiInt: 0.28,
      skyBoost: 1.1, envBoost: 1.9, ground: 0x4a3a52,
      fog: 0xd89a86, fogD: 0.0002,
      deep: 0x1a2c63, shallow: 0x4b7d9c, waterLight: 0xa88e9a,
      exposure: 1.05, lamps: 0.75, stars: 0.12
    },
    noche: {
      top: 0x030817, hor: 0x15244a, glow: 0x34477d, glowAmt: 0.4,
      cloud: 0.34, cloudLit: 0x2c3c66, cloudDark: 0x0a1124,
      sunDir: [0.42, 0.62, -0.66], sunCol: 0xa9c0ff, sunInt: 1.5, disc: 9, discCos: 0.99975,
      hemiSky: 0x4a63a6, hemiGnd: 0x1a2236, hemiInt: 0.8,
      skyBoost: 1.0, envBoost: 4.2, ground: 0x0a1226,
      fog: 0x0b1630, fogD: 0.00028,
      deep: 0x061433, shallow: 0x143a5c, waterLight: 0x8fa3d8,
      exposure: 1.4, lamps: 1, stars: 1
    }
  };

  /* ---------- puntos de vista (x = este, z = sur, en metros desde el restaurante) ----------
     look: la cámara queda fija y se gira la mirada, como a pie de terraza. */
  var VIEWS = {
    hero:    { pos: [-38, 12.5, -46], target: [7, 4, -7],     fov: 40, wide: true },
    llegada: { pos: [-8, 5.5, -50],   target: [8, 4.6, -9],   fov: 40, wide: true },
    mesa:    { pos: [19.9, 5.5, 0.1], target: [18.3, 5.0, -1.8], fov: 46, look: true },
    ocaso:   { pos: [20.7, 4.6, -17.7], target: [-30, 4.2, -21], fov: 58, look: true },
    general: { pos: [60, 27, -56],    target: [5, 3, -6],     fov: 40, wide: true },
    mar:     { pos: [9, 3.4, -66],    target: [8, 5, -8],     fov: 36, wide: true },
    terraza: { pos: [0.9, 4.3, -16.3], target: [16, 3.8, -13.0], fov: 62, look: true },
    comedor: { pos: [17.2, 5.75, 0.9], target: [16.8, 5.3, -20], fov: 62, look: true },
    cala:    { pos: [41, 3.4, 21],    target: [24, 4.2, 1],   fov: 46 },
    denia:   { pos: [-2.4, 4.5, -14.5], target: [-2610, 60, -951], fov: 24, look: true }
  };

  var POINTS = {
    terraza: [10, 6.8, -14.5],
    comedor: [18.5, 8.8, -3],
    cala:    [41, 1.6, 22],
    denia:   [-2610, 95, -951],
    montgo:  [-667, 770, 2816]
  };

  NS.VIEWS = VIEWS;
  NS.TIMES = TIMES;

  /* ---------- GLSL compartido por el cielo y por el reflejo del agua ---------- */
  var SKY_GLSL = [
    "uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uSunDir; uniform vec3 uSunCol;",
    "uniform vec3 uCloudLit; uniform vec3 uCloudDark; uniform vec3 uGround;",
    "uniform float uGlowAmt; uniform float uCloud; uniform float uTime; uniform float uStars; uniform float uDisc; uniform float uDiscCos;",
    "float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }",
    "float vnoise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y); }",
    "float fbm5(vec2 p){ float a = 0.5; float s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }",
    "float fbm3(vec2 p){ float a = 0.5; float s = 0.0; for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; } return s; }",
    "vec3 skyBase(vec3 d){",
    "  float h = max(d.y, 0.0);",
    "  vec3 c = mix(uHor, uTop, pow(h, 0.48));",
    "  float sd = max(dot(d, uSunDir), 0.0);",
    "  c = mix(c, uGlow, clamp(pow(sd, 6.0) * uGlowAmt * (1.0 - pow(h, 0.5) * 0.6), 0.0, 1.0));",
    "  return c;",
    "}",
    "vec3 skyClouds(vec3 c, vec3 d){",
    "  if (d.y > 0.0) {",
    "    vec2 uv = d.xz / (d.y + 0.16) * 1.35 + vec2(uTime * 0.006, uTime * 0.0025);",
    "    float n = fbm5(uv);",
    "    float th = 0.8 - uCloud * 0.55;",
    "    float cov = smoothstep(th, th + 0.2, n) * smoothstep(0.0, 0.2, d.y);",
    "    float lit = fbm3(uv * 1.7 + 3.1);",
    "    float sd = max(dot(d, uSunDir), 0.0);",
    "    vec3 cc = mix(uCloudDark, uCloudLit, smoothstep(0.25, 0.75, lit));",
    "    cc += uSunCol * pow(sd, 8.0) * 0.35;",
    "    c = mix(c, cc, cov * 0.88);",
    "  }",
    "  return c;",
    "}"
  ].join("\n");

  NS.createScene = function (host, options) {
    var THREE = window.THREE;
    options = options || {};
    if (!THREE) throw new Error("THREE no cargado");

    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var isMobile = window.innerWidth < 900 || /Mobi|Android/i.test(navigator.userAgent);
    var rng = makeRng(1943);

    /* ================= renderer ================= */
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    renderer.setSize(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    var useShadows = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);
    renderer.info.autoReset = false;
    var maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(TIMES.dia.fog, TIMES.dia.fogD);
    scene.background = new THREE.Color(TIMES.dia.hor);

    var camera = new THREE.PerspectiveCamera(40, 1, 0.4, 45000);

    /* ================= texturas generadas ================= */
    function tileNoise(size, cx, cy, rnd) {
      var g = new Float32Array(cx * cy), i;
      for (i = 0; i < g.length; i++) g[i] = rnd();
      var out = new Float32Array(size * size);
      for (var y = 0; y < size; y++) {
        var fy = (y / size) * cy, yi = Math.floor(fy), ty = fy - yi;
        ty = ty * ty * (3 - 2 * ty);
        var y0 = yi % cy, y1 = (yi + 1) % cy;
        for (var x = 0; x < size; x++) {
          var fx = (x / size) * cx, xi = Math.floor(fx), tx = fx - xi;
          tx = tx * tx * (3 - 2 * tx);
          var x0 = xi % cx, x1 = (xi + 1) % cx;
          var a = g[y0 * cx + x0], b = g[y0 * cx + x1], c = g[y1 * cx + x0], d = g[y1 * cx + x1];
          out[y * size + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
        }
      }
      return out;
    }
    function tileFbm(size, cx, cy, oct, rnd) {
      var out = new Float32Array(size * size), amp = 1, tot = 0;
      for (var o = 0; o < oct; o++) {
        var n = tileNoise(size, Math.min(size, cx << o), Math.min(size, cy << o), rnd);
        for (var i = 0; i < out.length; i++) out[i] += n[i] * amp;
        tot += amp;
        amp *= 0.5;
      }
      for (var k = 0; k < out.length; k++) out[k] /= tot;
      return out;
    }
    function finishTex(canvas, srgb) {
      var t = new THREE.CanvasTexture(canvas);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = maxAniso;
      return t;
    }
    // textura de color a partir de un campo de alturas; colorFn(v, x, y) -> [r,g,b] 0..255
    function colorTex(field, size, colorFn) {
      var c = document.createElement("canvas");
      c.width = c.height = size;
      var g = c.getContext("2d"), img = g.createImageData(size, size), d = img.data;
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        var i = y * size + x, col = colorFn(field[i], x, y);
        d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return finishTex(c, true);
    }
    // mapa de normales a partir del mismo campo
    function normalTex(field, size, strength) {
      var c = document.createElement("canvas");
      c.width = c.height = size;
      var g = c.getContext("2d"), img = g.createImageData(size, size), d = img.data;
      for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
        var xl = field[y * size + ((x + size - 1) % size)], xr = field[y * size + ((x + 1) % size)];
        var yu = field[((y + size - 1) % size) * size + x], yd = field[((y + 1) % size) * size + x];
        var nx = (xl - xr) * strength, ny = (yd - yu) * strength, nz = 1;
        var l = Math.sqrt(nx * nx + ny * ny + nz * nz), i = (y * size + x) * 4;
        d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (nz / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return finishTex(c, false);
    }
    function grey(v, lo, hi) { var k = Math.round((lo + (hi - lo) * v) * 255); return [k, k, k]; }

    var trng = makeRng(77);
    var TS = isMobile ? 256 : 512;
    var T = {};
    (function () {
      // roca: se multiplica por el color de vértice
      var rock = tileFbm(TS, 6, 6, 5, trng);
      T.rock = colorTex(rock, TS, function (v) { return grey(v, 0.62, 1.0); });
      T.rockN = normalTex(rock, TS, 5);
      // cal: grano fino
      var cal = tileFbm(256, 24, 24, 3, trng);
      T.cal = colorTex(cal, 256, function (v) { return grey(v, 0.93, 1.0); });
      T.calN = normalTex(cal, 256, 1.1);
      // follaje
      var fol = tileFbm(256, 12, 12, 4, trng);
      T.fol = colorTex(fol, 256, function (v) { return grey(v, 0.55, 1.0); });
      T.folN = normalTex(fol, 256, 6);
      // brezo: fibras a lo largo
      var th = tileNoise(256, 96, 3, trng), th2 = tileNoise(256, 24, 6, trng);
      for (var i = 0; i < th.length; i++) th[i] = th[i] * 0.7 + th2[i] * 0.3;
      T.brezo = colorTex(th, 256, function (v) { return [Math.round(150 + 85 * v), Math.round(118 + 72 * v), Math.round(58 + 50 * v)]; });
      T.brezoN = normalTex(th, 256, 4);
      // corteza con anillos
      var bk = tileNoise(128, 3, 28, trng);
      T.bark = colorTex(bk, 128, function (v) { return [Math.round(96 + 60 * v), Math.round(76 + 48 * v), Math.round(56 + 36 * v)]; });
      T.barkN = normalTex(bk, 128, 5);

      // baldosa de barro de la terraza: 4 x 4 piezas con junta
      var S = 512, N = 4, f = new Float32Array(S * S), tint = [], nz = tileFbm(S, 32, 32, 3, trng), x, y;
      for (i = 0; i < N * N; i++) tint.push(0.86 + trng() * 0.2);
      for (y = 0; y < S; y++) for (x = 0; x < S; x++) {
        var px = (x % (S / N)), py = (y % (S / N)), e = Math.min(px, py, S / N - 1 - px, S / N - 1 - py);
        f[y * S + x] = smooth(0, 5, e) * (0.9 + nz[y * S + x] * 0.1);
      }
      T.suelo = colorTex(f, S, function (v, xx, yy) {
        var t = tint[Math.floor(yy / (S / N)) * N + Math.floor(xx / (S / N))] * (0.9 + nz[yy * S + xx] * 0.2);
        if (v < 0.55) return [150, 138, 122];
        return [Math.min(255, Math.round(190 * t)), Math.min(255, Math.round(120 * t)), Math.min(255, Math.round(86 * t))];
      });
      T.sueloN = normalTex(f, S, 2.2);

      // losas de piedra arenisca de la terraza baja
      var g2 = new Float32Array(S * S), tint2 = {}, rows = 5, rh = S / rows, joints = [];
      for (var r = 0; r < rows; r++) {
        var js = [0], acc = 0;
        while (acc < S - 70) { acc += 60 + Math.floor(trng() * 90); if (acc < S - 50) js.push(acc); }
        joints.push(js);
      }
      function stoneAt(xx, yy) {
        var r2 = Math.floor(yy / rh), js2 = joints[r2], k = 0;
        for (var q = 0; q < js2.length; q++) if (xx >= js2[q]) k = q;
        var x0 = js2[k], x1 = k + 1 < js2.length ? js2[k + 1] : S;
        return { id: r2 * 40 + k, e: Math.min(xx - x0, x1 - 1 - xx, yy - r2 * rh, (r2 + 1) * rh - 1 - yy) };
      }
      for (y = 0; y < S; y++) for (x = 0; x < S; x++) {
        var st = stoneAt(x, y);
        g2[y * S + x] = smooth(0, 4, st.e) * (0.82 + nz[y * S + x] * 0.18);
      }
      T.losa = colorTex(g2, S, function (v, xx, yy) {
        var st2 = stoneAt(xx, yy);
        if (tint2[st2.id] === undefined) tint2[st2.id] = 0.84 + trng() * 0.2;
        var t = tint2[st2.id] * (0.92 + nz[yy * S + xx] * 0.16);
        if (v < 0.5) return [158, 146, 124];
        return [Math.min(255, Math.round(222 * t)), Math.min(255, Math.round(203 * t)), Math.min(255, Math.round(168 * t))];
      });
      T.losaN = normalTex(g2, S, 2.4);

      // teja árabe: canales a lo largo de la pendiente
      var R = 256, cols = 8, rws = 4, tf = new Float32Array(R * R), tt = [];
      for (i = 0; i < cols * rws; i++) tt.push(0.8 + trng() * 0.3);
      for (y = 0; y < R; y++) for (x = 0; x < R; x++) {
        var u = ((x % (R / cols)) / (R / cols)) * 2 - 1, w = (y % (R / rws)) / (R / rws);
        tf[y * R + x] = Math.sqrt(Math.max(0, 1 - u * u)) * 0.8 + w * 0.2;
      }
      T.teja = colorTex(tf, R, function (v, xx, yy) {
        var t = tt[Math.floor(yy / (R / rws)) * cols + Math.floor(xx / (R / cols))] * (0.5 + v * 0.6);
        return [Math.min(255, Math.round(196 * t)), Math.min(255, Math.round(104 * t)), Math.min(255, Math.round(70 * t))];
      });
      T.tejaN = normalTex(tf, R, 3.2);

      // toldo a rayas
      var c = document.createElement("canvas");
      c.width = 128; c.height = 8;
      var g = c.getContext("2d");
      for (i = 0; i < 8; i++) { g.fillStyle = i % 2 ? "#f3ead2" : "#d9a73c"; g.fillRect(i * 16, 0, 16, 8); }
      T.toldo = finishTex(c, true);

      // hoja de palmera con transparencia
      c = document.createElement("canvas");
      c.width = 128; c.height = 512;
      g = c.getContext("2d");
      g.lineCap = "round";
      for (i = 0; i < 46; i++) {
        var k = i / 45, yy2 = 500 - k * 480, len = (1 - Math.pow(k, 2.2)) * 58 + 4;
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          g.strokeStyle = "rgb(" + Math.round(52 + trng() * 30) + "," + Math.round(104 + trng() * 44) + "," + Math.round(40 + trng() * 22) + ")";
          g.lineWidth = 4.2 - k * 1.6;
          g.beginPath();
          g.moveTo(64, yy2);
          g.quadraticCurveTo(64 + sgn * len * 0.55, yy2 - 16, 64 + sgn * len, yy2 - 26 - trng() * 8);
          g.stroke();
        }
      }
      g.strokeStyle = "#7c8a3e"; g.lineWidth = 4;
      g.beginPath(); g.moveTo(64, 512); g.lineTo(64, 16); g.stroke();
      T.palma = new THREE.CanvasTexture(c);
      T.palma.colorSpace = THREE.SRGBColorSpace;
      T.palma.anisotropy = maxAniso;

      // rótulo del muro (texto dibujado, no es el logotipo original)
      c = document.createElement("canvas");
      c.width = 1024; c.height = 512;
      g = c.getContext("2d");
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 1024, 512);
      g.textAlign = "center";
      g.fillStyle = "#23262b";
      g.font = "italic 600 96px Georgia, 'Times New Roman', serif";
      g.fillText("Restaurante", 512, 130);
      g.fillStyle = "#c2372a";
      g.font = "italic 700 168px Georgia, 'Times New Roman', serif";
      g.fillText("El Pegolí", 512, 300);
      g.fillStyle = "#23262b";
      g.font = "italic 600 96px Georgia, 'Times New Roman', serif";
      g.fillText("Terraza", 512, 430);
      T.rotulo = new THREE.CanvasTexture(c);
      T.rotulo.colorSpace = THREE.SRGBColorSpace;
      T.rotulo.anisotropy = maxAniso;
    })();

    /* ================= materiales ================= */
    function pbr(o) {
      if (o.roughness === undefined) o.roughness = 0.9;
      if (o.metalness === undefined) o.metalness = 0;
      return new THREE.MeshStandardMaterial(o);
    }
    function ns(v) { return new THREE.Vector2(v, v); }
    var M = {
      cal: pbr({ color: 0xfbf8f1, map: T.cal, normalMap: T.calN, normalScale: ns(0.55), roughness: 0.94 }),
      calLisa: pbr({ color: 0xfbf8f1, roughness: 0.8 }),
      teja: pbr({ color: 0xffffff, map: T.teja, normalMap: T.tejaN, normalScale: ns(1.1), roughness: 0.88, side: THREE.DoubleSide }),
      suelo: pbr({ color: 0xffffff, map: T.suelo, normalMap: T.sueloN, normalScale: ns(0.7), roughness: 0.82 }),
      losa: pbr({ color: 0xffffff, map: T.losa, normalMap: T.losaN, normalScale: ns(0.8), roughness: 0.95 }),
      piedra: pbr({ color: 0xcdb891, map: T.rock, normalMap: T.rockN, normalScale: ns(1.2), roughness: 0.97 }),
      vidrio: pbr({ color: 0x19303f, roughness: 0.04, metalness: 0.0, envMapIntensity: 2.2, emissive: 0xffc77e, emissiveIntensity: 0 }),
      cristal: pbr({ color: 0xcfe6ea, roughness: 0.03, transparent: true, opacity: 0.2, envMapIntensity: 2.2, depthWrite: false }),
      brezo: pbr({ color: 0xffffff, map: T.brezo, normalMap: T.brezoN, normalScale: ns(1.4), roughness: 1, side: THREE.DoubleSide }),
      madera: pbr({ color: 0x4a3323, map: T.bark, roughness: 0.85 }),
      azul: pbr({ color: 0x1d50b4, roughness: 0.62 }),
      mantel: pbr({ color: 0xffffff, roughness: 0.9, flatShading: true }),
      loza: pbr({ color: 0xffffff, roughness: 0.25 }),
      aluminio: pbr({ color: 0xc9ced3, roughness: 0.32, metalness: 0.9 }),
      blancoMate: pbr({ color: 0xf4f3ee, roughness: 0.55 }),
      hierro: pbr({ color: 0x17181a, roughness: 0.55, metalness: 0.4 }),
      farol: pbr({ color: 0xfff1cf, roughness: 0.35, emissive: 0xffc56e, emissiveIntensity: 0 }),
      barro: pbr({ color: 0xb8683f, roughness: 0.85 }),
      toldo: pbr({ color: 0xffffff, map: T.toldo, roughness: 0.9, side: THREE.DoubleSide }),
      verde: pbr({ color: 0x5c8a3e, map: T.fol, normalMap: T.folN, normalScale: ns(1.6), roughness: 0.95, vertexColors: true }),
      pino: pbr({ color: 0xffffff, map: T.fol, normalMap: T.folN, normalScale: ns(1.8), roughness: 0.95, vertexColors: true }),
      palma: pbr({ color: 0xffffff, map: T.palma, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.75 }),
      tronco: pbr({ color: 0xffffff, map: T.bark, normalMap: T.barkN, normalScale: ns(1.2), roughness: 0.95 }),
      roca: pbr({ color: 0xffffff, map: T.rock, normalMap: T.rockN, normalScale: ns(2.4), roughness: 0.96, vertexColors: true }),
      barco: pbr({ color: 0xfbfaf6, roughness: 0.45 }),
      vela: pbr({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide })
    };

    // texturas y materiales del modelo sobre datos reales
    (function () {
      // fachada genérica de los edificios vecinos: paño encalado con una ventana por módulo
      var c = document.createElement("canvas"), i;
      c.width = c.height = 256;
      var g = c.getContext("2d");
      g.fillStyle = "#f4f1ea";
      g.fillRect(0, 0, 256, 256);
      for (i = 0; i < 900; i++) {
        g.fillStyle = "rgba(120,110,95," + (trng() * 0.05).toFixed(3) + ")";
        g.fillRect(trng() * 256, trng() * 256, 2 + trng() * 5, 1 + trng() * 3);
      }
      var grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "rgba(90,80,70,0.10)"); grad.addColorStop(0.2, "rgba(90,80,70,0)");
      grad.addColorStop(0.85, "rgba(90,80,70,0)"); grad.addColorStop(1, "rgba(80,70,60,0.16)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = "#d9d4c8"; g.fillRect(84, 58, 88, 118);
      var wg = g.createLinearGradient(0, 64, 0, 170);
      wg.addColorStop(0, "#2c3e4d"); wg.addColorStop(1, "#51697a");
      g.fillStyle = wg; g.fillRect(90, 64, 76, 106);
      g.fillStyle = "#d9d4c8"; g.fillRect(126, 64, 4, 106); g.fillRect(90, 112, 76, 3);
      g.fillStyle = "#c9c2b4"; g.fillRect(78, 176, 100, 7);
      T.fachada = finishTex(c, true);

      c = document.createElement("canvas");
      c.width = 64; c.height = 40;
      g = c.getContext("2d");
      g.fillStyle = "#c60b1e"; g.fillRect(0, 0, 64, 40);
      g.fillStyle = "#ffc400"; g.fillRect(0, 10, 64, 20);
      T.bandera = new THREE.CanvasTexture(c);
      T.bandera.colorSpace = THREE.SRGBColorSpace;

      // rótulo pintado sobre el muro azulado de la cala (texto dibujado, no es el logotipo original)
      c = document.createElement("canvas");
      c.width = 1024; c.height = 600;
      g = c.getContext("2d");
      g.fillStyle = "#e6eff4";
      g.fillRect(0, 0, 1024, 600);
      g.textAlign = "center";
      g.fillStyle = "#26282c";
      g.font = "500 118px Georgia, 'Times New Roman', serif";
      g.fillText("Restaurante", 512, 150);
      g.fillStyle = "#b3202c";
      g.font = "italic 700 170px 'Brush Script MT', 'Segoe Script', Georgia, serif";
      g.fillText("El Pegolí", 512, 345);
      g.fillStyle = "#26282c";
      g.font = "500 118px Georgia, 'Times New Roman', serif";
      g.fillText("Terraza", 512, 520);
      T.rotulo = new THREE.CanvasTexture(c);
      T.rotulo.colorSpace = THREE.SRGBColorSpace;
      T.rotulo.anisotropy = maxAniso;
    })();
    M.hormigon = pbr({ color: 0x77726a, map: T.rock, normalMap: T.rockN, normalScale: ns(1.2), roughness: 0.98 });
    M.hormigonClaro = pbr({ color: 0xbdb8ae, map: T.rock, roughness: 0.9 });
    M.cristal2 = pbr({ color: 0xc9dbe0, roughness: 0.03, transparent: true, opacity: 0.14, envMapIntensity: 1.1, depthWrite: false });
    M.marco = pbr({ color: 0x1b1d20, roughness: 0.45, metalness: 0.5 });
    M.plastico = pbr({ color: 0xf2f1ec, roughness: 0.5 });
    M.brezoOscuro = pbr({ color: 0x8f8d8a, map: T.brezo, normalMap: T.brezoN, normalScale: ns(1.5), roughness: 1, side: THREE.DoubleSide });
    M.turquesa = pbr({ color: 0x2ba6a0, roughness: 0.85 });
    M.azulPint = pbr({ color: 0x2f62b5, roughness: 0.6 });
    M.grava = pbr({ color: 0x8c8f92, map: T.rock, roughness: 1 });
    M.maquina = pbr({ color: 0xb9bdc0, roughness: 0.5, metalness: 0.4 });
    M.sueloInt = pbr({ color: 0xd9d5cc, roughness: 0.35 });
    M.membrana = pbr({ color: 0xb5cad6, roughness: 0.75 });
    M.maderaClara = pbr({ color: 0x8a6a48, roughness: 0.6 });
    M.teal = pbr({ color: 0x5f8f8c, roughness: 0.85 });
    M.lampara = pbr({ color: 0xfff3dc, emissive: 0xffd9a0, emissiveIntensity: 0.4, roughness: 1 });
    M.paredInt = pbr({ color: 0xf1ede4, roughness: 0.9, envMapIntensity: 0.3 });
    M.sueloInt.envMapIntensity = 0.5;
    M.mantel.envMapIntensity = 0.55;
    M.muroAzul = pbr({ color: 0xe6eff4, map: T.cal, normalMap: T.calN, normalScale: ns(0.8), roughness: 0.96 });

    function mesh(geo, mat, x, y, z, parent, opts) {
      var m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      opts = opts || {};
      m.castShadow = opts.cast !== false;
      m.receiveShadow = opts.receive !== false;
      (parent || scene).add(m);
      return m;
    }
    function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
    // caja con UV en unidades reales, para que la textura no se estire
    function tbox(w, h, d, tile) {
      var g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (var f = 0; f < 6; f++) for (var i = 0; i < 4; i++) {
        var k = f * 4 + i;
        uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
      }
      return g;
    }
    function facet(g) { var n = g.toNonIndexed(); n.computeVertexNormals(); return n; }
    function xf(g, x, y, z, rx, ry, rz) {
      var c = g.clone(), m = new THREE.Matrix4();
      m.compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(1, 1, 1));
      c.applyMatrix4(m);
      return c;
    }
    function merge(list) {
      var pos = [], nor = [], uv = [];
      list.forEach(function (g0) {
        var g = g0.index ? g0.toNonIndexed() : g0;
        Array.prototype.push.apply(pos, g.attributes.position.array);
        Array.prototype.push.apply(nor, g.attributes.normal.array);
        if (g.attributes.uv) Array.prototype.push.apply(uv, g.attributes.uv.array);
        else for (var i = 0; i < g.attributes.position.count * 2; i++) uv.push(0);
      });
      var out = new THREE.BufferGeometry();
      out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      return out;
    }
    function instanced(geo, mat, n, parent, cast) {
      var im = new THREE.InstancedMesh(geo, mat, n);
      im.castShadow = cast !== false;
      im.receiveShadow = true;
      (parent || scene).add(im);
      return im;
    }
    // suelda vértices repetidos para poder calcular normales suaves reales
    function weld(g) {
      var p = g.attributes.position, uv = g.attributes.uv, map = {}, pos = [], uvs = [], idx = [];
      for (var i = 0; i < p.count; i++) {
        var key = Math.round(p.getX(i) * 1e4) + "_" + Math.round(p.getY(i) * 1e4) + "_" + Math.round(p.getZ(i) * 1e4);
        var k = map[key];
        if (k === undefined) {
          k = pos.length / 3;
          map[key] = k;
          pos.push(p.getX(i), p.getY(i), p.getZ(i));
          uvs.push(uv.getX(i), uv.getY(i));
        }
        idx.push(k);
      }
      var out = new THREE.BufferGeometry();
      out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      out.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      out.setIndex(idx);
      return out;
    }
    // esfera irregular para rocas, copas y arbustos.
    // strata > 0 marca estratos horizontales (roca); ao oscurece la parte baja (follaje)
    function blob(detail, amount, freq, squash, strata, ao) {
      var g = weld(new THREE.IcosahedronGeometry(1, detail)), p = g.attributes.position, v = new THREE.Vector3(), i;
      var col = new Float32Array(p.count * 3), uv = g.attributes.uv;
      for (i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        var n = fbm(v.x * freq + 11.3, v.y * freq + v.z * freq * 1.7 + 3.1);
        var n2 = fbm(v.z * freq * 2.7 + 5.2, v.x * freq * 2.7 - v.y * freq * 2.1);
        v.multiplyScalar(1 + (n - 0.5) * amount + (n2 - 0.5) * amount * 0.45);
        if (strata) {
          // aristas y estratos: la roca de Les Rotes rompe en lajas
          var ridge = 1 - Math.abs(2 * fbm(v.x * freq * 1.9 + 7.7, v.z * freq * 1.9 + v.y * 2.3) - 1);
          v.multiplyScalar(1 + (ridge - 0.5) * amount * 0.5);
          v.y = lerp(v.y, Math.round(v.y * strata) / strata, 0.85);
        }
        if (squash) v.y *= squash;
        p.setXYZ(i, v.x, v.y, v.z);
        var shade = ao ? lerp(1 - ao, 1, smooth(-0.7, 0.5, v.y / (squash || 1))) * (0.9 + n2 * 0.2) : 1;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade;
        uv.setXY(i, (v.x + v.z * 0.4) * (strata ? 1.5 : 0.6), (v.y + v.z * 0.7) * (strata ? 1.5 : 0.6));
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    }
    // cubierta a cuatro aguas con UV a lo largo de la pendiente
    function hipRoof(w, d, h, tile) {
      var hw = w / 2, hd = d / 2, pos = [], uv = [];
      var corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
      for (var i = 0; i < 4; i++) {
        var a = corners[i], b = corners[(i + 1) % 4];
        var base = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
        var run = i % 2 === 0 ? hd : hw, slope = Math.sqrt(run * run + h * h);
        pos.push(b[0], 0, b[1], a[0], 0, a[1], 0, h, 0);
        uv.push(base / tile, 0, 0, 0, base / 2 / tile, slope / tile);
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      return g;
    }

    /* ================= cielo ================= */
    var SKY_R = 20000;
    var skyU = {
      uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
      uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uGlowAmt: { value: 0.3 }, uCloud: { value: 0.4 }, uTime: { value: 0 }, uStars: { value: 0 }, uDisc: { value: 20 }, uDiscCos: { value: 0.9996 }
    };
    function skyMaterial(isEnv) {
      var u = {};
      Object.keys(skyU).forEach(function (k) { u[k] = skyU[k]; });
      u.uBoost = { value: 1 };
      return new THREE.ShaderMaterial({
        uniforms: u,
        side: THREE.BackSide, depthWrite: false, depthTest: !isEnv, fog: false,
        vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: [
          "uniform float uBoost; varying vec3 vDir;",
          SKY_GLSL,
          "void main(){",
          "  vec3 d = normalize(vDir);",
          "  vec3 c = skyClouds(skyBase(d), d);",
          isEnv
            ? "  c = mix(c, uGround, smoothstep(0.0, -0.25, d.y));"
            : [
              "  float sd = dot(d, uSunDir);",
              "  c += uSunCol * (smoothstep(uDiscCos, uDiscCos + 0.00012, sd) * uDisc + pow(max(sd, 0.0), 220.0) * 0.6);",
              "  vec2 sp = d.xz / (abs(d.y) + 0.35) * 190.0;",
              "  float st = step(0.9982, hash21(floor(sp))) * smoothstep(0.02, 0.25, d.y);",
              "  c += vec3(st) * uStars * (0.6 + 0.4 * sin(uTime * 2.0 + sp.x));"
            ].join("\n"),
          "  gl_FragColor = vec4(c * uBoost, 1.0);",
          "  #include <tonemapping_fragment>",
          "  #include <colorspace_fragment>",
          "}"
        ].join("\n")
      });
    }
    var skyMat = skyMaterial(false);
    var sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 48, 24), skyMat);
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);

    // el mismo cielo, sin disco solar, ilumina la escena como mapa de entorno
    var envScene = new THREE.Scene();
    var envMat = skyMaterial(true);
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 32, 16), envMat));
    var pmrem = new THREE.PMREMGenerator(renderer);
    var envRT = null;
    function updateEnv() {
      var old = envRT;
      envRT = pmrem.fromScene(envScene, 0, 1, SKY_R * 1.3);
      scene.environment = envRT.texture;
      if (old) old.dispose();
    }

    /* ================= luces ================= */
    var hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.3);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
    (function () {
      var sc = sun.shadow.camera;
      sc.left = -42; sc.right = 46; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 300;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.05;
    })();
    scene.add(sun);
    scene.add(sun.target);
    sun.target.position.set(6, 3, -5);

    var lampLights = [];
    [[10, 6.4, -14, 170], [-2.5, 6.6, -8, 80], [18, 6.6, -3, 110]].forEach(function (p) {
      var l = new THREE.PointLight(0xffb866, 0, 30, 2);
      l.position.set(p[0], p[1], p[2]);
      l.userData.max = p[3];
      scene.add(l);
      lampLights.push(l);
    });

    /* ================= terreno real: ortofoto y relieve ================= */
    // Suelo: ortofoto PNOA del IGN. Relieve: modelo digital del terreno. Edificios: OpenStreetMap.
    var GEO = window.__PEGOLI_GEO__;
    if (!GEO) throw new Error("faltan los datos del terreno (lib/geodata.js)");
    function prepGrid(g) {
      if (g.h) return g;
      var bin = atob(g.heights), n = g.n, a = new Float32Array(n * n);
      for (var i = 0; i < n * n; i++) a[i] = (bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)) / g.scale + g.h0;
      g.h = a; g.x0 = g.cx - g.size / 2; g.z0 = g.cz - g.size / 2; g.cell = g.size / n;
      return g;
    }
    var NEARG = prepGrid(GEO.near), MIDG = prepGrid(GEO.mid), FARG = prepGrid(GEO.far);
    function gridH(g, x, z) {
      var fx = clamp((x - g.x0) / g.cell - 0.5, 0, g.n - 1.001), fz = clamp((z - g.z0) / g.cell - 0.5, 0, g.n - 1.001);
      var i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, h = g.h, n = g.n;
      return lerp(lerp(h[j * n + i], h[j * n + i + 1], tx), lerp(h[(j + 1) * n + i], h[(j + 1) * n + i + 1], tx), tz);
    }
    function inGrid(g, x, z, m) { return x > g.x0 + m && x < g.x0 + g.size - m && z > g.z0 + m && z < g.z0 + g.size - m; }
    function landH(x, z) {
      if (inGrid(NEARG, x, z, 3)) return gridH(NEARG, x, z);
      if (inGrid(MIDG, x, z, 20)) return gridH(MIDG, x, z);
      if (inGrid(FARG, x, z, 60)) return gridH(FARG, x, z);
      return -3;
    }

    var pendingTex = 0;
    function ortoTex(uri, maxSize) {
      var t = new THREE.Texture();
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      pendingTex++;
      var img = new Image();
      img.onload = function () {
        var src = img;
        if (maxSize && img.width > maxSize) {
          var c = document.createElement("canvas");
          c.width = c.height = maxSize;
          c.getContext("2d").drawImage(img, 0, 0, maxSize, maxSize);
          src = c;
        }
        t.image = src;
        t.needsUpdate = true;
        pendingTex--;
        dirty = true;
      };
      img.onerror = function () { pendingTex--; };
      img.src = uri;
      return t;
    }
    var OT = {
      cerca: ortoTex(GEO.orto.cerca, 0),
      medio: ortoTex(GEO.orto.medio, isMobile ? 1024 : 0),
      lejos: ortoTex(GEO.orto.lejos, isMobile ? 1024 : 0)
    };
    function ortoUV(x, z) { return [(x - NEARG.x0) / NEARG.size, 1 - (z - NEARG.z0) / NEARG.size]; }

    function terrain(g, tex, adjust, extra) {
      var n = g.n, geo = new THREE.PlaneGeometry(1, 1, n - 1, n - 1), p = geo.attributes.position, uv = geo.attributes.uv;
      for (var k = 0; k < p.count; k++) {
        var i = k % n, j = Math.floor(k / n), x = g.x0 + (i + 0.5) * g.cell, z = g.z0 + (j + 0.5) * g.cell;
        p.setXYZ(k, x, adjust(x, z, g.h[k], i === 0 || j === 0 || i === n - 1 || j === n - 1), z);
        uv.setXY(k, (x - g.x0) / g.size, 1 - (z - g.z0) / g.size);
      }
      geo.computeVertexNormals();
      var o = { color: 0xd4d4d4, map: tex, roughness: 1 };
      if (extra) for (var q in extra) o[q] = extra[q];
      var mat = pbr(o);
      if (extra && extra.normalMap) {
        // la ortofoto se queda corta a un metro de distancia: se le suma grano de roca
        mat.onBeforeCompile = function (sh) {
          sh.uniforms.uDetail = { value: T.rock };
          sh.fragmentShader = "uniform sampler2D uDetail;\n" + sh.fragmentShader.replace("#include <map_fragment>",
            "#include <map_fragment>\n  diffuseColor.rgb *= mix(vec3(1.0), texture2D(uDetail, vMapUv * 170.0).rgb * 1.65, 0.75);");
        };
      }
      return mesh(geo, mat, 0, 0, 0, scene, { cast: false });
    }
    (function () {
      var detail = T.rockN.clone();
      detail.repeat.set(64, 64);
      detail.needsUpdate = true;
      terrain(NEARG, OT.cerca, function (x, z, h, border) { return border ? Math.min(h, gridH(MIDG, x, z) - 2.5) : h; }, { normalMap: detail, normalScale: ns(0.75) });
      terrain(MIDG, OT.medio, function (x, z, h, border) {
        if (inGrid(NEARG, x, z, 10)) return h - 5;
        return border ? Math.min(h, gridH(FARG, x, z) - 4) : h;
      }).receiveShadow = false;
      terrain(FARG, OT.lejos, function (x, z, h) { return inGrid(MIDG, x, z, 70) ? h - 30 : h; }).receiveShadow = false;
    })();

    /* ================= mar ================= */
    // la profundidad sale del mismo relieve; el fondo, de la propia ortofoto
    var depthTex = (function () {
      var n = NEARG.n, data = new Uint8Array(n * n * 4);
      for (var k = 0; k < n * n; k++) {
        var v = Math.round(clamp((NEARG.h[k] + 8) / 16, 0, 1) * 255);
        data[k * 4] = data[k * 4 + 1] = data[k * 4 + 2] = v; data[k * 4 + 3] = 255;
      }
      var t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
      t.magFilter = t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      return t;
    })();
    var seaU = {};
    Object.keys(skyU).forEach(function (k) { seaU[k] = skyU[k]; });
    seaU.uDepth = { value: depthTex };
    seaU.uOrto = { value: OT.cerca };
    seaU.uNearRect = { value: new THREE.Vector4(NEARG.x0, NEARG.z0, 1 / NEARG.size, 1 / NEARG.size) };
    seaU.uDeep = { value: new THREE.Color() };
    seaU.uShallow = { value: new THREE.Color() };
    seaU.uWaterLight = { value: new THREE.Color() };
    seaU.uFogCol = { value: new THREE.Color() };
    seaU.uFogD = { value: 0.0002 };
    seaU.uBoost = { value: 1 };
    var seaMat = new THREE.ShaderMaterial({
      uniforms: seaU,
      fog: false,
      defines: isMobile ? { LOW: 1 } : {},
      vertexShader: "varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: [
        "uniform sampler2D uDepth; uniform sampler2D uOrto; uniform vec4 uNearRect; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uWaterLight; uniform vec3 uFogCol; uniform float uFogD; uniform float uBoost;",
        "varying vec3 vWorld;",
        SKY_GLSL,
        "vec2 waveGrad(vec2 p, float t, float dist){",
        "  vec2 g = vec2(0.0);",
        "  vec2 d1 = normalize(vec2(0.25, 1.0)); g += d1 * 0.3 * 0.09 * cos(dot(p, d1) * 0.3 + t * 0.8);",
        "  vec2 d2 = normalize(vec2(-0.6, 1.0)); g += d2 * 0.72 * 0.04 * cos(dot(p, d2) * 0.72 + t * 1.2);",
        "  vec2 d3 = normalize(vec2(1.0, 0.35)); g += d3 * 1.6 * 0.016 * cos(dot(p, d3) * 1.6 + t * 1.7);",
        "  float e = 0.14;",
        "  vec2 q = p * 0.8 + vec2(t * 0.26, t * 0.16);",
        "  float n0 = fbm3(q);",
        "  g += vec2(fbm3(q + vec2(e, 0.0)) - n0, fbm3(q + vec2(0.0, e)) - n0) / e * 0.26 / (1.0 + dist * 0.01);",
        "  #ifndef LOW",
        "  vec2 q2 = p * 3.6 - vec2(t * 0.42, t * 0.34);",
        "  float m0 = fbm3(q2);",
        "  g += vec2(fbm3(q2 + vec2(e, 0.0)) - m0, fbm3(q2 + vec2(0.0, e)) - m0) / e * 0.08 / (1.0 + dist * 0.04);",
        "  #endif",
        "  return g;",
        "}",
        "void main(){",
        "  vec3 toCam = cameraPosition - vWorld;",
        "  float dist = length(toCam);",
        "  vec3 V = toCam / dist;",
        "  vec2 g = waveGrad(vWorld.xz, uTime, dist);",
        "  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));",
        "  vec2 uvn = (vWorld.xz - uNearRect.xy) * uNearRect.zw;",
        "  float wN = smoothstep(0.0, 0.05, uvn.x) * smoothstep(1.0, 0.95, uvn.x) * smoothstep(0.0, 0.05, uvn.y) * smoothstep(1.0, 0.95, uvn.y);",
        "  vec2 uvc = clamp(uvn, 0.0, 1.0);",
        "  float hgt = mix(-7.0, -8.0 + texture2D(uDepth, uvc).r * 16.0, wN);",
        "  float depth = max(-hgt, 0.0);",
        // color del agua: profundidad + lo que se ve del fondo en la ortofoto
        "  vec3 body = mix(uShallow, uDeep, 1.0 - exp(-depth * 0.42));",
        "  vec3 bed = texture2D(uOrto, vec2(uvc.x, 1.0 - uvc.y)).rgb;",
        "  body = mix(body, bed * 1.7 + uShallow * 0.22, wN * (0.15 + 0.6 * exp(-depth * 0.5)));",
        "  body *= uWaterLight * (0.72 + 0.28 * max(dot(N, uSunDir), 0.0));",
        "  vec3 R = reflect(-V, N); R.y = abs(R.y);",
        "  #ifdef LOW",
        "  vec3 refl = skyBase(R);",
        "  #else",
        "  vec3 refl = skyClouds(skyBase(R), R);",
        "  #endif",
        "  float F = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);",
        "  vec3 col = mix(body, refl, clamp(F, 0.0, 0.9));",
        "  float s = max(dot(R, uSunDir), 0.0);",
        "  col += uSunCol * (pow(s, 380.0) * 5.0 + pow(s, 36.0) * 0.14);",
        // espuma en la orilla y contra las rocas
        "  float fn = fbm3(vWorld.xz * 1.1 + vec2(uTime * 0.2, -uTime * 0.11));",
        "  float shore = (1.0 - smoothstep(0.0, 0.6, depth)) * wN;",
        "  float lap = 0.5 + 0.5 * sin(uTime * 0.85 - depth * 5.0 + fn * 4.0);",
        "  float foam = smoothstep(0.62, 0.96, shore * (0.5 + 0.5 * lap) + fn * 0.4 - 0.06);",
        "  col = mix(col, vec3(0.95) * (uWaterLight * 0.75 + uSunCol * 0.25), clamp(foam, 0.0, 1.0) * 0.6);",
        "  float fogF = 1.0 - exp(-uFogD * uFogD * dist * dist);",
        "  col = mix(col, uFogCol, fogF);",
        "  gl_FragColor = vec4(col * uBoost, 1.0);",
        "  #include <tonemapping_fragment>",
        "  #include <colorspace_fragment>",
        "}"
      ].join("\n")
    });
    (function () {
      var g = new THREE.PlaneGeometry(70000, 70000);
      g.rotateX(-Math.PI / 2);
      mesh(g, seaMat, 0, 0, -20000, scene, { cast: false, receive: false });
    })();

    /* ================= geometría auxiliar ================= */
    function shapeOf(poly) {
      var s = new THREE.Shape();
      poly.forEach(function (p, i) { if (i) s.lineTo(p[0], -p[1]); else s.moveTo(p[0], -p[1]); });
      return s;
    }
    function inflate(poly, d) {
      var cx = 0, cz = 0;
      poly.forEach(function (p) { cx += p[0] / poly.length; cz += p[1] / poly.length; });
      return poly.map(function (p) { var vx = p[0] - cx, vz = p[1] - cz, l = Math.sqrt(vx * vx + vz * vz) || 1; return [p[0] + (vx / l) * d, p[1] + (vz / l) * d]; });
    }
    // prisma vertical sobre un polígono en planta, con UV en metros / tile
    function prismGeo(poly, y0, y1, tile) {
      var g = new THREE.ExtrudeGeometry(shapeOf(poly), { depth: y1 - y0, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      g.translate(0, y0, 0);
      var uv = g.attributes.uv, t = tile || 2.5;
      for (var i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / t, uv.getY(i) / t);
      return g;
    }
    function prism(poly, y0, y1, mat, tile, parent, opts) { return mesh(prismGeo(poly, y0, y1, tile), mat, 0, 0, 0, parent, opts); }
    function seg(a, b) {
      var dx = b[0] - a[0], dz = b[1] - a[1];
      return { len: Math.sqrt(dx * dx + dz * dz), ang: Math.atan2(dx, dz), cx: (a[0] + b[0]) / 2, cz: (a[1] + b[1]) / 2, dx: dx, dz: dz };
    }
    function wall(a, b, y0, y1, th, mat, parent, tile) {
      var s = seg(a, b), m = mesh(tbox(th, y1 - y0, s.len, tile || 2.5), mat, s.cx, (y0 + y1) / 2, s.cz, parent);
      m.rotation.y = s.ang;
      return m;
    }

    /* ================= edificios vecinos y arbolado ================= */
    (function () {
      var rP = [], rU = [], wP = [], wU = [], wC = [], c = new THREE.Color();
      var tones = [0xf4efe6, 0xe9dfcc, 0xf7f3ea, 0xe2d2b6, 0xf1e9dc, 0xdcc7a6, 0xead8c8, 0xefe9df];
      GEO.buildings.forEach(function (b, bi) {
        var pts = [], minH = 1e9, maxH = -1e9, i;
        for (i = 1; i < b.length; i += 2) {
          pts.push([b[i], b[i + 1]]);
          var hh = landH(b[i], b[i + 1]);
          minH = Math.min(minH, hh); maxH = Math.max(maxH, hh);
        }
        var lv = b[0] === 2 ? 1 + Math.floor(hash2(b[1], b[2]) * 2.4) : b[0];
        var base = minH - 0.8, top = maxH + lv * 2.9 + 0.4 + hash2(b[2], b[1]) * 0.7;
        var g = new THREE.ExtrudeGeometry(shapeOf(pts), { depth: top - base, bevelEnabled: false });
        g.rotateX(-Math.PI / 2);
        g.translate(0, base, 0);
        var p = g.attributes.position, uv = g.attributes.uv;
        c.setHex(tones[Math.floor(hash2(b[1] * 1.3, b[2] * 0.7) * tones.length)]).multiplyScalar(0.9 + hash2(b[2], b[1] + 5) * 0.12);
        g.groups.forEach(function (gr) {
          for (var k = gr.start; k < gr.start + gr.count; k += 3) {
            var isCap = gr.materialIndex === 0;
            if (isCap && p.getY(k) < base + 0.1) continue; // tapa inferior
            for (var q = k; q < k + 3; q++) {
              var x = p.getX(q), y = p.getY(q), z = p.getZ(q);
              if (isCap) { rP.push(x, y, z); var o = ortoUV(x, z); rU.push(o[0], o[1]); }
              else { wP.push(x, y, z); wU.push(uv.getX(q) / 5.4, (y - base) / 3.0); wC.push(c.r, c.g, c.b); }
            }
          }
        });
        g.dispose();
      });
      function build(P, U, C) {
        var g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
        if (C) g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
        g.computeVertexNormals();
        return g;
      }
      mesh(build(rP, rU), pbr({ color: 0xdadada, map: OT.cerca, roughness: 1 }), 0, 0, 0, scene, { cast: false });
      mesh(build(wP, wU, wC), pbr({ color: 0xffffff, map: T.fachada, vertexColors: true, roughness: 0.95 }), 0, 0, 0, scene, { cast: false });
    })();

    // arbolado: una copa irregular de varios lóbulos sobre cada mancha de árboles de la ortofoto
    (function () {
      var lobe = blob(1, 1.0, 2.1, 1, 0, 0.62), cp = lobe.attributes.position, cc = lobe.attributes.color, cu = lobe.attributes.uv, ci = lobe.index.array;
      var P = [], U = [], C = [], I = [], trunks = [], d = new THREE.Object3D(), col = new THREE.Color();
      var greens = [0x40603a, 0x4f6d3e, 0x5f7448, 0x38553a, 0x6b7a50];
      GEO.trees.forEach(function (t, k) {
        if (isMobile && k % 2) return;
        var x = t[0], z = t[1], r = t[2], y = landH(x, z), hgt = 1.6 + r * 0.7 + hash2(x, z) * 1.8;
        col.setHex(greens[Math.floor(hash2(x * 3.1, z * 1.7) * greens.length)]).multiplyScalar(0.85 + hash2(z, x) * 0.35);
        for (var b = 0; b < 3; b++) {
          var a = hash2(z + b, x) * 6.28, ca = Math.cos(a), sa = Math.sin(a), base = P.length / 3;
          var ox = (hash2(x, b + 1.3) - 0.5) * r * 0.9, oz = (hash2(b + 2.7, z) - 0.5) * r * 0.9, rr = r * (0.55 + hash2(x + b, z - b) * 0.3);
          for (var i = 0; i < cp.count; i++) {
            var vx = cp.getX(i), vy = cp.getY(i), vz = cp.getZ(i), s = cc.getX(i);
            P.push(x + ox + (vx * ca - vz * sa) * rr, y + hgt + b * 0.35 + vy * rr * 0.62, z + oz + (vx * sa + vz * ca) * rr);
            U.push(cu.getX(i) * 1.5, cu.getY(i) * 1.5);
            C.push(col.r * s, col.g * s, col.b * s);
          }
          for (var q = 0; q < ci.length; q++) I.push(ci[q] + base);
        }
        trunks.push([x, y, z, hgt]);
      });
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(C, 3));
      g.setIndex(I);
      g.computeVertexNormals();
      mesh(g, M.pino, 0, 0, 0, scene, { cast: false }); // quedan fuera de la zona de sombras
      var im = instanced(new THREE.CylinderGeometry(0.14, 0.2, 1, 5), M.tronco, trunks.length, scene, false);
      trunks.forEach(function (t, i) {
        d.position.set(t[0], t[1] + t[3] / 2 - 0.2, t[2]);
        d.scale.set(1, t[3] + 0.4, 1);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      });
    })();

    /* ================= el restaurante ================= */
    // Planta tomada de la ortofoto (x = este, z = sur, metros desde el centro del edificio).
    var Y_PT = 2.6, Y_UP = 4.2;
    var PT = [[-5.2, -12.2], [-1.2, -16.3], [10, -18.8], [20.8, -18.6], [21.6, -8.8], [3.5, -8.8], [2.2, -12.6]]; // terraza de sombrillas
    var WP = [[-7.5, -10.8], [1.6, -12.8], [3.1, -5.0], [-6.0, -3.2]];      // porche cubierto
    var TP = [[-11, -2.8], [-3.2, -3.8], [-2.2, 3.8], [-10.2, 4.8]];        // pabellón de teja
    var GB = [[0.5, -8.8], [12.5, -8.8], [12.5, 5.5], [0.5, 5.5]];          // cuerpo central
    var DR = [[12.5, -7.5], [20.5, -8.5], [24.2, -5], [24.6, 0], [20, 2.7], [12.5, 2.7]]; // comedor acristalado
    var SWG = [[0.5, 5.5], [12.5, 5.5], [12.5, 2.7], [20, 2.7], [24.6, 0], [28.5, 9], [17, 12.8], [0.5, 7.2]]; // cuerpo de la calle
    var BODY = [[-13, -1], [-11.2, -3], [-7.5, -10.8], [1.6, -12.8], [2.3, -8.8], [12.5, -8.8], [12.5, -7.5], [20.5, -8.5], [24.2, -5], [24.6, 0],
      [28.5, 9], [17, 12.8], [0.5, 7.2], [-2.2, 3.9], [-10.2, 4.8], [-12.5, 5.2]];

    var resto = new THREE.Group();
    scene.add(resto);

    var balusterGeo = (function () {
      var pts = [[0.07, 0], [0.07, 0.07], [0.042, 0.11], [0.052, 0.2], [0.085, 0.33], [0.085, 0.4], [0.052, 0.52], [0.042, 0.62], [0.07, 0.66], [0.07, 0.72]]
        .map(function (p) { return new THREE.Vector2(p[0], p[1]); });
      var g = new THREE.LatheGeometry(pts, 4);
      g.rotateY(Math.PI / 4);
      return facet(g);
    })();
    var potGeo = new THREE.LatheGeometry([[0.0, 0], [0.2, 0], [0.34, 0.3], [0.36, 0.38], [0.31, 0.4], [0.0, 0.4]].map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 14);

    // balaustrada blanca; s escala la altura (1 = 1,1 m)
    function balustrade(runs, y, parent, s) {
      s = s || 1;
      var list = [];
      runs.forEach(function (r) {
        var q = seg(r.a, r.b);
        mesh(tbox(0.36, 0.11, q.len, 2.5), M.cal, q.cx, y + 0.95 * s, q.cz, parent).rotation.y = q.ang;
        mesh(tbox(0.3, 0.1, q.len, 2.5), M.cal, q.cx, y + 0.05, q.cz, parent).rotation.y = q.ang;
        var nP = Math.max(1, Math.round(q.len / 3.0)), i;
        for (i = 0; i <= nP; i++) {
          var px = r.a[0] + (q.dx * i) / nP, pz = r.a[1] + (q.dz * i) / nP;
          mesh(tbox(0.4, 1.06 * s, 0.4, 2.5), M.cal, px, y + 0.53 * s, pz, parent).rotation.y = q.ang;
          mesh(tbox(0.5, 0.08, 0.5, 2.5), M.cal, px, y + 1.08 * s, pz, parent).rotation.y = q.ang;
        }
        var nB = Math.floor(q.len / 0.3);
        for (i = 1; i < nB; i++) {
          var t = i / nB, sg = t * nP;
          if (Math.abs(sg - Math.round(sg)) * (q.len / nP) < 0.27) continue;
          list.push([r.a[0] + q.dx * t, r.a[1] + q.dz * t, q.ang]);
        }
      });
      var im = instanced(balusterGeo, M.cal, list.length, parent), d = new THREE.Object3D();
      list.forEach(function (b, i) {
        d.position.set(b[0], y + 0.1, b[1]);
        d.rotation.set(0, b[2], 0);
        d.scale.set(1, 1.1 * s, 1);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      });
    }
    function lantern(x, y, z, parent) {
      mesh(new THREE.CylinderGeometry(0.11, 0.07, 0.24, 4), M.farol, x, y, z, parent, { cast: false }).rotation.y = Math.PI / 4;
      mesh(facet(new THREE.ConeGeometry(0.17, 0.13, 4)), M.hierro, x, y + 0.185, z, parent).rotation.y = Math.PI / 4;
      mesh(box(0.04, 0.04, 0.2), M.hierro, x, y + 0.1, z + 0.1, parent, { cast: false });
    }
    function glassWall(a, b, y0, y1, parent, mull) {
      var q = seg(a, b), h = y1 - y0, g = new THREE.Group(), i;
      g.position.set(q.cx, y0, q.cz);
      g.rotation.y = q.ang;
      parent.add(g);
      mesh(box(0.03, h, q.len), M.cristal2, 0, h / 2, 0, g, { cast: false });
      mesh(box(0.11, 0.3, q.len), M.marco, 0, 0.15, 0, g);
      mesh(box(0.11, 0.14, q.len), M.marco, 0, h - 0.07, 0, g);
      var n = Math.max(1, Math.round(q.len / (mull || 2.8)));
      for (i = 0; i <= n; i++) mesh(box(0.11, h, 0.08), M.marco, 0, h / 2, -q.len / 2 + (q.len * i) / n, g);
    }
    function windowUnit(x, y, z, w, h, rotY, parent) {
      var g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = rotY || 0;
      parent.add(g);
      mesh(box(w, h, 0.06), M.vidrio, 0, 0, 0, g, { cast: false });
      var f = 0.07;
      mesh(box(w + f * 2, f, 0.12), M.blancoMate, 0, h / 2 + f / 2, 0, g);
      mesh(box(w + f * 2, f, 0.18), M.blancoMate, 0, -h / 2 - f / 2, 0.02, g);
      mesh(box(f, h, 0.12), M.blancoMate, -w / 2 - f / 2, 0, 0, g);
      mesh(box(f, h, 0.12), M.blancoMate, w / 2 + f / 2, 0, 0, g);
      mesh(box(0.04, h, 0.08), M.blancoMate, 0, 0, 0, g, { cast: false });
    }

    // zócalos: hormigón oscuro contra el agua y muro encalado encima
    prism(inflate(PT, 0.06), -3, 1.0, M.hormigon, 2.5, resto);
    prism(PT, 0.9, Y_PT, M.cal, 2.5, resto);
    prism(PT, Y_PT, Y_PT + 0.06, M.losa, 2.6, resto, { cast: false });
    prism(inflate(BODY, 0.05), -2, 1.4, M.hormigon, 2.5, resto);
    prism(BODY, 1.3, Y_UP, M.cal, 2.5, resto);
    prism(BODY, Y_UP, Y_UP + 0.05, M.suelo, 1.6, resto, { cast: false });

    // terraza de sombrillas: peto bajo con balaustres hacia el mar, cristal al este
    balustrade([{ a: PT[0], b: PT[1] }, { a: PT[1], b: PT[2] }, { a: PT[2], b: PT[3] }], Y_PT + 0.06, resto, 0.7);
    (function () {
      var q = seg(PT[3], PT[4]), g = new THREE.Group(), i;
      g.position.set(q.cx, Y_PT + 0.06, q.cz);
      g.rotation.y = q.ang;
      resto.add(g);
      mesh(box(0.03, 0.85, q.len), M.cristal, 0, 0.5, 0, g, { cast: false });
      mesh(box(0.08, 0.06, q.len), M.blancoMate, 0, 0.98, 0, g);
      mesh(tbox(0.22, 0.14, q.len, 2.5), M.cal, 0, 0.07, 0, g);
      for (i = 0; i <= 5; i++) mesh(box(0.06, 0.95, 0.06), M.blancoMate, 0, 0.5, -q.len / 2 + (q.len * i) / 5, g);
    })();

    // sombrillas de brezo (posiciones de la ortofoto), mesas, sillas y hamacas
    (function () {
      var canopy = new THREE.LatheGeometry([[0.02, 0.62], [0.45, 0.54], [1.05, 0.33], [1.5, 0.1], [1.68, -0.08], [1.6, -0.15], [1.15, 0.02], [0.08, 0.3]].map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 30);
      var cp = canopy.attributes.position, i, v;
      for (i = 0; i < cp.count; i++) {
        var rad = Math.sqrt(cp.getX(i) * cp.getX(i) + cp.getZ(i) * cp.getZ(i));
        if (rad > 1.4) { v = 1 + (hash2(cp.getX(i) * 9, cp.getZ(i) * 9) - 0.5) * 0.07; cp.setXYZ(i, cp.getX(i) * v, cp.getY(i) - hash2(cp.getZ(i) * 7, cp.getX(i) * 5) * 0.07, cp.getZ(i) * v); }
      }
      canopy.computeVertexNormals();
      var uvc = canopy.attributes.uv;
      for (i = 0; i < uvc.count; i++) uvc.setXY(i, uvc.getX(i) * 6, uvc.getY(i) * 1.5);
      var tuft = new THREE.CylinderGeometry(0.1, 0.17, 0.62, 10);
      var cap = new THREE.CylinderGeometry(0.2, 0.12, 0.12, 10);
      var spots = [[-2.0, -13.9], [3.6, -15.3], [6.6, -12.3], [6.2, -15.6], [9.4, -12.0], [11.2, -14.6], [10.2, -17.4], [14.5, -17.0], [18.3, -16.8], [16.3, -13.4], [13.8, -10.6], [19.0, -11.2]];
      var tChair = (function () {
        var tube = function (len) { return new THREE.CylinderGeometry(0.016, 0.016, len, 6); };
        return merge([
          xf(tube(0.44), -0.2, 0.22, 0.18), xf(tube(0.44), 0.2, 0.22, 0.18), xf(tube(0.84), -0.2, 0.42, -0.2, -0.08), xf(tube(0.84), 0.2, 0.42, -0.2, -0.08),
          xf(box(0.44, 0.03, 0.42), 0, 0.44, 0), xf(box(0.44, 0.34, 0.03), 0, 0.68, -0.22, -0.08),
          xf(box(0.03, 0.03, 0.4), -0.21, 0.62, -0.02), xf(box(0.03, 0.03, 0.4), 0.21, 0.62, -0.02)
        ]);
      })();
      var chairs = instanced(tChair, M.plastico, spots.length * 4, resto), d = new THREE.Object3D(), k = 0, y = Y_PT + 0.06;
      spots.forEach(function (q, n) {
        mesh(new THREE.CylinderGeometry(0.055, 0.07, 2.5, 8), M.tronco, q[0], y + 1.25, q[1], resto);
        mesh(canopy, M.brezoOscuro, q[0], y + 2.5, q[1], resto).rotation.y = n;
        mesh(tuft, M.brezoOscuro, q[0], y + 3.38, q[1], resto);
        mesh(cap, M.brezoOscuro, q[0], y + 3.74, q[1], resto);
        var tx = q[0] + 0.75, tz = q[1] + 0.35;
        mesh(box(0.75, 0.035, 0.75), M.plastico, tx, y + 0.74, tz, resto);
        mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6), M.plastico, tx, y + 0.37, tz, resto);
        mesh(box(0.42, 0.03, 0.42), M.plastico, tx, y + 0.02, tz, resto, { cast: false });
        for (var s = 0; s < 4; s++) {
          var a = (s * Math.PI) / 2 + (hash2(n, s) - 0.5) * 0.5, rr = 0.78 + hash2(s, n) * 0.12;
          d.position.set(tx + Math.sin(a) * rr, y, tz + Math.cos(a) * rr);
          d.rotation.set(0, a + Math.PI, 0);
          d.updateMatrix();
          chairs.setMatrixAt(k++, d.matrix);
        }
      });
      // hamacas a lo largo del borde norte
      for (i = 0; i < 6; i++) {
        var t = (i + 0.6) / 6.6, lx = lerp(PT[1][0], PT[3][0], t) + 0.6, lz = lerp(PT[1][1], PT[3][1] + 1.2, t) + 1.5 + (i < 2 ? 0.9 - i * 0.3 : 0);
        var l = new THREE.Group();
        l.position.set(lx, y, lz);
        l.rotation.y = Math.PI + 0.12 * Math.sin(i * 2.1);
        resto.add(l);
        mesh(box(0.62, 0.06, 1.32), M.plastico, 0, 0.3, 0.15, l);
        mesh(box(0.62, 0.06, 0.62), M.plastico, 0, 0.45, -0.72, l).rotation.x = 0.55;
        [[-0.26, 0.6], [0.26, 0.6], [-0.26, -0.4], [0.26, -0.4]].forEach(function (g2) { mesh(box(0.05, 0.28, 0.05), M.plastico, g2[0], 0.14, g2[1], l); });
      }
      // pufs turquesa y bandera
      [[3.9, -10.2], [5.0, -9.9]].forEach(function (q) {
        mesh(box(0.7, 0.3, 0.7), M.plastico, q[0], y + 0.15, q[1], resto);
        mesh(box(0.72, 0.16, 0.72), M.turquesa, q[0], y + 0.38, q[1], resto);
      });
      mesh(new THREE.CylinderGeometry(0.025, 0.03, 4.6, 6), M.aluminio, 20.9, y + 2.3, -9.4, resto);
      var flag = mesh(new THREE.PlaneGeometry(0.95, 0.6), pbr({ color: 0xffffff, map: T.bandera, side: THREE.DoubleSide, roughness: 0.9 }), 21.4, y + 4.25, -9.4, resto);
      flag.rotation.y = 0.3;
    })();

    // porche cubierto sobre la terraza, con su escalera de peldaños blancos y canto azul
    (function () {
      prism(inflate(WP, 0.35), 7.0, 7.28, M.cal, 2.5, resto);
      [WP[0], WP[1], [(WP[0][0] + WP[1][0]) / 2, (WP[0][1] + WP[1][1]) / 2], WP[2], WP[3]].forEach(function (p) {
        mesh(tbox(0.38, 2.8, 0.38, 2.5), M.cal, p[0] * 0.97, Y_UP + 1.4, p[1] * 0.97 + 0.1, resto).rotation.y = 0.2;
      });
      wall(WP[3], WP[2], Y_UP, 7.0, 0.25, M.cal, resto);
      var e = seg(WP[0], WP[1]), ex = e.dx / e.len, ez = e.dz / e.len, nx = ez, nz = -ex; // normal hacia el mar
      var gap0 = [WP[1][0] - ex * 2.9, WP[1][1] - ez * 2.9];
      balustrade([{ a: WP[0], b: gap0 }, { a: WP[3], b: WP[0] }], Y_UP + 0.05, resto);
      var c0 = [WP[1][0] - ex * 1.65, WP[1][1] - ez * 1.65], rot = Math.atan2(-ez, ex), k;
      for (k = 0; k < 8; k++) {
        var hh = (k + 1) * 0.2, off = 0.14 + (7 - k) * 0.28;
        var st = mesh(tbox(2.2, hh, 0.3, 2.5), M.cal, c0[0] + nx * off, Y_PT + hh / 2, c0[1] + nz * off, resto);
        st.rotation.y = rot;
        var nos = mesh(box(2.2, 0.035, 0.05), M.azulPint, c0[0] + nx * (off + 0.13), Y_PT + hh - 0.02, c0[1] + nz * (off + 0.13), resto, { cast: false });
        nos.rotation.y = rot;
      }
    })();

    // pabellón de teja junto a la calle
    (function () {
      prism(TP, Y_UP, 7.15, M.cal, 2.5, resto);
      var roof = mesh(hipRoof(9.4, 9.2, 1.9, 1.3), M.teja, -6.65, 7.15, 0.5, resto);
      roof.rotation.y = 0.128;
      mesh(box(8.4, 0.16, 8.2), M.madera, -6.65, 7.1, 0.5, resto).rotation.y = 0.128;
      windowUnit(-7.1, Y_UP + 1.5, -3.36, 1.3, 1.3, 0.128, resto);
      windowUnit(-10.72, Y_UP + 1.5, 1.0, 1.3, 1.3, Math.PI / 2 + 0.128, resto);
      balustrade([{ a: [-13, -1], b: [-12.5, 5.2] }, { a: [-11.2, -3], b: [-13, -1] }], Y_UP + 0.05, resto);
    })();

    // cuerpo central: cubierta técnica con máquinas, y barra con pérgola a pie de terraza
    (function () {
      prism(GB, Y_UP, 7.6, M.cal, 2.5, resto);
      prism(inflate(GB, -0.3), 7.6, 7.64, M.grava, 2.5, resto, { cast: false });
      [[GB[0], GB[1]], [GB[1], GB[2]], [GB[2], GB[3]], [GB[3], GB[0]]].forEach(function (s) { wall(s[0], s[1], 7.6, 8.0, 0.2, M.cal, resto); });
      [[3.2, -5.5, 1.6, 0.9, 1.0], [6.2, -5.2, 1.2, 1.1, 0.9], [9.5, -3.0, 2.0, 0.8, 1.1], [4.5, 1.0, 1.4, 1.0, 0.9], [8.6, 2.2, 1.0, 0.7, 0.8]].forEach(function (u) {
        mesh(box(u[2], u[3], u[4]), M.maquina, u[0], 7.64 + u[3] / 2, u[1], resto);
      });
      [3.6, 6.8, 10.0].forEach(function (x) { windowUnit(x, Y_UP + 1.55, -8.83, 1.5, 1.5, 0, resto); });
      lantern(2.0, Y_UP + 2.2, -8.95, resto);
      lantern(11.6, Y_UP + 2.2, -8.95, resto);
      // remate de bola con mástil, visible desde la terraza
      mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.1, 8), M.blancoMate, 1.0, 8.5, -8.3, resto);
      mesh(new THREE.SphereGeometry(0.3, 16, 12), M.blancoMate, 1.0, 9.2, -8.3, resto);
      mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 5), M.aluminio, 1.0, 10.1, -8.3, resto);
      // barra
      var y = Y_PT + 0.06;
      mesh(tbox(4.4, 1.05, 0.7, 1.2), M.piedra, 8.2, y + 0.52, -9.75, resto);
      mesh(box(4.6, 0.06, 0.86), M.madera, 8.2, y + 1.08, -9.75, resto);
      [[5.9, -11.3], [10.5, -11.3], [5.9, -9.0], [10.5, -9.0]].forEach(function (p) { mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.5, 7), M.tronco, p[0], y + 1.25, p[1], resto); });
      mesh(box(5.2, 0.08, 2.9), M.brezoOscuro, 8.2, y + 2.55, -10.15, resto);
      mesh(box(5.0, 0.1, 0.1), M.tronco, 8.2, y + 2.46, -11.3, resto);
    })();

    var candles;
    // comedor: paños de vidrio de suelo a techo, pilares de hormigón, mesas vestidas y lámparas
    (function () {
      var y0 = Y_UP + 0.05, y1 = 7.45, i;
      prism(DR, y0, y0 + 0.03, M.sueloInt, 1.2, resto, { cast: false });
      prism(inflate(DR, 0.45), y1, y1 + 0.3, M.cal, 2.5, resto);
      prism(inflate(DR, 0.25), y1 + 0.3, y1 + 0.34, M.membrana, 2.5, resto, { cast: false });
      for (i = 0; i < 4; i++) glassWall(DR[i], DR[i + 1], y0, y1, resto, i === 0 ? 2.7 : 2.4);
      wall(DR[4], DR[5], y0, y1, 0.25, M.paredInt, resto);
      wall(DR[5], DR[0], y0, y1, 0.25, M.paredInt, resto);
      prism(inflate(DR, -0.05), y1 - 0.06, y1 - 0.02, M.paredInt, 2.5, resto, { cast: false });
      var fill = new THREE.PointLight(0xfff1dc, 20, 20, 2);
      fill.position.set(17.6, y1 - 0.9, -2.2);
      scene.add(fill);
      [DR[0], DR[1], DR[2], DR[3], DR[4]].forEach(function (p) { mesh(tbox(0.46, y1 - y0, 0.46, 1.5), M.hormigonClaro, p[0] * 0.985 + 0.25, (y0 + y1) / 2, p[1] * 0.98, resto); });

      var skirt = facet(new THREE.CylinderGeometry(0.62 * Math.SQRT2, 0.68 * Math.SQRT2, 0.5, 4, 1, true));
      skirt.rotateY(Math.PI / 4);
      var clothGeo = merge([xf(facet(box(1.24, 0.03, 1.24)), 0, 0.775, 0), xf(skirt, 0, 0.51, 0)]);
      var sq = function (len) { return box(0.035, len, 0.035); };
      var woodChair = merge([
        xf(sq(0.46), -0.2, 0.23, 0.18), xf(sq(0.46), 0.2, 0.23, 0.18), xf(sq(0.95), -0.2, 0.475, -0.2, -0.07), xf(sq(0.95), 0.2, 0.475, -0.2, -0.07),
        xf(box(0.44, 0.04, 0.42), 0, 0.46, 0), xf(box(0.44, 0.06, 0.035), 0, 0.92, -0.235, -0.07),
        xf(box(0.035, 0.5, 0.02), 0, 0.68, -0.22, -0.07, 0, 0.62), xf(box(0.035, 0.5, 0.02), 0, 0.68, -0.22, -0.07, 0, -0.62)
      ]);
      var cushionGeo = xf(box(0.42, 0.05, 0.4), 0, 0.505, 0);
      var plateGeo = new THREE.CylinderGeometry(0.13, 0.09, 0.016, 16);
      var glassGeo = new THREE.LatheGeometry([[0.035, 0], [0.004, 0.012], [0.004, 0.09], [0.04, 0.13], [0.045, 0.2], [0.036, 0.23]].map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 10);
      // mesas del comedor y del porche
      var tables = [[15.0, -5.2, y0], [18.2, -5.7, y0], [21.4, -4.6, y0], [15.0, -1.6, y0], [18.4, -1.6, y0], [21.6, -1.0, y0], [15.2, 1.2, y0],
        [-4.6, -8.6, Y_UP + 0.05], [-1.2, -9.4, Y_UP + 0.05], [-3.6, -5.6, Y_UP + 0.05], [0.2, -6.4, Y_UP + 0.05]];
      var nT = tables.length;
      var cloth = instanced(clothGeo, M.mantel, nT, resto), leg = instanced(new THREE.CylinderGeometry(0.04, 0.04, 0.76, 8).translate(0, 0.38, 0), M.hierro, nT, resto);
      var chair = instanced(woodChair, M.maderaClara, nT * 4, resto), cush = instanced(cushionGeo, M.teal, nT * 4, resto);
      var plate = instanced(plateGeo, M.loza, nT * 4, resto, false), glass = instanced(glassGeo, M.cristal, nT * 4, resto, false);
      candles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcf7d, transparent: true, opacity: 0, fog: false }), nT);
      resto.add(candles);
      var d = new THREE.Object3D(), k = 0;
      tables.forEach(function (t, n) {
        d.scale.set(1, 1, 1);
        d.rotation.set(0, 0.12, 0);
        d.position.set(t[0], t[2], t[1]);
        d.updateMatrix();
        cloth.setMatrixAt(n, d.matrix);
        leg.setMatrixAt(n, d.matrix);
        d.position.set(t[0], t[2] + 0.86, t[1]);
        d.updateMatrix();
        candles.setMatrixAt(n, d.matrix);
        for (var s = 0; s < 4; s++) {
          var a = (s * Math.PI) / 2 + 0.12 + (hash2(n, s + 7) - 0.5) * 0.2, r = 0.93 + hash2(s, n + 3) * 0.08;
          d.rotation.set(0, a + Math.PI, 0);
          d.position.set(t[0] + Math.sin(a) * r, t[2], t[1] + Math.cos(a) * r);
          d.updateMatrix();
          chair.setMatrixAt(k, d.matrix);
          cush.setMatrixAt(k, d.matrix);
          d.rotation.set(0, 0, 0);
          d.position.set(t[0] + Math.sin(a) * 0.4, t[2] + 0.8, t[1] + Math.cos(a) * 0.4);
          d.updateMatrix();
          plate.setMatrixAt(k, d.matrix);
          d.position.set(t[0] + Math.sin(a + 0.55) * 0.36, t[2] + 0.792, t[1] + Math.cos(a + 0.55) * 0.36);
          d.updateMatrix();
          glass.setMatrixAt(k, d.matrix);
          k++;
        }
      });
      // lámparas colgantes
      [[15.0, -3.4], [18.4, -3.6], [21.6, -2.8], [16.8, 0.2]].forEach(function (p) {
        mesh(new THREE.SphereGeometry(0.3, 14, 10), M.lampara, p[0], y1 - 0.75, p[1], resto, { cast: false });
        mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.45, 4), M.hierro, p[0], y1 - 0.23, p[1], resto, { cast: false });
      });
      // aparadores entre ventanales
      [[13.2, -5.0], [13.2, -0.5]].forEach(function (p) { mesh(box(0.45, 0.85, 1.3), M.maderaClara, p[0], y0 + 0.43, p[1], resto); });
    })();

    // cuerpo de la calle, con la entrada
    (function () {
      prism(SWG, Y_UP, 7.5, M.cal, 2.5, resto);
      prism(inflate(SWG, -0.3), 7.5, 7.54, M.membrana, 2.5, resto, { cast: false });
      var a = SWG[7], b = SWG[6], q = seg(a, b), ux = q.dx / q.len, uz = q.dz / q.len, nx = -uz, nz = ux; // normal hacia la calle
      [3.2, 6.6, 13.0].forEach(function (t) { windowUnit(a[0] + ux * t + nx * 0.03, Y_UP + 1.55, a[1] + uz * t + nz * 0.03, 1.4, 1.4, -Math.atan2(uz, ux) + Math.PI, resto); });
      var dx = a[0] + ux * 9.8 + nx * 0.03, dz = a[1] + uz * 9.8 + nz * 0.03, rot = -Math.atan2(uz, ux) + Math.PI;
      mesh(box(1.7, 2.3, 0.08), M.madera, dx, Y_UP + 1.15, dz, resto).rotation.y = rot;
      var aw = mesh(new THREE.PlaneGeometry(2.6, 1.2), M.toldo, dx + nx * 0.55, Y_UP + 2.75, dz + nz * 0.55, resto);
      aw.rotation.set(-Math.PI / 2 + 0.4, rot, 0, "YXZ");
      lantern(a[0] + ux * 8.4 + nx * 0.15, Y_UP + 2.2, a[1] + uz * 8.4 + nz * 0.15, resto);
      lantern(a[0] + ux * 11.2 + nx * 0.15, Y_UP + 2.2, a[1] + uz * 11.2 + nz * 0.15, resto);
    })();

    // muro de la cala con el rótulo pintado
    (function () {
      var pts = [[25.0, 1.0], [27.4, 4.6], [29.5, 8.7], [29.9, 12.0]], i;
      for (i = 0; i < 3; i++) wall(pts[i], pts[i + 1], -0.5, 5.3 - i * 0.25, 0.45, M.muroAzul, resto);
      var q = seg(pts[1], pts[2]), nx = q.dz / q.len, nz = -q.dx / q.len; // cara que mira a la cala
      var sign = mesh(new THREE.PlaneGeometry(3.6, 2.1), pbr({ color: 0xffffff, map: T.rotulo, roughness: 0.95 }), q.cx + nx * 0.24, 3.55, q.cz + nz * 0.24, resto, { cast: false, receive: false });
      sign.rotation.y = Math.atan2(nx, nz);
      // coronación de piedra suelta
      var stone = blob(1, 0.6, 1.8, 0.6, 3, 0.2);
      for (i = 0; i < 9; i++) {
        var t = i / 8, s = mesh(stone, M.roca, lerp(pts[1][0], pts[3][0], t), 5.2 - t * 0.4, lerp(pts[1][1], pts[3][1], t), resto);
        s.scale.set(0.5 + hash2(i, 1) * 0.3, 0.28 + hash2(i, 2) * 0.15, 0.45 + hash2(i, 3) * 0.3);
        s.rotation.y = i * 1.7;
      }
    })();

    /* ================= palmeras ================= */
    var palms = [];
    var palmDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.palma, alphaTest: 0.35 });
    function palm(x, z, h, lean, yBase, scale) {
      var g = new THREE.Group(), sc = scale || 1;
      g.position.set(x, yBase === undefined ? landH(x, z) - 0.3 : yBase, z);
      g.scale.setScalar(sc);
      var pts = [], i;
      for (i = 0; i <= 6; i++) { var t = i / 6; pts.push(new THREE.Vector3(Math.sin(t * 1.3) * lean * h, t * h, 0)); }
      var trunk = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.2, 9, false), uv = trunk.attributes.uv;
      for (i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * h * 0.9, uv.getY(i) * 2);
      mesh(trunk, M.tronco, 0, 0, 0, g);
      var topP = pts[6];
      mesh(new THREE.SphereGeometry(0.34, 10, 8), M.tronco, topP.x, topP.y - 0.1, 0, g);
      var fronds = [], n = 17;
      for (i = 0; i < n; i++) {
        var f = new THREE.PlaneGeometry(1.15, 3.7, 2, 9), p = f.attributes.position, tier = i % 3;
        for (var k = 0; k < p.count; k++) {
          var yy = p.getY(k) + 1.85, tt = yy / 3.7, xx = p.getX(k);
          p.setXYZ(k, xx, yy * (1 - 0.12 * tt), (0.5 + tier * 0.45) * tt * tt * 2.1 - Math.abs(xx) * 0.32);
        }
        f.rotateX(0.55 + tier * 0.32 + rng() * 0.12);
        f.rotateY((i / n) * Math.PI * 2 + rng() * 0.3);
        f.computeVertexNormals();
        fronds.push(f);
      }
      var crown = new THREE.Mesh(merge(fronds), M.palma);
      crown.position.copy(topP);
      crown.castShadow = true;
      crown.customDepthMaterial = palmDepth;
      g.add(crown);
      g.rotation.y = rng() * 6;
      scene.add(g);
      palms.push({ crown: crown, phase: rng() * 6 });
      return g;
    }
    // palmeras del jardín de enfrente (posición aproximada sobre la ortofoto) y macetas de la terraza
    [[-31.5, 10, 6.5], [-27, 9, 7.2], [-29, 13.5, 5.8], [-18, 17.5, 7.5], [-15.5, 14.5, 6.4], [-10, 16, 7], [-5, 22, 6.2], [0, 23.5, 7.4], [4, 25.5, 6.6], [-20, 59.5, 7]]
      .forEach(function (p, i) { palm(p[0], p[1], p[2], (i % 2 ? 0.18 : -0.14)); });
    [[8.2, -17.3], [16.6, -10.4], [12.6, -12.6], [20.4, -9.7]].forEach(function (p) {
      mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.55, 14), M.plastico, p[0], Y_PT + 0.33, p[1], resto);
      palm(p[0], p[1], 1.5, 0.05, Y_PT + 0.5, 0.42);
    });

    // barcos
    var boats = [];
    var hullGeo = new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    function hull(parent, len, beam, depth) {
      var h = mesh(hullGeo, M.barco, 0, 0.32, 0, parent);
      h.scale.set(beam, depth, len);
      var deck = mesh(new THREE.CircleGeometry(1, 20), pbr({ color: 0xd8c7a2, roughness: 0.8 }), 0, 0.325, 0, parent, { cast: false });
      deck.rotation.x = -Math.PI / 2;
      deck.scale.set(beam * 0.96, len * 0.96, 1);
    }
    function sailboat(x, z, s, heading) {
      var g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = heading;
      g.scale.setScalar(s);
      hull(g, 1.9, 0.6, 0.5);
      mesh(new THREE.CylinderGeometry(0.03, 0.035, 4.6, 6), M.aluminio, 0, 2.6, 0.2, g);
      var shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.quadraticCurveTo(0.5, 2.2, 0, 4.1); shape.lineTo(1.9, 0); shape.lineTo(0, 0);
      var sail = mesh(new THREE.ShapeGeometry(shape, 8), M.vela, 0, 0.7, 0.12, g, { receive: false });
      sail.rotation.y = -Math.PI / 2 + 0.25;
      scene.add(g);
      boats.push({ g: g, x: x, z: z, phase: rng() * 6, speed: 0.25 + rng() * 0.2 });
    }
    sailboat(-120, -210, 2.2, 1.2);
    sailboat(160, -330, 2.4, -1.1);
    sailboat(-340, -520, 2.4, 0.4);

    /* ================= momento del día ================= */
    var COLOR_KEYS = ["top", "hor", "glow", "cloudLit", "cloudDark", "sunCol", "hemiSky", "hemiGnd", "ground", "fog", "deep", "shallow", "waterLight"];
    var NUM_KEYS = ["glowAmt", "cloud", "sunInt", "disc", "discCos", "hemiInt", "skyBoost", "envBoost", "fogD", "exposure", "lamps", "stars"];
    function toState(def) {
      var s = { sunDir: new THREE.Vector3().fromArray(def.sunDir).normalize() };
      COLOR_KEYS.forEach(function (k) { s[k] = new THREE.Color(def[k]); });
      NUM_KEYS.forEach(function (k) { s[k] = def[k]; });
      return s;
    }
    var STATES = {};
    Object.keys(TIMES).forEach(function (k) { STATES[k] = toState(TIMES[k]); });
    var timeName = options.time && TIMES[options.time] ? options.time : "dia";
    var cur = toState(TIMES[timeName]);
    var timeTween = null, envClock = 0;

    function applyTime(refreshEnv) {
      skyU.uTop.value.copy(cur.top); skyU.uHor.value.copy(cur.hor); skyU.uGlow.value.copy(cur.glow);
      skyU.uCloudLit.value.copy(cur.cloudLit); skyU.uCloudDark.value.copy(cur.cloudDark); skyU.uGround.value.copy(cur.ground);
      skyU.uSunDir.value.copy(cur.sunDir); skyU.uSunCol.value.copy(cur.sunCol);
      skyU.uGlowAmt.value = cur.glowAmt; skyU.uCloud.value = cur.cloud; skyU.uStars.value = cur.stars;
      skyU.uDisc.value = cur.disc; skyU.uDiscCos.value = cur.discCos;
      skyMat.uniforms.uBoost.value = cur.skyBoost;
      envMat.uniforms.uBoost.value = cur.envBoost;
      seaU.uBoost.value = cur.skyBoost;
      seaU.uDeep.value.copy(cur.deep); seaU.uShallow.value.copy(cur.shallow); seaU.uWaterLight.value.copy(cur.waterLight);
      seaU.uFogCol.value.copy(cur.fog); seaU.uFogD.value = cur.fogD;
      scene.fog.color.copy(cur.fog);
      scene.fog.density = cur.fogD;
      scene.background.copy(cur.hor);
      hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.hemiGnd); hemi.intensity = cur.hemiInt;
      sun.color.copy(cur.sunCol); sun.intensity = cur.sunInt;
      sun.position.copy(cur.sunDir).multiplyScalar(150).add(sun.target.position);
      renderer.toneMappingExposure = cur.exposure;
      M.vidrio.emissiveIntensity = cur.lamps * 0.9;
      M.farol.emissiveIntensity = cur.lamps * 3.4;
      M.lampara.emissiveIntensity = 0.35 + cur.lamps * 2.4;
      candles.material.opacity = cur.lamps;
      lampLights.forEach(function (l) { l.intensity = l.userData.max * cur.lamps; });
      if (refreshEnv) updateEnv();
    }
    applyTime(true);

    function setTime(name, instant) {
      if (!STATES[name]) return;
      timeName = name;
      if (instant) {
        cur = toState(TIMES[name]);
        timeTween = null;
        applyTime(true);
        return;
      }
      var from = cur;
      cur = toState(TIMES[name]);
      COLOR_KEYS.forEach(function (k) { cur[k].copy(from[k]); });
      NUM_KEYS.forEach(function (k) { cur[k] = from[k]; });
      cur.sunDir.copy(from.sunDir);
      timeTween = { from: from, to: STATES[name], t: 0, dur: 2.0 };
      envClock = 0;
    }
    function stepTime(dt) {
      if (!timeTween) return;
      timeTween.t = Math.min(1, timeTween.t + dt / timeTween.dur);
      var e = easeInOut(timeTween.t), a = timeTween.from, b = timeTween.to;
      COLOR_KEYS.forEach(function (k) { cur[k].copy(a[k]).lerp(b[k], e); });
      NUM_KEYS.forEach(function (k) { cur[k] = lerp(a[k], b[k], e); });
      cur.sunDir.copy(a.sunDir).lerp(b.sunDir, e).normalize();
      envClock += dt;
      var done = timeTween.t >= 1, refresh = done || envClock > 0.3;
      if (refresh) envClock = 0;
      applyTime(refresh);
      if (done) timeTween = null;
    }

    /* ================= cámara ================= */
    // Dos maneras de mirar: orbitar alrededor del edificio, o girar la mirada desde un punto fijo.
    var camPos = new THREE.Vector3(), camTgt = new THREE.Vector3(), tmpV = new THREE.Vector3();
    var sph = { r: 50, theta: 0, phi: 1 }, goal = { r: 50, theta: 0, phi: 1 };
    var look = false, wide = true, fov = 40, fovGoal = 40, viewTween = null, mode = "hero", userTouched = false, scrollP = 0;
    var pointer = { x: 0, y: 0 }, pointerS = { x: 0, y: 0 };
    var offset = { x: 0, y: 0 }, offsetGoal = { x: 0, y: 0 };
    var R_MIN = 9, R_MAX = 170;
    function phiMin() { return look ? 1.05 : 0.3; }
    function phiMax() { return look ? 2.0 : 1.53; }

    // recorrido guiado: la página indica entre qué dos puntos de vista está y cuánto ha avanzado
    var tour = null, tourInit = false, tourFrames = 0;
    var tourPos = new THREE.Vector3(), tourTgt = new THREE.Vector3(), pA = new THREE.Vector3(), pB = new THREE.Vector3(), tA = new THREE.Vector3(), tB = new THREE.Vector3();
    function poseOf(name, pos, tgt) {
      var v = VIEWS[name] || VIEWS.hero;
      pos.fromArray(v.pos);
      tgt.fromArray(v.target);
      if (!v.look && v.wide && camera.aspect < 0.9) pos.sub(tgt).multiplyScalar(1.34).add(tgt);
      tgt.sub(pos).normalize().multiplyScalar(25).add(pos); // el punto de mira siempre a la misma distancia
      return v;
    }

    function applyView(name) {
      var v = VIEWS[name];
      camPos.fromArray(v.pos);
      camTgt.fromArray(v.target);
      look = !!v.look;
      wide = !!v.wide;
      fov = fovGoal = v.fov;
      var d = camPos.clone().sub(camTgt), r = d.length();
      sph.r = goal.r = r;
      sph.theta = goal.theta = Math.atan2(d.x, d.z);
      sph.phi = goal.phi = Math.acos(clamp(d.y / r, -1, 1));
    }
    function goTo(name, dur) {
      if (!VIEWS[name]) return;
      var dir = camera.getWorldDirection(new THREE.Vector3());
      viewTween = { t: 0, dur: dur || 2.1, name: name, pos: camera.position.clone(), tgt: camera.position.clone().addScaledVector(dir, 40), fov: fov };
    }
    applyView("hero");
    camera.position.copy(camPos); // la cámara arranca ya en la vista de portada
    camera.lookAt(camTgt);

    var size = { w: 1, h: 1 };
    function resize() {
      var w = host.clientWidth || window.innerWidth, h = host.clientHeight || window.innerHeight;
      if (w === size.w && h === size.h) return;
      size.w = w; size.h = h;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      setOffsetGoal();
      dirty = true;
    }
    function setOffsetGoal() {
      if (mode === "tour" && tour) { offsetGoal.x = tour.ox; offsetGoal.y = tour.oy; }
      else if (mode === "hero") {
        if (size.w >= 900) { offsetGoal.x = 0.2; offsetGoal.y = 0.02; }
        else { offsetGoal.x = 0; offsetGoal.y = 0.25; }
      } else { offsetGoal.x = 0; offsetGoal.y = size.w >= 900 ? 0 : 0.03; }
    }

    function updateCamera(dt, time, eco) {
      var k = 1 - Math.pow(0.0015, dt); // amortiguación independiente de los fps
      if (mode === "tour" && tour && !viewTween) {
        var va = poseOf(tour.a, pA, tA), vb = poseOf(tour.b, pB, tB), e2 = tour.t;
        var arc = va.look || vb.look ? 0 : Math.sin(Math.PI * e2) * Math.min(9, pA.distanceTo(pB) * 0.1);
        pA.lerp(pB, e2);
        pA.y += arc;
        tA.lerp(tB, e2);
        if (!tourInit) {
          tourInit = true;
          tourPos.copy(camera.position);
          camera.getWorldDirection(tourTgt).multiplyScalar(25).add(camera.position);
        }
        var kt = 1 - Math.pow(0.03, dt);
        tourPos.lerp(pA, kt);
        tourTgt.lerp(tA, kt);
        camera.position.copy(tourPos);
        if (!reduced && !eco) camera.position.y += Math.sin(time * 0.35) * 0.04;
        camera.lookAt(tourTgt);
        fov = lerp(fov, lerp(va.fov, vb.fov, e2), kt);
        if (tourFrames > 0) tourFrames--;
      } else if (viewTween) {
        viewTween.t = Math.min(1, viewTween.t + dt / viewTween.dur);
        var e = easeInOut(viewTween.t), v = VIEWS[viewTween.name];
        var bx = v.pos[0], by = v.pos[1], bz = v.pos[2];
        if (!v.look && v.wide && camera.aspect < 0.9) { bx = v.target[0] + (bx - v.target[0]) * 1.34; by = v.target[1] + (by - v.target[1]) * 1.34; bz = v.target[2] + (bz - v.target[2]) * 1.34; }
        var a = viewTween.pos, far = Math.sqrt((bx - a.x) * (bx - a.x) + (bz - a.z) * (bz - a.z));
        camera.position.set(lerp(a.x, bx, e), lerp(a.y, by, e) + Math.sin(Math.PI * e) * Math.min(16, far * 0.14), lerp(a.z, bz, e));
        tmpV.set(lerp(viewTween.tgt.x, v.target[0], e), lerp(viewTween.tgt.y, v.target[1], e), lerp(viewTween.tgt.z, v.target[2], e));
        camera.lookAt(tmpV);
        fov = lerp(viewTween.fov, v.fov, e);
        if (viewTween.t >= 1) { applyView(viewTween.name); viewTween = null; }
      } else {
        if (mode === "explore" && !look && !userTouched && !reduced && !eco) goal.theta += dt * 0.03;
        sph.theta = lerp(sph.theta, goal.theta, k);
        sph.phi = lerp(sph.phi, goal.phi, k);
        sph.r = lerp(sph.r, goal.r, k);
        fov = lerp(fov, fovGoal, k);
        pointerS.x = lerp(pointerS.x, pointer.x, k * 0.5);
        pointerS.y = lerp(pointerS.y, pointer.y, k * 0.5);
        var theta = sph.theta, phi = sph.phi, r = sph.r;
        if (mode === "hero") {
          if (!reduced && !eco) theta += Math.sin(time * 0.11) * 0.06;
          theta += pointerS.x * 0.04 + scrollP * 0.28;
          phi = clamp(phi + pointerS.y * 0.02 - scrollP * 0.08, phiMin(), phiMax());
          r *= 1 - scrollP * 0.14;
        }
        // en pantallas verticales la cámara se aleja para que quepa todo el edificio
        if (!look && wide && camera.aspect < 0.9) r *= 1.34;
        var sp = Math.sin(phi), dx = sp * Math.sin(theta), dy = Math.cos(phi), dz = sp * Math.cos(theta);
        if (look) {
          camera.position.copy(camPos);
          tmpV.set(camPos.x - dx * 10, camPos.y - dy * 10, camPos.z - dz * 10);
          camera.lookAt(tmpV);
        } else {
          camera.position.set(camTgt.x + r * dx, camTgt.y + r * dy, camTgt.z + r * dz);
          // nunca por debajo del agua ni del terreno
          var floor = Math.max(1.0, landH(camera.position.x, camera.position.z) + 1.3);
          if (camera.position.y < floor) camera.position.y = floor;
          camera.lookAt(camTgt);
        }
      }
      offset.x = lerp(offset.x, offsetGoal.x, k * 0.6);
      offset.y = lerp(offset.y, offsetGoal.y, k * 0.6);
      camera.fov = fov;
      if (Math.abs(offset.x) > 0.001 || Math.abs(offset.y) > 0.001) camera.setViewOffset(size.w, size.h, -offset.x * size.w, offset.y * size.h, size.w, size.h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      sky.position.copy(camera.position);
    }

    /* ================= posprocesado ================= */
    // Sombreado de contacto (oclusión ambiental): oscurece rincones y encuentros entre superficies.
    // Solo en equipos de sobremesa con WebGL2; si el equipo va justo, se desactiva.
    var post = null;
    (function () {
      if (isMobile || options.noPost || !renderer.capabilities.isWebGL2) return;
      // hace falta poder dibujar sobre texturas de coma flotante; si no, se dibuja directo
      if (!renderer.extensions.has("EXT_color_buffer_float") && !renderer.extensions.has("EXT_color_buffer_half_float")) return;
      var rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
      rt.depthTexture = new THREE.DepthTexture(4, 4);
      var mat = new THREE.ShaderMaterial({
        uniforms: { tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() }, uRes: { value: new THREE.Vector2(1, 1) } },
        depthTest: false, depthWrite: false, fog: false,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: [
          "uniform sampler2D tColor; uniform sampler2D tDepth; uniform mat4 uProj; uniform mat4 uInvProj; uniform vec2 uRes; varying vec2 vUv;",
          "vec3 viewPos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return v.xyz / v.w; }",
          "float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }",
          "void main(){",
          "  vec3 col = texture2D(tColor, vUv).rgb;",
          "  float d = texture2D(tDepth, vUv).x;",
          "  float ao = 1.0;",
          "  if (d < 0.999995) {",
          "    vec3 p = viewPos(vUv);",
          "    vec3 n = normalize(cross(dFdx(p), dFdy(p)));",
          "    float radius = 0.85;",
          "    float rpx = radius * uProj[1][1] * 0.5 / max(-p.z, 0.5);",
          "    float ang = ign(gl_FragCoord.xy) * 6.2831853;",
          "    float occ = 0.0;",
          "    for (int i = 0; i < 12; i++) {",
          "      float fi = (float(i) + 0.5) / 12.0;",
          "      float a = ang + fi * 15.08;",
          "      vec2 o = vec2(cos(a) * uRes.y / uRes.x, sin(a)) * rpx * sqrt(fi);",
          "      vec3 v = viewPos(vUv + o) - p;",
          "      float dv = dot(v, v);",
          "      occ += max(dot(n, v) - 0.035 - 0.0006 * -p.z, 0.0) / (dv + 0.03) * step(dv, radius * radius * 5.0);",
          "    }",
          "    ao = clamp(1.0 - occ * 0.15, 0.0, 1.0);",
          "    ao = mix(1.0, ao, smoothstep(240.0, 50.0, -p.z));",
          "  }",
          "  col *= mix(1.0, ao, 0.9);",
          "  gl_FragColor = vec4(col, 1.0);",
          "  #include <tonemapping_fragment>",
          "  #include <colorspace_fragment>",
          "}"
        ].join("\n")
      });
      var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
      quad.frustumCulled = false;
      var ps = new THREE.Scene();
      ps.add(quad);
      post = { rt: rt, mat: mat, scene: ps, cam: new THREE.Camera(), size: new THREE.Vector2() };
    })();
    function renderScene() {
      if (post && quality.level === 0) {
        try {
          renderer.getDrawingBufferSize(post.size);
          if (post.rt.width !== post.size.x || post.rt.height !== post.size.y) post.rt.setSize(post.size.x, post.size.y);
          renderer.setRenderTarget(post.rt);
          if (!post.checked) {
            // algunos equipos aceptan crear el búfer pero no pueden usarlo: se comprueba una vez
            var gl = renderer.getContext();
            post.checked = true;
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("búfer de posprocesado no disponible");
          }
          renderer.render(scene, camera);
          renderer.setRenderTarget(null);
          post.mat.uniforms.uProj.value.copy(camera.projectionMatrix);
          post.mat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
          post.mat.uniforms.uRes.value.copy(post.size);
          renderer.render(post.scene, post.cam);
          return;
        } catch (e) {
          // sin posprocesado la escena se ve igual, solo sin el sombreado de contacto
          renderer.setRenderTarget(null);
          post = null;
          if (window.console) console.warn("[vista 3D] posprocesado desactivado:", e.message);
        }
      }
      renderer.render(scene, camera);
    }

    /* ================= bucle ================= */
    var active = true, running = true, last = 0, lastRaf = 0, frameCbs = [], firstFrame = false, frames = 0, dirty = true, born = performance.now();

    // Regulador de calidad: si el equipo no llega, se baja resolución y sombras;
    // sin aceleración gráfica (nivel 3) solo se dibuja cuando algo cambia,
    // para que el resto de la página siga respondiendo.
    var quality = { level: 0, sum: 0, n: 0, warm: 0, lastRender: 0 };
    function setLevel(l) {
      if (l <= quality.level) return;
      quality.level = l;
      quality.warm = 0; quality.sum = 0; quality.n = 0;
      if (l >= 2) sun.castShadow = false;
      renderer.setPixelRatio(l >= 3 ? 0.6 : l === 2 ? 0.8 : 1);
      size.w = 0;
      resize();
      host.setAttribute("data-quality", String(l));
      dirty = true;
    }
    function govern(interval) {
      if (options.lockQuality || quality.level >= 3 || interval <= 0) return;
      if (quality.warm < 6) { quality.warm++; return; }
      quality.sum += Math.min(interval, 600);
      quality.n++;
      // sin aceleración gráfica se nota enseguida: no hace falta esperar a la media larga
      if (quality.n >= 3 && quality.sum / quality.n > 250) { setLevel(3); return; }
      if (quality.n < 10) return;
      var avg = quality.sum / quality.n;
      quality.sum = 0; quality.n = 0;
      if (avg > 110) setLevel(3);
      else if (avg > 62) setLevel(2);
      else if (avg > 42) setLevel(1);
    }
    function isMoving() {
      return dirty || !!viewTween || !!timeTween || (mode === "tour" && tourFrames > 0) ||
        Math.abs(goal.theta - sph.theta) > 0.002 || Math.abs(goal.phi - sph.phi) > 0.002 || Math.abs(goal.r - sph.r) > 0.05 ||
        Math.abs(fovGoal - fov) > 0.05 ||
        Math.abs(offsetGoal.x - offset.x) > 0.002 || Math.abs(offsetGoal.y - offset.y) > 0.002;
    }

    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      if (!active || document.hidden) { last = now; lastRaf = 0; return; }
      // primero se espera a que la ortofoto esté lista (con un tope de 6 s)
      if (!firstFrame && pendingTex > 0 && now - born < 6000) return;
      var eco = quality.level >= 3;
      if (eco) {
        if (!isMoving()) { last = now; return; }
        if (now - quality.lastRender < 80) return;
        quality.lastRender = now;
      } else {
        govern(lastRaf ? now - lastRaf : 0);
        lastRaf = now;
      }
      var dt = Math.min(eco ? 0.12 : 0.05, (now - last) / 1000 || 0.016);
      last = now;
      var time = now / 1000;
      resize();
      stepTime(dt);
      skyU.uTime.value = time;
      for (var i = 0; i < palms.length; i++) palms[i].crown.rotation.z = Math.sin(time * 0.7 + palms[i].phase) * 0.03;
      for (var b = 0; b < boats.length; b++) {
        var bt = boats[b];
        bt.g.position.y = Math.sin(time * 0.9 + bt.phase) * 0.07;
        bt.g.rotation.z = Math.sin(time * 0.7 + bt.phase) * 0.03;
        if (bt.speed && !reduced) {
          bt.g.position.x = bt.x + Math.sin(time * 0.02 * bt.speed + bt.phase) * 40;
          bt.g.position.z = bt.z + Math.cos(time * 0.02 * bt.speed + bt.phase) * 14;
        }
      }
      dirty = false;
      updateCamera(dt, time, eco);
      renderer.info.reset();
      renderScene();
      frames++;
      if (!firstFrame) {
        firstFrame = true;
        host.classList.add("is-live");
        if (options.onReady) options.onReady();
      }
      for (var c = 0; c < frameCbs.length; c++) frameCbs[c](time);
    }
    resize();
    requestAnimationFrame(frame);
    window.addEventListener("resize", resize);

    renderer.domElement.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      host.classList.remove("is-live");
      if (options.onLost) options.onLost();
    });

    /* ================= API ================= */
    var proj = new THREE.Vector3();
    return {
      credit: GEO.credit,
      setTime: function (name, instant) { dirty = true; setTime(name, instant); },
      getTime: function () { return timeName; },
      goTo: function (name, dur) { dirty = true; userTouched = name !== "general" || userTouched; goTo(name, dur); },
      setMode: function (m) {
        if (m === mode) return;
        mode = m;
        dirty = true;
        setOffsetGoal();
        if (m === "tour") { userTouched = false; viewTween = null; tourInit = false; tourFrames = 60; }
        else if (m === "hero") { userTouched = false; goTo("hero", 1.8); }
        else goTo("general", 2.2);
      },
      getMode: function () { return mode; },
      // a, b: nombres de punto de vista; t: avance 0..1; ox, oy: desplazamiento del encuadre para dejar sitio al texto
      setTour: function (a, b, t, ox, oy) {
        t = clamp(t, 0, 1);
        if (tour && tour.a === a && tour.b === b && Math.abs(tour.t - t) < 0.0005 && tour.ox === ox && tour.oy === oy) return;
        tour = { a: a, b: b, t: t, ox: ox || 0, oy: oy || 0 };
        tourFrames = 60;
        dirty = true;
        if (mode === "tour") setOffsetGoal();
      },
      setScroll: function (p) { p = clamp(p, 0, 1); if (p !== scrollP) { scrollP = p; dirty = true; } },
      setPointer: function (x, y) { pointer.x = x; pointer.y = y; },
      setActive: function (v) { v = !!v; if (v && !active) dirty = true; active = v; },
      rotate: function (dx, dy) {
        if (viewTween) return;
        userTouched = true;
        dirty = true;
        if (look) { goal.theta += dx * 0.75; goal.phi = clamp(goal.phi + dy * 0.75, phiMin(), phiMax()); }
        else { goal.theta -= dx; goal.phi = clamp(goal.phi - dy, phiMin(), phiMax()); }
      },
      zoom: function (factor) {
        if (viewTween) return;
        userTouched = true;
        dirty = true;
        if (look) { fovGoal = clamp(fovGoal * (factor < 1 ? 0.86 : 1.16), 20, 75); return; }
        if (wide && camera.aspect < 0.9) { sph.r *= 1.34; goal.r = sph.r; wide = false; }
        goal.r = clamp(goal.r * factor, R_MIN, R_MAX);
      },
      project: function (name) {
        var p = POINTS[name];
        if (!p) return null;
        proj.set(p[0], p[1], p[2]).project(camera);
        return { x: (proj.x * 0.5 + 0.5) * size.w, y: (-proj.y * 0.5 + 0.5) * size.h, visible: proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05 };
      },
      onFrame: function (fn) { frameCbs.push(fn); },
      stats: function () { return { quality: quality.level, busy: !!viewTween, camera: camera.position.toArray().map(function (v) { return Math.round(v * 100) / 100; }), heading: Math.round(sph.theta * 100) / 100, fov: Math.round(fov * 10) / 10, frames: frames, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, mode: mode, time: timeName }; },
      snap: function (name, time) { dirty = true; viewTween = null; applyView(name); if (time) setTime(time, true); offset.x = offsetGoal.x; offset.y = offsetGoal.y; },
      destroy: function () { running = false; renderer.dispose(); }
    };
  };
})();
