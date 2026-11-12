/* ==========================================================================
   El Pegolí — recreación 3D del restaurante (Three.js r160, sin módulos).
   Escena hecha con primitivas: no es un plano a escala, es una vista
   orientativa construida a partir de fotografías públicas del local.
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

  /* ---------- relieve de la costa ---------- */
  function coastZ(x) {
    return 10 + 6 * Math.sin(x * 0.045 + 0.6) + 3 * Math.sin(x * 0.13 + 2.1) - 26 * Math.exp(-(x * x) / 484);
  }
  function landH(x, z) {
    var d = z - coastZ(x) + (fbm(x * 0.08, z * 0.08) - 0.5) * 6;
    var shore = smooth(-3, 4, d);
    var h = -4 + shore * 6.2;
    if (d > 4) h += Math.min((d - 4) * 0.13, 10);
    h += (fbm(x * 0.25, z * 0.25) - 0.5) * 1.5 * shore;
    return h;
  }

  /* ---------- momentos del día ---------- */
  var TIMES = {
    dia: {
      top: 0x2a7bd3, hor: 0xc6e6f6, glow: 0xffffff, glowAmt: 0.22,
      fog: 0xc3e1f1, fogD: 0.0024,
      sunDir: [0.38, 0.84, -0.4], sunCol: 0xfff3da, sunInt: 3.3,
      hemiSky: 0xcfe4ff, hemiGnd: 0xb39b7a, hemiInt: 1.35,
      sea: 0xffffff, seaEm: 0, seaRough: 0.2, exposure: 1.18, lamps: 0, stars: 0, sunSize: 46, sunTint: 0xfffbe8
    },
    atardecer: {
      top: 0x2f3f7c, hor: 0xffa565, glow: 0xffd391, glowAmt: 0.95,
      fog: 0xd79c8c, fogD: 0.0017,
      sunDir: [-0.9, 0.1, -0.42], sunCol: 0xff9548, sunInt: 2.7,
      hemiSky: 0xb7a6d6, hemiGnd: 0x7c5340, hemiInt: 1.15,
      sea: 0x93a0d6, seaEm: 0.09, seaRough: 0.42, exposure: 1.05, lamps: 0.7, stars: 0.15, sunSize: 70, sunTint: 0xffc27a
    },
    noche: {
      top: 0x040a1c, hor: 0x1c2c52, glow: 0x3b4f86, glowAmt: 0.35,
      fog: 0x0c1730, fogD: 0.0036,
      sunDir: [0.42, 0.66, -0.62], sunCol: 0x9db7ff, sunInt: 1.25,
      hemiSky: 0x4a63a6, hemiGnd: 0x1a2236, hemiInt: 1.0,
      sea: 0x6f8abb, seaEm: 0.22, seaRough: 0.6, exposure: 1.2, lamps: 1, stars: 1, sunSize: 26, sunTint: 0xe9efff
    }
  };

  /* ---------- puntos de vista ---------- */
  var VIEWS = {
    hero:     { pos: [-33, 12.5, -44], target: [1, 4.2, -2], fov: 42 },
    general:  { pos: [34, 21, -50],    target: [-4, 3, -2],  fov: 42 },
    terraza:  { pos: [12, 6.3, -1.9], target: [-42, 1.5, -36], fov: 50 },
    comedor:  { pos: [-5, 6.6, -17],   target: [-1.5, 5.1, 0], fov: 46 },
    rocas:    { pos: [-17, 1.5, -23],  target: [-1, 4.4, -7], fov: 50 },
    denia:    { pos: [15, 9.5, 3],     target: [-170, 6, -52], fov: 26 },
    sombrillas: { pos: [-33, 6.2, -14], target: [-20, 3, -2], fov: 46 }
  };

  var POINTS = {
    terraza:    [0, 5.6, -6.2],
    comedor:    [-1.5, 8.2, 0],
    sombrillas: [-21.5, 5.2, -3],
    rocas:      [5, 0.8, -13.5],
    denia:      [-182, 20, -48],
    montgo:     [30, 78, 255]
  };

  NS.VIEWS = VIEWS;
  NS.TIMES = TIMES;

  NS.createScene = function (host, options) {
    var THREE = window.THREE;
    options = options || {};
    if (!THREE) throw new Error("THREE no cargado");

    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var isMobile = window.innerWidth < 900 || /Mobi|Android/i.test(navigator.userAgent);
    var rng = makeRng(1943);

    /* ================= renderer ================= */
    var renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    renderer.setSize(host.clientWidth || window.innerWidth, host.clientHeight || window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    var useShadows = !isMobile;
    if (useShadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(TIMES.dia.fog, TIMES.dia.fogD);
    scene.background = new THREE.Color(TIMES.dia.hor);

    var camera = new THREE.PerspectiveCamera(42, 1, 0.3, 1400);

    /* ================= materiales ================= */
    function std(color, rough, extra) {
      var o = { color: color, roughness: rough === undefined ? 0.9 : rough, metalness: 0 };
      if (extra) for (var k in extra) o[k] = extra[k];
      return new THREE.MeshStandardMaterial(o);
    }
    var M = {
      cal: std(0xffffff, 0.9),
      calSombra: std(0xe9e3d6, 0.95),
      teja: std(0xb9583a, 0.85, { flatShading: true }),
      suelo: std(0xc48f6c, 0.9),
      arena: std(0xdbc9a5, 0.95),
      vidrio: std(0x3f7596, 0.1, { metalness: 0.1, emissive: 0xffc77e, emissiveIntensity: 0 }),
      brezo: std(0xc8a25a, 1, { flatShading: true }),
      madera: std(0x4d3626, 0.9),
      azul: std(0x1c55b9, 0.55),
      mantel: std(0xffffff, 0.85),
      hierro: std(0x1c1c1e, 0.6),
      farol: std(0xfff1cf, 0.4, { emissive: 0xffc56e, emissiveIntensity: 0 }),
      verde: std(0x4f7d3a, 1, { flatShading: true }),
      verdeOscuro: std(0x35603a, 1, { flatShading: true }),
      palma: std(0x4f8a3c, 0.9, { flatShading: true, side: THREE.DoubleSide }),
      tronco: std(0x6d5138, 1, { flatShading: true }),
      roca: std(0xffffff, 1, { flatShading: true }),
      barco: std(0xfbfaf6, 0.7),
      vela: std(0xffffff, 0.9, { side: THREE.DoubleSide }),
      piedra: std(0xb9a27c, 1, { flatShading: true })
    };

    function mesh(geo, mat, x, y, z, parent, opts) {
      var m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      opts = opts || {};
      m.castShadow = opts.cast !== false && useShadows;
      m.receiveShadow = opts.receive !== false && useShadows;
      (parent || scene).add(m);
      return m;
    }
    function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

    /* ================= cielo ================= */
    var SKY_R = 900;
    var skyGeo = new THREE.SphereGeometry(SKY_R, 40, 20);
    skyGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
    var sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    sky.renderOrder = -10;
    scene.add(sky);

    function glowTexture() {
      var c = document.createElement("canvas");
      c.width = c.height = 256;
      var g = c.getContext("2d");
      var grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.16, "rgba(255,255,255,0.95)");
      grad.addColorStop(0.3, "rgba(255,255,255,0.32)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 256, 256);
      var t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    }
    var sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), fog: false, depthWrite: false, transparent: true, toneMapped: false }));
    sunSprite.renderOrder = -9;
    scene.add(sunSprite);

    // estrellas
    var starGeo = new THREE.BufferGeometry();
    (function () {
      var n = 520, arr = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) {
        var th = rng() * Math.PI * 2, y = 0.08 + rng() * 0.92, r = Math.sqrt(1 - y * y);
        arr[i * 3] = Math.cos(th) * r * (SKY_R - 30);
        arr[i * 3 + 1] = y * (SKY_R - 30);
        arr[i * 3 + 2] = Math.sin(th) * r * (SKY_R - 30);
      }
      starGeo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    })();
    var stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    stars.renderOrder = -8;
    scene.add(stars);

    /* ================= luces ================= */
    var hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
    scene.add(hemi);
    var sun = new THREE.DirectionalLight(0xffffff, 3);
    if (useShadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      var sc = sun.shadow.camera;
      sc.left = -46; sc.right = 46; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 260;
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.06;
    }
    scene.add(sun);
    scene.add(sun.target);
    sun.target.position.set(-4, 2, -2);

    var lampLights = [];
    [[0, 7.2, -5.5, 150], [-1.5, 6.1, -0.2, 90], [-21.5, 4.6, -3, 80]].forEach(function (p) {
      var l = new THREE.PointLight(0xffb866, 0, 30, 2);
      l.position.set(p[0], p[1], p[2]);
      l.userData.max = p[3];
      scene.add(l);
      lampLights.push(l);
    });

    /* ================= mar ================= */
    var deep = new THREE.Color(0x1a6ea6), shallow = new THREE.Color(0x49c4bd);
    var SEA_SIZE = 260, SEA_SEG = isMobile ? 84 : 128;
    var seaGeo = new THREE.PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEG, SEA_SEG);
    seaGeo.rotateX(-Math.PI / 2);
    seaGeo.translate(0, 0, -40);
    var seaPos = seaGeo.attributes.position;
    var seaCol = new Float32Array(seaPos.count * 3);
    var seaFade = new Float32Array(seaPos.count);
    (function () {
      var c = new THREE.Color();
      for (var i = 0; i < seaPos.count; i++) {
        var x = seaPos.getX(i), z = seaPos.getZ(i);
        var h = landH(x, z);
        var k = smooth(-3.9, -1.2, h);
        c.copy(deep).lerp(shallow, k * 0.85);
        c.multiplyScalar(0.86 + hash2(x, z) * 0.28);
        seaCol[i * 3] = c.r; seaCol[i * 3 + 1] = c.g; seaCol[i * 3 + 2] = c.b;
        var ex = Math.abs(x) / (SEA_SIZE / 2), ez = Math.abs(z + 40) / (SEA_SIZE / 2);
        seaFade[i] = 1 - smooth(0.82, 1, Math.max(ex, ez));
      }
    })();
    seaGeo.setAttribute("color", new THREE.BufferAttribute(seaCol, 3));
    var seaMat = std(0xffffff, 0.2, { metalness: 0.12, flatShading: true, vertexColors: true });
    var sea = mesh(seaGeo, seaMat, 0, 0, 0, scene, { cast: false });
    var farSea = mesh(new THREE.PlaneGeometry(2600, 2600), std(0x1a6ea6, 0.4, { metalness: 0.1 }), 0, -0.06, -200, scene, { cast: false, receive: false });
    farSea.rotation.x = -Math.PI / 2;

    function updateSea(t) {
      for (var i = 0; i < seaPos.count; i++) {
        var x = seaPos.getX(i), z = seaPos.getZ(i);
        var y = Math.sin(x * 0.19 + t * 0.8) * 0.2 + Math.sin(z * 0.27 - t * 1.05) * 0.17 + Math.sin((x * 0.8 + z) * 0.62 + t * 1.5) * 0.11 + Math.sin((x - z * 0.6) * 1.1 - t * 1.9) * 0.05;
        seaPos.setY(i, y * seaFade[i]);
      }
      seaPos.needsUpdate = true;
    }

    /* ================= costa y tierra ================= */
    (function () {
      var W = 420, D = 200, SX = 150, SZ = 72;
      var g = new THREE.PlaneGeometry(W, D, SX, SZ);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0, 70);
      var p = g.attributes.position;
      var col = new Float32Array(p.count * 3);
      var cRoca = new THREE.Color(0xb8713f), cRoca2 = new THREE.Color(0x8f5a36), cTierra = new THREE.Color(0xa99363),
        cVerde = new THREE.Color(0x5f7f47), cPino = new THREE.Color(0x3f6a3b), c = new THREE.Color();
      for (var i = 0; i < p.count; i++) {
        var x = p.getX(i), z = p.getZ(i), h = landH(x, z);
        p.setY(i, h);
        var n = fbm(x * 0.12 + 9, z * 0.12 + 3);
        if (h < 2.4) c.copy(cRoca2).lerp(cRoca, smooth(-1.5, 1.6, h) * (0.6 + n * 0.6));
        else if (h < 4.2) c.copy(cRoca).lerp(cTierra, smooth(2.4, 4.2, h));
        else c.copy(cTierra).lerp(n > 0.5 ? cPino : cVerde, smooth(4.2, 6.5, h) * (0.55 + n * 0.5));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      mesh(g, std(0xffffff, 1, { flatShading: true, vertexColors: true }), 0, 0, 0, scene, { cast: false });
    })();

    // rocas sueltas junto al agua
    (function () {
      var n = 70, geo = new THREE.IcosahedronGeometry(1, 0);
      var im = new THREE.InstancedMesh(geo, M.roca, n);
      var d = new THREE.Object3D(), c = new THREE.Color();
      for (var i = 0; i < n; i++) {
        var x = (rng() - 0.5) * 150;
        var z = coastZ(x) - 2.5 - rng() * 7;
        if (Math.abs(x) < 15 && z > -11) z = -11.5 - rng() * 6;
        var s = 0.5 + rng() * 1.9;
        d.position.set(x, -0.25 + rng() * 0.5, z);
        d.scale.set(s * (0.8 + rng() * 0.8), s * (0.35 + rng() * 0.4), s * (0.8 + rng() * 0.7));
        d.rotation.set(rng() * 0.5, rng() * 6.28, rng() * 0.5);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
        c.setHex(rng() > 0.5 ? 0xb06c3c : 0x94603a).multiplyScalar(0.85 + rng() * 0.3);
        im.setColorAt(i, c);
      }
      im.castShadow = useShadows; im.receiveShadow = useShadows;
      scene.add(im);
    })();

    /* ================= el restaurante ================= */
    var TOP = 3.6; // cota de la terraza
    var resto = new THREE.Group();
    scene.add(resto);

    // plataforma y muro que cae sobre las rocas
    mesh(box(26, 6.4, 16), M.cal, 0, TOP - 3.2, -2, resto);
    mesh(box(25.4, 0.08, 15.4), M.suelo, 0, TOP + 0.04, -2, resto, { cast: false });

    // rótulo del muro de la terraza (texto dibujado, no es el logotipo original)
    (function () {
      var c = document.createElement("canvas");
      c.width = 1024; c.height = 512;
      var g = c.getContext("2d");
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 1024, 512);
      g.textAlign = "center";
      g.fillStyle = "#23262b";
      g.font = "italic 600 96px Georgia, 'Times New Roman', serif";
      g.fillText("Restaurante", 512, 130);
      g.fillStyle = "#c2372a";
      g.font = "italic 700 168px Georgia, 'Times New Roman', serif";
      g.fillText("El Pegol\u00ed", 512, 300);
      g.fillStyle = "#23262b";
      g.font = "italic 600 96px Georgia, 'Times New Roman', serif";
      g.fillText("Terraza", 512, 430);
      var t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      var sign = mesh(new THREE.PlaneGeometry(6.4, 3.2), std(0xf7f3ea, 0.92, { map: t }), -5.5, TOP - 2.1, -10.03, resto, { cast: false, receive: false });
      sign.rotation.y = Math.PI;
    })();

    // comedor acristalado
    mesh(box(15, 3.6, 7), M.cal, -1.5, TOP + 1.8, 2.2, resto);
    mesh(box(15.6, 0.28, 7.6), M.cal, -1.5, TOP + 3.74, 2.2, resto);
    (function () {
      var i;
      for (i = 0; i < 5; i++) mesh(box(2.45, 2.35, 0.14), M.vidrio, -7.3 + i * 2.9, TOP + 1.5, -1.33, resto, { cast: false });
      for (i = 0; i < 2; i++) mesh(box(0.14, 2.35, 2.5), M.vidrio, -9.03, TOP + 1.5, 0.6 + i * 3.1, resto, { cast: false });
      // toldo corrido sobre los ventanales
      mesh(box(15.2, 0.1, 1.5), M.cal, -1.5, TOP + 3.05, -2.0, resto);
    })();

    // pabellón con cubierta de teja
    mesh(box(6.6, 3.3, 6.6), M.cal, 9.3, TOP + 1.65, 2.2, resto);
    (function () {
      var roof = mesh(new THREE.ConeGeometry(5.5, 2.1, 4), M.teja, 9.3, TOP + 3.3 + 1.05, 2.2, resto);
      roof.rotation.y = Math.PI / 4;
      mesh(box(1.7, 2.2, 0.14), M.vidrio, 9.3, TOP + 1.3, -1.13, resto, { cast: false });
    })();

    // torreón con cubierta de brezo
    mesh(new THREE.CylinderGeometry(1.5, 1.6, 5.4, 8), M.cal, 11.6, TOP + 2.7, -8.6, resto);
    mesh(new THREE.ConeGeometry(2.3, 1.7, 8), M.brezo, 11.6, TOP + 5.4 + 0.85, -8.6, resto);
    mesh(box(0.7, 1.2, 0.1), M.vidrio, 11.6, TOP + 3.6, -10.18, resto, { cast: false });

    // balaustrada blanca
    (function () {
      var y = TOP + 0.08;
      var runs = [
        { a: [-12.8, -9.8], b: [9.8, -9.8] },
        { a: [-12.8, -9.8], b: [-12.8, 5.6] },
        { a: [12.8, -6.8], b: [12.8, -1.3] }
      ];
      var balusters = [];
      runs.forEach(function (r) {
        var dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1];
        var len = Math.sqrt(dx * dx + dz * dz), ang = Math.atan2(dx, dz);
        var cx = (r.a[0] + r.b[0]) / 2, cz = (r.a[1] + r.b[1]) / 2;
        var top = mesh(box(0.34, 0.14, len), M.cal, cx, y + 1.02, cz, resto);
        top.rotation.y = ang;
        var bot = mesh(box(0.28, 0.12, len), M.cal, cx, y + 0.1, cz, resto);
        bot.rotation.y = ang;
        var nP = Math.round(len / 3.2), i;
        for (i = 0; i <= nP; i++) {
          var px = r.a[0] + (dx * i) / nP, pz = r.a[1] + (dz * i) / nP;
          mesh(box(0.46, 1.2, 0.46), M.cal, px, y + 0.6, pz, resto);
          mesh(box(0.56, 0.1, 0.56), M.cal, px, y + 1.24, pz, resto);
        }
        var nB = Math.floor(len / 0.42);
        for (i = 1; i < nB; i++) balusters.push([r.a[0] + (dx * i) / nB, r.a[1] + (dz * i) / nB]);
      });
      var im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.075, 0.1, 0.82, 6), M.cal, balusters.length);
      var d = new THREE.Object3D();
      balusters.forEach(function (b, i) {
        d.position.set(b[0], y + 0.56, b[1]);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      });
      im.castShadow = useShadows;
      resto.add(im);

      // farolas sobre los pilares
      [[-12.8, -9.8], [-6.4, -9.8], [0, -9.8], [6.4, -9.8], [-12.8, -3.4], [-12.8, 3]].forEach(function (p) {
        mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.5, 6), M.hierro, p[0], y + 2.02, p[1], resto);
        mesh(box(0.3, 0.38, 0.3), M.farol, p[0], y + 2.9, p[1], resto, { cast: false });
        mesh(new THREE.ConeGeometry(0.28, 0.2, 4), M.hierro, p[0], y + 3.18, p[1], resto, { cast: false }).rotation.y = Math.PI / 4;
      });
      // macetas con arbusto en las esquinas
      [[9.8, -9.8], [-12.8, 5.6], [12.8, -1.3]].forEach(function (p) {
        mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.5, 8), M.cal, p[0], y + 1.54, p[1], resto);
        var b = mesh(new THREE.IcosahedronGeometry(0.62, 0), M.verde, p[0], y + 2.15, p[1], resto);
        b.scale.set(1.2, 0.85, 1.2);
      });
    })();

    // mesas con mantel blanco y sillas azules
    var candles;
    (function () {
      var tables = [], x, z;
      for (z = -7.6; z <= -4.4; z += 3.1) for (x = -10; x <= 9.2; x += 3.8) tables.push([x, z]);
      var cloth = new THREE.InstancedMesh(box(1.3, 0.74, 1.3), M.mantel, tables.length);
      var seat = new THREE.InstancedMesh(box(0.46, 0.07, 0.46), M.azul, tables.length * 4);
      var back = new THREE.InstancedMesh(box(0.46, 0.5, 0.06), M.azul, tables.length * 4);
      candles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffcf7d, transparent: true, opacity: 0, fog: false }), tables.length);
      var d = new THREE.Object3D(), k = 0;
      tables.forEach(function (t, i) {
        d.rotation.set(0, 0, 0);
        d.position.set(t[0], TOP + 0.45, t[1]);
        d.updateMatrix();
        cloth.setMatrixAt(i, d.matrix);
        d.position.set(t[0], TOP + 0.95, t[1]);
        d.updateMatrix();
        candles.setMatrixAt(i, d.matrix);
        for (var s = 0; s < 4; s++) {
          var a = (s * Math.PI) / 2, cx = t[0] + Math.sin(a) * 0.98, cz = t[1] + Math.cos(a) * 0.98;
          d.rotation.set(0, a, 0);
          d.position.set(cx, TOP + 0.5, cz);
          d.updateMatrix();
          seat.setMatrixAt(k, d.matrix);
          d.position.set(cx + Math.sin(a) * 0.22, TOP + 0.78, cz + Math.cos(a) * 0.22);
          d.updateMatrix();
          back.setMatrixAt(k, d.matrix);
          k++;
        }
      });
      [cloth, seat, back].forEach(function (m) { m.castShadow = useShadows; m.receiveShadow = useShadows; resto.add(m); });
      resto.add(candles);
    })();

    // terraza baja con sombrillas de brezo
    (function () {
      var LOW = 1.8, cx = -21.5, cz = -3;
      mesh(box(15, 5, 12.5), M.cal, cx, LOW - 2.5, cz, resto);
      mesh(box(14.5, 0.08, 12), M.arena, cx, LOW + 0.04, cz, resto, { cast: false });
      mesh(box(15, 0.55, 0.28), M.cal, cx, LOW + 0.3, cz - 6.1, resto);
      mesh(box(0.28, 0.55, 12.5), M.cal, cx - 7.36, LOW + 0.3, cz, resto);
      // escalones hacia la terraza principal
      for (var s = 0; s < 5; s++) mesh(box(1.6, 0.36, 2.6), M.cal, -14.2 + s * 0.4 - 0.9, LOW + 0.18 + s * 0.36, 2.6, resto);
      [[-25.5, -6], [-20.5, -6.4], [-16.6, -4.8], [-24.6, -1.2], [-19.6, -0.6]].forEach(function (p, i) {
        mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.5, 6), M.madera, p[0], LOW + 1.25, p[1], resto);
        mesh(new THREE.ConeGeometry(1.75, 0.85, 10), M.brezo, p[0], LOW + 2.6, p[1], resto);
        mesh(new THREE.ConeGeometry(0.62, 0.7, 10), M.brezo, p[0], LOW + 3.2, p[1], resto);
        mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 10), M.mantel, p[0] + 0.5, LOW + 0.78, p[1] + 0.3, resto);
        mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 6), M.mantel, p[0] + 0.5, LOW + 0.42, p[1] + 0.3, resto, { cast: false });
        if (i < 3) {
          var l = mesh(box(0.66, 0.2, 1.9), M.mantel, p[0] - 0.9, LOW + 0.34, p[1] + 0.9, resto);
          l.rotation.y = 0.25 * (i - 1);
        }
      });
    })();

    // palmeras y vegetación
    var palms = [];
    function palm(x, z, h, lean) {
      var g = new THREE.Group();
      g.position.set(x, landH(x, z) - 0.2, z);
      var n = 6, px = 0, i;
      for (i = 0; i < n; i++) {
        var seg = mesh(new THREE.CylinderGeometry(0.2 - i * 0.012, 0.25 - i * 0.012, h / n + 0.05, 6), M.tronco, px, (h / n) * (i + 0.5), 0, g);
        seg.rotation.z = -lean * (i / n);
        px += Math.sin(lean * (i / n)) * (h / n);
      }
      var crown = new THREE.Group();
      crown.position.set(px, h, 0);
      for (i = 0; i < 11; i++) {
        var frond = new THREE.Group();
        var leaf = mesh(new THREE.ConeGeometry(0.42, 3.3, 4), M.palma, 0, 1.65, 0, frond);
        leaf.scale.z = 0.22;
        frond.rotation.set(0, (i / 11) * Math.PI * 2, 1.05 + (i % 3) * 0.28, "YZX");
        crown.add(frond);
      }
      g.add(crown);
      scene.add(g);
      palms.push({ crown: crown, phase: rng() * 6 });
      return g;
    }
    palm(15.5, 9, 7.2, 0.22);
    palm(-11.5, 10, 6.2, -0.18);
    palm(18.5, 6.5, 5.4, 0.3);
    palm(-30, 6, 5.8, -0.25);

    (function () {
      var spots = [[16, 5, 2.1], [19.5, 8.5, 1.7], [14.6, 7.4, 1.5], [21.5, 5.5, 1.8], [-10, 7.8, 1.6], [3, 8.8, 1.5], [7.5, 9.6, 1.3], [-15, 8.4, 1.4], [-27, 5.2, 1.5]];
      spots.forEach(function (s, i) {
        var b = mesh(new THREE.IcosahedronGeometry(s[2], 0), i % 2 ? M.verde : M.verdeOscuro, s[0], landH(s[0], s[1]) + s[2] * 0.4, s[1], scene);
        b.scale.y = 0.72;
        b.rotation.y = rng() * 6;
      });
    })();

    // casas y pinos de Les Rotes, al fondo
    (function () {
      var i, d = new THREE.Object3D();
      for (i = 0; i < 16; i++) {
        var x = (rng() - 0.5) * 240, z = 22 + rng() * 70;
        if (Math.abs(x) < 26 && z < 34) continue;
        var w = 5 + rng() * 5, h = 2.8 + rng() * 2.4, dp = 5 + rng() * 4, y = landH(x, z);
        var house = mesh(box(w, h, dp), M.cal, x, y + h / 2 - 0.3, z, scene);
        house.rotation.y = rng() * 0.6 - 0.3;
        if (rng() > 0.4) {
          var r = mesh(new THREE.ConeGeometry(Math.max(w, dp) * 0.78, 1.5, 4), M.teja, x, y + h + 0.45, z, scene);
          r.rotation.y = Math.PI / 4 + house.rotation.y;
        }
      }
      var n = isMobile ? 70 : 130;
      var cone = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), M.verdeOscuro, n);
      var trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 1, 5), M.tronco, n);
      for (i = 0; i < n; i++) {
        var px = (rng() - 0.5) * 380, pz = 16 + rng() * 140;
        if (Math.abs(px) < 22 && pz < 20) pz += 22;
        var py = landH(px, pz), s = 1.7 + rng() * 1.8, th = 2 + rng() * 2.4;
        d.position.set(px, py + th / 2, pz); d.scale.set(1, th, 1); d.rotation.set(0, 0, 0); d.updateMatrix();
        trunk.setMatrixAt(i, d.matrix);
        d.position.set(px, py + th + s * 0.45, pz); d.scale.set(s * 1.25, s * 0.8, s * 1.25); d.rotation.set(0, rng() * 6, 0); d.updateMatrix();
        cone.setMatrixAt(i, d.matrix);
      }
      cone.castShadow = useShadows;
      scene.add(cone); scene.add(trunk);
    })();

    // el Montgó, detrás de Les Rotes
    (function () {
      var g = new THREE.PlaneGeometry(760, 240, 60, 18);
      g.rotateX(-Math.PI / 2);
      var p = g.attributes.position, col = new Float32Array(p.count * 3);
      var cRock = new THREE.Color(0x9a8f96), cGreen = new THREE.Color(0x66805c), c = new THREE.Color();
      for (var i = 0; i < p.count; i++) {
        var x = p.getX(i), z = p.getZ(i);
        var u = (x + 380) / 760;
        var ridge = smooth(0.02, 0.3, u) * (1 - smooth(0.62, 1, u) * 0.92);
        ridge *= 0.82 + 0.18 * Math.sin(u * 9 + 1.3) + (vnoise(x * 0.02, 7) - 0.5) * 0.25;
        var cross = 1 - Math.pow(Math.abs(z) / 120, 1.6);
        var h = Math.max(0, ridge * cross) * 96 + (fbm(x * 0.03, z * 0.03) - 0.5) * 9 * cross;
        p.setY(i, Math.max(h, -2));
        c.copy(cGreen).lerp(cRock, smooth(18, 52, h));
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      mesh(g, std(0xffffff, 1, { flatShading: true, vertexColors: true }), 40, 6, 265, scene, { cast: false, receive: false });
    })();

    // Dénia a lo lejos: caserío, castillo sobre el cerro y escollera del puerto
    (function () {
      var g = new THREE.Group();
      g.position.set(-190, 0, -42);
      scene.add(g);
      var o = { cast: false, receive: false };
      mesh(box(150, 2.4, 60), M.arena, -10, 0.2, 24, g, o);
      var hill = mesh(new THREE.CylinderGeometry(9, 27, 13, 9), std(0x7d8a5c, 1, { flatShading: true }), 8, 7.7, 6, g, o);
      hill.scale.z = 0.8;
      mesh(box(14, 2.6, 7), M.piedra, 8, 15.4, 6, g, o);
      mesh(box(3, 4.6, 3), M.piedra, 2.5, 16.4, 4.5, g, o);
      mesh(box(2.6, 4, 2.6), M.piedra, 13.6, 16.1, 7.5, g, o);
      mesh(box(66, 1.6, 2.4), M.piedra, 46, 0.6, -20, g, o).rotation.y = 0.22;
      var n = 120, im = new THREE.InstancedMesh(box(1, 1, 1), std(0xffffff, 0.95), n), d = new THREE.Object3D(), c = new THREE.Color();
      var tones = [0xf6efe2, 0xeadcc0, 0xf0d9b8, 0xfaf6ee, 0xe2c9a4];
      for (var i = 0; i < n; i++) {
        var x = -78 + rng() * 132, z = 2 + rng() * 44;
        if (Math.abs(x - 8) < 24 && z < 28) x += 50;
        var h = 2 + rng() * 5.5;
        d.position.set(x, 1.4 + h / 2, z);
        d.scale.set(3 + rng() * 5, h, 3 + rng() * 5);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
        im.setColorAt(i, c.setHex(tones[Math.floor(rng() * tones.length)]));
      }
      g.add(im);
    })();

    // barcos
    var boats = [];
    function sailboat(x, z, s, heading) {
      var g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = heading;
      g.scale.setScalar(s);
      var hull = mesh(new THREE.CylinderGeometry(0.55, 0.3, 3.4, 8), M.barco, 0, 0.25, 0, g);
      hull.rotation.x = Math.PI / 2;
      hull.scale.set(1, 1, 0.55);
      mesh(new THREE.CylinderGeometry(0.035, 0.035, 4.4, 5), M.madera, 0, 2.5, 0.2, g);
      var shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(0, 4); shape.lineTo(1.9, 0); shape.lineTo(0, 0);
      var sail = mesh(new THREE.ShapeGeometry(shape), M.vela, 0, 0.6, 0.12, g, { receive: false });
      sail.rotation.y = -Math.PI / 2;
      scene.add(g);
      boats.push({ g: g, x: x, z: z, phase: rng() * 6, speed: 0.25 + rng() * 0.2, heading: heading });
    }
    sailboat(-42, -62, 1.5, 1.2);
    sailboat(38, -96, 1.8, -1.1);
    (function () {
      // llaüt de pesca fondeado
      var g = new THREE.Group();
      g.position.set(33, 0, -20);
      g.rotation.y = 0.7;
      var hull = mesh(new THREE.CylinderGeometry(0.75, 0.42, 4.2, 8), M.barco, 0, 0.3, 0, g);
      hull.rotation.x = Math.PI / 2;
      hull.scale.set(1, 1, 0.6);
      mesh(box(0.9, 0.7, 1.1), M.azul, 0, 0.95, 0.5, g);
      mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), M.madera, 0, 1.5, -0.9, g);
      scene.add(g);
      boats.push({ g: g, x: 33, z: -20, phase: 2, speed: 0, heading: 0.7 });
    })();

    /* ================= momento del día ================= */
    function toState(def) {
      return {
        top: new THREE.Color(def.top), hor: new THREE.Color(def.hor), glow: new THREE.Color(def.glow), glowAmt: def.glowAmt,
        fog: new THREE.Color(def.fog), fogD: def.fogD,
        sunDir: new THREE.Vector3().fromArray(def.sunDir).normalize(), sunCol: new THREE.Color(def.sunCol), sunInt: def.sunInt,
        hemiSky: new THREE.Color(def.hemiSky), hemiGnd: new THREE.Color(def.hemiGnd), hemiInt: def.hemiInt,
        sea: new THREE.Color(def.sea), seaEm: def.seaEm, seaRough: def.seaRough, exposure: def.exposure, lamps: def.lamps, stars: def.stars,
        sunSize: def.sunSize, sunTint: new THREE.Color(def.sunTint)
      };
    }
    var STATES = {};
    Object.keys(TIMES).forEach(function (k) { STATES[k] = toState(TIMES[k]); });
    var cur = toState(TIMES[options.time && TIMES[options.time] ? options.time : "dia"]);
    var timeName = options.time && TIMES[options.time] ? options.time : "dia";
    var timeTween = null;
    var COLOR_KEYS = ["top", "hor", "glow", "fog", "sunCol", "hemiSky", "hemiGnd", "sea", "sunTint"];
    var NUM_KEYS = ["seaEm", "seaRough", "glowAmt", "fogD", "sunInt", "hemiInt", "exposure", "lamps", "stars", "sunSize"];

    var tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
    function applyTime() {
      // cielo: degradado horizonte→cenit con resplandor hacia el sol
      var pos = skyGeo.attributes.position, col = skyGeo.attributes.color;
      for (var i = 0; i < pos.count; i++) {
        tmpV.set(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize();
        var t = Math.pow(clamp(tmpV.y, 0, 1), 0.55);
        tmpC.copy(cur.hor).lerp(cur.top, t);
        var g = Math.pow(Math.max(tmpV.dot(cur.sunDir), 0), 5) * cur.glowAmt * (1 - t * 0.6);
        tmpC.lerp(cur.glow, clamp(g, 0, 1));
        col.setXYZ(i, tmpC.r, tmpC.g, tmpC.b);
      }
      col.needsUpdate = true;
      scene.fog.color.copy(cur.fog);
      scene.fog.density = cur.fogD;
      scene.background.copy(cur.hor);
      hemi.color.copy(cur.hemiSky); hemi.groundColor.copy(cur.hemiGnd); hemi.intensity = cur.hemiInt;
      sun.color.copy(cur.sunCol); sun.intensity = cur.sunInt;
      sun.position.copy(cur.sunDir).multiplyScalar(120).add(sun.target.position);
      seaMat.color.copy(cur.sea);
      farSea.material.color.set(0x1a6ea6).multiply(cur.sea);
      seaMat.emissive.copy(cur.hor).multiplyScalar(cur.seaEm);
      seaMat.roughness = cur.seaRough;
      farSea.material.emissive.copy(seaMat.emissive);
      renderer.toneMappingExposure = cur.exposure;
      M.vidrio.emissiveIntensity = cur.lamps * 0.85;
      M.farol.emissiveIntensity = cur.lamps * 3.2;
      candles.material.opacity = cur.lamps;
      lampLights.forEach(function (l) { l.intensity = l.userData.max * cur.lamps; });
      stars.material.opacity = cur.stars;
      sunSprite.position.copy(cur.sunDir).multiplyScalar(SKY_R - 60);
      sunSprite.scale.setScalar(cur.sunSize * 3.2);
      sunSprite.material.color.copy(cur.sunTint);
    }
    applyTime();

    function setTime(name, instant) {
      if (!STATES[name]) return;
      timeName = name;
      if (instant) {
        cur = toState(TIMES[name]);
        timeTween = null;
        applyTime();
        return;
      }
      timeTween = { from: cur, to: STATES[name], t: 0, dur: 1.8 };
      cur = toState(TIMES[name]);
      // copiar el estado de partida
      COLOR_KEYS.forEach(function (k) { cur[k].copy(timeTween.from[k]); });
      NUM_KEYS.forEach(function (k) { cur[k] = timeTween.from[k]; });
      cur.sunDir.copy(timeTween.from.sunDir);
    }
    function stepTime(dt) {
      if (!timeTween) return;
      timeTween.t = Math.min(1, timeTween.t + dt / timeTween.dur);
      var e = easeInOut(timeTween.t), a = timeTween.from, b = timeTween.to;
      COLOR_KEYS.forEach(function (k) { cur[k].copy(a[k]).lerp(b[k], e); });
      NUM_KEYS.forEach(function (k) { cur[k] = lerp(a[k], b[k], e); });
      cur.sunDir.copy(a.sunDir).lerp(b.sunDir, e).normalize();
      applyTime();
      if (timeTween.t >= 1) timeTween = null;
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
        if (size.w >= 900) { offsetGoal.x = 0.17; offsetGoal.y = 0.02; }
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
      sun.castShadow = false;
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
      if (!eco || !firstFrame) updateSea(time);
      for (var i = 0; i < palms.length; i++) palms[i].crown.rotation.z = Math.sin(time * 0.7 + palms[i].phase) * 0.035;
      for (var b = 0; b < boats.length; b++) {
        var bt = boats[b];
        bt.g.position.y = Math.sin(time * 0.9 + bt.phase) * 0.09;
        bt.g.rotation.z = Math.sin(time * 0.7 + bt.phase) * 0.035;
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
