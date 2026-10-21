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
  // Con el inicio temprano el script tambien entra en iframes y podria entrar en la
  // pantalla local de TizenBrew: en esta ultima no hace nada.
  if (location.protocol === 'file:' || !location.hostname) return;
  var ES_PRINCIPAL = (function () { try { return window.top === window; } catch (e) { return false; } })();

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
  // Los anuncios de pantalla completa que "se meten" son casi siempre:
  //   (a) ventanas emergentes (popunder) que se abren con tu primer clic,
  //   (b) redirecciones forzadas: la pagina te manda a otro sitio sin que lo pidieras,
  //   (c) capas invisibles encima del video que capturan tu clic.
  // Este escudo bloquea las tres. Regla: solo se abre otro sitio si TU elegiste
  // un enlace que apunta ahi (o lo escribiste en el menu).

  function host(url) {
    try { return new URL(url, location.href).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }
  function mismoSitio(a, b) {   // ej. video.sitio.com y sitio.com cuentan como el mismo
    if (!a || !b) return false;
    if (a === b) return true;
    var pa = a.split('.').slice(-2).join('.'), pb = b.split('.').slice(-2).join('.');
    return pa === pb;
  }

  var ultimoClic = 0;
  var intencion = { host: '', t: 0 };          // a donde quisiste ir tu (enlace que pulsaste)
  function autorizar(url) { intencion.host = host(url); intencion.t = Date.now(); }
  function autorizado(url) {
    var h = host(url);
    return mismoSitio(h, host(location.href)) ||
           (Date.now() - intencion.t < 4000 && mismoSitio(h, intencion.host));
  }

  var escudo = true;   // se puede apagar por sitio desde el menu
  try { escudo = localStorage.getItem('navAlejandroEscudoOff') !== '1'; } catch (e) {}

  var bloqueados = 0;
  function avisoBloqueo(texto, sinNumero) {
    if (!sinNumero) bloqueados++;
    if (!ES_PRINCIPAL) return;
    try {
      var t = document.getElementById('nav-alejandro-toast');
      if (!t) {
        t = document.createElement('div');
        t.id = 'nav-alejandro-toast';
        t.style.cssText = 'position:fixed;top:24px;right:24px;z-index:2147483647;pointer-events:none;' +
          'background:rgba(10,18,32,.92);color:#fff;font:600 20px Arial,sans-serif;padding:12px 20px;' +
          'border-radius:14px;border:2px solid ' + COLOR + ';transition:opacity .3s;opacity:0';
        document.documentElement.appendChild(t);
      }
      t.textContent = '🛡 ' + texto + (sinNumero ? '' : ' (' + bloqueados + ')');
      t.style.opacity = '1';
      clearTimeout(t._o);
      t._o = setTimeout(function () { t.style.opacity = '0'; }, 1800);
    } catch (e) {}
  }

  // (a) Ventanas emergentes: nunca se abren ventanas nuevas.
  //     Si es un enlace que TU pulsaste hacia ese mismo destino, se abre en la misma pestana.
  window.open = function (url) {
    if (!escudo) { if (url) location.href = url; return null; }
    if (url && Date.now() - ultimoClic < 1000 && autorizado(url)) { location.href = url; }
    else avisoBloqueo('Ventana emergente bloqueada');
    return null;
  };

  // Registrar a donde apunta el enlace que pulsas (control, touchpad o mouse)
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a) {
      if (a.target && a.target !== '_self') a.target = '_self';   // nada de pestanas nuevas
      autorizar(a.href);
    }
  }, true);
  document.addEventListener('submit', function (e) {   // formularios (buscadores) tambien valen
    try { autorizar(e.target.action || location.href); } catch (err) {}
  }, true);

  // (b) Redirecciones forzadas: se cancelan si van a otro sitio que tu no elegiste
  if (ES_PRINCIPAL && window.navigation && navigation.addEventListener) {
    navigation.addEventListener('navigate', function (e) {
      if (!escudo || !e.cancelable) return;
      if (e.navigationType === 'traverse' || e.navigationType === 'reload') return;  // Atras / recargar
      if (autorizado(e.destination.url)) return;
      e.preventDefault();
      avisoBloqueo('Redirección a ' + host(e.destination.url) + ' bloqueada');
    });
  }

  // (c) Capas invisibles o gigantes que tapan la pagina para robar el clic
  function esTrampa(el) {
    if (!el || el === document.body || el === document.documentElement) return false;
    var st = getComputedStyle(el);
    if (st.position !== 'fixed' && st.position !== 'absolute') return false;
    var r = el.getBoundingClientRect();
    var grande = r.width * r.height > window.innerWidth * window.innerHeight * 0.25;
    if (!grande) return false;
    var invisible = parseFloat(st.opacity) < 0.15 ||
      (st.backgroundColor === 'rgba(0, 0, 0, 0)' && !el.textContent.trim() && !el.querySelector('img,video,canvas,svg'));
    var enlaceAfuera = el.tagName === 'A' && el.href && !mismoSitio(host(el.href), host(location.href));
    return invisible || enlaceAfuera;
  }
  function quitarTrampas(x, y) {
    if (!escudo) return;
    for (var i = 0; i < 5; i++) {           // puede haber varias capas apiladas
      var el = document.elementFromPoint(x, y), quitado = false;
      for (var n = el; n && n !== document.body; n = n.parentElement) {
        if (n.tagName === 'VIDEO') break;   // nunca tocar el video
        if (esTrampa(n)) { n.remove(); quitado = true; avisoBloqueo('Capa de anuncio quitada'); break; }
      }
      if (!quitado) return;
    }
  }

  // ================================================================ BLOQUEADOR DE SCRIPTS
  // Igual que Brave/uBlock: los scripts, iframes, pixeles y peticiones de redes de
  // anuncios y rastreo se bloquean ANTES de ejecutarse. Corre al inicio de cada pagina.
  var LISTA_BLOQUEO = [
    // Google y grandes redes
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
    'google-analytics.com', 'amazon-adsystem.com', 'adnxs.com', 'criteo.com', 'criteo.net',
    'taboola.com', 'outbrain.com', 'adform.net', 'rubiconproject.com', 'pubmatic.com', 'openx.net',
    'casalemedia.com', 'smartadserver.com', 'moatads.com', 'adsafeprotected.com', 'doubleverify.com',
    'scorecardresearch.com', 'quantserve.com', 'media.net', 'adroll.com', 'teads.tv', 'sharethrough.com',
    '33across.com', 'spotxchange.com', 'springserve.com', 'lijit.com', 'sovrn.com', 'zedo.com',
    'mgid.com', 'revcontent.com', 'adskeeper.com', 'adskeeper.co.uk', 'disqusads.com', 'hotjar.com',
    'mc.yandex.ru', 'an.yandex.ru', 'onesignal.com',
    // Popunders, redirecciones y anuncios agresivos (tambien se buscan dentro de scripts en linea)
    'popads.net', 'popcash.net', 'propellerads.com', 'propellerclick.com', 'adsterra.com',
    'highperformanceformat.com', 'exoclick.com', 'exosrv.com', 'realsrv.com', 'juicyads.com',
    'trafficjunky.net', 'trafficstars.com', 'tsyndicate.com', 'hilltopads.net', 'clickadu.com',
    'adcash.com', 'onclickads.net', 'admaven.com', 'ad-maven.com', 'richads.com', 'galaksion.com',
    'pushground.com', 'monetag.com', 'a-ads.com', 'bidvertiser.com', 'adspyglass.com', 'popmyads.com'
  ];
  var bloqueoActivo = true;
  try { bloqueoActivo = localStorage.getItem('navAlejandroEscudoOff') !== '1'; } catch (e) {}
  var DOMS = {};
  LISTA_BLOQUEO.forEach(function (d) { DOMS[d] = 1; });
  // Solo las redes de popunder se buscan dentro de scripts en linea (las grandes, como Google,
  // aparecen mencionadas en scripts normales de muchas paginas y bloquearlas las romperia)
  var AGRESIVAS = LISTA_BLOQUEO.slice(LISTA_BLOQUEO.indexOf('popads.net'));
  var RE_TEXTO = new RegExp(AGRESIVAS.map(function (d) { return d.replace(/\./g, '\\.'); }).join('|'));

  function urlBloqueada(u) {
    if (!bloqueoActivo || !u) return false;
    var h;
    try { h = new URL(String(u), location.href).hostname; } catch (e) { return false; }
    var p = h.split('.');
    for (var i = 0; i < p.length - 1; i++) if (DOMS[p.slice(i).join('.')]) return true;
    return false;
  }

  var scriptsBloqueados = 0, avisoPendiente = null;
  function contar() {
    scriptsBloqueados++;
    if (avisoPendiente) return;   // un solo aviso cada 1.5 s, no uno por script
    avisoPendiente = setTimeout(function () {
      avisoPendiente = null;
      avisoBloqueo(scriptsBloqueados + ' anuncios/rastreadores bloqueados', true);
    }, 1500);
  }

  function nodoBloqueado(n) {
    if (!n || n.nodeType !== 1) return false;
    var t = n.tagName;
    if (t === 'SCRIPT') {
      if (n.src ? urlBloqueada(n.src) : (bloqueoActivo && RE_TEXTO.test(n.textContent || ''))) return true;
    } else if (t === 'IFRAME' || t === 'IMG' || t === 'EMBED' || t === 'OBJECT') {
      if (urlBloqueada(n.src || n.data)) return true;
    } else if (t === 'LINK') {
      if (/preload|prefetch|preconnect|dns-prefetch/i.test(n.rel || '') && urlBloqueada(n.href)) return true;
    }
    return false;
  }

  // 1) Scripts que vienen en el HTML: se desactivan apenas aparecen (antes de ejecutarse)
  function revisarNodo(n) {
    if (nodoBloqueado(n)) {
      if (n.tagName === 'SCRIPT') n.type = 'javascript/bloqueado';
      if (n.parentNode) n.parentNode.removeChild(n);
      contar();
    }
  }
  try {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var a = muts[i].addedNodes;
        for (var j = 0; j < a.length; j++) {
          revisarNodo(a[j]);
          if (a[j].querySelectorAll) {
            var hijos = a[j].querySelectorAll('script,iframe,img,embed,object,link');
            for (var k = 0; k < hijos.length; k++) revisarNodo(hijos[k]);
          }
        }
      }
    }).observe(document, { childList: true, subtree: true });
  } catch (e) {}

  // Barrido inicial: el modulo se carga cuando la pagina ya empezo, asi que se quitan
  // los iframes, imagenes y scripts de anuncios que ya esten puestos
  function barrer() {
    try {
      var ns = document.querySelectorAll('script[src],iframe,img,embed,object,link[rel]');
      for (var i = 0; i < ns.length; i++) revisarNodo(ns[i]);
    } catch (e) {}
  }
  barrer();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', barrer);
  window.addEventListener('load', barrer);

  // 2) Scripts e iframes que la pagina mete despues con JavaScript
  ['appendChild', 'insertBefore', 'replaceChild'].forEach(function (m) {
    var orig = Node.prototype[m];
    Node.prototype[m] = function (n) {
      if (nodoBloqueado(n)) { contar(); return n; }
      return orig.apply(this, arguments);
    };
  });
  ['append', 'prepend', 'after', 'before'].forEach(function (m) {
    var orig = Element.prototype[m];
    if (!orig) return;
    Element.prototype[m] = function () {
      var args = Array.prototype.filter.call(arguments, function (n) {
        if (nodoBloqueado(n)) { contar(); return false; } return true;
      });
      return orig.apply(this, args);
    };
  });
  function protegerSrc(proto, prop) {
    var d = proto && Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.set) return;
    Object.defineProperty(proto, prop, {
      configurable: true, enumerable: d.enumerable, get: d.get,
      set: function (v) { if (urlBloqueada(v)) { contar(); return; } d.set.call(this, v); }
    });
  }
  protegerSrc(window.HTMLScriptElement && HTMLScriptElement.prototype, 'src');
  protegerSrc(window.HTMLIFrameElement && HTMLIFrameElement.prototype, 'src');
  protegerSrc(window.HTMLImageElement && HTMLImageElement.prototype, 'src');
  var setAttrOrig = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (nombre, valor) {
    if ((nombre === 'src' || nombre === 'href' || nombre === 'data') && /^(SCRIPT|IFRAME|IMG|EMBED|OBJECT)$/.test(this.tagName) && urlBloqueada(valor)) {
      contar(); return;
    }
    return setAttrOrig.apply(this, arguments);
  };

  // 3) Peticiones de red de anuncios y rastreo (fetch, XHR, beacons)
  if (window.fetch) {
    var fetchOrig = window.fetch;
    window.fetch = function (r) {
      var u = r && r.url ? r.url : r;
      if (urlBloqueada(u)) { contar(); return Promise.reject(new TypeError('Bloqueado')); }
      return fetchOrig.apply(this, arguments);
    };
  }
  var xhrOpen = XMLHttpRequest.prototype.open, xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__bloq = urlBloqueada(u);
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__bloq) { contar(); try { this.abort(); } catch (e) {} return; }
    return xhrSend.apply(this, arguments);
  };
  if (navigator.sendBeacon) {
    var beaconOrig = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u) { if (urlBloqueada(u)) { contar(); return true; } return beaconOrig.apply(null, arguments); };
  }

  // Anuncios visuales comunes (los de red los bloquea el DNS de AdGuard)
  var REDES = ['doubleclick', 'googlesyndication', 'adservice', 'popads', 'popcash', 'propellerads',
    'adsterra', 'exoclick', 'juicyads', 'hilltopads', 'clickadu', 'monetag', 'a-ads', 'bidvertiser',
    'adcash', 'trafficstars', 'onclickads', 'admaven', 'richads', 'pushground', 'galaksion'];
  var CSS_ANUNCIOS = [
    'ins.adsbygoogle', '.adsbygoogle', '[id^="google_ads"]', '[id^="div-gpt-ad"]', '[id^="aswift"]',
    'iframe[id*="google_ads"]', '[class*="ad-banner"]', '[class*="advert"]', '[id*="advert"]',
    '[class*="sponsored"]', '[data-ad]', '[data-ad-slot]', '.ad-container', '.ad-slot',
    '[aria-label="Advertisement"]', '[aria-label="Publicidad"]', '.taboola', '[id^="taboola"]',
    '.OUTBRAIN', '[id^="outbrain"]', '[class*="cookie-banner"]', '[id*="cookie-banner"]'
  ].concat(REDES.map(function (r) { return 'iframe[src*="' + r + '"],a[href*="' + r + '"]'; }))
   .join(',') + '{display:none!important;visibility:hidden!important;pointer-events:none!important}';

  function inyectarCSS() {
    if (document.getElementById('nav-alejandro-css')) return;
    var s = document.createElement('style');
    s.id = 'nav-alejandro-css';
    s.textContent = CSS_ANUNCIOS;
    (document.head || document.documentElement).appendChild(s);
  }

  if (!ES_PRINCIPAL) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inyectarCSS);
    else inyectarCSS();
    return;
  }

  // ---------------------------------------------------------------- CURSOR
  // Motor del cursor optimizado:
  //  - se mueve con transform (GPU), sin recalcular el diseno de la pagina
  //  - todo lo costoso (resaltar, hover) se hace como maximo una vez por cuadro
  //    y solo cuando el cursor se detiene un instante
  //  - con las flechas, mantener presionado = movimiento continuo y suave a 60 fps
  var cur = { x: 960, y: 540, el: null, marco: null, oculto: null,
              dx: 0, dy: 0, vel: 0, inicioMov: 0, ultimoFrame: 0, bucle: false,
              pendiente: false, quieto: null, teclaVista: 0 };
  var VEL_INICIAL = 900;   // px por segundo al empezar a mover
  var VEL_MAX = 2600;      // px por segundo manteniendo presionado
  var ACELERACION = 0.45;  // segundos hasta llegar a la velocidad maxima

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
    cur.el.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;' +
      'will-change:transform;filter:drop-shadow(0 0 4px ' + COLOR + ');transition:opacity .25s';
    document.documentElement.appendChild(cur.el);
    cur.marco = document.createElement('div');
    cur.marco.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483645;pointer-events:none;display:none;' +
      'border:3px solid ' + COLOR + ';border-radius:10px;box-shadow:0 0 14px ' + COLOR + ';will-change:transform';
    document.documentElement.appendChild(cur.marco);
    colocar();
  }

  function colocar() {   // barato: solo transform
    cur.el.style.transform = 'translate3d(' + cur.x + 'px,' + cur.y + 'px,0)';
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
    if (!cur.marco) return;
    var t = objetivo();
    if (!t || t.tagName === 'VIDEO' || t === document.body) { cur.marco.style.display = 'none'; return; }
    var r = t.getBoundingClientRect();
    if (r.width > window.innerWidth * 0.9 && r.height > window.innerHeight * 0.6) {
      cur.marco.style.display = 'none'; return;     // no resaltar contenedores gigantes
    }
    cur.marco.style.display = 'block';
    cur.marco.style.width = (r.width + 8) + 'px';
    cur.marco.style.height = (r.height + 8) + 'px';
    cur.marco.style.transform = 'translate3d(' + (r.left - 4) + 'px,' + (r.top - 4) + 'px,0)';
  }

  function hover() {   // los menus que se abren al pasar el mouse tambien funcionan
    var el = document.elementFromPoint(cur.x, cur.y);
    if (!el) return;
    var op = { bubbles: true, clientX: cur.x, clientY: cur.y, view: window };
    try { el.dispatchEvent(new MouseEvent('mouseover', op)); el.dispatchEvent(new MouseEvent('mousemove', op)); } catch (e) {}
  }

  // Lo costoso se hace 70 ms despues de que el cursor se detiene (no en cada paso)
  function alDetenerse(conHover) {
    clearTimeout(cur.quieto);
    if (cur.marco) cur.marco.style.display = 'none';
    cur.quieto = setTimeout(function () {
      resaltar();
      if (conHover) hover();
    }, 70);
  }

  var opacidad = '1', ultimaActividad = 0;
  function ponerOpacidad(o) {
    if (o !== opacidad && cur.el) { cur.el.style.opacity = o; opacidad = o; }
  }
  function mostrar() {
    ultimaActividad = Date.now();
    ponerOpacidad('1');
  }
  // Un solo reloj revisa si hay que atenuar el cursor (en vez de crear un temporizador por evento)
  setInterval(function () {
    if (!cur.el || Date.now() - ultimaActividad < 3500) return;
    var video = hayVideoReproduciendo();
    ponerOpacidad(video ? '0' : '0.4');            // en videos se esconde del todo
    if (video && cur.marco) cur.marco.style.display = 'none';
  }, 500);

  // Un solo dibujo por cuadro, aunque lleguen muchos eventos
  function pedirDibujo() {
    if (cur.pendiente) return;
    cur.pendiente = true;
    requestAnimationFrame(function () {
      cur.pendiente = false;
      crearCursor();
      colocar();
      mostrar();
    });
  }

  // Mouse real: touchpad de la app del celular, mouse USB o Bluetooth.
  // La app del celular manda pocas posiciones por segundo (se ve "a saltos").
  // Para que se vea fluido, el cursor se DESLIZA a 60 fps hacia la ultima posicion
  // recibida, prediciendo un poco el movimiento segun la velocidad del dedo.
  var raton = { tx: 960, ty: 540, vx: 0, vy: 0, t: 0, bucle: false };
  var SUAVIZADO = 0.55;   // 0..1: mas alto = mas pegado al dedo, mas bajo = mas suave
  function deslizar() {
    var ex = raton.tx - cur.x, ey = raton.ty - cur.y;
    if (Math.abs(ex) < 0.5 && Math.abs(ey) < 0.5) {
      cur.x = raton.tx; cur.y = raton.ty; colocar(); raton.bucle = false; return;
    }
    cur.x += ex * SUAVIZADO; cur.y += ey * SUAVIZADO;
    colocar();
    requestAnimationFrame(deslizar);
  }
  window.addEventListener('mousemove', function (e) {
    if (!e.isTrusted) return;                     // ignorar los eventos que genera este mismo script
    var ahora = performance.now(), dt = ahora - raton.t;
    if (dt > 0 && dt < 120) {                     // velocidad del dedo para anticipar un poco
      raton.vx = (e.clientX - raton.tx) / dt; raton.vy = (e.clientY - raton.ty) / dt;
    } else { raton.vx = raton.vy = 0; }
    raton.t = ahora;
    var w = window.innerWidth, h = window.innerHeight, pred = Math.min(dt, 40);
    raton.tx = Math.max(0, Math.min(w - 1, e.clientX + raton.vx * pred * 0.5));
    raton.ty = Math.max(0, Math.min(h - 1, e.clientY + raton.vy * pred * 0.5));
    crearCursor();
    mostrar();
    if (!raton.bucle) { raton.bucle = true; requestAnimationFrame(deslizar); }
    if (cur.marco && cur.marco.style.display !== 'none') cur.marco.style.display = 'none';
    alDetenerseRaton();
  }, true);
  // Al detener el dedo: posicion exacta (sin prediccion) y resaltado
  var quietoRaton = null;
  function alDetenerseRaton() {
    clearTimeout(quietoRaton);
    quietoRaton = setTimeout(function () {
      raton.tx = Math.round(raton.tx - raton.vx * 20); raton.ty = Math.round(raton.ty - raton.vy * 20);
      raton.vx = raton.vy = 0;
      if (!raton.bucle) { raton.bucle = true; requestAnimationFrame(deslizar); }
      setTimeout(resaltar, 60);
    }, 90);
  }
  window.addEventListener('mousedown', function (e) {
    if (!e.isTrusted) return;
    ultimoClic = Date.now();                     // un clic real tambien autoriza abrir enlaces
    var antes = document.elementFromPoint(e.clientX, e.clientY);
    quitarTrampas(e.clientX, e.clientY);
    if (antes && !document.documentElement.contains(antes)) {   // era una trampa: no dejar pasar el clic
      e.preventDefault(); e.stopImmediatePropagation();
    }
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

  var scrollCache = { el: null, t: 0 };
  function scroll(dy, suave) {
    var ahora = Date.now();
    if (!scrollCache.el || ahora - scrollCache.t > 400) scrollCache.el = contenedorScroll(cur.x, cur.y);
    scrollCache.t = ahora;
    var c = scrollCache.el;
    if (suave && c.scrollBy) c.scrollBy({ top: dy, behavior: 'smooth' });
    else c.scrollTop += dy;                        // instantaneo: sin retraso
  }

  // ---- Movimiento continuo con flechas (requestAnimationFrame) ----
  function paso(t) {
    if (!cur.dx && !cur.dy) { cur.bucle = false; alDetenerse(true); return; }
    // si el control dejo de mandar teclas (keyup perdido), frenar
    if (Date.now() - cur.teclaVista > 650) { cur.dx = cur.dy = 0; cur.bucle = false; alDetenerse(true); return; }
    var dt = Math.min(0.05, (t - (cur.ultimoFrame || t)) / 1000);
    cur.ultimoFrame = t;
    var progreso = Math.min(1, (t - cur.inicioMov) / 1000 / ACELERACION);
    var v = VEL_INICIAL + (VEL_MAX - VEL_INICIAL) * progreso * progreso;
    var w = window.innerWidth, h = window.innerHeight, borde = 24;
    cur.x = Math.max(0, Math.min(w - 1, cur.x + cur.dx * v * dt));
    var ny = cur.y + cur.dy * v * dt;
    if (ny > h - borde && cur.dy > 0) { scroll(v * dt * 1.6); ny = h - borde; }
    if (ny < borde && cur.dy < 0) { scroll(-v * dt * 1.6); ny = borde; }
    cur.y = Math.max(0, Math.min(h - 1, ny));
    colocar();
    requestAnimationFrame(paso);
  }

  function empezarMovimiento(dx, dy) {
    crearCursor();
    mostrar();
    var nueva = (dx !== cur.dx || dy !== cur.dy);
    cur.teclaVista = Date.now();
    if (!nueva && cur.bucle) return;              // tecla repetida: el bucle ya esta corriendo
    cur.dx = dx; cur.dy = dy;
    // Toque corto: salto inmediato de 22 px para que responda al instante
    cur.x = Math.max(0, Math.min(window.innerWidth - 1, cur.x + dx * 22));
    cur.y = Math.max(0, Math.min(window.innerHeight - 1, cur.y + dy * 22));
    colocar();
    if (cur.marco) cur.marco.style.display = 'none';
    if (!cur.bucle) {
      cur.bucle = true;
      cur.inicioMov = performance.now() + 120;     // pequena pausa antes de acelerar (precision)
      cur.ultimoFrame = 0;
      requestAnimationFrame(paso);
    }
  }

  // ---- Modo saltos: las flechas saltan al siguiente boton/enlace en esa direccion ----
  var modoSaltos = false;
  try { modoSaltos = localStorage.getItem('navAlejandroSaltos') === '1'; } catch (e) {}

  function candidatos() {
    var lista = [], w = window.innerWidth, h = window.innerHeight;
    var ns = document.querySelectorAll(CLICABLE);
    for (var i = 0; i < ns.length && lista.length < 400; i++) {
      var r = ns[i].getBoundingClientRect();
      if (r.width < 6 || r.height < 6 || r.bottom < 0 || r.top > h || r.right < 0 || r.left > w) continue;
      if (r.width > w * 0.9 && r.height > h * 0.6) continue;           // contenedores gigantes no
      var cx = Math.max(4, Math.min(w - 4, r.left + r.width / 2));
      var cy = Math.max(4, Math.min(h - 4, r.top + r.height / 2));
      var top = document.elementFromPoint(cx, cy);
      if (top && top !== ns[i] && !ns[i].contains(top) && !top.contains(ns[i])) continue;  // tapado
      lista.push({ x: cx, y: cy });
    }
    return lista;
  }

  function saltar(dx, dy) {
    crearCursor(); mostrar();
    var mejor = null, puntaje = Infinity, lista = candidatos();
    for (var i = 0; i < lista.length; i++) {
      var vx = lista[i].x - cur.x, vy = lista[i].y - cur.y;
      var adelante = vx * dx + vy * dy;                 // avance en la direccion pedida
      if (adelante < 12) continue;
      var lateral = Math.abs(vx * dy - vy * dx);        // desvio a los lados
      if (lateral > adelante * 2) continue;             // fuera del cono (~63 grados)
      var p = adelante + lateral * 2.2;
      if (p < puntaje) { puntaje = p; mejor = lista[i]; }
    }
    if (mejor) {
      raton.tx = mejor.x; raton.ty = mejor.y; raton.vx = raton.vy = 0;
      if (!raton.bucle) { raton.bucle = true; requestAnimationFrame(deslizar); }
      alDetenerse(true);
    } else if (dy) {
      scroll(dy * window.innerHeight * 0.45, true);     // nada en esa direccion: desplazar
      alDetenerse(true);
    }
  }

  function pararMovimiento() {
    cur.dx = cur.dy = 0;
  }

  function clic() {
    ultimoClic = Date.now();
    quitarTrampas(cur.x, cur.y);
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
    setTimeout(resaltar, 250);
  }

  function videoPrincipal() {
    var vs = document.querySelectorAll('video'), mejor = null, area = 0;
    for (var i = 0; i < vs.length; i++) {
      var r = vs[i].getBoundingClientRect(), a = r.width * r.height;
      if (a > area) { area = a; mejor = vs[i]; }
    }
    return mejor;
  }

  // Borra lo que el sitio guardo en el TV (cookies, almacenamiento, cache, service workers)
  function limpiarSitio() {
    try { localStorage.clear(); } catch (e) {}
    try { sessionStorage.clear(); } catch (e) {}
    try {
      document.cookie.split(';').forEach(function (c) {
        var n = c.split('=')[0].trim(); if (!n) return;
        var partes = location.hostname.split('.');
        for (var i = 0; i < partes.length - 1; i++) {
          var dom = partes.slice(i).join('.');
          document.cookie = n + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + dom;
        }
        document.cookie = n + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      });
    } catch (e) {}
    var tareas = [];
    try { if (window.caches) tareas.push(caches.keys().then(function (k) { return Promise.all(k.map(function (n) { return caches.delete(n); })); })); } catch (e) {}
    try { if (navigator.serviceWorker) tareas.push(navigator.serviceWorker.getRegistrations().then(function (r) { r.forEach(function (x) { x.unregister(); }); })); } catch (e) {}
    try { if (window.indexedDB && indexedDB.databases) tareas.push(indexedDB.databases().then(function (d) { d.forEach(function (x) { indexedDB.deleteDatabase(x.name); }); })); } catch (e) {}
    Promise.all(tareas).catch(function () {}).then(function () { location.reload(); });
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
    autorizar(url);
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
      '<button class="it" data-a="escudo">' + (escudo ? '🛡 Escudo: ON' : '🛡 Escudo: OFF') + '</button>' +
      '<button class="it" data-a="limpiar">🧹 Limpiar sitio</button>' +
      '<button class="it" data-a="saltos">' + (modoSaltos ? '🎯 Saltos: ON' : '🎯 Saltos: OFF') + '</button>' +
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
    if (b.dataset.u) { cerrarMenu(); autorizar(b.dataset.u); location.href = b.dataset.u; return; }
    switch (b.dataset.a) {
      case 'atras': cerrarMenu(); history.back(); break;
      case 'recargar': location.reload(); break;
      case 'zoommas': menu.zoom = Math.min(2, Math.round((menu.zoom + 0.1) * 10) / 10); aplicarZoom(); break;
      case 'zoommenos': menu.zoom = Math.max(0.5, Math.round((menu.zoom - 0.1) * 10) / 10); aplicarZoom(); break;
      case 'inicio': cerrarMenu(); autorizar(FAVORITOS[0].u); location.href = FAVORITOS[0].u; break;
      case 'escudo':
        escudo = !escudo;
        try { escudo ? localStorage.removeItem('navAlejandroEscudoOff') : localStorage.setItem('navAlejandroEscudoOff', '1'); } catch (e) {}
        b.textContent = escudo ? '🛡 Escudo: ON' : '🛡 Escudo: OFF';
        setTimeout(function () { location.reload(); }, 400);   // aplica el cambio al bloqueador
        break;
      case 'limpiar': limpiarSitio(); break;
      case 'saltos':
        modoSaltos = !modoSaltos;
        try { modoSaltos ? localStorage.setItem('navAlejandroSaltos', '1') : localStorage.removeItem('navAlejandroSaltos'); } catch (e) {}
        b.textContent = modoSaltos ? '🎯 Saltos: ON' : '🎯 Saltos: OFF';
        break;
      case 'arriba': cerrarMenu(); (document.scrollingElement || document.documentElement).scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'cursor': cerrarMenu(); cur.x = window.innerWidth / 2; cur.y = window.innerHeight / 2; pedirDibujo(); alDetenerse(true); break;
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
    else if (escribiendo()) {                                 // dejar escribir sin interferir
      if (c !== K.ATRAS) return;
      document.activeElement.blur();                          // Atras: solo cierra el teclado
    }
    else if (c === K.IZQ) modoSaltos ? saltar(-1, 0) : empezarMovimiento(-1, 0);
    else if (c === K.DER) modoSaltos ? saltar(1, 0) : empezarMovimiento(1, 0);
    else if (c === K.ARRIBA) modoSaltos ? saltar(0, -1) : empezarMovimiento(0, -1);
    else if (c === K.ABAJO) modoSaltos ? saltar(0, 1) : empezarMovimiento(0, 1);
    else if (c === K.OK) clic();
    else if (c === K.CANAL_MAS) scroll(-window.innerHeight * 0.85, true);
    else if (c === K.CANAL_MENOS) scroll(window.innerHeight * 0.85, true);
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

  window.addEventListener('keyup', function (e) {
    if (e.keyCode >= 37 && e.keyCode <= 40) pararMovimiento();
  }, true);

  // ---------------------------------------------------------------- ARRANQUE
  function alCargar() {
    inyectarCSS();
    crearCursor();
    pedirDibujo();
    aplicarZoom();
    var esInicio = /^https:\/\/www\.google\.com\/?$/.test(location.href);
    if (esInicio && history.length <= 1) abrirMenu();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alCargar);
  else alCargar();
  // Por si la pagina reemplaza el <html> o borra el cursor
  setInterval(function () { if (!document.hidden) { inyectarCSS(); crearCursor(); } }, 3000);
})();

