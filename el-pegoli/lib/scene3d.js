/* ==========================================================================
   El Pegolí — recreación 3D del restaurante (Three.js r160, sin módulos).
   Versión realista: agua con reflejos y espuma, cielo con nubes, iluminación
   por entorno, sombras suaves y materiales con textura generados en el propio
   navegador (no se descarga ninguna imagen).
   Sigue siendo una recreación orientativa hecha a partir de fotografías
   públicas del local, no un plano a escala.
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

  /* ---------- relieve de la costa: plataforma de roca baja sobre el agua ---------- */
  function coastZ(x) {
    return 10 + 6 * Math.sin(x * 0.045 + 0.6) + 3 * Math.sin(x * 0.13 + 2.1) - 26 * Math.exp(-(x * x) / 484);
  }
  function landH(x, z) {
    var d = z - coastZ(x) + (fbm(x * 0.06, z * 0.06) - 0.5) * 7;
    var shelf = smooth(-7, -0.6, d);
    var cliff = smooth(-0.5, 1.5, d);
    var h = -5.2 + shelf * 4.5 + cliff * 3.1;
    if (d > 1.5) h += Math.min((d - 1.5) * 0.07, 11);
    h += (fbm(x * 0.3, z * 0.3) - 0.5) * 0.9 * cliff + (fbm(x * 0.9, z * 0.9) - 0.5) * 0.3 * cliff;
    // lajas de roca a ras de agua
    h += smooth(-4, -0.8, d) * (1 - cliff) * (fbm(x * 0.45 + 4, z * 0.45) - 0.36) * 1.9;
    // la roca queda por debajo de las terrazas
    if (x > -13.6 && x < 13.6 && z > -10.6 && z < 6.6) h = Math.min(h, 3.0);
    if (x > -29.6 && x <= -13.6 && z > -9.8 && z < 3.8) h = Math.min(h, 1.3);
    return h;
  }

  /* ---------- momentos del día ---------- */
  var TIMES = {
    dia: {
      top: 0x145fcb, hor: 0xa9d6f5, glow: 0xffffff, glowAmt: 0.3,
      cloud: 0.44, cloudLit: 0xffffff, cloudDark: 0xc3d2e2,
      sunDir: [-0.3, 0.76, -0.57], sunCol: 0xfff0d2, sunInt: 4.1, disc: 30, discCos: 0.9996,
      hemiSky: 0xcfe4ff, hemiGnd: 0xb39b7a, hemiInt: 0.3,
      skyBoost: 1.3, envBoost: 1.45, ground: 0x4f6f86,
      fog: 0xbfdff1, fogD: 0.0015,
      deep: 0x0a4a80, shallow: 0x2fb9b0, waterLight: 0xffffff,
      exposure: 1.0, lamps: 0, stars: 0
    },
    atardecer: {
      top: 0x26356f, hor: 0xff9a58, glow: 0xffd28c, glowAmt: 0.95,
      cloud: 0.52, cloudLit: 0xffab73, cloudDark: 0x64456b,
      sunDir: [-0.9, 0.13, -0.42], sunCol: 0xffb07a, sunInt: 1.75, disc: 22, discCos: 0.9994,
      hemiSky: 0xb7a6d6, hemiGnd: 0x7c5340, hemiInt: 0.28,
      skyBoost: 1.1, envBoost: 1.9, ground: 0x4a3a52,
      fog: 0xd89a86, fogD: 0.0017,
      deep: 0x1a2c63, shallow: 0x4b7d9c, waterLight: 0xa88e9a,
      exposure: 1.05, lamps: 0.75, stars: 0.12
    },
    noche: {
      top: 0x030817, hor: 0x15244a, glow: 0x34477d, glowAmt: 0.4,
      cloud: 0.34, cloudLit: 0x2c3c66, cloudDark: 0x0a1124,
      sunDir: [0.42, 0.62, -0.66], sunCol: 0xa9c0ff, sunInt: 1.5, disc: 9, discCos: 0.99975,
      hemiSky: 0x4a63a6, hemiGnd: 0x1a2236, hemiInt: 0.8,
      skyBoost: 1.0, envBoost: 4.2, ground: 0x0a1226,
      fog: 0x0b1630, fogD: 0.0032,
      deep: 0x061433, shallow: 0x143a5c, waterLight: 0x8fa3d8,
      exposure: 1.4, lamps: 1, stars: 1
    }
  };

  /* ---------- puntos de vista ---------- */
  var VIEWS = {
    hero:     { pos: [-33, 12.5, -44], target: [1, 4.2, -2], fov: 42 },
    general:  { pos: [34, 21, -50],    target: [-4, 3, -2],  fov: 42 },
    terraza:  { pos: [9.6, 5.45, -2.6], target: [-42, 2.4, -36], fov: 52 },
    comedor:  { pos: [-5, 6.6, -17],   target: [-1.5, 5.1, 0], fov: 46 },
    rocas:    { pos: [-17, 1.5, -23],  target: [-1, 4.4, -7], fov: 50 },
    denia:    { pos: [15, 9.5, 3],     target: [-170, 6, -52], fov: 26 },
    sombrillas: { pos: [-33, 5.6, -13], target: [-20, 2.9, -2], fov: 46 }
  };

  var POINTS = {
    terraza:    [0, 5.6, -6.2],
    comedor:    [-1.5, 8.4, 0],
    sombrillas: [-21.5, 5.2, -3],
    rocas:      [5, 0.8, -13.5],
    denia:      [-182, 20, -48],
    montgo:     [30, 78, 255]
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
    var maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(TIMES.dia.fog, TIMES.dia.fogD);
    scene.background = new THREE.Color(TIMES.dia.hor);

    var camera = new THREE.PerspectiveCamera(42, 1, 0.3, 1500);

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
    var SKY_R = 900;
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
      sc.left = -40; sc.right = 34; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 260;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.05;
    })();
    scene.add(sun);
    scene.add(sun.target);
    sun.target.position.set(-4, 2, -2);

    var lampLights = [];
    [[0, 7.0, -5.5, 150], [-1.5, 6.1, -0.2, 90], [-21.5, 4.6, -3, 80]].forEach(function (p) {
      var l = new THREE.PointLight(0xffb866, 0, 30, 2);
      l.position.set(p[0], p[1], p[2]);
      l.userData.max = p[3];
      scene.add(l);
      lampLights.push(l);
    });

    /* ================= mar ================= */
    // batimetría horneada en una textura: da el color turquesa del bajo y la espuma de la orilla
    var DEPTH = { x0: -215, z0: -120, w: 430, h: 190 };
    var depthTex = (function () {
      var W = 512, H = 256, data = new Uint8Array(W * H * 4);
      for (var j = 0; j < H; j++) for (var i = 0; i < W; i++) {
        var hgt = landH(DEPTH.x0 + ((i + 0.5) / W) * DEPTH.w, DEPTH.z0 + ((j + 0.5) / H) * DEPTH.h);
        var v = Math.round(clamp((hgt + 6) / 8, 0, 1) * 255), k = (j * W + i) * 4;
        data[k] = data[k + 1] = data[k + 2] = v; data[k + 3] = 255;
      }
      var t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
      t.magFilter = t.minFilter = THREE.LinearFilter;
      t.needsUpdate = true;
      return t;
    })();
    var seaU = {};
    Object.keys(skyU).forEach(function (k) { seaU[k] = skyU[k]; });
    seaU.uDepth = { value: depthTex };
    seaU.uDepthRect = { value: new THREE.Vector4(DEPTH.x0, DEPTH.z0, 1 / DEPTH.w, 1 / DEPTH.h) };
    seaU.uDeep = { value: new THREE.Color() };
    seaU.uShallow = { value: new THREE.Color() };
    seaU.uRockTint = { value: new THREE.Color(0x8a6a48) };
    seaU.uWaterLight = { value: new THREE.Color() };
    seaU.uFogCol = { value: new THREE.Color() };
    seaU.uFogD = { value: 0.002 };
    seaU.uBoost = { value: 1 };
    var seaMat = new THREE.ShaderMaterial({
      uniforms: seaU,
      fog: false,
      defines: isMobile ? { LOW: 1 } : {},
      vertexShader: "varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: [
        "uniform sampler2D uDepth; uniform vec4 uDepthRect; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uRockTint; uniform vec3 uWaterLight; uniform vec3 uFogCol; uniform float uFogD; uniform float uBoost;",
        "varying vec3 vWorld;",
        SKY_GLSL,
        "vec2 waveGrad(vec2 p, float t, float dist){",
        "  vec2 g = vec2(0.0);",
        "  vec2 d1 = normalize(vec2(0.25, 1.0)); g += d1 * 0.34 * 0.11 * cos(dot(p, d1) * 0.34 + t * 0.85);",
        "  vec2 d2 = normalize(vec2(-0.6, 1.0)); g += d2 * 0.78 * 0.05 * cos(dot(p, d2) * 0.78 + t * 1.25);",
        "  vec2 d3 = normalize(vec2(1.0, 0.35)); g += d3 * 1.7 * 0.02 * cos(dot(p, d3) * 1.7 + t * 1.8);",
        "  float e = 0.14;",
        "  vec2 q = p * 0.9 + vec2(t * 0.28, t * 0.17);",
        "  float n0 = fbm3(q);",
        "  g += vec2(fbm3(q + vec2(e, 0.0)) - n0, fbm3(q + vec2(0.0, e)) - n0) / e * 0.3 / (1.0 + dist * 0.012);",
        "  #ifndef LOW",
        "  vec2 q2 = p * 4.2 - vec2(t * 0.45, t * 0.36);",
        "  float m0 = fbm3(q2);",
        "  g += vec2(fbm3(q2 + vec2(e, 0.0)) - m0, fbm3(q2 + vec2(0.0, e)) - m0) / e * 0.09 / (1.0 + dist * 0.05);",
        "  #endif",
        "  return g;",
        "}",
        "void main(){",
        "  vec3 toCam = cameraPosition - vWorld;",
        "  float dist = length(toCam);",
        "  vec3 V = toCam / dist;",
        "  vec2 g = waveGrad(vWorld.xz, uTime, dist);",
        "  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));",
        "  float hgt = -6.0 + texture2D(uDepth, clamp((vWorld.xz - uDepthRect.xy) * uDepthRect.zw, 0.0, 1.0)).r * 8.0;",
        "  float depth = max(-hgt, 0.0);",
        // color del agua según el fondo
        "  vec3 body = mix(uShallow, uDeep, 1.0 - exp(-depth * 0.5));",
        "  body = mix(uRockTint * 0.75, body, 1.0 - exp(-depth * 1.5));",
        "  body *= uWaterLight * (0.72 + 0.28 * max(dot(N, uSunDir), 0.0));",
        // reflejo del cielo
        "  vec3 R = reflect(-V, N); R.y = abs(R.y);",
        "  #ifdef LOW",
        "  vec3 refl = skyBase(R);",
        "  #else",
        "  vec3 refl = skyClouds(skyBase(R), R);",
        "  #endif",
        "  float F = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);",
        "  vec3 col = mix(body, refl, clamp(F, 0.0, 0.92));",
        // brillo del sol sobre el agua
        "  float s = max(dot(R, uSunDir), 0.0);",
        "  col += uSunCol * (pow(s, 380.0) * 5.0 + pow(s, 36.0) * 0.16);",
        // espuma en la orilla y contra las rocas
        "  float fn = fbm3(vWorld.xz * 1.15 + vec2(uTime * 0.22, -uTime * 0.12));",
        "  float shore = 1.0 - smoothstep(0.0, 1.15, depth);",
        "  float lap = 0.5 + 0.5 * sin(uTime * 0.9 - depth * 4.5 + fn * 4.0);",
        "  float foam = smoothstep(0.52, 0.86, shore * (0.55 + 0.45 * lap) + fn * 0.42 - 0.08);",
        "  foam += smoothstep(0.62, 0.9, fn) * smoothstep(3.2, 0.9, depth) * 0.35;",
        "  col = mix(col, vec3(0.96) * (uWaterLight * 0.75 + uSunCol * 0.25), clamp(foam, 0.0, 1.0) * 0.9);",
        "  float fogF = 1.0 - exp(-uFogD * uFogD * dist * dist);",
        "  col = mix(col, uFogCol, fogF);",
        "  gl_FragColor = vec4(col * uBoost, 1.0);",
        "  #include <tonemapping_fragment>",
        "  #include <colorspace_fragment>",
        "}"
      ].join("\n")
    });
    (function () {
      var g = new THREE.PlaneGeometry(3200, 3200);
      g.rotateX(-Math.PI / 2);
      mesh(g, seaMat, 0, 0, -700, scene, { cast: false, receive: false });
    })();

    /* ================= costa y tierra ================= */
    (function () {
      var W = 430, D = 190, SX = isMobile ? 190 : 290, SZ = isMobile ? 84 : 128;
      var g = new THREE.PlaneGeometry(W, D, SX, SZ);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0, DEPTH.z0 + D / 2 + 50);
      var p = g.attributes.position, uv = g.attributes.uv;
      var col = new Float32Array(p.count * 3);
      var cRoca = new THREE.Color(0xc98a52), cRoca2 = new THREE.Color(0x8a5a38), cMojado = new THREE.Color(0x4f3a2b),
        cTierra = new THREE.Color(0xb39a68), cMata = new THREE.Color(0x7d8a52), cPino = new THREE.Color(0x4f6f3e), c = new THREE.Color();
      for (var i = 0; i < p.count; i++) {
        var x = p.getX(i), z = p.getZ(i), h = landH(x, z);
        p.setY(i, h);
        uv.setXY(i, x / 9, z / 9);
        var n = fbm(x * 0.12 + 9, z * 0.12 + 3), n2 = fbm(x * 0.5 + 2, z * 0.5 + 7);
        if (h < 0.35) c.copy(cMojado).lerp(cRoca2, smooth(-0.6, 0.35, h));
        else if (h < 2.6) c.copy(cRoca2).lerp(cRoca, smooth(0.35, 1.8, h) * (0.55 + n2 * 0.7));
        else if (h < 3.6) c.copy(cRoca).lerp(cTierra, smooth(2.6, 3.6, h) * (0.4 + n * 0.8));
        else c.copy(cTierra).lerp(n > 0.52 ? cPino : cMata, smooth(3.5, 5.2, h) * (0.5 + n * 0.5));
        c.multiplyScalar(0.86 + n2 * 0.28);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      mesh(g, pbr({ color: 0xffffff, vertexColors: true, map: T.rock, normalMap: T.rockN, normalScale: ns(1.5), roughness: 0.97 }), 0, 0, 0, scene, { cast: false });
    })();

    // lajas y bloques de roca sueltos junto al agua
    (function () {
      var rd = isMobile ? 2 : 3;
      var geos = [blob(rd, 0.7, 1.5, 0.5, 5, 0.25), blob(rd, 0.9, 2.3, 0.6, 4, 0.25)], n = isMobile ? 50 : 90;
      var d = new THREE.Object3D(), c = new THREE.Color(), lists = [[], []];
      for (var i = 0; i < n; i++) {
        var x = (rng() - 0.5) * 160;
        var z = coastZ(x) - 2 - rng() * 8;
        if (Math.abs(x) < 15 && z > -11.4) z = -11.6 - rng() * 6;
        if (x > -30 && x < -13 && z > -10.2) z = -10.6 - rng() * 5;
        var s = 0.4 + Math.pow(rng(), 2.2) * 1.7;
        d.position.set(x, -0.25 + rng() * 0.3, z);
        d.scale.set(s * (1.0 + rng() * 1.0), s * (0.55 + rng() * 0.5), s * (0.8 + rng() * 0.9));
        d.rotation.set(rng() * 0.25, rng() * 6.28, rng() * 0.25);
        d.updateMatrix();
        lists[i % 2].push({ m: d.matrix.clone(), c: c.setHex(rng() > 0.5 ? 0xb5743f : 0x93613a).multiplyScalar(0.8 + rng() * 0.35).clone() });
      }
      lists.forEach(function (list, k) {
        var im = instanced(geos[k], M.roca, list.length);
        list.forEach(function (it, j) { im.setMatrixAt(j, it.m); im.setColorAt(j, it.c); });
      });
    })();

    /* ================= el restaurante ================= */
    var TOP = 3.6; // cota de la terraza
    var resto = new THREE.Group();
    scene.add(resto);

    // balaustre de sección cuadrada, como el de la terraza
    var balusterGeo = (function () {
      var pts = [[0.085, 0], [0.085, 0.07], [0.05, 0.11], [0.062, 0.2], [0.1, 0.33], [0.1, 0.4], [0.062, 0.52], [0.05, 0.62], [0.085, 0.66], [0.085, 0.72]]
        .map(function (p) { return new THREE.Vector2(p[0], p[1]); });
      var g = new THREE.LatheGeometry(pts, 4);
      g.rotateY(Math.PI / 4);
      return facet(g);
    })();
    var potGeo = new THREE.LatheGeometry([[0.0, 0], [0.2, 0], [0.34, 0.3], [0.36, 0.38], [0.31, 0.4], [0.0, 0.4]].map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 14);
    var shrubGeo = blob(2, 0.6, 2.2, 0.85, 0, 0.5);

    function balustrade(runs, y, parent) {
      var list = [];
      runs.forEach(function (r) {
        var dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1];
        var len = Math.sqrt(dx * dx + dz * dz), ang = Math.atan2(dx, dz);
        var cx = (r.a[0] + r.b[0]) / 2, cz = (r.a[1] + r.b[1]) / 2;
        mesh(tbox(0.46, 0.13, len, 2.5), M.cal, cx, y + 0.98, cz, parent).rotation.y = ang;
        mesh(tbox(0.36, 0.12, len, 2.5), M.cal, cx, y + 0.06, cz, parent).rotation.y = ang;
        var nP = Math.max(1, Math.round(len / 3.2)), i;
        for (i = 0; i <= nP; i++) {
          var px = r.a[0] + (dx * i) / nP, pz = r.a[1] + (dz * i) / nP;
          mesh(tbox(0.5, 1.12, 0.5, 2.5), M.cal, px, y + 0.56, pz, parent);
          mesh(tbox(0.62, 0.1, 0.62, 2.5), M.cal, px, y + 1.15, pz, parent);
        }
        var nB = Math.floor(len / 0.36);
        for (i = 1; i < nB; i++) {
          var t = i / nB, seg = t * nP;
          if (Math.abs(seg - Math.round(seg)) * (len / nP) < 0.32) continue; // no dentro del pilar
          list.push([r.a[0] + dx * t, r.a[1] + dz * t]);
        }
      });
      var im = instanced(balusterGeo, M.cal, list.length, parent), d = new THREE.Object3D();
      list.forEach(function (b, i) {
        d.position.set(b[0], y + 0.12, b[1]);
        d.scale.set(1, 1.1, 1);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      });
    }
    function lantern(x, y, z, parent, pole) {
      if (pole) {
        mesh(new THREE.CylinderGeometry(0.035, 0.05, pole, 8), M.hierro, x, y + pole / 2, z, parent);
        mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.1, 8), M.hierro, x, y + 0.05, z, parent);
      }
      var top = y + (pole || 0);
      mesh(new THREE.CylinderGeometry(0.17, 0.1, 0.34, 4), M.farol, x, top + 0.2, z, parent, { cast: false }).rotation.y = Math.PI / 4;
      mesh(facet(new THREE.ConeGeometry(0.26, 0.2, 4)), M.hierro, x, top + 0.47, z, parent).rotation.y = Math.PI / 4;
      mesh(new THREE.SphereGeometry(0.04, 8, 6), M.hierro, x, top + 0.6, z, parent, { cast: false });
    }
    function potPlant(x, y, z, parent, s, colour) {
      var p = mesh(potGeo, M.barro, x, y, z, parent);
      p.scale.setScalar(s);
      var b = mesh(shrubGeo, M.verde, x, y + 0.62 * s, z, parent);
      b.scale.setScalar(0.46 * s);
      b.rotation.y = rng() * 6;
      if (colour) b.material = colour;
    }
    function windowUnit(x, y, z, w, h, rotY, parent) {
      var g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = rotY || 0;
      parent.add(g);
      mesh(box(w, h, 0.06), M.vidrio, 0, 0, 0, g, { cast: false });
      var f = 0.09;
      mesh(box(w + f * 2, f, 0.14), M.blancoMate, 0, h / 2 + f / 2, 0, g);
      mesh(box(w + f * 2, f, 0.2), M.blancoMate, 0, -h / 2 - f / 2, 0.02, g);
      mesh(box(f, h, 0.14), M.blancoMate, -w / 2 - f / 2, 0, 0, g);
      mesh(box(f, h, 0.14), M.blancoMate, w / 2 + f / 2, 0, 0, g);
      mesh(box(0.05, h, 0.1), M.blancoMate, 0, 0, 0, g, { cast: false });
      return g;
    }

    // plataforma y muro que cae sobre las rocas
    mesh(tbox(26, 8, 16, 2.5), M.cal, 0, TOP - 4, -2, resto);
    mesh(tbox(25.2, 0.08, 15.2, 1.6), M.suelo, 0, TOP + 0.04, -2, resto, { cast: false });
    // zócalo más oscuro por la humedad del mar
    mesh(tbox(26.06, 1.3, 16.06, 2.5), pbr({ color: 0xcfc9bb, map: T.cal, roughness: 0.98 }), 0, -0.1, -2, resto, { cast: false });

    // rótulo pintado y postes blancos del muro
    (function () {
      var sign = mesh(new THREE.PlaneGeometry(6.4, 3.2), pbr({ color: 0xfbf8f1, map: T.rotulo, roughness: 0.94 }), -5.5, TOP - 2.1, -10.03, resto, { cast: false, receive: false });
      sign.rotation.y = Math.PI;
      [-11.2, -1.2, 3.6, 8.6].forEach(function (x) {
        mesh(box(0.12, 4.3, 0.12), M.blancoMate, x, TOP + 0.6, -10.12, resto);
        mesh(box(0.2, 0.06, 0.26), M.blancoMate, x, TOP - 0.9, -10.08, resto, { cast: false });
        mesh(box(0.2, 0.06, 0.26), M.blancoMate, x, TOP + 0.3, -10.08, resto, { cast: false });
      });
    })();

    // comedor acristalado con toldos
    (function () {
      mesh(tbox(15, 3.7, 7, 2.5), M.cal, -1.5, TOP + 1.85, 2.2, resto);
      mesh(tbox(15.5, 0.22, 7.5, 2.5), M.cal, -1.5, TOP + 3.81, 2.2, resto);
      // peto con balaustres en la cubierta
      var y = TOP + 3.92, i;
      [[[-9, -1.3], [6, -1.3]], [[-9, -1.3], [-9, 5.7]]].forEach(function (r) {
        var dx = r[1][0] - r[0][0], dz = r[1][1] - r[0][1], len = Math.sqrt(dx * dx + dz * dz), ang = Math.atan2(dx, dz);
        mesh(tbox(0.3, 0.1, len, 2.5), M.cal, (r[0][0] + r[1][0]) / 2, y + 0.52, (r[0][1] + r[1][1]) / 2, resto).rotation.y = ang;
      });
      var list = [];
      for (i = 0; i < 46; i++) list.push([-9 + i * (15 / 46) + 0.16, -1.3]);
      for (i = 1; i < 21; i++) list.push([-9, -1.3 + i * (7 / 21)]);
      var im = instanced(balusterGeo, M.cal, list.length, resto), d = new THREE.Object3D();
      list.forEach(function (b, k) { d.position.set(b[0], y, b[1]); d.scale.set(0.8, 0.68, 0.8); d.updateMatrix(); im.setMatrixAt(k, d.matrix); });

      for (i = 0; i < 5; i++) {
        windowUnit(-7.3 + i * 2.9, TOP + 1.42, -1.34, 2.4, 2.3, 0, resto);
        // toldo de rayas ocres
        var a = mesh(new THREE.PlaneGeometry(2.7, 1.5), M.toldo, -7.3 + i * 2.9, TOP + 2.86, -2.0, resto);
        a.rotation.x = -Math.PI / 2 + 0.42;
        mesh(new THREE.PlaneGeometry(2.7, 0.22), M.toldo, -7.3 + i * 2.9, TOP + 2.47, -2.69, resto);
      }
      for (i = 0; i < 2; i++) windowUnit(-9.04, TOP + 1.42, 0.7 + i * 3.1, 2.4, 2.3, Math.PI / 2, resto);
      // faroles de pared
      [-8.75, -5.85, -2.95, -0.05, 2.85, 5.75].forEach(function (x) { lantern(x, TOP + 2.75, -1.48, resto, 0); });
    })();

    // pabellón porticado con cubierta de teja y pilares de piedra
    (function () {
      var cx = 9.4, cz = 2.2, w = 6.8;
      mesh(tbox(w, 3.2, 0.3, 2.5), M.cal, cx, TOP + 1.6, cz + w / 2 - 0.15, resto);
      mesh(tbox(0.3, 3.2, w, 2.5), M.cal, cx + w / 2 - 0.15, TOP + 1.6, cz, resto);
      mesh(tbox(w, 0.9, 0.3, 2.5), M.cal, cx, TOP + 0.45, cz - w / 2 + 0.15, resto);
      [[-1, -1], [1, -1], [-1, 1], [0, -1]].forEach(function (s) {
        mesh(tbox(0.55, 3.2, 0.55, 1.4), M.piedra, cx + s[0] * (w / 2 - 0.28), TOP + 1.6, cz + s[1] * (w / 2 - 0.28), resto);
      });
      mesh(box(w + 0.5, 0.2, w + 0.5), M.madera, cx, TOP + 3.3, cz, resto);
      mesh(hipRoof(w + 1.5, w + 1.5, 2.1, 1.3), M.teja, cx, TOP + 3.4, cz, resto);
      mesh(box(w - 0.6, 0.05, w - 0.6), pbr({ color: 0x20160f, roughness: 1 }), cx, TOP + 3.18, cz, resto, { cast: false });
    })();

    // cuerpo alto con balcón y templete de teja
    (function () {
      var cx = 11.2, cz = -8.2, s = 3.4, h = 5.2;
      mesh(tbox(s, h, s, 2.5), M.cal, cx, TOP + h / 2, cz, resto);
      windowUnit(cx, TOP + 1.5, cz - s / 2 - 0.02, 1.2, 1.7, 0, resto);
      windowUnit(cx - s / 2 - 0.02, TOP + 1.5, cz, 1.2, 1.7, Math.PI / 2, resto);
      mesh(tbox(s + 0.5, 0.18, s + 0.5, 2.5), M.cal, cx, TOP + h + 0.09, cz, resto);
      var y = TOP + h + 0.18, e = s / 2 + 0.05;
      [[-e, -e, e, -e], [-e, -e, -e, e], [e, -e, e, e], [-e, e, e, e]].forEach(function (r) {
        var len = s + 0.1, horiz = r[1] === r[3];
        mesh(box(horiz ? len : 0.16, 0.9, horiz ? 0.16 : len), M.calLisa, cx + (r[0] + r[2]) / 2, y + 0.45, cz + (r[1] + r[3]) / 2, resto);
      });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) {
        mesh(box(0.14, 2.3, 0.14), M.madera, cx + q[0] * (e - 0.1), y + 1.15, cz + q[1] * (e - 0.1), resto);
      });
      mesh(box(s + 0.7, 0.12, s + 0.7), M.madera, cx, y + 2.34, cz, resto);
      mesh(hipRoof(s + 1.4, s + 1.4, 1.2, 1.3), M.teja, cx, y + 2.4, cz, resto);
      lantern(cx - s / 2 - 0.16, TOP + 3.3, cz - s / 2 - 0.16, resto, 0);
    })();

    // balaustrada de la terraza, faroles y macetas
    (function () {
      var y = TOP + 0.08;
      balustrade([
        { a: [-12.75, -9.75], b: [9.45, -9.75] },
        { a: [-12.75, -9.75], b: [-12.75, -0.2] },
        { a: [12.75, -6.4], b: [12.75, -1.4] }
      ], y, resto);
      [[-12.75, -9.75], [-6.4, -9.75], [-0.05, -9.75], [6.28, -9.75], [-12.75, -4.98]].forEach(function (p) {
        lantern(p[0], y + 1.2, p[1], resto, 1.05);
      });
      [[-9.6, -9.75], [-3.2, -9.75], [3.1, -9.75], [9.45, -9.75], [-12.75, -0.2], [12.75, -1.4], [12.75, -6.4]].forEach(function (p, i) {
        potPlant(p[0], y + 1.2, p[1], resto, i % 2 ? 1.0 : 1.25);
      });
    })();

    // mesas vestidas y sillas de aluminio con cojín azul
    var candles;
    (function () {
      var tables = [], x, z;
      for (z = -7.5; z <= -4.3; z += 3.1) for (x = -10.2; x <= 8.2; x += 3.65) tables.push([x, z]);
      var nT = tables.length;

      var skirt = facet(new THREE.CylinderGeometry(0.66 * Math.SQRT2, 0.72 * Math.SQRT2, 0.5, 4, 1, true));
      skirt.rotateY(Math.PI / 4);
      var clothGeo = merge([xf(facet(box(1.32, 0.03, 1.32)), 0, 0.775, 0), xf(skirt, 0, 0.51, 0)]);
      var legGeo = merge([new THREE.CylinderGeometry(0.035, 0.035, 0.76, 8).translate(0, 0.38, 0), new THREE.CylinderGeometry(0.24, 0.26, 0.03, 12).translate(0, 0.015, 0)]);

      var tube = function (len, r) { return new THREE.CylinderGeometry(r || 0.014, r || 0.014, len, 6); };
      var frameGeo = merge([
        xf(tube(0.64), -0.23, 0.32, 0.2), xf(tube(0.64), 0.23, 0.32, 0.2),
        xf(tube(0.96), -0.23, 0.48, -0.22, -0.1), xf(tube(0.96), 0.23, 0.48, -0.22, -0.1),
        xf(tube(0.46), -0.23, 0.64, -0.01, Math.PI / 2), xf(tube(0.46), 0.23, 0.64, -0.01, Math.PI / 2),
        xf(tube(0.46), 0, 0.95, -0.27, 0, 0, Math.PI / 2), xf(tube(0.46), 0, 0.43, 0.2, 0, 0, Math.PI / 2),
        xf(tube(0.42), -0.23, 0.43, 0, Math.PI / 2), xf(tube(0.42), 0.23, 0.43, 0, Math.PI / 2)
      ]);
      var cushionGeo = merge([xf(box(0.42, 0.06, 0.4), 0, 0.47, 0), xf(box(0.42, 0.4, 0.05), 0, 0.74, -0.235, -0.1)]);
      var plateGeo = new THREE.CylinderGeometry(0.13, 0.09, 0.016, 18);
      var glassGeo = new THREE.LatheGeometry([[0.035, 0], [0.004, 0.012], [0.004, 0.09], [0.04, 0.13], [0.045, 0.2], [0.036, 0.23]].map(function (p) { return new THREE.Vector2(p[0], p[1]); }), 10);

      var cloth = instanced(clothGeo, M.mantel, nT, resto), leg = instanced(legGeo, M.aluminio, nT, resto);
      var frame = instanced(frameGeo, M.aluminio, nT * 4, resto), cushion = instanced(cushionGeo, M.azul, nT * 4, resto);
      var plate = instanced(plateGeo, M.loza, nT * 4, resto, false), glass = instanced(glassGeo, M.cristal, nT * 4, resto, false);
      candles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffcf7d, transparent: true, opacity: 0, fog: false }), nT);
      resto.add(candles);

      var d = new THREE.Object3D(), k = 0;
      tables.forEach(function (t, i) {
        d.scale.set(1, 1, 1);
        d.rotation.set(0, 0, 0);
        d.position.set(t[0], TOP + 0.08, t[1]);
        d.updateMatrix();
        cloth.setMatrixAt(i, d.matrix);
        leg.setMatrixAt(i, d.matrix);
        d.position.set(t[0], TOP + 0.95, t[1]);
        d.updateMatrix();
        candles.setMatrixAt(i, d.matrix);
        for (var s = 0; s < 4; s++) {
          var a = (s * Math.PI) / 2 + (rng() - 0.5) * 0.22, r = 0.98 + rng() * 0.1;
          d.rotation.set(0, a + Math.PI, 0);
          d.position.set(t[0] + Math.sin(a) * r, TOP + 0.08, t[1] + Math.cos(a) * r);
          d.updateMatrix();
          frame.setMatrixAt(k, d.matrix);
          cushion.setMatrixAt(k, d.matrix);
          d.rotation.set(0, 0, 0);
          d.position.set(t[0] + Math.sin(a) * 0.4, TOP + 0.885, t[1] + Math.cos(a) * 0.4);
          d.updateMatrix();
          plate.setMatrixAt(k, d.matrix);
          d.position.set(t[0] + Math.sin(a + 0.55) * 0.36, TOP + 0.877, t[1] + Math.cos(a + 0.55) * 0.36);
          d.updateMatrix();
          glass.setMatrixAt(k, d.matrix);
          k++;
        }
      });
    })();

    // terraza baja: losas de piedra, sombrillas de brezo, hamacas y mampara de cristal
    (function () {
      var LOW = 1.8, cx = -21.5, cz = -3;
      mesh(tbox(15, 6, 12.5, 2.5), M.cal, cx, LOW - 3, cz, resto);
      mesh(tbox(14.6, 0.08, 12.1, 2.6), M.losa, cx, LOW + 0.04, cz, resto, { cast: false });
      mesh(tbox(15.06, 1.3, 12.56, 2.5), pbr({ color: 0xcfc9bb, map: T.cal, roughness: 0.98 }), cx, -0.1, cz, resto, { cast: false });
      // mampara de cristal hacia el mar, con pasamanos blanco
      mesh(box(14.8, 0.9, 0.03), M.cristal, cx, LOW + 0.6, cz - 6.1, resto, { cast: false });
      mesh(box(15, 0.07, 0.1), M.blancoMate, cx, LOW + 1.08, cz - 6.1, resto);
      mesh(tbox(15, 0.16, 0.24, 2.5), M.cal, cx, LOW + 0.1, cz - 6.1, resto);
      for (var i = 0; i <= 6; i++) mesh(box(0.07, 1.06, 0.07), M.blancoMate, cx - 7.4 + i * (14.8 / 6), LOW + 0.55, cz - 6.1, resto);
      // balaustrada en el extremo
      balustrade([{ a: [cx - 7.3, cz - 6.0], b: [cx - 7.3, cz + 6.0] }], LOW + 0.08, resto);
      // escalones hacia la terraza principal
      for (var s = 0; s < 5; s++) mesh(tbox(1.5, 0.36, 2.6, 2.5), M.cal, -14.7 + s * 0.4, LOW + 0.18 + s * 0.36, 2.2, resto);

      var cone = new THREE.ConeGeometry(1.85, 0.95, 28, 4, true), p = cone.attributes.position, v;
      for (i = 0; i < p.count; i++) if (p.getY(i) < -0.4) { v = 1 + (hash2(p.getX(i) * 9, p.getZ(i) * 9) - 0.5) * 0.09; p.setXYZ(i, p.getX(i) * v, p.getY(i) - hash2(p.getZ(i) * 7, p.getX(i) * 5) * 0.09, p.getZ(i) * v); }
      cone.computeVertexNormals();
      var tuft = new THREE.ConeGeometry(0.2, 1.1, 10, 1, true);
      var tChair = (function () {
        var tube = function (len) { return new THREE.CylinderGeometry(0.014, 0.014, len, 6); };
        return merge([
          xf(tube(0.44), -0.2, 0.22, 0.18), xf(tube(0.44), 0.2, 0.22, 0.18), xf(tube(0.86), -0.2, 0.43, -0.2, -0.08), xf(tube(0.86), 0.2, 0.43, -0.2, -0.08),
          xf(box(0.42, 0.025, 0.4), 0, 0.44, 0), xf(box(0.42, 0.36, 0.025), 0, 0.68, -0.22, -0.08)
        ]);
      })();
      [[-25.6, -6.2], [-20.6, -6.6], [-16.7, -5.0], [-24.7, -1.3], [-19.7, -0.7]].forEach(function (q, k) {
        mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.5, 8), M.madera, q[0], LOW + 1.25, q[1], resto);
        mesh(cone, M.brezo, q[0], LOW + 2.62, q[1], resto);
        mesh(tuft, M.brezo, q[0], LOW + 3.5, q[1], resto);
        mesh(new THREE.ConeGeometry(0.62, 0.5, 16, 1, true), M.brezo, q[0], LOW + 3.12, q[1], resto);
        // mesa cuadrada y sillas blancas
        mesh(box(0.7, 0.03, 0.7), M.blancoMate, q[0] + 0.55, LOW + 0.8, q[1] + 0.35, resto);
        mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.72, 6), M.aluminio, q[0] + 0.55, LOW + 0.44, q[1] + 0.35, resto);
        for (var c = 0; c < 2; c++) {
          var ch = mesh(tChair, M.blancoMate, q[0] + 0.55 + (c ? 0.75 : -0.75), LOW + 0.08, q[1] + 0.35, resto);
          ch.rotation.y = c ? -Math.PI / 2 : Math.PI / 2;
        }
        if (k < 3) {
          // hamaca
          var l = new THREE.Group();
          l.position.set(q[0] - 1.2, LOW + 0.08, q[1] + 1.2);
          l.rotation.y = 0.3 * (k - 1) + Math.PI;
          resto.add(l);
          mesh(box(0.62, 0.07, 1.35), M.blancoMate, 0, 0.3, 0.15, l);
          mesh(box(0.62, 0.07, 0.6), M.blancoMate, 0, 0.46, -0.72, l).rotation.x = 0.55;
          [[-0.26, 0.6], [0.26, 0.6], [-0.26, -0.4], [0.26, -0.4]].forEach(function (g2) { mesh(box(0.05, 0.28, 0.05), M.blancoMate, g2[0], 0.14, g2[1], l); });
        }
      });
      // farol de suelo
      mesh(box(0.26, 0.5, 0.26), M.hierro, -15.4, LOW + 0.33, -8.6, resto);
      mesh(box(0.2, 0.3, 0.2), M.farol, -15.4, LOW + 0.33, -8.6, resto, { cast: false });
    })();

    /* ================= vegetación ================= */
    var palms = [];
    var palmDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.palma, alphaTest: 0.35 });
    function palm(x, z, h, lean) {
      var g = new THREE.Group(), y0 = landH(x, z) - 0.3;
      g.position.set(x, y0, z);
      var pts = [], i;
      for (i = 0; i <= 6; i++) { var t = i / 6; pts.push(new THREE.Vector3(Math.sin(t * 1.3) * lean * h, t * h, 0)); }
      var curve = new THREE.CatmullRomCurve3(pts);
      var trunk = new THREE.TubeGeometry(curve, 14, 0.2, 9, false), uv = trunk.attributes.uv;
      for (i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * h * 0.9, uv.getY(i) * 2);
      mesh(trunk, M.tronco, 0, 0, 0, g);
      var topP = pts[6];
      mesh(new THREE.SphereGeometry(0.34, 10, 8), M.tronco, topP.x, topP.y - 0.1, 0, g);
      // hojas: plano curvado con textura recortada
      var fronds = [], n = 17;
      for (i = 0; i < n; i++) {
        var f = new THREE.PlaneGeometry(1.15, 3.7, 2, 9), p = f.attributes.position, tier = i % 3;
        for (var k = 0; k < p.count; k++) {
          var yy = p.getY(k) + 1.85, tt = yy / 3.7, xx = p.getX(k);
          var droop = (0.5 + tier * 0.45) * tt * tt * 2.1;
          p.setXYZ(k, xx, yy * (1 - 0.12 * tt), droop - Math.abs(xx) * 0.32);
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
      scene.add(g);
      palms.push({ crown: crown, phase: rng() * 6 });
    }
    palm(15.5, 9.5, 7.4, 0.2);
    palm(-11.5, 10.5, 6.4, -0.16);
    palm(19, 7.5, 5.6, 0.26);
    palm(-31, 6.5, 6.0, -0.22);
    palm(2.5, 11.5, 5.2, 0.1);

    // matas y arbustos sobre la roca
    (function () {
      var near = [[16, 6, 2.0], [19.5, 9, 1.6], [14.4, 8, 1.4], [21.5, 6.5, 1.8], [-10, 8.2, 1.5], [5, 9.2, 1.4], [8.5, 10.2, 1.3], [-15, 8.6, 1.4], [-27, 5.6, 1.4], [24, 9.5, 1.7]];
      var n = isMobile ? 90 : 170, im = instanced(shrubGeo, M.pino, near.length + n), d = new THREE.Object3D(), c = new THREE.Color(), i;
      var tones = [0x5d7f3c, 0x6f8748, 0x4f6e3a, 0x86905a, 0x7a8f6a];
      near.forEach(function (s, k) {
        d.position.set(s[0], landH(s[0], s[1]) + s[2] * 0.35, s[1]);
        d.scale.set(s[2] * 1.15, s[2] * 0.8, s[2] * 1.15);
        d.rotation.set(0, rng() * 6, 0);
        d.updateMatrix();
        im.setMatrixAt(k, d.matrix);
        im.setColorAt(k, c.setHex(tones[k % 3]));
      });
      for (i = 0; i < n; i++) {
        var x = (rng() - 0.5) * 400, z = coastZ(x) + 2.5 + Math.pow(rng(), 1.6) * 60;
        if (x > -31 && x < 15 && z < 9) z = 9 + rng() * 30;
        var s = 0.45 + rng() * 1.0;
        d.position.set(x, landH(x, z) + s * 0.25, z);
        d.scale.set(s * (1 + rng() * 0.6), s * 0.7, s * (1 + rng() * 0.6));
        d.rotation.set(0, rng() * 6, 0);
        d.updateMatrix();
        im.setMatrixAt(near.length + i, d.matrix);
        im.setColorAt(near.length + i, c.setHex(tones[Math.floor(rng() * tones.length)]).multiplyScalar(0.8 + rng() * 0.35));
      }
    })();

    // casas y pinos de Les Rotes, al fondo
    (function () {
      var i, d = new THREE.Object3D(), c = new THREE.Color();
      for (i = 0; i < 18; i++) {
        var x = (rng() - 0.5) * 260, z = 26 + rng() * 66;
        if (Math.abs(x) < 28 && z < 38) continue;
        var w = 6 + rng() * 5, h = 3 + rng() * 2.6, dp = 6 + rng() * 4, y = landH(x, z), rot = rng() * 0.6 - 0.3;
        var house = new THREE.Group();
        house.position.set(x, y - 0.4, z);
        house.rotation.y = rot;
        scene.add(house);
        mesh(tbox(w, h + 0.4, dp, 2.5), M.cal, 0, (h + 0.4) / 2, 0, house);
        if (rng() > 0.3) mesh(hipRoof(w + 0.9, dp + 0.9, 1.5, 1.3), M.teja, 0, h + 0.4, 0, house);
        for (var k = 0; k < 3; k++) mesh(box(1.0, 1.2, 0.05), M.vidrio, -w / 2 + 1.4 + k * ((w - 2.8) / 2), h * 0.5, -dp / 2 - 0.02, house, { cast: false });
      }
      var n = isMobile ? 70 : 140, canopy = blob(2, 0.85, 1.9, 0.7, 0, 0.6);
      var crowns = instanced(canopy, M.pino, n * 3), trunks = instanced(new THREE.CylinderGeometry(0.14, 0.22, 1, 6), M.tronco, n);
      var greens = [0x3f6638, 0x4a7340, 0x375c34, 0x55783f];
      for (i = 0; i < n; i++) {
        var px = (rng() - 0.5) * 400, pz = 18 + rng() * 140;
        if (Math.abs(px) < 24 && pz < 24) pz += 24;
        var py = landH(px, pz), s = 1.9 + rng() * 2.0, th = 2.4 + rng() * 3, lean = (rng() - 0.5) * 0.25;
        d.position.set(px, py + th / 2 - 0.2, pz); d.scale.set(1, th, 1); d.rotation.set(lean, 0, lean * 0.6); d.updateMatrix();
        trunks.setMatrixAt(i, d.matrix);
        for (var b = 0; b < 3; b++) {
          var ox = (rng() - 0.5) * s * 0.9, oz = (rng() - 0.5) * s * 0.9, bs = s * (0.62 + rng() * 0.4);
          d.position.set(px + ox + lean * th, py + th + bs * 0.32 + b * 0.25, pz + oz);
          d.scale.set(bs * 1.15, bs * 0.78, bs * 1.15);
          d.rotation.set(rng() * 0.4, rng() * 6, rng() * 0.4);
          d.updateMatrix();
          crowns.setMatrixAt(i * 3 + b, d.matrix);
          crowns.setColorAt(i * 3 + b, c.setHex(greens[Math.floor(rng() * greens.length)]).multiplyScalar(0.8 + rng() * 0.4));
        }
      }
    })();

    // el Montgó, detrás de Les Rotes
    (function () {
      var g = new THREE.PlaneGeometry(760, 260, isMobile ? 80 : 130, isMobile ? 26 : 40);
      g.rotateX(-Math.PI / 2);
      var p = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(p.count * 3);
      var cRock = new THREE.Color(0xa59a98), cRock2 = new THREE.Color(0x857c80), cGreen = new THREE.Color(0x5f7a52), cDry = new THREE.Color(0x8d8a62), c = new THREE.Color();
      for (var i = 0; i < p.count; i++) {
        var x = p.getX(i), z = p.getZ(i);
        var u = (x + 380) / 760;
        var ridge = smooth(0.02, 0.3, u) * (1 - smooth(0.6, 1, u) * 0.92);
        ridge *= 0.8 + 0.2 * Math.sin(u * 9 + 1.3) + (vnoise(x * 0.02, 7) - 0.5) * 0.3;
        var cross = Math.max(0, 1 - Math.pow(Math.abs(z) / 130, 1.5));
        var base = Math.max(0, ridge * cross);
        // farallón: la parte alta sube de golpe
        var h = base * 70 + smooth(0.42, 0.62, base) * 26 + (fbm(x * 0.035, z * 0.035) - 0.5) * 14 * cross + (fbm(x * 0.12, z * 0.12) - 0.5) * 4 * cross;
        p.setY(i, Math.max(h, -2));
        uv.setXY(i, x / 30, z / 30);
        var n = fbm(x * 0.05 + 3, z * 0.05);
        c.copy(n > 0.5 ? cGreen : cDry).lerp(n > 0.45 ? cRock : cRock2, smooth(26, 58, h + n * 18));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      mesh(g, pbr({ color: 0xffffff, vertexColors: true, map: T.rock, normalMap: T.rockN, normalScale: ns(2.2), roughness: 1 }), 40, 4, 270, scene, { cast: false, receive: false });
    })();

    // Dénia a lo lejos: playa, caserío, castillo sobre el cerro, escollera y sierras detrás
    (function () {
      var g = new THREE.Group();
      g.position.set(-190, 0, -42);
      scene.add(g);
      var o = { cast: false, receive: false };
      mesh(box(170, 2.2, 70), pbr({ color: 0xdccba6, roughness: 1 }), -14, 0.1, 30, g, o);
      var hill = mesh(blob(2, 0.3, 1.2, 1), pbr({ color: 0x66784c, map: T.fol, roughness: 1, vertexColors: true }), 8, 1, 8, g, o);
      hill.scale.set(27, 14, 20);
      mesh(box(15, 2.6, 7.5), M.piedra, 8, 15.2, 8, g, o);
      mesh(box(3.2, 4.8, 3.2), M.piedra, 2.5, 16.2, 6.5, g, o);
      mesh(box(2.8, 4.2, 2.8), M.piedra, 13.8, 15.9, 9.5, g, o);
      mesh(box(70, 1.5, 2.6), pbr({ color: 0x8f8a80, roughness: 1 }), 48, 0.55, -22, g, o).rotation.y = 0.22;
      var n = 150, im = new THREE.InstancedMesh(box(1, 1, 1), pbr({ color: 0xffffff, roughness: 0.95 }), n), d = new THREE.Object3D(), c = new THREE.Color();
      var tones = [0xf6efe2, 0xeadcc0, 0xf0d9b8, 0xfaf6ee, 0xe2c9a4, 0xd9b48f];
      for (var i = 0; i < n; i++) {
        var x = -90 + rng() * 150, z = 3 + rng() * 50;
        if (Math.abs(x - 8) < 26 && z < 30) x += 54;
        var h = 2 + rng() * 6.5;
        d.position.set(x, 1.2 + h / 2, z);
        d.scale.set(3 + rng() * 5, h, 3 + rng() * 5);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
        im.setColorAt(i, c.setHex(tones[Math.floor(rng() * tones.length)]));
      }
      g.add(im);
      // sierras lejanas
      var m = new THREE.PlaneGeometry(520, 60, 70, 1), p = m.attributes.position;
      for (i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, 6 + fbm(p.getX(i) * 0.012 + 5, 2.3) * 34 + fbm(p.getX(i) * 0.06, 9.1) * 6);
        else p.setY(i, -2);
      var far = mesh(m, pbr({ color: 0x66768a, roughness: 1, side: THREE.DoubleSide }), -330, 0, 100, g, o);
      far.rotation.y = Math.PI / 2;
    })();

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
    function sailboat(x, z, s, heading, colour) {
      var g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = heading;
      g.scale.setScalar(s);
      hull(g, 1.9, 0.6, 0.5);
      mesh(new THREE.CylinderGeometry(0.03, 0.035, 4.6, 6), M.aluminio, 0, 2.6, 0.2, g);
      var shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.quadraticCurveTo(0.5, 2.2, 0, 4.1); shape.lineTo(1.9, 0); shape.lineTo(0, 0);
      var sail = mesh(new THREE.ShapeGeometry(shape, 8), colour ? pbr({ color: colour, roughness: 0.9, side: THREE.DoubleSide }) : M.vela, 0, 0.7, 0.12, g, { receive: false });
      sail.rotation.y = -Math.PI / 2 + 0.25;
      scene.add(g);
      boats.push({ g: g, x: x, z: z, phase: rng() * 6, speed: 0.25 + rng() * 0.2 });
    }
    sailboat(-42, -62, 1.5, 1.2, 0xe2572b);
    sailboat(38, -96, 1.8, -1.1, 0);
    (function () {
      // llaüt de pesca fondeado
      var g = new THREE.Group();
      g.position.set(33, 0, -20);
      g.rotation.y = 0.7;
      hull(g, 2.3, 0.8, 0.6);
      mesh(box(0.95, 0.75, 1.15), M.azul, 0, 0.72, 0.5, g);
      mesh(box(1.05, 0.06, 1.25), M.blancoMate, 0, 1.12, 0.5, g);
      mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 6), M.madera, 0, 1.3, -1.0, g);
      scene.add(g);
      boats.push({ g: g, x: 33, z: -20, phase: 2, speed: 0 });
    })();

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
      sun.position.copy(cur.sunDir).multiplyScalar(120).add(sun.target.position);
      renderer.toneMappingExposure = cur.exposure;
      M.vidrio.emissiveIntensity = cur.lamps * 0.9;
      M.farol.emissiveIntensity = cur.lamps * 3.4;
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
    var target = new THREE.Vector3(), sph = { r: 50, theta: 0, phi: 1 }, goal = { r: 50, theta: 0, phi: 1 };
    var portraitWide = true, fov = 42, viewTween = null, mode = "hero", userTouched = false, scrollP = 0;
    var pointer = { x: 0, y: 0 }, pointerS = { x: 0, y: 0 };
    var offset = { x: 0, y: 0 }, offsetGoal = { x: 0, y: 0 };
    var R_MIN = 7, R_MAX = 95, PHI_MIN = 0.32, PHI_MAX = 1.53;

    function fromView(v) {
      var p = new THREE.Vector3().fromArray(v.pos), t = new THREE.Vector3().fromArray(v.target);
      var d = p.clone().sub(t), r = d.length();
      return { target: t, r: r, theta: Math.atan2(d.x, d.z), phi: Math.acos(clamp(d.y / r, -1, 1)), fov: v.fov };
    }
    function snapTo(name) {
      var s = fromView(VIEWS[name]);
      target.copy(s.target);
      sph.r = goal.r = s.r; sph.theta = goal.theta = s.theta; sph.phi = goal.phi = s.phi;
      fov = s.fov;
      portraitWide = name === "general" || name === "hero";
    }
    function goTo(name, dur) {
      if (!VIEWS[name]) return;
      portraitWide = name === "general" || name === "hero";
      var s = fromView(VIEWS[name]);
      // camino angular más corto
      var dTheta = s.theta - sph.theta;
      while (dTheta > Math.PI) dTheta -= Math.PI * 2;
      while (dTheta < -Math.PI) dTheta += Math.PI * 2;
      viewTween = {
        t: 0, dur: dur || 1.9,
        a: { target: target.clone(), r: sph.r, theta: sph.theta, phi: sph.phi, fov: fov },
        b: { target: s.target, r: s.r, theta: sph.theta + dTheta, phi: s.phi, fov: s.fov }
      };
    }
    function stepView(dt) {
      if (!viewTween) return;
      viewTween.t = Math.min(1, viewTween.t + dt / viewTween.dur);
      var e = easeInOut(viewTween.t), a = viewTween.a, b = viewTween.b;
      target.copy(a.target).lerp(b.target, e);
      sph.r = goal.r = lerp(a.r, b.r, e);
      sph.theta = goal.theta = lerp(a.theta, b.theta, e);
      sph.phi = goal.phi = lerp(a.phi, b.phi, e);
      fov = lerp(a.fov, b.fov, e);
      if (viewTween.t >= 1) viewTween = null;
    }
    snapTo("hero");

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
      if (mode === "hero") {
        if (size.w >= 900) { offsetGoal.x = 0.2; offsetGoal.y = 0.02; }
        else { offsetGoal.x = 0; offsetGoal.y = 0.25; }
      } else { offsetGoal.x = 0; offsetGoal.y = size.w >= 900 ? 0 : 0.03; }
    }

    function updateCamera(dt, time, eco) {
      stepView(dt);
      var k = 1 - Math.pow(0.0015, dt); // amortiguación independiente de los fps
      if (!viewTween) {
        if (mode === "explore" && !userTouched && !reduced && !eco) goal.theta += dt * 0.035;
        sph.theta = lerp(sph.theta, goal.theta, k);
        sph.phi = lerp(sph.phi, goal.phi, k);
        sph.r = lerp(sph.r, goal.r, k);
      }
      pointerS.x = lerp(pointerS.x, pointer.x, k * 0.5);
      pointerS.y = lerp(pointerS.y, pointer.y, k * 0.5);
      var theta = sph.theta, phi = sph.phi, r = sph.r;
      if (mode === "hero") {
        if (!reduced && !eco) theta += Math.sin(time * 0.11) * 0.07;
        theta += pointerS.x * 0.05 + scrollP * 0.3;
        phi = clamp(phi + pointerS.y * 0.025 - scrollP * 0.1, PHI_MIN, PHI_MAX);
        r *= 1 - scrollP * 0.14;
      }
      // en pantallas verticales la cámara se aleja para que quepa todo el edificio
      if (camera.aspect < 0.9 && (mode === "hero" || portraitWide)) r *= 1.34;
      var sp = Math.sin(phi);
      camera.position.set(target.x + r * sp * Math.sin(theta), target.y + r * Math.cos(phi), target.z + r * sp * Math.cos(theta));
      // nunca por debajo del agua ni del terreno
      var floor = Math.max(0.9, landH(camera.position.x, camera.position.z) + 1.2);
      if (camera.position.y < floor) camera.position.y = floor;
      camera.lookAt(target);
      offset.x = lerp(offset.x, offsetGoal.x, k * 0.6);
      offset.y = lerp(offset.y, offsetGoal.y, k * 0.6);
      camera.fov = fov;
      if (Math.abs(offset.x) > 0.001 || Math.abs(offset.y) > 0.001) camera.setViewOffset(size.w, size.h, -offset.x * size.w, offset.y * size.h, size.w, size.h);
      else camera.clearViewOffset();
      camera.updateProjectionMatrix();
      sky.position.copy(camera.position);
    }

    /* ================= bucle ================= */
    var active = true, running = true, last = 0, lastRaf = 0, frameCbs = [], firstFrame = false, frames = 0, dirty = true;

    // Regulador de calidad: si el equipo no llega, se baja resolución y sombras;
    // sin aceleración gráfica (nivel 3) solo se dibuja cuando algo cambia,
    // para que el resto de la página siga respondiendo.
    var quality = { level: 0, sum: 0, n: 0, warm: 0, lastRender: 0 };
    function setLevel(l) {
      if (l <= quality.level) return;
      quality.level = l;
      quality.warm = 0; quality.sum = 0; quality.n = 0;
      if (l >= 2) { sun.castShadow = false; useShadows = false; }
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
      return dirty || !!viewTween || !!timeTween ||
        Math.abs(goal.theta - sph.theta) > 0.002 || Math.abs(goal.phi - sph.phi) > 0.002 || Math.abs(goal.r - sph.r) > 0.05 ||
        Math.abs(offsetGoal.x - offset.x) > 0.002 || Math.abs(offsetGoal.y - offset.y) > 0.002;
    }

    function frame(now) {
      if (!running) return;
      requestAnimationFrame(frame);
      if (!active || document.hidden) { last = now; lastRaf = 0; return; }
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
          bt.g.position.x = bt.x + Math.sin(time * 0.02 * bt.speed + bt.phase) * 26;
          bt.g.position.z = bt.z + Math.cos(time * 0.02 * bt.speed + bt.phase) * 9;
        }
      }
      dirty = false;
      updateCamera(dt, time, eco);
      renderer.render(scene, camera);
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
      setTime: function (name, instant) { dirty = true; setTime(name, instant); },
      getTime: function () { return timeName; },
      goTo: function (name, dur) { dirty = true; userTouched = name !== "general" || userTouched; goTo(name, dur); },
      setMode: function (m) {
        if (m === mode) return;
        mode = m;
        dirty = true;
        setOffsetGoal();
        if (m === "hero") { userTouched = false; goTo("hero", 1.6); }
        else goTo("general", 2.1);
      },
      getMode: function () { return mode; },
      setScroll: function (p) { p = clamp(p, 0, 1); if (p !== scrollP) { scrollP = p; dirty = true; } },
      setPointer: function (x, y) { pointer.x = x; pointer.y = y; },
      setActive: function (v) { v = !!v; if (v && !active) dirty = true; active = v; },
      rotate: function (dx, dy) {
        userTouched = true;
        dirty = true;
        viewTween = null;
        goal.theta -= dx;
        goal.phi = clamp(goal.phi - dy, PHI_MIN, PHI_MAX);
      },
      zoom: function (factor) {
        userTouched = true;
        dirty = true;
        viewTween = null;
        if (portraitWide && camera.aspect < 0.9) { sph.r *= 1.34; goal.r = sph.r; portraitWide = false; }
        goal.r = clamp(goal.r * factor, R_MIN, R_MAX);
      },
      project: function (name) {
        var p = POINTS[name];
        if (!p) return null;
        proj.set(p[0], p[1], p[2]).project(camera);
        return { x: (proj.x * 0.5 + 0.5) * size.w, y: (-proj.y * 0.5 + 0.5) * size.h, visible: proj.z < 1 && Math.abs(proj.x) < 1.05 && Math.abs(proj.y) < 1.05 };
      },
      onFrame: function (fn) { frameCbs.push(fn); },
      stats: function () { return { quality: quality.level, camera: camera.position.toArray().map(function (v) { return Math.round(v * 100) / 100; }), frames: frames, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, mode: mode, time: timeName }; },
      snap: function (name, time) { dirty = true; snapTo(name); viewTween = null; if (time) setTime(time, true); offset.x = offsetGoal.x; offset.y = offsetGoal.y; },
      destroy: function () { running = false; renderer.dispose(); }
    };
  };
})();
