/*
 * Navegador Alejandro - modulo de TizenBrew (se inyecta en cada pagina)
 * --------------------------------------------------------------------
 * Control remoto:
 *   Flechas ............ mover el cursor (mantener = mas rapido; en el borde hace scroll)
 *   OK ................. clic donde esta el cursor
 *   Atras .............. pagina anterior (en la primera pagina abre el menu)
 *   Play/Pausa ......... abrir / cerrar el MENU (buscar, escribir direccion, favoritos, zoom)
 *   Canal +/- .......... subir / bajar una pantalla completa
 *   Adelantar/Atrasar .. +/-10 s en el video de la pagina
 * Tambien funciona con mouse real: touchpad de la app del celular, mouse USB o Bluetooth.
 * El recuadro azul muestra que vas a pulsar; cerca de botones el cursor frena (precision).
 * El zoom se recuerda por cada sitio.
 */
(function () {
  'use strict';
  if (window.__navAlejandro) return;
  window.__navAlejandro = true;

  // ===================== CONFIGURACION (edita aqui) =====================
  var FAVORITOS = [
    { n: 'Google', u: 'https://www.google.com/' },
    { n: 'TikTok', u: 'https://www.tiktok.com/' },
    { n: 'Wikipedia', u: 'https://es.wikipedia.org/' },
    { n: 'Claude', u: 'https://claude.ai/' },
    { n: 'Gmail', u: 'https://mail.google.com/' },
    { n: 'Noticias', u: 'https://news.google.com/?hl=es-419&gl=CO&ceid=CO:es-419' },
    { n: 'Clima', u: 'https://www.google.com/search?q=clima+tunja' },
    { n: 'Dólar hoy', u: 'https://www.google.com/search?q=dolar+hoy+colombia' }
  ];
  var BUSCADOR = 'https://www.google.com/search?q=';
  var COLOR = '#7cc4ff';
  // ======================================================================

  var K = { IZQ: 37, ARRIBA: 38, DER: 39, ABAJO: 40, OK: 13, ATRAS: 10009,
            PLAYPAUSA: 10252, CANAL_MAS: 427, CANAL_MENOS: 428, ADELANTAR: 417, ATRASAR: 412 };

  // ---------------------------------------------------------------- BLOQUEO
  // 1) Pop-ups: window.open abre en la misma pestana solo si viene de un clic tuyo
  var ultimoClic = 0;
  window.open = function (url) {
    if (url && Date.now() - ultimoClic < 1000) { location.href = url; }
    return null;   // las ventanas que se abren solas se descartan
  };
  // 2) Anuncios visuales (los de red ya los bloquea el DNS de AdGuard)
  var CSS_ANUNCIOS = [
    'ins.adsbygoogle', '.adsbygoogle', '[id^="google_ads"]', '[id^="div-gpt-ad"]',
    'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]', 'iframe[src*="adservice"]',
    'iframe[id*="google_ads"]', '[class*="ad-banner"]', '[class*="advert"]', '[id*="advert"]',
    '[class*="sponsored"]', '[data-ad]', '[data-ad-slot]', '.ad-container', '.ad-slot',
    '[aria-label="Advertisement"]', '[aria-label="Publicidad"]', '.taboola', '[id^="taboola"]',
    '.OUTBRAIN', '[id^="outbrain"]', '[class*="cookie-banner"]', '[id*="cookie-banner"]'
  ].join(',') + '{display:none!important;visibility:hidden!important}';

  function inyectarCSS() {
    if (document.getElementById('nav-alejandro-css')) return;
    var s = document.createElement('style');
    s.id = 'nav-alejandro-css';
    s.textContent = CSS_ANUNCIOS;
    (document.head || document.documentElement).appendChild(s);
  }
  // 3) Enlaces que abren pestana nueva -> misma pestana
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[target]') : null;
    if (a && a.target !== '_self') a.target = '_self';
  }, true);

  // ---------------------------------------------------------------- CURSOR
  var cur = { x: 960, y: 540, el: null, vel: 12, ultimaTecla: 0, oculto: null };

  // Flechita tipo mouse (la punta esta en la esquina superior izquierda = punto de clic)
  var FLECHA = '<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 17 22">' +
    '<path d="M1 1 L1 17 L5 13 L8 20 L11 19 L8 12 L14 12 Z" fill="#fff" stroke="#000" stroke-width="1.4" ' +
    'stroke-linejoin="round"/></svg>';
  var CLICABLE = 'a[href],button,input,select,textarea,label,summary,[role="button"],[role="link"],' +
    '[role="tab"],[role="menuitem"],[onclick],[tabindex]:not([tabindex="-1"]),video';

  function crearCursor() {
    if (cur.el && document.documentElement.contains(cur.el)) return;
    cur.el = document.createElement('div');
    cur.el.innerHTML = FLECHA;
    cur.el.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;left:960px;top:540px;' +
      'filter:drop-shadow(0 0 6px ' + COLOR + ');transition:opacity .3s,transform .1s;transform-origin:0 0';
    document.documentElement.appendChild(cur.el);
    // Recuadro que resalta lo que vas a pulsar
    cur.marco = document.createElement('div');
    cur.marco.style.cssText = 'position:fixed;z-index:2147483645;pointer-events:none;display:none;' +
      'border:3px solid ' + COLOR + ';border-radius:10px;box-shadow:0 0 18px ' + COLOR + ';transition:all .12s';
    document.documentElement.appendChild(cur.marco);
  }

  function hayVideoReproduciendo() {
    var v = videoPrincipal();
    return v && !v.paused && !v.ended;
  }

  function objetivo() {
    var el = document.elementFromPoint(cur.x, cur.y);
    return el && el.closest ? el.closest(CLICABLE) : null;
  }

  function resaltar() {
    var t = objetivo();
    if (!t || t.tagName === 'VIDEO' || t === document.body) { cur.marco.style.display = 'none'; return; }
    var r = t.getBoundingClientRect();
    if (r.width > window.innerWidth * 0.9 && r.height > window.innerHeight * 0.6) {
      cur.marco.style.display = 'none'; return;     // no resaltar contenedores gigantes
    }
    cur.marco.style.display = 'block';
    cur.marco.style.left = (r.left - 4) + 'px';
    cur.marco.style.top = (r.top - 4) + 'px';
    cur.marco.style.width = (r.width + 8) + 'px';
    cur.marco.style.height = (r.height + 8) + 'px';
  }

  function pintarCursor(sinHover) {
    crearCursor();
    cur.el.style.left = cur.x + 'px';
    cur.el.style.top = cur.y + 'px';
    cur.el.style.opacity = '1';
    resaltar();
    if (!sinHover) {   // los menus que se abren al pasar el mouse tambien funcionan
      var el = document.elementFromPoint(cur.x, cur.y);
      if (el) {
        var op = { bubbles: true, clientX: cur.x, clientY: cur.y, view: window };
        try { el.dispatchEvent(new MouseEvent('mouseover', op)); el.dispatchEvent(new MouseEvent('mousemove', op)); } catch (e) {}
      }
    }
    clearTimeout(cur.oculto);
    cur.oculto = setTimeout(function () {
      if (!cur.el) return;
      var video = hayVideoReproduciendo();
      cur.el.style.opacity = video ? '0' : '0.4';   // en videos se esconde del todo
      if (video) cur.marco.style.display = 'none';
    }, 3500);
  }

  // Mouse real: touchpad de la app del celular, mouse USB o Bluetooth
  window.addEventListener('mousemove', function (e) {
    if (!e.isTrusted) return;                     // ignorar los eventos que genera este mismo script
    cur.x = e.clientX; cur.y = e.clientY;
    pintarCursor(true);
  }, true);
  window.addEventListener('mousedown', function (e) {
    if (e.isTrusted) ultimoClic = Date.now();    // un clic real tambien autoriza abrir enlaces
  }, true);

  function contenedorScroll(x, y) {
    var el = document.elementFromPoint(x, y);
    while (el && el !== document.body && el !== document.documentElement) {
      var st = getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 5) return el;
      el = el.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }

  function scroll(dy) {
    var c = contenedorScroll(cur.x, cur.y);
    c.scrollBy ? c.scrollBy({ top: dy, behavior: 'smooth' }) : (c.scrollTop += dy);
    setTimeout(resaltar, 350);
  }

  function mover(dx, dy) {
    var ahora = Date.now();
    cur.vel = (ahora - cur.ultimaTecla < 180) ? Math.min(cur.vel * 1.25, 70) : 12;
    cur.ultimaTecla = ahora;
    // Precision: encima de algo pulsable el cursor frena para no pasarse
    var paso = objetivo() && cur.vel > 20 ? cur.vel * 0.55 : cur.vel;
    var w = window.innerWidth, h = window.innerHeight, borde = 30;
    cur.x = Math.max(0, Math.min(w - 1, cur.x + dx * paso));
    cur.y = Math.max(0, Math.min(h - 1, cur.y + dy * paso));
    if (dy > 0 && cur.y >= h - borde) scroll(Math.max(cur.vel * 4, 120));
    if (dy < 0 && cur.y <= borde) scroll(-Math.max(cur.vel * 4, 120));
    pintarCursor();
  }

  function clic() {
    ultimoClic = Date.now();
    var el = document.elementFromPoint(cur.x, cur.y);
    if (!el) return;
    var op = { bubbles: true, cancelable: true, view: window, clientX: cur.x, clientY: cur.y };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', op));
      el.dispatchEvent(new MouseEvent('mousedown', op));
      el.dispatchEvent(new PointerEvent('pointerup', op));
      el.dispatchEvent(new MouseEvent('mouseup', op));
    } catch (e) {}
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) {
      el.focus();   // abre el teclado del TV
      return;
    }
    if (typeof el.click === 'function') el.click();
    else el.dispatchEvent(new MouseEvent('click', op));
    if (cur.el) {   // efecto visual del clic
      cur.el.style.transform = 'scale(.8)';
      setTimeout(function () { if (cur.el) cur.el.style.transform = ''; }, 120);
    }
    setTimeout(resaltar, 300);
  }

  function videoPrincipal() {
    var vs = document.querySelectorAll('video'), mejor = null, area = 0;
    for (var i = 0; i < vs.length; i++) {
      var r = vs[i].getBoundingClientRect(), a = r.width * r.height;
      if (a > area) { area = a; mejor = vs[i]; }
    }
    return mejor;
  }

  // ---------------------------------------------------------------- MENU
  var menu = { host: null, root: null, abierto: false, items: [], idx: 0, zoom: 1 };
  try { menu.zoom = parseFloat(localStorage.getItem('navAlejandroZoom')) || 1; } catch (e) {}

  function aplicarZoom() {
    document.documentElement.style.zoom = menu.zoom === 1 ? '' : String(menu.zoom);
    try { localStorage.setItem('navAlejandroZoom', String(menu.zoom)); } catch (e) {}
  }

  function ir(texto) {
    texto = (texto || '').trim();
    if (!texto) return;
    var url = /^https?:\/\//i.test(texto) ? texto
      : (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(texto) ? 'https://' + texto : BUSCADOR + encodeURIComponent(texto));
    location.href = url;
  }

  function construirMenu() {
    menu.host = document.createElement('div');
    menu.host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:none';
    menu.root = menu.host.attachShadow ? menu.host.attachShadow({ mode: 'open' }) : menu.host;
    var fav = FAVORITOS.map(function (f) {
      return '<button class="it fav" data-u="' + f.u + '"><b>' + f.n.charAt(0) + '</b><span>' + f.n + '</span></button>';
    }).join('');
    menu.root.innerHTML =
      '<style>' +
      '*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}' +
      '.fondo{position:fixed;inset:0;background:rgba(5,9,15,.92);display:flex;align-items:center;justify-content:center}' +
      '.caja{width:1300px;max-width:92vw;color:#fff}' +
      'h1{font-size:44px;margin:0 0 6px}h1 span{color:' + COLOR + '}' +
      '.url{font-size:20px;opacity:.55;margin-bottom:26px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      'input{width:100%;font-size:32px;padding:20px 26px;border-radius:18px;border:3px solid #2a3c55;background:#111c2e;color:#fff;outline:none}' +
      '.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px;margin:26px 0}' +
      '.fav{height:130px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px}' +
      '.fav b{width:56px;height:56px;border-radius:50%;background:' + COLOR + ';color:#0a1220;font-size:30px;display:flex;align-items:center;justify-content:center}' +
      '.fila{display:grid;grid-template-columns:repeat(4,1fr);gap:20px}' +
      '.zoom{font-size:20px;opacity:.6;margin-top:10px}' +
      'button{font-size:24px;color:#fff;background:rgba(255,255,255,.07);border:3px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;cursor:pointer}' +
      '.sel{border-color:' + COLOR + '!important;box-shadow:0 0 22px ' + COLOR + ';transform:scale(1.04)}' +
      '.ayuda{margin-top:24px;font-size:20px;opacity:.5}' +
      '</style>' +
      '<div class="fondo"><div class="caja">' +
      '<h1>Navegador <span>Alejandro</span></h1>' +
      '<div class="url" id="url"></div>' +
      '<input class="it" id="buscar" placeholder="Buscar o escribir dirección…">' +
      '<div class="grid">' + fav + '</div>' +
      '<div class="fila">' +
      '<button class="it" data-a="atras">◀ Atrás</button>' +
      '<button class="it" data-a="recargar">⟳ Recargar</button>' +
      '<button class="it" data-a="zoommas">Zoom +</button>' +
      '<button class="it" data-a="zoommenos">Zoom −</button>' +
      '<button class="it" data-a="inicio">⌂ Inicio</button>' +
      '<button class="it" data-a="video">⛶ Video completo</button>' +
      '<button class="it" data-a="arriba">⤒ Ir arriba</button>' +
      '<button class="it" data-a="cursor">✛ Centrar cursor</button>' +
      '</div>' +
      '<div class="ayuda">Flechas: moverse · OK: elegir · Play/Pausa o Atrás: cerrar menú</div>' +
      '</div></div>';
    document.documentElement.appendChild(menu.host);
    menu.items = Array.prototype.slice.call(menu.root.querySelectorAll('.it'));
    menu.root.getElementById('buscar').addEventListener('keydown', function (e) {
      if (e.keyCode === K.OK) { e.stopPropagation(); ir(this.value); }
    });
  }

  function seleccionar(i) {
    menu.idx = Math.max(0, Math.min(menu.items.length - 1, i));
    menu.items.forEach(function (b, j) { b.classList.toggle('sel', j === menu.idx); });
  }

  function abrirMenu() {
    if (!menu.host) construirMenu();
    menu.root.getElementById('url').textContent = location.host + '  ·  zoom ' + Math.round(menu.zoom * 100) + '%';
    menu.host.style.display = 'block';
    menu.abierto = true;
    if (cur.el) cur.el.style.display = 'none';
    seleccionar(0);
  }

  function cerrarMenu() {
    if (!menu.host) return;
    var b = menu.root.getElementById('buscar');
    if (b) b.blur();
    menu.host.style.display = 'none';
    menu.abierto = false;
    if (cur.el) cur.el.style.display = '';
  }

  function moverMenu(code) {
    // fila 0: buscador (1 item) | filas de favoritos y acciones: 4 columnas
    var i = menu.idx, total = menu.items.length;
    if (i === 0) {
      if (code === K.ABAJO) seleccionar(1);
      return;
    }
    var p = i - 1;
    if (code === K.DER) seleccionar(i + 1 <= total - 1 ? i + 1 : i);
    if (code === K.IZQ) seleccionar(p % 4 === 0 ? i : i - 1);
    if (code === K.ABAJO) seleccionar(Math.min(total - 1, i + 4));
    if (code === K.ARRIBA) seleccionar(p < 4 ? 0 : i - 4);
  }

  function activarMenu() {
    var b = menu.items[menu.idx];
    if (b.id === 'buscar') { b.focus(); return; }   // abre el teclado del TV
    if (b.dataset.u) { cerrarMenu(); location.href = b.dataset.u; return; }
    switch (b.dataset.a) {
      case 'atras': cerrarMenu(); history.back(); break;
      case 'recargar': location.reload(); break;
      case 'zoommas': menu.zoom = Math.min(2, Math.round((menu.zoom + 0.1) * 10) / 10); aplicarZoom(); break;
      case 'zoommenos': menu.zoom = Math.max(0.5, Math.round((menu.zoom - 0.1) * 10) / 10); aplicarZoom(); break;
      case 'inicio': cerrarMenu(); location.href = FAVORITOS[0].u; break;
      case 'arriba': cerrarMenu(); (document.scrollingElement || document.documentElement).scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'cursor': cerrarMenu(); cur.x = window.innerWidth / 2; cur.y = window.innerHeight / 2; pintarCursor(); break;
      case 'video':
        var v = videoPrincipal();
        cerrarMenu();
        if (v) {
          try { (v.requestFullscreen || v.webkitRequestFullscreen).call(v); } catch (e) {}
          if (v.paused) { try { v.play(); } catch (e) {} }
        }
        break;
    }
    if (b.dataset.a && b.dataset.a.indexOf('zoom') === 0) {
      menu.root.getElementById('url').textContent = location.host + '  ·  zoom ' + Math.round(menu.zoom * 100) + '%';
    }
  }

  // ---------------------------------------------------------------- TECLAS
  function escribiendo() {
    var a = menu.abierto && menu.root.activeElement ? menu.root.activeElement : document.activeElement;
    return a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable);
  }

  window.addEventListener('keydown', function (e) {
    var c = e.keyCode, manejada = true;

    if (c === K.PLAYPAUSA) { menu.abierto ? cerrarMenu() : abrirMenu(); }
    else if (menu.abierto) {
      if (escribiendo() && c !== K.ATRAS) return;          // el teclado del TV maneja esas teclas
      if (c === K.ATRAS) cerrarMenu();
      else if (c === K.OK) activarMenu();
      else if (c >= 37 && c <= 40) moverMenu(c);
      else manejada = false;
    }
    else if (escribiendo() && c !== K.ATRAS) { return; }     // dejar escribir en la pagina
    else if (c === K.IZQ) mover(-1, 0);
    else if (c === K.DER) mover(1, 0);
    else if (c === K.ARRIBA) mover(0, -1);
    else if (c === K.ABAJO) mover(0, 1);
    else if (c === K.OK) clic();
    else if (c === K.CANAL_MAS) scroll(-window.innerHeight * 0.85);
    else if (c === K.CANAL_MENOS) scroll(window.innerHeight * 0.85);
    else if (c === K.ADELANTAR || c === K.ATRASAR) {
      var v = videoPrincipal();
      if (v) v.currentTime = Math.max(0, v.currentTime + (c === K.ADELANTAR ? 10 : -10));
    }
    else if (c === K.ATRAS) {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (history.length > 1) history.back(); else abrirMenu();
    }
    else manejada = false;

    if (manejada) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // ---------------------------------------------------------------- ARRANQUE
  function alCargar() {
    inyectarCSS();
    crearCursor();
    pintarCursor();
    aplicarZoom();
    var esInicio = /^https:\/\/www\.google\.com\/?$/.test(location.href);
    if (esInicio && history.length <= 1) abrirMenu();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alCargar);
  else alCargar();
  // Por si la pagina reemplaza el <html> o borra el cursor
  setInterval(function () { inyectarCSS(); crearCursor(); }, 3000);
})();
