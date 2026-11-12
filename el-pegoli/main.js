/* ==========================================================================
   El Pegolí — comportamiento. Patrón IIFE, sin módulos.
   Todo el contenido está en el HTML: esto solo lo enriquece.
   ========================================================================== */
(function () {
  "use strict";

  var BRAND = window.__BRAND__ || {};
  var doc = document, root = doc.documentElement, body = doc.body;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var canHover = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var scene = null;

  function safe(fn, name) {
    try { fn(); } catch (e) { if (window.console) console.warn("[" + name + "]", e); }
  }
  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function escHTML(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* ---------- cortina de entrada ---------- */
  function initSplash() {
    var splash = $("[data-splash]");
    var done = false;
    function hide() {
      if (done) return;
      done = true;
      if (splash) splash.classList.add("is-out");
      body.classList.add("is-ready");
    }
    if (doc.readyState === "complete") setTimeout(hide, 500);
    else window.addEventListener("load", function () { setTimeout(hide, 350); });
    setTimeout(hide, 2600); // red de seguridad adicional
  }

  /* ---------- navegación ---------- */
  function initNav() {
    var nav = $("[data-nav]"), toggle = $("[data-menu-toggle]"), menu = $("[data-menu]");
    if (!nav) return;
    function setMenu(open) {
      if (!menu || !toggle) return;
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.querySelector(".sr-only").textContent = open ? "Cerrar menú" : "Abrir menú";
      body.style.overflow = open ? "hidden" : "";
    }
    if (toggle && menu) {
      toggle.addEventListener("click", function () { setMenu(menu.hidden); });
      menu.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
      doc.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) { setMenu(false); toggle.focus(); } });
      window.addEventListener("resize", function () { if (window.innerWidth > 1023 && !menu.hidden) setMenu(false); });
    }

    // sección actual en el menú
    var links = $$(".nav-links a");
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          links.forEach(function (a) { a.classList.remove("is-current"); a.removeAttribute("aria-current"); });
          var a = map[en.target.id];
          if (a) { a.classList.add("is-current"); a.setAttribute("aria-current", "true"); }
        });
      }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
      $$("main section[id]").forEach(function (s) { io.observe(s); });
    }
  }

  /* ---------- anclas con desplazamiento suave nativo ---------- */
  function initAnchors() {
    doc.addEventListener("click", function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute("href");
      if (!id || id === "#") return;
      var el = doc.querySelector(id);
      if (!el) return;
      e.preventDefault();
      var offset = el.classList.contains("vista") || el.classList.contains("hero") ? 0 : 56;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: reduced ? "auto" : "smooth" });
      if (history.replaceState) history.replaceState(null, "", id);
    });
  }

  /* ---------- títulos por palabras ---------- */
  function splitWords(el) {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = "1";
    el.setAttribute("aria-label", el.textContent.trim().replace(/\s+/g, " "));
    var i = 0;
    function wrap(text) {
      return text.split(/(\s+)/).map(function (w) {
        if (/^\s*$/.test(w)) return w;
        return '<span class="w" aria-hidden="true"><span class="wi" style="--i:' + (i++) + '">' + escHTML(w) + "</span></span>";
      }).join("");
    }
    el.innerHTML = Array.prototype.map.call(el.childNodes, function (node) {
      if (node.nodeType === 3) return wrap(node.textContent);
      if (node.nodeName === "BR") return "<br>";
      if (node.nodeType === 1) {
        var tag = node.tagName.toLowerCase();
        return "<" + tag + ">" + wrap(node.textContent) + "</" + tag + ">";
      }
      return "";
    }).join("");
  }

  /* ---------- apariciones al hacer scroll ---------- */
  function initReveals() {
    $$("[data-split]").forEach(function (el) {
      el.classList.remove("reveal");
      el.removeAttribute("data-reveal");
      splitWords(el);
    });
    var targets = $$("[data-reveal], [data-split]");
    // escalonado dentro de cada grupo
    $$(".bento, .luces, .hitos, .cifras, .visita-grid").forEach(function (group) {
      $$("[data-reveal]", group).forEach(function (el, i) { el.style.setProperty("--d", i * 80 + "ms"); });
    });
    function reveal(el) {
      el.classList.add("is-revealed");
      el.dispatchEvent(new CustomEvent("revealed"));
    }
    if (!("IntersectionObserver" in window)) { targets.forEach(reveal); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { reveal(en.target); io.unobserve(en.target); }
      });
    }, { threshold: 0.01, rootMargin: "0px 0px -4% 0px" });
    targets.forEach(function (el) { io.observe(el); });
    // red de seguridad: a los 6 s, nada de lo que esté en pantalla sigue oculto
    setTimeout(function () {
      targets.forEach(function (el) {
        if (!el.classList.contains("is-revealed") && el.getBoundingClientRect().top < window.innerHeight) reveal(el);
      });
    }, 6000);
  }

  /* ---------- cifras ---------- */
  function initCounters() {
    $$("[data-years-since]").forEach(function (el) {
      var years = new Date().getFullYear() - parseInt(el.dataset.yearsSince, 10);
      if (years > 0) { el.dataset.count = String(years); el.textContent = String(years); }
    });
    $$("[data-count]").forEach(function (el) {
      var end = parseInt(el.dataset.count, 10), start = parseInt(el.dataset.countFrom || "0", 10);
      var host = el.closest("[data-reveal]") || el;
      var ran = false;
      function run() {
        if (ran) return;
        ran = true;
        var t0 = performance.now(), dur = 1400;
        (function tick(now) {
          var p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
          el.textContent = String(Math.round(start + (end - start) * e));
          if (p < 1) requestAnimationFrame(tick);
        })(t0);
      }
      host.addEventListener("revealed", run);
    });
  }

  /* ---------- inclinación 3D de las tarjetas ---------- */
  function initTilt() {
    if (!canHover) return;
    $$("[data-tilt]").forEach(function (card) {
      if (card.dataset.tiltBound) return;
      card.dataset.tiltBound = "1";
      var raf = 0;
      card.addEventListener("mousemove", function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          card.style.transition = "transform .12s linear, box-shadow .4s";
          card.style.transform = "rotateX(" + ((0.5 - py) * 7).toFixed(2) + "deg) rotateY(" + ((px - 0.5) * 8).toFixed(2) + "deg) translateZ(0)";
          card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
          card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
        });
      });
      card.addEventListener("mouseout", function (e) {
        if (card.contains(e.relatedTarget)) return;
        cancelAnimationFrame(raf);
        card.style.transition = "transform .7s cubic-bezier(.2,.8,.2,1), box-shadow .4s";
        card.style.transform = "";
      });
    });
  }

  /* ---------- barra de progreso ---------- */
  function initProgress() {
    var bar = $("[data-progress]");
    var hero = $("[data-hero]");
    var ticking = false;
    function update() {
      ticking = false;
      var max = root.scrollHeight - window.innerHeight;
      if (bar) bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ")";
      if (scene && hero) scene.setScroll(window.scrollY / Math.max(1, hero.offsetHeight));
    }
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ---------- luz del día (compartida por el hero y la vista 3D) ---------- */
  function setTime(name) {
    body.setAttribute("data-time", name);
    $$("[data-time-group] button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.time === name ? "true" : "false"); });
    if (scene) scene.setTime(name);
  }
  function initTime() {
    $$("[data-time-group] button").forEach(function (b) {
      b.addEventListener("click", function () { setTime(b.dataset.time); });
    });
    $$("[data-goto-time]").forEach(function (b) {
      b.addEventListener("click", function () {
        setTime(b.dataset.gotoTime);
        var vista = $("#vista-3d");
        if (vista && !root.classList.contains("no-webgl")) {
          window.scrollTo({ top: vista.getBoundingClientRect().top + window.scrollY, behavior: reduced ? "auto" : "smooth" });
          setTimeout(function () { setView("terraza"); }, 700);
        }
      });
    });
  }

  /* ---------- vista 3D ---------- */
  function setView(name) {
    $$("[data-views] button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.view === name ? "true" : "false"); });
    var cap = $("[data-vista-caption]");
    if (cap && BRAND.captions && BRAND.captions[name]) cap.textContent = BRAND.captions[name];
    if (scene) scene.goTo(name);
    var vista = $("[data-vista]");
    if (vista && name !== "general") vista.classList.add("is-touched");
  }

  function initScene() {
    var stage = $("[data-stage]"), vista = $("[data-vista]"), hero = $("[data-hero]");
    var NS = window.__PEGOLI__;
    if (!stage) return;
    if (!NS || !window.THREE || !NS.hasWebGL()) { root.classList.add("no-webgl"); return; }
    try {
      scene = NS.createScene(stage, {
        time: "dia",
        lockQuality: /[?&]calidad=alta/.test(window.location.search), // solo para capturas
        onLost: function () { root.classList.add("no-webgl"); }
      });
    } catch (e) {
      root.classList.add("no-webgl");
      throw e;
    }
    window.__PEGOLI__.scene = scene;

    // qué ventana al 3D está en pantalla: hero, vista o ninguna (entonces no se dibuja)
    var seen = { hero: true, vista: false };
    function sync() {
      scene.setActive(seen.hero || seen.vista);
      var explore = seen.vista && !seen.hero;
      scene.setMode(explore ? "explore" : "hero");
      if (vista) vista.classList.toggle("is-active", explore);
      if (!explore) {
        $$("[data-views] button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.view === "general" ? "true" : "false"); });
        var cap = $("[data-vista-caption]");
        if (cap && BRAND.captions) cap.textContent = BRAND.captions.inicio;
      }
    }
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.target === hero) seen.hero = en.isIntersecting;
          if (en.target === vista) seen.vista = en.isIntersecting;
        });
        sync();
      }, { threshold: 0, rootMargin: "0px 0px -22% 0px" });
      if (hero) io.observe(hero);
      if (vista) io.observe(vista);
    }

    // paralaje con el ratón en el hero
    if (canHover && hero) {
      window.addEventListener("mousemove", function (e) {
        scene.setPointer((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
      }, { passive: true });
    }

    // arrastrar para girar; pellizcar o Ctrl+rueda para acercar
    var drag = $("[data-drag]");
    if (drag) {
      var pts = {}, lastPinch = 0;
      var touched = function () { if (vista) vista.classList.add("is-touched"); };
      drag.addEventListener("pointerdown", function (e) {
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (drag.setPointerCapture) { try { drag.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ } }
        drag.classList.add("is-dragging");
      });
      drag.addEventListener("pointermove", function (e) {
        var p = pts[e.pointerId];
        if (!p) return;
        var ids = Object.keys(pts);
        if (ids.length === 1) {
          var dx = e.clientX - p.x, dy = e.clientY - p.y;
          var touch = e.pointerType === "touch";
          scene.rotate(dx * 0.0055, touch ? 0 : dy * 0.004); // en táctil, el gesto vertical es del scroll
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) touched();
        }
        p.x = e.clientX; p.y = e.clientY;
        if (ids.length === 2) {
          var a = pts[ids[0]], b = pts[ids[1]];
          var d = Math.hypot(a.x - b.x, a.y - b.y);
          if (lastPinch) scene.zoom(lastPinch / d);
          lastPinch = d;
          touched();
        }
      });
      var end = function (e) {
        delete pts[e.pointerId];
        lastPinch = 0;
        if (!Object.keys(pts).length) drag.classList.remove("is-dragging");
      };
      drag.addEventListener("pointerup", end);
      drag.addEventListener("pointercancel", end);
      drag.addEventListener("wheel", function (e) {
        if (!e.ctrlKey) return; // la rueda normal sigue haciendo scroll de la página
        e.preventDefault();
        scene.zoom(e.deltaY > 0 ? 1.08 : 0.92);
        touched();
      }, { passive: false });
      drag.addEventListener("keydown", function (e) {
        var k = e.key, used = true;
        if (k === "ArrowLeft") scene.rotate(0.14, 0);
        else if (k === "ArrowRight") scene.rotate(-0.14, 0);
        else if (k === "ArrowUp") scene.rotate(0, 0.08);
        else if (k === "ArrowDown") scene.rotate(0, -0.08);
        else if (k === "+" || k === "=") scene.zoom(0.88);
        else if (k === "-" || k === "_") scene.zoom(1.14);
        else used = false;
        if (used) { e.preventDefault(); touched(); }
      });
    }

    $$("[data-zoom]").forEach(function (b) {
      b.addEventListener("click", function () { scene.zoom(b.dataset.zoom === "in" ? 0.8 : 1.25); if (vista) vista.classList.add("is-touched"); });
    });
    $$("[data-views] button, .hotspot").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.dataset.view); });
    });

    // etiquetas ancladas a la maqueta
    var spots = $$(".hotspot"), head = $(".vista-head");
    scene.onFrame(function () {
      var on = scene.getMode() === "explore";
      var hr = head ? head.getBoundingClientRect() : null; // las etiquetas no pisan el titular
      for (var i = 0; i < spots.length; i++) {
        var el = spots[i], p = on ? scene.project(el.dataset.point) : null;
        var show = !!(p && p.visible && p.y > 150 && p.y < window.innerHeight - 130);
        if (show && hr && p.x < hr.right + 40 && p.y < hr.bottom + 24) show = false;
        if (show) el.style.transform = "translate3d(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px,0)";
        if (show !== (el._on === true)) { el._on = show; el.classList.toggle("is-on", show); el.tabIndex = show ? 0 : -1; }
      }
    });
    sync();
  }

  function boot() {
    safe(initSplash, "initSplash");
    safe(initNav, "initNav");
    safe(initAnchors, "initAnchors");
    safe(initCounters, "initCounters");
    safe(initReveals, "initReveals");
    safe(initTilt, "initTilt");
    safe(initTime, "initTime");
    safe(initScene, "initScene");
    safe(initProgress, "initProgress");
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
