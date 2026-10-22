/*
 * Navegador Alejandro v1.8 - modulo de TizenBrew (se inyecta en cada pagina)
 * --------------------------------------------------------------------
 * Control remoto:
 *   Flechas ............ mover la flechita (mantener = mas rapido; en el borde hace scroll)
 *                        arriba del todo aparece la BARRA (atras, inicio, direccion, zoom...)
 *   OK ................. clic donde esta la flechita
 *   Atras .............. pagina anterior / salir de pantalla completa / cerrar teclado
 *   Play/Pausa ......... abrir / cerrar el MENU
 *   Video en pantalla completa: la flechita sigue igual (flechas y OK); Play/Pausa pausa,
 *   0-9 saltan, Atras sale. Nada se roba las flechas ni el volumen.
 * Tambien funciona con mouse real: touchpad de la app del celular, mouse USB o Bluetooth.
 * Las paginas ven un Chrome de computador (modo PC), no un TV ni un celular.
 * Abajo salen guias con las teclas que sirven en cada momento.
 */
(function () {
  'use strict';
  if (window.__navAlejandro) return;
  window.__navAlejandro = true;
  // Con el inicio temprano el script tambien entra en iframes y podria entrar en la
  // pantalla local de TizenBrew: en esta ultima no hace nada.
  if (location.protocol === 'file:' || !location.hostname) return;
  var ES_PRINCIPAL = (function () { try { return window.top === window; } catch (e) { return false; } })();

  // ===================== MODO PC (v1.8) =====================
  // El TV se presenta como "SMART-TV; Tizen ... TV Safari" y muchas paginas (Facebook,
  // Cuevana...) mandan entonces su version de CELULAR. Aqui cada pagina ve un Chrome de
  // computador con Windows. (El TizenBrew corregido v2 tambien cambia lo que llega al servidor.)
  function agentePC(ua) {
    var m = /Chrome\/(\d{2,3})\./.exec(ua) || /\b(\d{2,3})\.\d+\.\d+\.\d+\b/.exec(ua);
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' +
      (m ? m[1] : '108') + '.0.0.0 Safari/537.36';
  }
  var UA_PC = agentePC(navigator.userAgent);
  (function modoPC() {
    var ver = /Chrome\/(\d+)/.exec(UA_PC)[1];
    function fijar(obj, prop, valor) {
      try { Object.defineProperty(obj, prop, { configurable: true, enumerable: true, get: function () { return valor; } }); } catch (e) {}
    }
    var N = window.Navigator && Navigator.prototype;
    if (!N) return;
    var marcas = [{ brand: 'Chromium', version: ver }, { brand: 'Google Chrome', version: ver }, { brand: 'Not?A_Brand', version: '99' }];
    var datos = { brands: marcas, mobile: false, platform: 'Windows' };
    fijar(N, 'userAgent', UA_PC);
    fijar(N, 'appVersion', UA_PC.replace(/^Mozilla\//, ''));
    fijar(N, 'platform', 'Win32');
    fijar(N, 'maxTouchPoints', 0);
    fijar(N, 'userAgentData', {
      brands: marcas, mobile: false, platform: 'Windows',
      getHighEntropyValues: function () {
        return Promise.resolve({ brands: marcas, mobile: false, platform: 'Windows', platformVersion: '10.0.0',
          architecture: 'x86', bitness: '64', model: '', uaFullVersion: ver + '.0.0.0',
          fullVersionList: marcas.map(function (b) { return { brand: b.brand, version: b.version + '.0.0.0' }; }) });
      },
      toJSON: function () { return datos; }
    });
    // Consultas tipo "(pointer: coarse)" o "(hover: none)": las paginas creen que es una pantalla tactil
    var mmOrig = window.matchMedia;
    if (!mmOrig) return;
    var RE_PUNTERO = /^\s*\(\s*(any-)?(pointer|hover)\s*:\s*(coarse|none|fine|hover)\s*\)\s*$/i;
    window.matchMedia = function (q) {
      var m = RE_PUNTERO.exec(String(q));
      if (!m) return mmOrig.apply(this, arguments);
      var vale = /fine|hover/i.test(m[3]);     // como un PC con mouse
      var nada = function () {};
      return { matches: vale, media: String(q), onchange: null, addListener: nada, removeListener: nada,
               addEventListener: nada, removeEventListener: nada, dispatchEvent: function () { return false; } };
    };
  })();

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
  var intencion = { host: '', t: 0, libre: 0 };   // a donde quisiste ir tu (enlace que pulsaste)
  function autorizar(url) { intencion.host = host(url); intencion.t = Date.now(); }
  function autorizado(url) {
    var h = host(url);
    return mismoSitio(h, host(location.href)) ||
           host(location.href) === 'caceres0128.github.io' ||          // tu propio inicio
           Date.now() - intencion.libre < 4000 ||                      // acabas de buscar algo tu
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
        t.setAttribute('data-navale', '');
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
  //     Muchas paginas "bloquean" el video hasta que su anuncio abre una pestana; en el
  //     navegador de Samsung tu la cierras con Atras y la pagina se desbloquea.
  //     Aqui la pagina recibe una VENTANA FALSA: cree que el anuncio se abrio, se
  //     desbloquea sola, y tu no ves nada. Si era algo bueno, se abre desde el menu (↗).
  function nada() {}
  function ventanaFalsa(url) {
    var u = String(url || 'about:blank');
    var doc = { write: nada, writeln: nada, close: nada, title: '', body: null, head: null, readyState: 'complete', URL: u,
                createElement: function (t) { return document.createElement(t); },
                getElementById: function () { return null; }, querySelector: function () { return null; } };
    doc.open = function () { return doc; };
    var w = { closed: false, name: '', opener: null, length: 0, document: doc,
      location: { href: u, assign: nada, replace: nada, reload: nada, toString: function () { return this.href; } },
      focus: nada, blur: nada, print: nada, stop: nada, moveTo: nada, moveBy: nada, resizeTo: nada, resizeBy: nada,
      scrollTo: nada, postMessage: nada, addEventListener: nada, removeEventListener: nada,
      dispatchEvent: function () { return true; }, setTimeout: function () { return 0; }, clearTimeout: nada,
      close: function () { w.closed = true; } };
    w.window = w.self = w.top = w.parent = w.frames = w;
    return w;
  }
  var ventanasBloqueadas = [];        // las ultimas, para abrirlas desde el menu si eran buenas
  function recordarBloqueada(url) {
    try {
      var u = new URL(String(url), location.href).href;
      if (!/^https?:/.test(u) || urlBloqueada(u)) return;
      if (!ES_PRINCIPAL) { window.top.postMessage({ __navAle: 1, t: 'bloqueada', u: u }, '*'); return; }
      ventanasBloqueadas = [u].concat(ventanasBloqueadas.filter(function (x) { return x !== u; })).slice(0, 5);
      if (typeof refrescarBarra === 'function') refrescarBarra();
    } catch (e) {}
  }
  window.open = function (url) {
    if (!escudo) { if (url) location.href = url; return ventanaFalsa(url); }
    if (url && ES_PRINCIPAL && Date.now() - ultimoClic < 1000 && autorizado(url)) { location.href = url; return ventanaFalsa(url); }
    if (url) recordarBloqueada(url);
    avisoBloqueo('Ventana emergente bloqueada');
    if (!ES_PRINCIPAL) contar('ventana emergente');
    return ventanaFalsa(url);
  };

  // Registrar a donde apunta el enlace que pulsas (control, touchpad o mouse)
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a) {
      var nueva = a.target && !/^_(self|parent)$/i.test(a.target);
      // Dentro de un reproductor (iframe), un enlace que abre otra pestana hacia otro
      // sitio es casi siempre un anuncio: no se abre (queda en el menu ↗ por si acaso)
      if (!ES_PRINCIPAL && escudo && nueva && !/^javascript:/i.test(a.href) &&
          !mismoSitio(host(a.href), host(location.href))) {
        e.preventDefault();
        recordarBloqueada(a.href);
        contar('enlace emergente');
        return;
      }
      if (nueva) a.target = '_self';   // nada de pestanas nuevas
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
    // nunca es trampa el contenido real: reproductores, videos, imagenes, lienzos
    if (/^(IFRAME|VIDEO|EMBED|OBJECT|CANVAS|IMG|PICTURE|SVG)$/i.test(el.tagName)) return false;
    if (el.hasAttribute && el.hasAttribute('data-navale')) return false;
    var st = getComputedStyle(el);
    if (st.position !== 'fixed' && st.position !== 'absolute') return false;
    var r = el.getBoundingClientRect();
    var grande = r.width * r.height > window.innerWidth * window.innerHeight * 0.25;
    if (!grande) return false;
    var invisible = parseFloat(st.opacity) < 0.15 ||
      (st.backgroundColor === 'rgba(0, 0, 0, 0)' && !el.textContent.trim() &&
       !el.querySelector('img,video,canvas,svg,iframe,embed,object') && !/url\(/.test(st.backgroundImage || ''));
    var enlaceAfuera = el.tagName === 'A' && el.href && !mismoSitio(host(el.href), host(location.href));
    return invisible || enlaceAfuera;
  }
  function quitarTrampas(x, y) {
    if (!escudo) return;
    for (var i = 0; i < 5; i++) {           // puede haber varias capas apiladas
      var el = document.elementFromPoint(x, y), quitado = false;
      for (var n = el; n && n !== document.body; n = n.parentElement) {
        if (/^(VIDEO|IFRAME|EMBED|OBJECT)$/.test(n.tagName)) break;   // nunca tocar el reproductor
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
  var registro = {};   // dominio -> cantidad (panel de bloqueos)
  function registrar(clave) {
    registro[clave] = (registro[clave] || 0) + 1;
  }
  function contar(detalle) {
    var clave = (detalle && host(detalle)) || detalle || 'otros';
    if (!ES_PRINCIPAL) {   // los iframes reportan al marco principal
      try { window.top.postMessage({ __navAle: 1, t: 'conteo', d: String(clave) }, '*'); } catch (e) {}
      return;
    }
    registrar(clave);
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
    } else if (t === 'META') {
      // (4) recargas/redirecciones forzadas con <meta http-equiv="refresh">
      if (bloqueoActivo && /refresh/i.test(n.httpEquiv || n.getAttribute('http-equiv') || '')) return true;
    }
    return false;
  }

  // 1) Scripts que vienen en el HTML: se desactivan apenas aparecen (antes de ejecutarse)
  function revisarNodo(n) {
    if (nodoBloqueado(n)) {
      if (n.tagName === 'SCRIPT') n.type = 'javascript/bloqueado';
      if (n.parentNode) n.parentNode.removeChild(n);
      contar(n.src || n.href || n.data || n.tagName.toLowerCase());
      return;
    }
    if (n.tagName === 'IFRAME' && cajaArena(n)) {
      // ya estaba cargando sin caja: se recarga dentro de la caja
      var src = n.getAttribute('src');
      if (src) setAttrOrig.call(n, 'src', src);
    }
    if (n.hasAttribute && n.hasAttribute('autofocus')) n.removeAttribute('autofocus');
  }
  try {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var a = muts[i].addedNodes;
        for (var j = 0; j < a.length; j++) {
          revisarNodo(a[j]);
          if (a[j].querySelectorAll) {
            var hijos = a[j].querySelectorAll('script,iframe,img,embed,object,link,meta,[autofocus]');
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
      var ns = document.querySelectorAll('script[src],iframe,img,embed,object,link[rel],meta,[autofocus]');
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
      if (nodoBloqueado(n)) { contar(n.src || n.href); return n; }
      prepararNodo(n);
      return orig.apply(this, arguments);
    };
  });
  ['append', 'prepend', 'after', 'before'].forEach(function (m) {
    var orig = Element.prototype[m];
    if (!orig) return;
    Element.prototype[m] = function () {
      var args = Array.prototype.filter.call(arguments, function (n) {
        if (nodoBloqueado(n)) { contar(n.src || n.href); return false; }
        prepararNodo(n);
        return true;
      });
      return orig.apply(this, args);
    };
  });
  function protegerSrc(proto, prop) {
    var d = proto && Object.getOwnPropertyDescriptor(proto, prop);
    if (!d || !d.set) return;
    Object.defineProperty(proto, prop, {
      configurable: true, enumerable: d.enumerable, get: d.get,
      set: function (v) {
        if (urlBloqueada(v)) { contar(v); return; }
        if (this.tagName === 'IFRAME') cajaArena(this, v);
        d.set.call(this, v);
      }
    });
  }
  protegerSrc(window.HTMLScriptElement && HTMLScriptElement.prototype, 'src');
  protegerSrc(window.HTMLIFrameElement && HTMLIFrameElement.prototype, 'src');
  protegerSrc(window.HTMLImageElement && HTMLImageElement.prototype, 'src');
  var setAttrOrig = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (nombre, valor) {
    if ((nombre === 'src' || nombre === 'href' || nombre === 'data') && /^(SCRIPT|IFRAME|IMG|EMBED|OBJECT)$/.test(this.tagName) && urlBloqueada(valor)) {
      contar(valor); return;
    }
    if (nombre === 'src' && this.tagName === 'IFRAME') cajaArena(this, valor);
    return setAttrOrig.apply(this, arguments);
  };

  // 3) Peticiones de red de anuncios y rastreo (fetch, XHR, beacons)
  if (window.fetch) {
    var fetchOrig = window.fetch;
    window.fetch = function (r) {
      var u = r && r.url ? r.url : r;
      if (urlBloqueada(u)) { contar(u); return Promise.reject(new TypeError('Bloqueado')); }
      return fetchOrig.apply(this, arguments);
    };
  }
  var xhrOpen = XMLHttpRequest.prototype.open, xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__bloq = urlBloqueada(u);
    this.__url = u;
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__bloq) { contar(this.__url); try { this.abort(); } catch (e) {} return; }
    return xhrSend.apply(this, arguments);
  };
  if (navigator.sendBeacon) {
    var beaconOrig = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u) { if (urlBloqueada(u)) { contar(u); return true; } return beaconOrig.apply(null, arguments); };
  }

  // ================================================================ BLOQUEO AVANZADO (v1.7)
  // (1) Caja de arena: los iframes de OTROS sitios (reproductores, anuncios) pueden
  //     reproducir video, pero no cambiar tu pagina ni abrir ventanas nuevas.
  var ALMACEN_HOST = 'caceres0128.github.io';
  var cajaActiva = bloqueoActivo;
  try { cajaActiva = bloqueoActivo && localStorage.getItem('navAlejandroCajaOff') !== '1'; } catch (e) {}
  var SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock allow-orientation-lock allow-modals';
  function cajaArena(f, nuevoSrc) {
    try {
      if (!cajaActiva || !f || f.tagName !== 'IFRAME' || f.__navCaja || f.hasAttribute('sandbox')) return false;
      var src = nuevoSrc != null ? String(nuevoSrc) : (f.getAttribute('src') || '');
      if (!/^(https?:)?\/\//i.test(src)) return false;          // about:blank, srcdoc, rutas propias: no
      var h = host(src);
      if (!h || mismoSitio(h, host(location.href)) || h === ALMACEN_HOST) return false;
      f.__navCaja = true;
      setAttrOrig.call(f, 'sandbox', SANDBOX);
      if (!f.hasAttribute('allow')) setAttrOrig.call(f, 'allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
      setAttrOrig.call(f, 'allowfullscreen', '');
      return true;
    } catch (e) { return false; }
  }
  function prepararNodo(n) {
    if (!n || n.nodeType !== 1 && n.nodeType !== 11) return;
    if (n.tagName === 'IFRAME') cajaArena(n);
    if (n.querySelectorAll) {
      var fs = n.querySelectorAll('iframe');
      for (var i = 0; i < fs.length; i++) cajaArena(fs[i]);
    }
  }

  // (2) "Primer clic": scripts que vigilan TODA la pagina para abrir un anuncio
  //     con tu primer clic. Se ignoran los vigilantes de clic que abren ventanas.
  var EVENTOS_CLIC = /^(click|mousedown|mouseup|pointerdown|pointerup|touchstart|touchend|auxclick)$/;
  var RE_POPUNDER = /\bwindow\.open\b|\[\s*["']open["']\s*\]|popunder|clickunder|pop_?under/i;
  var addEvOrig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (tipo, fn) {
    try {
      if (bloqueoActivo && fn && EVENTOS_CLIC.test(tipo) &&
          (this === window || this === document || this === document.documentElement || this === document.body)) {
        var codigo = typeof fn === 'function' ? Function.prototype.toString.call(fn)
          : (fn && fn.handleEvent ? Function.prototype.toString.call(fn.handleEvent) : '');
        if (RE_POPUNDER.test(codigo)) { contar('vigilante de primer clic'); return; }
      }
    } catch (e) {}
    return addEvOrig.apply(this, arguments);
  };

  // (3) Librerias de popunder conocidas: si intentan instalarse, se detienen
  ['PopAds', 'popns'].forEach(function (nombre) {
    try {
      Object.defineProperty(window, nombre, {
        configurable: false,
        get: function () { return undefined; },
        set: function () { if (bloqueoActivo) { contar('popunder ' + nombre); throw new ReferenceError('bloqueado'); } }
      });
    } catch (e) {}
  });

  // (5) Lista de bloqueo actualizable sin nueva version: lista.txt en tu GitHub
  var LISTA_URL = 'https://cdn.jsdelivr.net/gh/caceres0128/navegador-tv@main/lista.txt';
  function aplicarLista(txt) {
    String(txt || '').split(/\r?\n/).forEach(function (l) {
      l = l.replace(/#.*/, '').trim().toLowerCase();
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(l)) DOMS[l] = 1;
    });
  }
  try { aplicarLista(localStorage.getItem('navAlejandroLista')); } catch (e) {}
  setTimeout(function () {
    var t = 0;
    try { t = +localStorage.getItem('navAlejandroListaT') || 0; } catch (e) {}
    if (Date.now() - t < 6 * 3600e3) return;            // como mucho cada 6 horas
    try {
      (fetchOrig || window.fetch).call(window, LISTA_URL).then(function (r) { return r.ok ? r.text() : ''; }).then(function (txt) {
        if (!txt) return;
        aplicarLista(txt);
        try { localStorage.setItem('navAlejandroLista', txt); localStorage.setItem('navAlejandroListaT', String(Date.now())); } catch (e) {}
      }).catch(function () {});
    } catch (e) {}
  }, ES_PRINCIPAL ? 3000 : 6000);

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

  // ================================================================ COMUN A TODOS LOS MARCOS
  // (incluye los iframes de los reproductores, donde vive el video de muchas paginas)

  // ---- (12) Teclado bajo control: el teclado del TV solo se abre si TU eliges la casilla
  var intencionFoco = 0;
  function permitirFoco() { intencionFoco = Date.now(); }
  function esEditable(el) {
    return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable) &&
      !/^(button|submit|checkbox|radio|range|color|file|image|reset|hidden)$/i.test(el.type || '');
  }
  var focoOrig = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function () {
    if (esEditable(this) && !this.__navAlePropio && Date.now() - intencionFoco > 900) return;  // foco automatico: no
    return focoOrig.apply(this, arguments);
  };
  addEvOrig.call(window, 'mousedown', function (e) { if (e.isTrusted) permitirFoco(); }, true);
  addEvOrig.call(window, 'keydown', function (e) { if (e.isTrusted && e.keyCode === 13) permitirFoco(); }, true);
  addEvOrig.call(document, 'DOMContentLoaded', function () {
    var a = document.activeElement;
    if (esEditable(a) && Date.now() - intencionFoco > 900) a.blur();   // autofocus de la pagina
  });
  // autofocus u otros focos que llegan tarde: si no lo pediste, se suelta
  addEvOrig.call(document, 'focusin', function (e) {
    var t = e.target;
    if (esEditable(t) && !t.__navAlePropio && Date.now() - intencionFoco > 900) {
      try { t.blur(); } catch (err) {}
    }
  }, true);

  // ---- (v1.8.2) TECLADO DEL TV: el boton "Completado" del teclado en pantalla NO manda un
  // Enter normal (manda el codigo 65376), asi que Google y los demas buscadores nunca se
  // enteraban de que terminaste de escribir, y la casilla se quedaba con el foco (flechita
  // trabada). Aqui "Completado" = Enter de verdad: busca / envia, y suelta la casilla.
  var IME_LISTO = 65376, IME_CANCELAR = 65385;
  function activoReal() {
    var a = document.activeElement;
    while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
    return a;
  }
  function enviarCasilla(el) {
    var op = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, charCode: 0, bubbles: true, cancelable: true, composed: true };
    var atendido = false;
    try {
      var ev = new KeyboardEvent('keydown', op);
      el.dispatchEvent(ev);
      atendido = ev.defaultPrevented;
      var ev2 = new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, charCode: 13, bubbles: true, cancelable: true });
      el.dispatchEvent(ev2);
      atendido = atendido || ev2.defaultPrevented;
      el.dispatchEvent(new KeyboardEvent('keyup', op));
    } catch (e) {}
    if (atendido) return;                       // la pagina ya hizo la busqueda con su JavaScript
    var f = el.form || (el.closest ? el.closest('form') : null);
    if (!f) return;
    try { f.requestSubmit ? f.requestSubmit() : f.submit(); }
    catch (e) { try { f.submit(); } catch (e2) {} }
  }
  addEvOrig.call(window, 'keydown', function (e) {
    var c = e.keyCode;
    if (c !== IME_LISTO && c !== IME_CANCELAR) return;
    var a = activoReal();
    if (!esEditable(a)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (c === IME_LISTO) {
      intencion.libre = Date.now();     // TU buscaste: la pagina puede llevarte al resultado
      if (typeof a.__navAleEnviar === 'function') a.__navAleEnviar(a.value);
      else enviarCasilla(a);
    }
    setTimeout(function () { try { a.blur(); } catch (err) {} }, 0);   // la flechita vuelve a moverse
  }, true);

  // ---- Avisos en pantalla (OSD) de este marco
  function osd(texto) {
    try {
      var o = document.getElementById('nav-ale-osd');
      if (!o) {
        o = document.createElement('div');
        o.id = 'nav-ale-osd';
        o.setAttribute('data-navale', '');
        o.style.cssText = 'position:fixed;left:50%;top:8%;transform:translateX(-50%);z-index:2147483647;' +
          'pointer-events:none;background:rgba(10,18,32,.88);color:#fff;font:700 30px Arial,sans-serif;' +
          'padding:14px 30px;border-radius:40px;border:2px solid ' + COLOR + ';transition:opacity .25s;opacity:0';
        (document.body || document.documentElement).appendChild(o);
      }
      o.textContent = texto;
      o.style.opacity = '1';
      clearTimeout(o._t);
      o._t = setTimeout(function () { o.style.opacity = '0'; }, 1400);
    } catch (e) {}
  }
  function mmss(t) {
    t = Math.max(0, Math.floor(t || 0));
    var h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), x = t % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x;
  }

  // ---- (13) Control de video universal
  function videoPrincipal() {
    var vs = document.querySelectorAll('video'), mejor = null, area = 0;
    for (var i = 0; i < vs.length; i++) {
      var r = vs[i].getBoundingClientRect(), a = r.width * r.height;
      if (a > area) { area = a; mejor = vs[i]; }
    }
    return mejor;
  }
  // ---- Pantalla completa "de TV" (v1.8)
  // La pantalla completa real tapa todo lo demas: ni la flechita ni los avisos se
  // pueden ver encima. Como el navegador ya ocupa todo el TV, aqui "pantalla completa"
  // = el reproductor se estira a toda la pantalla con CSS, y la pagina cree que es la real.
  var pcom = { el: null, estilo: null };
  var alCambiarPantalla = null;            // el marco principal pone aqui sus avisos
  var dispatchOrig = EventTarget.prototype.dispatchEvent;
  var D = Document.prototype, E = Element.prototype;
  var fsReal = {};
  ['fullscreenElement', 'webkitFullscreenElement', 'webkitCurrentFullScreenElement'].forEach(function (p) {
    var d = Object.getOwnPropertyDescriptor(D, p);
    fsReal[p] = d && d.get;
    try { Object.defineProperty(D, p, { configurable: true, get: function () { return pcom.el || (d && d.get ? d.get.call(this) : null); } }); } catch (e) {}
  });
  ['fullscreen', 'webkitIsFullScreen'].forEach(function (p) {
    var d = Object.getOwnPropertyDescriptor(D, p);
    try { Object.defineProperty(D, p, { configurable: true, get: function () { return !!pcom.el || !!(d && d.get && d.get.call(this)); } }); } catch (e) {}
  });
  ['fullscreenEnabled', 'webkitFullscreenEnabled'].forEach(function (p) {
    try { Object.defineProperty(D, p, { configurable: true, get: function () { return true; } }); } catch (e) {}
  });
  function realCompleto() {
    var g = fsReal.fullscreenElement || fsReal.webkitFullscreenElement;
    try { return g ? g.call(document) : null; } catch (e) { return null; }
  }
  var salirReal = D.exitFullscreen || D.webkitExitFullscreen;
  function avisarCambio(el) {
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (t) {
      try { dispatchOrig.call(el && el.isConnected ? el : document, new Event(t, { bubbles: true })); } catch (e) {}
    });
  }
  var CSS_PCOM = '[data-navale-pc],[data-navale-pc] body{overflow:hidden!important}' +
    '[data-navale-pcp]{transform:none!important;filter:none!important;contain:none!important;' +
    'will-change:auto!important;z-index:2147483640!important;clip-path:none!important}';
  function entrarCompleta(el) {
    if (!el || el.nodeType !== 1) return;
    if (pcom.el === el) return;
    if (pcom.el) salirCompleta(true);
    pcom.el = el;
    pcom.estilo = el.getAttribute('style');
    el.style.cssText += ';position:fixed!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;' +
      'width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;min-width:0!important;' +
      'min-height:0!important;margin:0!important;border:0!important;transform:none!important;z-index:2147483640!important;' +
      'background:#000!important;visibility:visible!important;opacity:1!important' + (el.tagName === 'VIDEO' ? ';object-fit:contain!important' : '');
    for (var n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) setAttrOrig.call(n, 'data-navale-pcp', '');
    setAttrOrig.call(document.documentElement, 'data-navale-pc', '');
    if (!document.getElementById('nav-ale-pcom')) {
      var st = document.createElement('style');
      st.id = 'nav-ale-pcom';
      st.textContent = CSS_PCOM;
      (document.head || document.documentElement).appendChild(st);
    }
    avisarCambio(el);
    if (!ES_PRINCIPAL) { try { window.parent.postMessage({ __navAle: 1, t: 'pc', on: true }, '*'); } catch (e) {} }
    if (alCambiarPantalla) alCambiarPantalla(true);
  }
  function salirCompleta(cambiando) {
    var el = pcom.el;
    if (!el) return;
    pcom.el = null;
    if (pcom.estilo == null) el.removeAttribute('style'); else setAttrOrig.call(el, 'style', pcom.estilo);
    var ps = document.querySelectorAll('[data-navale-pcp]');
    for (var i = 0; i < ps.length; i++) ps[i].removeAttribute('data-navale-pcp');
    document.documentElement.removeAttribute('data-navale-pc');
    if (el.tagName === 'IFRAME' && el.contentWindow) {        // que el reproductor de adentro tambien salga
      try { el.contentWindow.postMessage({ __navAle: 1, t: 'salirPC' }, '*'); } catch (e) {}
    }
    avisarCambio(el);
    if (cambiando) return;
    if (!ES_PRINCIPAL) { try { window.parent.postMessage({ __navAle: 1, t: 'pc', on: false }, '*'); } catch (e) {} }
    if (alCambiarPantalla) alCambiarPantalla(false);
  }
  function pedirCompleta() { entrarCompleta(this); return Promise.resolve(); }
  ['requestFullscreen', 'webkitRequestFullscreen', 'webkitRequestFullScreen'].forEach(function (m) { E[m] = pedirCompleta; });
  if (window.HTMLVideoElement) {
    HTMLVideoElement.prototype.webkitEnterFullscreen = HTMLVideoElement.prototype.webkitEnterFullScreen = pedirCompleta;
  }
  function salirPedido() {
    if (pcom.el) salirCompleta();
    else if (realCompleto() && salirReal) { try { salirReal.call(document); } catch (e) {} }
    return Promise.resolve();
  }
  ['exitFullscreen', 'webkitExitFullscreen', 'webkitCancelFullScreen'].forEach(function (m) { D[m] = salirPedido; });
  // Pantalla completa real (por ejemplo el boton propio de un <video controls>): se convierte
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (t) {
    addEvOrig.call(document, t, function () {
      var r = realCompleto();
      if (r && r !== pcom.el) {
        try { salirReal.call(document); } catch (e) {}
        entrarCompleta(r);
      }
    }, true);
  });
  // Un iframe hijo entro / salio de pantalla completa: estirar (o devolver) ese iframe aqui
  addEvOrig.call(window, 'message', function (e) {
    var d = e.data;
    if (!d || d.__navAle !== 1) return;
    if (d.t === 'pc') {
      var f = hijoDe(e.source);
      if (!f) return;
      if (d.on) entrarCompleta(f);
      else if (pcom.el === f) salirCompleta();
    } else if (d.t === 'salirPC' && pcom.el) {
      salirCompleta();
    }
  });

  function videoEnCompleta() {   // video de ESTE marco que esta en pantalla completa
    var fs = pcom.el || realCompleto();
    if (!fs) return null;
    if (fs.tagName === 'VIDEO') return fs;
    var vs = fs.getElementsByTagName('video'), mejor = null, area = 0;
    for (var i = 0; i < vs.length; i++) {
      var r = vs[i].getBoundingClientRect(), a = r.width * r.height;
      if (a > area) { area = a; mejor = vs[i]; }
    }
    return mejor;
  }
  var velocidad = 1;
  try { velocidad = parseFloat(localStorage.getItem('navAlejandroVel')) || 1; } catch (e) {}
  function controlVideo(accion, valor, v) {
    v = v || videoPrincipal();
    if (!v) return false;
    try {
      if (accion === 'pausa') {
        if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); osd('▶ Reproducir'); }
        else { v.pause(); osd('❚❚ Pausa'); }
      } else if (accion === 'saltar') {
        v.currentTime = Math.max(0, Math.min((v.duration || 1e9) - 1, v.currentTime + valor));
        osd((valor > 0 ? '⏩ +' : '⏪ ') + valor + ' s  ·  ' + mmss(v.currentTime) + (isFinite(v.duration) ? ' / ' + mmss(v.duration) : ''));
      } else if (accion === 'volumen') {
        v.muted = false;
        v.volume = Math.max(0, Math.min(1, Math.round((v.volume + valor) * 10) / 10));
        osd('🔊 Volumen ' + Math.round(v.volume * 100) + '%');
      } else if (accion === 'porcentaje') {
        if (!isFinite(v.duration)) return false;
        v.currentTime = v.duration * valor / 10;
        osd('⏱ ' + (valor * 10) + '%  ·  ' + mmss(v.currentTime));
      } else if (accion === 'velocidad') {
        velocidad = valor;
        try { localStorage.setItem('navAlejandroVel', String(valor)); } catch (e) {}
        var vs = document.querySelectorAll('video');
        for (var i = 0; i < vs.length; i++) vs[i].playbackRate = valor;
        osd('⏩ Velocidad ' + valor + 'x');
      } else if (accion === 'completa') {
        (v.requestFullscreen || v.webkitRequestFullscreen).call(v);
        if (v.paused) { var q = v.play(); if (q && q.catch) q.catch(function () {}); }
      } else return false;
    } catch (e) { return false; }
    return true;
  }
  // El volumen lo maneja el propio TV con sus botones: las flechas nunca tocan el volumen.

  // ---- (14) Recordar donde quedaste + (15) velocidad en cada video nuevo
  var CLAVE_POS = 'navAlePos:' + location.href.split('#')[0];
  function prepararVideo(v) {
    if (!v || v.__navAle) return;
    v.__navAle = true;
    var ultimoGuardado = 0, restaurado = false;
    addEvOrig.call(v, 'playing', function () {
      if (velocidad !== 1 && v.playbackRate !== velocidad) v.playbackRate = velocidad;
      if (restaurado) return;
      restaurado = true;
      try {
        var g = JSON.parse(localStorage.getItem(CLAVE_POS) || 'null');
        if (g && g.t > 30 && isFinite(v.duration) && g.t < v.duration - 30 && v.currentTime < 10) {
          v.currentTime = g.t;
          osd('↻ Continuando desde ' + mmss(g.t));
        }
      } catch (e) {}
    });
    addEvOrig.call(v, 'timeupdate', function () {
      var ahora = Date.now();
      if (ahora - ultimoGuardado < 5000 || !isFinite(v.duration) || v.duration < 120) return;
      ultimoGuardado = ahora;
      try {
        if (v.currentTime > v.duration - 30) localStorage.removeItem(CLAVE_POS);   // terminado
        else localStorage.setItem(CLAVE_POS, JSON.stringify({ t: Math.floor(v.currentTime), ts: ahora }));
      } catch (e) {}
    });
    addEvOrig.call(v, 'play', function () { avisarEstadoVideo(true); });
    addEvOrig.call(v, 'pause', function () { avisarEstadoVideo(false); });
    addEvOrig.call(v, 'ended', function () { avisarEstadoVideo(false); });
  }
  function avisarEstadoVideo(rep) {
    if (ES_PRINCIPAL) return;
    try { window.top.postMessage({ __navAle: 1, t: 'estadoVideo', rep: rep }, '*'); } catch (e) {}
  }
  setInterval(function () {
    var vs = document.getElementsByTagName('video');
    for (var i = 0; i < vs.length; i++) prepararVideo(vs[i]);
  }, 1500);

  // ---- Clic remoto: el marco de arriba pide "haz clic en x,y" dentro de este marco
  function clicEn(x, y) {
    permitirFoco();
    ultimoClic = Date.now();
    quitarTrampas(x, y);
    var el = document.elementFromPoint(x, y);
    if (!el) return;
    if (el.tagName === 'IFRAME' && el.contentWindow) {        // iframe dentro de iframe: pasarlo
      var r = el.getBoundingClientRect();
      el.contentWindow.postMessage({ __navAle: 1, t: 'clic', x: x - r.left - el.clientLeft, y: y - r.top - el.clientTop }, '*');
      return;
    }
    var op = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', op));
      el.dispatchEvent(new MouseEvent('mousedown', op));
      el.dispatchEvent(new PointerEvent('pointerup', op));
      el.dispatchEvent(new MouseEvent('mouseup', op));
    } catch (e) {}
    if (esEditable(el)) { focoOrig.call(el); return; }        // abre el teclado del TV
    if (el.tagName === 'VIDEO') { controlVideo('pausa', 0, el); return; }
    if (typeof el.click === 'function') el.click();
    else el.dispatchEvent(new MouseEvent('click', op));
  }

  // ---- Movimiento real del mouse/touchpad encima de un iframe: se pasa hacia arriba
  function hijoDe(win) {
    var fs = document.getElementsByTagName('iframe');
    for (var i = 0; i < fs.length; i++) if (fs[i].contentWindow === win) return fs[i];
    return null;
  }
  function subirMovimiento(x, y) {
    try { window.parent.postMessage({ __navAle: 1, t: 'mover', x: x, y: y }, '*'); } catch (e) {}
  }
  addEvOrig.call(window, 'message', function (e) {
    var d = e.data;
    if (!d || d.__navAle !== 1 || d.t !== 'mover') return;
    var f = hijoDe(e.source);
    if (!f) return;
    var r = f.getBoundingClientRect();
    var x = d.x + r.left + f.clientLeft, y = d.y + r.top + f.clientTop;
    if (ES_PRINCIPAL) moverRatonA(x, y); else subirMovimiento(x, y);
  });

  if (!ES_PRINCIPAL) {
    var movPend = null;
    addEvOrig.call(window, 'mousemove', function (e) {
      if (!e.isTrusted) return;
      var primero = !movPend;
      movPend = { x: e.clientX, y: e.clientY };
      if (primero) requestAnimationFrame(function () { subirMovimiento(movPend.x, movPend.y); movPend = null; });
    }, true);
    // Mensajes del marco principal
    addEvOrig.call(window, 'message', function (e) {
      var d = e.data;
      if (!d || d.__navAle !== 1) return;
      if (d.t === 'clic') clicEn(d.x, d.y);
      else if (d.t === 'video') {
        // si el video no esta en este marco, esta en un iframe de adentro: pasarlo
        if (!controlVideo(d.accion, d.valor, d.completa ? videoEnCompleta() || undefined : undefined)) {
          var fs = pcom.el && pcom.el.tagName === 'IFRAME' ? pcom.el : null;
          var objetivos = fs ? [fs] : Array.prototype.slice.call(document.getElementsByTagName('iframe'));
          objetivos.forEach(function (f) { try { f.contentWindow.postMessage(d, '*'); } catch (err) {} });
        }
      }
      else if (d.t === 'velocidad') controlVideo('velocidad', d.valor);
    });
    // Si el foco quedo dentro de este marco (por ejemplo despues de pulsar el reproductor),
    // TODAS las teclas del control se mandan al marco principal, que decide: flechita,
    // menu, botones de colores o el video en pantalla completa. Asi el reproductor del
    // sitio ya no las usa para subir/bajar el volumen ni secuestra la flechita.
    var NAV = { 37: 1, 38: 1, 39: 1, 40: 1, 13: 1, 10009: 1, 10252: 1, 415: 1, 19: 1, 413: 1, 417: 1, 412: 1, 403: 1, 404: 1, 405: 1, 406: 1, 427: 1, 428: 1 };
    addEvOrig.call(window, 'keydown', function (e) {
      var c = e.keyCode, a = document.activeElement;
      if (esEditable(a)) {
        if (c === K.ATRAS) { a.blur(); e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (c !== K.ARRIBA && c !== K.ABAJO) return;
        a.blur();                                   // teclado ya cerrado: la flechita sigue
      }
      if (NAV[c] || (c >= 48 && c <= 57)) {
        try { window.top.postMessage({ __navAle: 1, t: 'tecla', k: c }, '*'); } catch (err) {}
        e.preventDefault(); e.stopImmediatePropagation();
      }
    }, true);
    addEvOrig.call(window, 'keyup', function (e) {
      if (e.keyCode >= 37 && e.keyCode <= 40) {
        try { window.top.postMessage({ __navAle: 1, t: 'teclaArriba', k: e.keyCode }, '*'); } catch (err) {}
      }
    }, true);
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
    cur.el.setAttribute('data-navale', '');
    cur.el.innerHTML = FLECHA;
    cur.el.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;' +
      'will-change:transform;filter:drop-shadow(0 0 4px ' + COLOR + ');transition:opacity .25s';
    document.documentElement.appendChild(cur.el);
    cur.marco = document.createElement('div');
    cur.marco.setAttribute('data-navale', '');
    cur.marco.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483645;pointer-events:none;display:none;' +
      'border:3px solid ' + COLOR + ';border-radius:10px;box-shadow:0 0 14px ' + COLOR + ';will-change:transform';
    document.documentElement.appendChild(cur.marco);
    colocar();
  }

  function colocar(escala) {   // barato: solo transform
    cur.el.style.transform = 'translate3d(' + cur.x + 'px,' + cur.y + 'px,0)' + (escala ? ' scale(' + escala + ')' : '');
  }
  function efectoClic() {      // la flechita se encoge un instante (sin moverse de su sitio)
    if (!cur.el) return;
    colocar(0.8);
    setTimeout(function () { if (cur.el) colocar(); }, 120);
  }

  function hayVideoReproduciendo() {
    var v = videoPrincipal();
    return v && !v.paused && !v.ended;
  }

  function objetivo() {
    var el = document.elementFromPoint(cur.x, cur.y);
    if (el && barra.host && el === barra.host) {             // boton de la barra de arriba
      var i = barra.root.elementFromPoint ? barra.root.elementFromPoint(cur.x, cur.y) : null;
      return i && i.closest ? i.closest('[data-b]') : null;
    }
    return el && el.closest ? el.closest(CLICABLE) : null;
  }

  function resaltar() {
    if (!cur.marco) return;
    var t = objetivo();
    guiaSegunObjetivo(t);
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
    ocultarEstado();
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
    revisarBarra();
    if (!cur.el || Date.now() - ultimaActividad < 3500) return;
    ponerOpacidad('0.4');                           // quieta se atenua, pero NUNCA desaparece
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
    moverRatonA(e.clientX, e.clientY);
  }, true);
  function moverRatonA(px, py) {
    var ahora = performance.now(), dt = ahora - raton.t;
    if (dt > 0 && dt < 120) {                     // velocidad del dedo para anticipar un poco
      raton.vx = (px - raton.tx) / dt; raton.vy = (py - raton.ty) / dt;
    } else { raton.vx = raton.vy = 0; }
    raton.t = ahora;
    var w = window.innerWidth, h = window.innerHeight, pred = Math.min(dt, 40);
    raton.tx = Math.max(0, Math.min(w - 1, px + raton.vx * pred * 0.5));
    raton.ty = Math.max(0, Math.min(h - 1, py + raton.vy * pred * 0.5));
    if (py < 8) mostrarBarra();
    crearCursor();
    mostrar();
    if (!raton.bucle) { raton.bucle = true; requestAnimationFrame(deslizar); }
    if (cur.marco && cur.marco.style.display !== 'none') cur.marco.style.display = 'none';
    alDetenerseRaton();
  }
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
    if (pcom.el) return;                           // en pantalla completa no se mueve la pagina de atras
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
    if (ny < borde && cur.dy < 0) { scroll(-v * dt * 1.6); ny = borde; mostrarBarra(); }
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
    if (barra.visible && barra.root) {                       // botones de la barra de arriba
      var bs = barra.root.querySelectorAll('[data-b]');
      for (var j = 0; j < bs.length; j++) {
        var rb = bs[j].getBoundingClientRect();
        if (rb.width) lista.push({ x: rb.left + rb.width / 2, y: rb.top + rb.height / 2 });
      }
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
      var sc = document.scrollingElement || document.documentElement;
      if (dy < 0 && sc.scrollTop <= 0) mostrarBarra();  // arriba del todo: la barra
      scroll(dy * window.innerHeight * 0.45, true);     // nada en esa direccion: desplazar
      alDetenerse(true);
    }
  }

  function pararMovimiento() {
    cur.dx = cur.dy = 0;
  }

  function clic() {
    ultimoClic = Date.now();
    permitirFoco();
    var el = document.elementFromPoint(cur.x, cur.y);
    if (el && barra.host && el === barra.host) {             // boton de la barra de arriba
      var bt = objetivo();
      efectoClic();
      if (bt) accionBarra(bt.getAttribute('data-b'));
      return;
    }
    quitarTrampas(cur.x, cur.y);
    el = document.elementFromPoint(cur.x, cur.y);
    if (!el) return;
    if (el.tagName === 'IFRAME' && el.contentWindow) {
      // el boton esta dentro de un reproductor (iframe): se le pide al iframe que haga el clic
      var r = el.getBoundingClientRect();
      el.contentWindow.postMessage({ __navAle: 1, t: 'clic', x: cur.x - r.left - el.clientLeft, y: cur.y - r.top - el.clientTop }, '*');
      efectoClic();
      return;
    }
    var op = { bubbles: true, cancelable: true, view: window, clientX: cur.x, clientY: cur.y };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', op));
      el.dispatchEvent(new MouseEvent('mousedown', op));
      el.dispatchEvent(new PointerEvent('pointerup', op));
      el.dispatchEvent(new MouseEvent('mouseup', op));
    } catch (e) {}
    if (esEditable(el)) {
      focoOrig.call(el);   // abre el teclado del TV (solo porque tu lo elegiste)
      return;
    }
    if (typeof el.click === 'function') el.click();
    else el.dispatchEvent(new MouseEvent('click', op));
    efectoClic();
    setTimeout(resaltar, 250);
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

  // ---------------------------------------------------------------- INICIO, FAVORITOS, HISTORIAL
  // Tu pagina de inicio y el "almacen" compartido viven en GitHub Pages (un solo sitio para
  // todos los demas): asi los favoritos y el historial sirven en cualquier pagina.
  var INICIO = 'https://caceres0128.github.io/navegador-tv/';
  var ALMACEN = INICIO + 'almacen.html';
  var EN_INICIO = location.hostname === ALMACEN_HOST;
  var favoritos = FAVORITOS.slice();
  var almacen = null, almacenListo = false, pendientes = [];

  function alAlmacen(msg) {
    if (almacenListo && almacen && almacen.contentWindow) almacen.contentWindow.postMessage(msg, 'https://' + ALMACEN_HOST);
    else pendientes.push(msg);
  }
  function abrirAlmacen() {
    if (EN_INICIO || almacen) return;
    almacen = document.createElement('iframe');
    almacen.setAttribute('data-navale', '');
    almacen.setAttribute('aria-hidden', 'true');
    almacen.style.cssText = 'position:fixed;width:1px;height:1px;left:-10px;top:-10px;border:0;opacity:0;pointer-events:none';
    almacen.src = ALMACEN;
    (document.body || document.documentElement).appendChild(almacen);
  }
  addEvOrig.call(window, 'message', function (e) {
    var d = e.data;
    if (!d || d.__navAle !== 1) return;
    if (e.origin === 'https://' + ALMACEN_HOST && d.t === 'listo') {
      almacenListo = true;
      while (pendientes.length) almacen.contentWindow.postMessage(pendientes.shift(), 'https://' + ALMACEN_HOST);
    } else if (e.origin === 'https://' + ALMACEN_HOST && d.t === 'favs' && d.lista && d.lista.length) {
      favoritos = d.lista;
      menu.sucio = true;   // se reconstruye con los nuevos al abrirlo
    } else if (d.t === 'conteo') {                                 // bloqueo dentro de un iframe
      registrar(String(d.d || 'iframe'));
      scriptsBloqueados++;
      if (!avisoPendiente) avisoPendiente = setTimeout(function () {
        avisoPendiente = null;
        avisoBloqueo(scriptsBloqueados + ' anuncios/rastreadores bloqueados', true);
      }, 1500);
    } else if (d.t === 'tecla') {                                  // tecla que llego a un iframe
      manejarTecla({ keyCode: d.k, preventDefault: function () {}, stopImmediatePropagation: function () {} });
    } else if (d.t === 'teclaArriba') {
      pararMovimiento();
    } else if (d.t === 'bloqueada') {                              // ventana/enlace emergente de un iframe
      recordarBloqueada(d.u);
      avisoBloqueo('Ventana emergente bloqueada');
    } else if (d.t === 'estadoVideo') {
      var fr = marcoDe(e.source);
      videoMarco = d.rep && fr ? { win: e.source, el: fr } : (videoMarco && videoMarco.win === e.source ? null : videoMarco);
    }
  });
  function guardarHistorial() {
    if (EN_INICIO || !/^https?:/.test(location.href)) return;
    alAlmacen({ __navAle: 1, t: 'hist', u: location.href, n: (document.title || location.hostname).slice(0, 120) });
  }
  function agregarFavorito() {
    var fav = { n: (document.title || location.hostname).slice(0, 40), u: location.href };
    alAlmacen({ __navAle: 1, t: 'fav+', u: fav.u, n: fav.n });
    if (EN_INICIO) return;
    favoritos = [fav].concat(favoritos.filter(function (f) { return f.u !== fav.u; })).slice(0, 12);
    menu.sucio = true;
    osd('⭐ Agregado a favoritos');
  }

  // ---- Videos dentro de iframes: el marco principal sabe cual se esta reproduciendo
  var videoMarco = null;
  function marcoDe(win) {
    var w = win;
    try { while (w && w.parent && w.parent !== window) w = w.parent; } catch (e) { return null; }
    var fs = document.getElementsByTagName('iframe');
    for (var i = 0; i < fs.length; i++) if (fs[i].contentWindow === w) return fs[i];
    return null;
  }
  function videoEnMarco(accion, valor) {
    if (!videoMarco) return false;
    try { videoMarco.win.postMessage({ __navAle: 1, t: 'video', accion: accion, valor: valor }, '*'); } catch (e) { return false; }
    return true;
  }
  function difundirVelocidad(v) {   // a la pagina y a todos sus iframes
    velocidad = v;
    try { localStorage.setItem('navAlejandroVel', String(v)); } catch (e) {}
    if (!controlVideo('velocidad', v)) osd('⏩ Velocidad ' + v + 'x');
    var fs = document.getElementsByTagName('iframe');
    for (var i = 0; i < fs.length; i++) {
      try { fs[i].contentWindow.postMessage({ __navAle: 1, t: 'velocidad', valor: v }, '*'); } catch (e) {}
    }
  }

  // ---------------------------------------------------------------- (6) COOKIES
  var SEL_COOKIES = ['#onetrust-reject-all-handler', '#didomi-notice-disagree-button', '.didomi-continue-without-agreeing',
    '#CybotCookiebotDialogBodyButtonDecline', '#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll',
    '.qc-cmp2-summary-buttons button[mode="secondary"]', 'button.fc-cta-do-not-consent', '.cmpboxbtnno',
    '[data-testid="uc-deny-all-button"]', '.cky-btn-reject', '#cookiescript_reject', '.cc-deny',
    'button[aria-label="Rechazar todo"]', 'button[aria-label="Reject all"]'];
  var RE_RECHAZO = /^\s*(rechazar( todo| todas| todas las cookies)?|reject( all)?|decline( all)?|deny( all)?|solo (las )?(cookies )?(necesarias|esenciales)|only (necessary|essential)( cookies)?|necessary only|continuar sin aceptar|no acepto|no aceptar)\s*$/i;
  var RE_CONTENEDOR = /cookie|consent|gdpr|cmp|privacy|privacidad/i;
  function visible(el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function rechazarCookies() {
    if (!bloqueoActivo) return true;
    for (var i = 0; i < SEL_COOKIES.length; i++) {
      var el = document.querySelector(SEL_COOKIES[i]);
      if (el && visible(el)) { el.click(); avisoBloqueo('Cookies rechazadas', true); return true; }
    }
    var global = /(^|\.)consent\./.test(location.hostname);
    var bs = document.querySelectorAll('button,[role="button"],a');
    for (var j = 0; j < bs.length && j < 600; j++) {
      var b = bs[j];
      if (!RE_RECHAZO.test(b.textContent || '') || !visible(b)) continue;
      if (!global) {
        var ok = false;
        for (var n = b; n && n !== document.body; n = n.parentElement) {
          if (RE_CONTENEDOR.test((n.id || '') + ' ' + (typeof n.className === 'string' ? n.className : '') + ' ' + (n.getAttribute('aria-label') || ''))) { ok = true; break; }
        }
        if (!ok) continue;
      }
      b.click(); avisoBloqueo('Cookies rechazadas', true); return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- (16-18) MODOS
  function preferencia(nombre, porDefecto) {
    try { var v = localStorage.getItem('navAle_' + nombre); return v === null ? porDefecto : v === '1'; } catch (e) { return porDefecto; }
  }
  function guardarPreferencia(nombre, valor) {
    try { localStorage.setItem('navAle_' + nombre, valor ? '1' : '0'); } catch (e) {}
  }
  var modos = { oscuro: preferencia('oscuro', false), ahorro: preferencia('ahorro', false) };
  var CSS_OSCURO = 'html{filter:invert(.92) hue-rotate(180deg)!important;background:#fff!important}' +
    'img,video,picture,canvas,iframe,embed,object,[style*="background-image"],[data-navale]{filter:invert(1) hue-rotate(180deg)!important}';
  var CSS_AHORRO = '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;scroll-behavior:auto!important}';
  function aplicarModos() {
    var css = (modos.oscuro ? CSS_OSCURO : '') + (modos.ahorro ? CSS_AHORRO : '');
    var st = document.getElementById('nav-ale-modos');
    if (!st) {
      st = document.createElement('style');
      st.id = 'nav-ale-modos';
      (document.head || document.documentElement).appendChild(st);
    }
    if (st.textContent !== css) st.textContent = css;
  }
  // Modo ahorro: pausa los videos de fondo/silenciados que no estas viendo
  setInterval(function () {
    if (!modos.ahorro || document.hidden) return;
    var principal = videoPrincipal(), vs = document.getElementsByTagName('video');
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (v === principal || v.paused || !v.muted) continue;
      var r = v.getBoundingClientRect();
      if (r.width * r.height < window.innerWidth * window.innerHeight * 0.3 || r.bottom < 0 || r.top > window.innerHeight) v.pause();
    }
  }, 2000);

  // Capa a pantalla completa propia (lectura y panel de bloqueos)
  var capa = { host: null, root: null, tipo: '', caja: null };
  function abrirCapa(tipo, html) {
    cerrarCapa();
    if (typeof ocultarBarra === 'function') { ocultarBarra(); ocultarEstado(); guia(null); }
    capa.host = document.createElement('div');
    capa.host.setAttribute('data-navale', '');
    capa.host.style.cssText = 'position:fixed;inset:0;z-index:2147483646';
    capa.root = capa.host.attachShadow ? capa.host.attachShadow({ mode: 'open' }) : capa.host;
    capa.root.innerHTML = '<style>' +
      '*{box-sizing:border-box;font-family:Georgia,"Times New Roman",serif}' +
      '.f{position:fixed;inset:0;background:#14171c;color:#e9e4da;overflow-y:auto;padding:70px 0 120px}' +
      '.c{max-width:1100px;margin:0 auto;padding:0 40px}' +
      'h1{font-size:54px;line-height:1.15;margin:0 0 30px;color:#fff}' +
      'h2,h3{font-size:40px;margin:40px 0 16px;color:#fff}' +
      'p,li{font-size:34px;line-height:1.6;margin:0 0 26px}' +
      'img{max-width:100%;border-radius:12px;margin:10px 0 26px}' +
      '.t{font-family:Arial,sans-serif}.t h1{font-size:44px}.fila{display:flex;justify-content:space-between;font-size:28px;padding:12px 0;border-bottom:1px solid #2a2f38}' +
      '.ayuda{position:fixed;bottom:20px;left:0;right:0;text-align:center;font:22px Arial,sans-serif;opacity:.5}' +
      '</style><div class="f' + (tipo === 'panel' ? ' t' : '') + '"><div class="c">' + html + '</div></div>' +
      '<div class="ayuda">⬆ ⬇ desplazar · Atrás: cerrar</div>';
    document.documentElement.appendChild(capa.host);
    capa.tipo = tipo;
    capa.caja = capa.root.querySelector('.f');
    if (cur.el) cur.el.style.display = 'none';
  }
  function cerrarCapa() {
    if (capa.host) capa.host.remove();
    capa.host = null; capa.tipo = '';
    if (cur.el) cur.el.style.display = '';
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // (18) Modo lectura: busca el bloque con mas texto y lo muestra limpio y grande
  function modoLectura() {
    var ps = document.querySelectorAll('p'), puntos = new Map(), mejor = null, max = 0;
    for (var i = 0; i < ps.length; i++) {
      var largo = (ps[i].textContent || '').trim().length;
      if (largo < 60) continue;
      var padre = ps[i].parentElement;
      var v = (puntos.get(padre) || 0) + largo;
      puntos.set(padre, v);
      if (v > max) { max = v; mejor = padre; }
    }
    if (!mejor || max < 400) { osd('📖 Esta página no tiene un artículo para leer'); return; }
    var titulo = (document.querySelector('h1') || {}).textContent || document.title;
    var html = '<h1>' + esc(titulo.trim()) + '</h1>';
    var ns = mejor.querySelectorAll('p,h2,h3,li,img');
    for (var j = 0; j < ns.length; j++) {
      var n = ns[j], tag = n.tagName.toLowerCase();
      if (tag === 'img') { if (n.currentSrc || n.src) html += '<img src="' + esc(n.currentSrc || n.src) + '">'; continue; }
      var txt = (n.textContent || '').trim();
      if (txt.length > 1) html += '<' + tag + '>' + esc(txt) + '</' + tag + '>';
    }
    abrirCapa('lectura', html);
  }

  // (7) Panel de bloqueos
  function panelBloqueos() {
    var claves = Object.keys(registro).sort(function (a, b) { return registro[b] - registro[a]; });
    var total = claves.reduce(function (s, k) { return s + registro[k]; }, 0);
    var html = '<h1>🛡 Bloqueos en esta página: ' + total + '</h1>' +
      (claves.length ? '' : '<p>Todavía no se ha bloqueado nada aquí.</p>') +
      claves.slice(0, 40).map(function (k) { return '<div class="fila"><span>' + esc(k) + '</span><b>' + registro[k] + '</b></div>'; }).join('') +
      '<p style="margin-top:30px;font-size:24px;opacity:.6">Escudo: ' + (escudo ? 'ON' : 'OFF') + ' · Caja de arena: ' + (cajaActiva ? 'ON' : 'OFF') +
      ' · Bloqueador: ' + Object.keys(DOMS).length + ' dominios en la lista</p>';
    abrirCapa('panel', html);
  }

  // ---------------------------------------------------------------- MENU
  var menu = { host: null, root: null, abierto: false, items: [], idx: 0, zoom: 1 };
  try { menu.zoom = parseFloat(localStorage.getItem('navAlejandroZoom')) || 1; } catch (e) {}

  function aplicarZoom() {
    // en el <body>: asi la flechita, la barra y las guias (que viven fuera del body) no cambian
    if (document.documentElement.style.zoom) document.documentElement.style.zoom = '';
    if (document.body) document.body.style.zoom = menu.zoom === 1 ? '' : String(menu.zoom);
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

  var VELOCIDADES = [1, 1.25, 1.5, 2];
  function etiquetas() {
    return {
      atras: '◀ Atrás', recargar: '⟳ Recargar', inicio: '⌂ Inicio', fav: '⭐ Agregar favorito',
      video: '⛶ Video completo', velocidad: '⏩ Velocidad ' + velocidad + 'x', zoommas: 'Zoom +', zoommenos: 'Zoom −',
      oscuro: '🌙 Oscuro: ' + (modos.oscuro ? 'ON' : 'OFF'), lectura: '📖 Modo lectura',
      ahorro: '🔋 Ahorro: ' + (modos.ahorro ? 'ON' : 'OFF'), saltos: '🎯 Saltos: ' + (modoSaltos ? 'ON' : 'OFF'),
      escudo: '🛡 Escudo: ' + (escudo ? 'ON' : 'OFF'), caja: '📦 Caja iframes: ' + (cajaActiva ? 'ON' : 'OFF'),
      panel: '📊 Bloqueos', limpiar: '🧹 Limpiar sitio', arriba: '⤒ Ir arriba',
      ventana: ventanasBloqueadas.length ? '↗ Abrir: ' + host(ventanasBloqueadas[0]) : '↗ Sin ventanas bloqueadas',
      guias: '💬 Guías: ' + (guias ? 'ON' : 'OFF'), ayuda: '❓ Ayuda del control'
    };
  }
  var ACCIONES = ['atras', 'recargar', 'inicio', 'fav', 'video', 'velocidad', 'zoommas', 'zoommenos',
    'oscuro', 'lectura', 'ahorro', 'saltos', 'escudo', 'caja', 'panel', 'limpiar', 'ventana', 'guias', 'ayuda', 'arriba'];

  function construirMenu() {
    menu.host = document.createElement('div');
    menu.host.setAttribute('data-navale', '');
    menu.host.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:none';
    menu.root = menu.host.attachShadow ? menu.host.attachShadow({ mode: 'open' }) : menu.host;
    var fav = favoritos.slice(0, 8).map(function (f) {
      return '<button class="it fav" data-u="' + esc(f.u) + '"><b>' + esc((f.n || '?').charAt(0).toUpperCase()) + '</b><span>' + esc(f.n) + '</span></button>';
    }).join('');
    var et = etiquetas();
    menu.root.innerHTML =
      '<style>' +
      '*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}' +
      '.fondo{position:fixed;inset:0;background:rgba(5,9,15,.94);overflow-y:auto}' +
      '.caja{width:1400px;max-width:94vw;margin:0 auto;padding:40px 0 60px;color:#fff}' +
      'h1{font-size:40px;margin:0 0 4px}h1 span{color:' + COLOR + '}' +
      '.url{font-size:20px;opacity:.55;margin-bottom:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      'input{width:100%;font-size:30px;padding:18px 24px;border-radius:18px;border:3px solid #2a3c55;background:#111c2e;color:#fff;outline:none}' +
      '.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:20px 0}' +
      '.fav{height:96px;display:flex;align-items:center;justify-content:flex-start;gap:16px;padding:0 20px;overflow:hidden}' +
      '.fav span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.fav b{flex:none;width:52px;height:52px;border-radius:50%;background:' + COLOR + ';color:#0a1220;font-size:28px;display:flex;align-items:center;justify-content:center}' +
      '.fila{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}' +
      'button{font-size:22px;color:#fff;background:rgba(255,255,255,.07);border:3px solid rgba(255,255,255,.12);border-radius:18px;padding:16px;cursor:pointer;text-align:left}' +
      '.sel{border-color:' + COLOR + '!important;box-shadow:0 0 22px ' + COLOR + ';transform:scale(1.03)}' +
      '.ayuda{margin-top:20px;font-size:19px;opacity:.5}' +
      '</style>' +
      '<div class="fondo"><div class="caja">' +
      '<h1>Navegador <span>Alejandro</span></h1>' +
      '<div class="url" id="url"></div>' +
      '<input class="it" id="buscar" placeholder="Buscar o escribir dirección…">' +
      '<div class="grid">' + fav + '</div>' +
      '<div class="fila">' + ACCIONES.map(function (a) { return '<button class="it" data-a="' + a + '">' + et[a] + '</button>'; }).join('') + '</div>' +
      '<div class="ayuda">Flechas: moverse · OK: elegir · Play/Pausa o Atrás: cerrar · 🔴 dirección · 🟢 saltos · 🟡 inicio · 🔵 bloqueos</div>' +
      '</div></div>';
    document.documentElement.appendChild(menu.host);
    menu.items = Array.prototype.slice.call(menu.root.querySelectorAll('.it'));
    var b = menu.root.getElementById('buscar');
    b.__navAlePropio = true;
    b.__navAleEnviar = function (v) { cerrarMenu(); ir(v); };      // "Completado" del teclado del TV
    b.addEventListener('keydown', function (e) {
      if (e.keyCode === K.OK) { e.stopPropagation(); ir(this.value); }
    });
  }
  function refrescarEtiquetas() {
    if (!menu.root) return;
    var et = etiquetas();
    menu.items.forEach(function (b) { if (b.dataset.a) b.textContent = et[b.dataset.a]; });
    menu.root.getElementById('url').textContent = location.host + '  ·  zoom ' + Math.round(menu.zoom * 100) + '%';
  }

  function seleccionar(i) {
    menu.idx = Math.max(0, Math.min(menu.items.length - 1, i));
    menu.items.forEach(function (b, j) { b.classList.toggle('sel', j === menu.idx); });
    try { menu.items[menu.idx].scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }

  function abrirMenu(enBuscador) {
    if (menu.host && menu.sucio) { menu.host.remove(); menu.host = null; }
    menu.sucio = false;
    if (!menu.host) construirMenu();
    refrescarEtiquetas();
    ocultarBarra(); ocultarEstado(); guia(null);
    menu.host.style.display = 'block';
    menu.abierto = true;
    if (cur.el) cur.el.style.display = 'none';
    seleccionar(0);
    if (enBuscador) { permitirFoco(); focoOrig.call(menu.items[0]); }
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
    // fila 0: buscador | luego bloques de 4 columnas (favoritos y acciones)
    var i = menu.idx, total = menu.items.length;
    var nFav = menu.root.querySelectorAll('.fav').length;
    if (i === 0) { if (code === K.ABAJO) seleccionar(1); return; }
    var enFav = i <= nFav, base = enFav ? 1 : nFav + 1, p = i - base;
    if (code === K.DER) seleccionar(i + 1 <= total - 1 ? i + 1 : i);
    if (code === K.IZQ) seleccionar(p % 4 === 0 ? i : i - 1);
    if (code === K.ABAJO) {
      if (enFav && i + 4 > nFav) seleccionar(nFav + 1 + Math.min(p % 4, 3));
      else seleccionar(Math.min(total - 1, i + 4));
    }
    if (code === K.ARRIBA) {
      if (p < 4) seleccionar(enFav || nFav === 0 ? 0 : Math.max(1, nFav - ((nFav - 1) % 4) + Math.min(p, (nFav - 1) % 4)));
      else seleccionar(i - 4);
    }
  }

  function activarMenu() {
    var b = menu.items[menu.idx];
    if (b.id === 'buscar') { permitirFoco(); focoOrig.call(b); return; }   // abre el teclado del TV
    if (b.dataset.u) { cerrarMenu(); autorizar(b.dataset.u); location.href = b.dataset.u; return; }
    var a = b.dataset.a, cerrar = false;
    switch (a) {
      case 'atras': cerrarMenu(); history.back(); return;
      case 'recargar': location.reload(); return;
      case 'inicio': cerrarMenu(); irInicio(); return;
      case 'fav': agregarFavorito(); cerrar = true; break;
      case 'zoommas': menu.zoom = Math.min(2, Math.round((menu.zoom + 0.1) * 10) / 10); aplicarZoom(); break;
      case 'zoommenos': menu.zoom = Math.max(0.5, Math.round((menu.zoom - 0.1) * 10) / 10); aplicarZoom(); break;
      case 'velocidad':
        difundirVelocidad(VELOCIDADES[(VELOCIDADES.indexOf(velocidad) + 1) % VELOCIDADES.length]); break;
      case 'oscuro': modos.oscuro = !modos.oscuro; guardarPreferencia('oscuro', modos.oscuro); aplicarModos(); break;
      case 'ahorro': modos.ahorro = !modos.ahorro; guardarPreferencia('ahorro', modos.ahorro); aplicarModos(); break;
      case 'lectura': cerrarMenu(); modoLectura(); return;
      case 'panel': cerrarMenu(); panelBloqueos(); return;
      case 'escudo':
        escudo = !escudo;
        try { escudo ? localStorage.removeItem('navAlejandroEscudoOff') : localStorage.setItem('navAlejandroEscudoOff', '1'); } catch (e) {}
        refrescarEtiquetas();
        setTimeout(function () { location.reload(); }, 400);   // aplica el cambio al bloqueador
        return;
      case 'caja':
        cajaActiva = !cajaActiva;
        try { cajaActiva ? localStorage.removeItem('navAlejandroCajaOff') : localStorage.setItem('navAlejandroCajaOff', '1'); } catch (e) {}
        refrescarEtiquetas();
        setTimeout(function () { location.reload(); }, 400);
        return;
      case 'limpiar': limpiarSitio(); return;
      case 'saltos':
        modoSaltos = !modoSaltos;
        try { modoSaltos ? localStorage.setItem('navAlejandroSaltos', '1') : localStorage.removeItem('navAlejandroSaltos'); } catch (e) {}
        break;
      case 'arriba': cerrarMenu(); (document.scrollingElement || document.documentElement).scrollTo({ top: 0, behavior: 'smooth' }); return;
      case 'ventana': if (ventanasBloqueadas.length) { cerrarMenu(); abrirBloqueada(); return; } break;
      case 'guias': guias = !guias; guardarPreferencia('guias', guias); if (!guias) guia(null); break;
      case 'ayuda': cerrarMenu(); ayuda(); return;
      case 'video':
        cerrarMenu();
        if (!controlVideo('completa')) videoEnMarco('completa');
        return;
    }
    refrescarEtiquetas();
    if (cerrar) cerrarMenu();
  }
  function irInicio() { autorizar(INICIO); location.href = INICIO; }
  function abrirBloqueada() {          // la ultima ventana emergente bloqueada, en esta misma pantalla
    var u = ventanasBloqueadas[0];
    if (!u) { osd('↗ No hay ventanas bloqueadas'); return; }
    autorizar(u); location.href = u;
  }

  // ---------------------------------------------------------------- (v1.8) BARRA DE ARRIBA
  // Como la del navegador de Samsung: aparece al llevar la flechita arriba del todo
  // (y unos segundos al cargar cada pagina) y se esconde sola al bajar.
  var ALTO_BARRA = 88;
  var barra = { host: null, root: null, visible: false, desde: 0, fijaHasta: 0 };
  var BOTONES_BARRA = [
    ['atras', '◀', 'Atrás'], ['adelante', '▶', 'Adelante'], ['inicio', '⌂', 'Inicio'], ['dir', '', 'Buscar o escribir dirección'],
    ['recargar', '⟳', 'Recargar'], ['bloqueos', '🛡', 'Bloqueos'], ['fav', '⭐', 'Agregar a favoritos'],
    ['zoommenos', 'A−', 'Alejar'], ['zoom', '100%', 'Tamaño normal'], ['zoommas', 'A+', 'Acercar'],
    ['ventana', '↗', 'Abrir la ventana emergente bloqueada'], ['menu', '☰', 'Menú']
  ];
  function construirBarra() {
    barra.host = document.createElement('div');
    barra.host.setAttribute('data-navale', '');
    barra.host.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:' + ALTO_BARRA + 'px;z-index:2147483646;' +
      'transform:translateY(-110%);transition:transform .18s ease-out;will-change:transform';
    barra.root = barra.host.attachShadow ? barra.host.attachShadow({ mode: 'open' }) : barra.host;
    barra.root.innerHTML = '<style>' +
      '*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}' +
      '.b{display:flex;align-items:center;gap:12px;height:' + ALTO_BARRA + 'px;padding:0 28px;color:#fff;' +
      'background:linear-gradient(#1d548f,#123a66);box-shadow:0 4px 18px rgba(0,0,0,.45)}' +
      '[data-b]{flex:none;height:62px;min-width:62px;padding:0 14px;border-radius:31px;border:3px solid transparent;' +
      'background:rgba(255,255,255,.13);color:#fff;font-size:26px;font-weight:700;display:flex;align-items:center;' +
      'justify-content:center;gap:8px;cursor:pointer;white-space:nowrap}' +
      '[data-b]:hover{border-color:' + COLOR + ';box-shadow:0 0 14px ' + COLOR + '}' +
      '[data-b="dir"]{flex:1;min-width:0;justify-content:flex-start;background:rgba(255,255,255,.93);color:#0b2440;' +
      'font-weight:400;font-size:24px;padding:0 26px;overflow:hidden}' +
      '[data-b="dir"] b{font-size:27px}[data-b="dir"] span{opacity:.55;overflow:hidden;text-overflow:ellipsis;margin-left:16px}' +
      '[data-b="zoom"]{font-size:21px;min-width:86px;background:transparent}' +
      '[data-b="ventana"]{background:#b7791f}.oculto{display:none!important}' +
      '.n{font-size:18px;background:#e5484d;border-radius:12px;padding:2px 9px}' +
      '</style><div class="b">' + BOTONES_BARRA.map(function (b) {
        return '<div data-b="' + b[0] + '" title="' + b[2] + '">' + b[1] + '</div>';
      }).join('') + '</div>';
    barra.root.addEventListener('click', function (e) {     // mouse real o touchpad del celular
      var b = e.target && e.target.closest ? e.target.closest('[data-b]') : null;
      if (b) accionBarra(b.getAttribute('data-b'));
    });
    document.documentElement.appendChild(barra.host);
  }
  function refrescarBarra() {
    if (!barra.root) return;
    var q = function (k) { return barra.root.querySelector('[data-b="' + k + '"]'); };
    var total = scriptsBloqueados + bloqueados;
    q('dir').innerHTML = (location.protocol === 'https:' ? '🔒&nbsp; ' : '⚠&nbsp; ') + '<b>' +
      esc(location.hostname.replace(/^www\./, '')) + '</b><span>' + esc(document.title || '') + '</span>';
    q('bloqueos').innerHTML = '🛡' + (total ? ' <span class="n">' + total + '</span>' : '');
    q('zoom').textContent = Math.round(menu.zoom * 100) + '%';
    q('ventana').classList.toggle('oculto', !ventanasBloqueadas.length);
    q('atras').style.opacity = history.length > 1 ? '1' : '.45';
  }
  function mostrarBarra(fija) {
    if (menu.abierto || capa.host || pantallaCompleta() || !document.documentElement) return;
    if (!barra.host || !document.documentElement.contains(barra.host)) construirBarra();
    refrescarBarra();
    barra.desde = Date.now();
    if (fija) barra.fijaHasta = Date.now() + fija;
    if (barra.visible) return;
    barra.visible = true;
    barra.host.style.transform = 'translateY(0)';
    if (!fija) guia('barra');
  }
  function ocultarBarra() {
    if (!barra.visible) return;
    barra.visible = false;
    barra.fijaHasta = 0;
    barra.host.style.transform = 'translateY(-110%)';
  }
  function revisarBarra() {                 // cada medio segundo
    if (!barra.visible) return;
    if (!document.documentElement.contains(barra.host)) { barra.visible = false; return; }
    refrescarBarra();
    if (Date.now() < barra.fijaHasta) return;
    if (cur.y > ALTO_BARRA + 40) ocultarBarra();
  }
  function cambiarZoom(z) {
    menu.zoom = Math.max(0.5, Math.min(2, Math.round(z * 10) / 10));
    aplicarZoom();
    osd('🔍 Tamaño ' + Math.round(menu.zoom * 100) + '%');
  }
  function accionBarra(b) {
    switch (b) {
      case 'atras': history.back(); break;
      case 'adelante': history.forward(); break;
      case 'inicio': irInicio(); break;
      case 'dir': ocultarBarra(); abrirMenu(true); break;
      case 'recargar': location.reload(); break;
      case 'bloqueos': ocultarBarra(); panelBloqueos(); break;
      case 'fav': agregarFavorito(); break;
      case 'zoommenos': cambiarZoom(menu.zoom - 0.1); break;
      case 'zoommas': cambiarZoom(menu.zoom + 0.1); break;
      case 'zoom': cambiarZoom(1); break;
      case 'ventana': abrirBloqueada(); break;
      case 'menu': ocultarBarra(); abrirMenu(); break;
    }
    refrescarBarra();
  }

  // ---- A donde lleva el enlace (abajo a la izquierda, como en un PC). Naranja = otro sitio.
  var estado = null;
  function mostrarEstado(url) {
    if (!estado || !document.documentElement.contains(estado)) {
      estado = document.createElement('div');
      estado.setAttribute('data-navale', '');
      estado.style.cssText = 'position:fixed;left:24px;bottom:24px;max-width:46vw;z-index:2147483646;pointer-events:none;' +
        'font:22px Arial,sans-serif;padding:9px 18px;border-radius:12px;white-space:nowrap;overflow:hidden;' +
        'text-overflow:ellipsis;background:rgba(10,18,32,.92);color:#dfe9f7;border:2px solid rgba(255,255,255,.15)';
      document.documentElement.appendChild(estado);
    }
    var afuera = !mismoSitio(host(url), host(location.href));
    estado.textContent = (afuera ? '↗ Otro sitio: ' : '🔗 ') + String(url).replace(/^https?:\/\/(www\.)?/, '').slice(0, 140);
    estado.style.borderColor = afuera ? '#f5a524' : 'rgba(255,255,255,.15)';
    estado.style.display = 'block';
  }
  function ocultarEstado() { if (estado) estado.style.display = 'none'; }

  // ---- (v1.8) GUIAS AUTOMATICAS: abajo salen las teclas que sirven en cada momento
  var guias = preferencia('guias', true);
  var GUIAS = {
    pagina: [['⬅⬆⬇➡', 'Mover'], ['OK', 'Clic'], ['↩', 'Atrás'], ['▶❚❚', 'Menú'], ['⬆', 'Arriba del todo: barra'], ['🟡', 'Inicio']],
    barra: [['⬅➡', 'Elegir botón'], ['OK', 'Usar'], ['⬇', 'Volver a la página']],
    campo: [['OK', 'Escribir aquí']],
    teclado: [['', 'Escribe con el teclado del TV'], ['↩', 'Cerrar el teclado']],
    reproductor: [['OK', 'Usar el reproductor'], ['', 'Pantalla completa: su botón ⛶ o Menú → Video completo']],
    video: [['⬅⬆⬇➡', 'Flechita'], ['OK', 'Clic'], ['▶❚❚', 'Pausa'], ['0–9', 'Saltar'], ['↩', 'Salir']]
  };
  var guiaVista = {}, guiaCaja = null, guiaT = null;
  function guia(ctx, forzar) {
    if (!ctx) { if (guiaCaja) guiaCaja.style.opacity = '0'; return; }
    if (!guias || !GUIAS[ctx] || menu.abierto || capa.host) return;
    var ahora = Date.now();
    if (!forzar && guiaVista[ctx] && ahora - guiaVista[ctx] < 60000) return;   // no repetir a cada rato
    guiaVista[ctx] = ahora;
    if (!guiaCaja || !document.documentElement.contains(guiaCaja)) {
      guiaCaja = document.createElement('div');
      guiaCaja.setAttribute('data-navale', '');
      guiaCaja.style.cssText = 'position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:2147483646;' +
        'pointer-events:none;display:flex;gap:28px;align-items:center;white-space:nowrap;background:rgba(10,18,32,.92);' +
        'color:#fff;font:600 23px Arial,sans-serif;padding:12px 30px;border-radius:40px;' +
        'border:2px solid rgba(124,196,255,.55);box-shadow:0 6px 24px rgba(0,0,0,.4);transition:opacity .3s;opacity:0';
      document.documentElement.appendChild(guiaCaja);
    }
    guiaCaja.innerHTML = GUIAS[ctx].map(function (g) {
      return '<span>' + (g[0] ? '<span style="display:inline-block;min-width:46px;text-align:center;padding:3px 11px;' +
        'margin-right:10px;border-radius:10px;background:#fff;color:#0a1220;font-weight:800">' + esc(g[0]) + '</span>' : '') +
        esc(g[1]) + '</span>';
    }).join('');
    guiaCaja.style.opacity = '1';
    clearTimeout(guiaT);
    guiaT = setTimeout(function () { guiaCaja.style.opacity = '0'; }, 6000);
  }
  function guiaSegunObjetivo(t) {          // se llama cuando la flechita se detiene
    if (t && t.tagName === 'A' && t.href && !/^javascript:/i.test(t.href)) mostrarEstado(t.href); else ocultarEstado();
    if (t && esEditable(t)) { guia('campo'); return; }
    var bajo = document.elementFromPoint(cur.x, cur.y);
    if (bajo && (bajo.tagName === 'VIDEO' || bajo.tagName === 'IFRAME') && !pantallaCompleta()) {
      var r = bajo.getBoundingClientRect();
      if (r.width * r.height > window.innerWidth * window.innerHeight * 0.15) guia('reproductor');
    }
  }
  addEvOrig.call(document, 'focusin', function (e) {
    if (esEditable(e.target) && Date.now() - intencionFoco < 900) guia('teclado', true);
  });

  // ---- Ayuda completa del control (menu → ❓)
  function ayuda() {
    var sec = function (t, filas) {
      return '<h2>' + t + '</h2>' + filas.map(function (f) {
        return '<div class="fila"><span>' + esc(f[1]) + '</span><b>' + esc(f[0]) + '</b></div>';
      }).join('');
    };
    abrirCapa('panel', '<h1>❓ Cómo usar el control</h1>' +
      sec('Navegar', [['⬅⬆⬇➡', 'Mover la flechita (mantén presionado para ir más rápido)'],
        ['Borde de abajo / arriba', 'Bajar o subir la página'], ['⬆ arriba del todo', 'Aparece la barra: atrás, inicio, dirección, zoom'],
        ['OK', 'Clic donde está la flechita'], ['↩ Atrás', 'Página anterior · cierra el teclado · sale de pantalla completa'],
        ['▶❚❚ Play/Pausa', 'Abrir o cerrar el menú'], ['CH + / CH −', 'Subir / bajar una pantalla']]) +
      sec('Video en pantalla completa', [['⬅⬆⬇➡ y OK', 'La flechita funciona igual que siempre (botones del reproductor)'],
        ['▶❚❚ Play/Pausa', 'Pausa / seguir'], ['0 … 9', 'Saltar al 0 % … 90 % del video'],
        ['⏪ ⏩', 'Atrasar / adelantar 10 s (si tu control los tiene)'],
        ['↩ Atrás', 'Salir de pantalla completa'], ['Volumen del control', 'Volumen (las flechas nunca lo tocan)']]) +
      sec('Botones de colores (o el botón 123)', [['🔴 Rojo', 'Buscar o escribir dirección'], ['🟢 Verde', 'Flechita libre / saltar de botón en botón'],
        ['🟡 Amarillo', 'Tu inicio'], ['🔵 Azul', 'Lo que se bloqueó en esta página']]) +
      sec('Bueno saber', [['↗', 'Si se bloqueó una ventana que SÍ querías, ábrela con ↗ en la barra o el menú'],
        ['🛡', 'Si una página no funciona, apaga Escudo o Caja iframes en el menú solo para ese sitio'],
        ['A− / A+', 'Cambiar el tamaño de la página (se recuerda por sitio)'],
        ['Modo PC', 'Las páginas creen que eres un computador: salen en versión de PC, no de celular']]));
  }

  // ---------------------------------------------------------------- TECLAS
  function escribiendo() {
    var a = menu.abierto && menu.root.activeElement ? menu.root.activeElement : document.activeElement;
    return esEditable(a);
  }
  var COLORES = { ROJO: 403, VERDE: 404, AMARILLO: 405, AZUL: 406 };

  function manejarTecla(e) {
    var c = e.keyCode, manejada = true;

    if (capa.host) {                                           // lectura o panel abiertos
      if (c === K.ATRAS || c === K.OK || c === K.PLAYPAUSA) cerrarCapa();
      else if (c === K.ABAJO || c === K.CANAL_MENOS) capa.caja.scrollBy({ top: 320 });
      else if (c === K.ARRIBA || c === K.CANAL_MAS) capa.caja.scrollBy({ top: -320 });
      else manejada = false;
    }
    else if (menu.abierto) {
      if (escribiendo() && (c === K.ARRIBA || c === K.ABAJO)) activoReal().blur();   // teclado ya cerrado: seguir en el menu
      else if (escribiendo() && c !== K.ATRAS) return;     // el teclado del TV maneja esas teclas
      if (c === K.ATRAS || c === K.PLAYPAUSA) cerrarMenu();
      else if (c === K.OK) activarMenu();
      else if (c >= 37 && c <= 40) moverMenu(c);
      else manejada = false;
    }
    else if (escribiendo() && !(c === K.ARRIBA || c === K.ABAJO)) {   // dejar escribir sin interferir
      if (c !== K.ATRAS) return;
      activoReal().blur();                                    // Atras: solo cierra el teclado
    }
    else if (escribiendo()) {          // arriba/abajo con la casilla ya sin teclado: soltarla y mover la flechita
      activoReal().blur();
      if (modoSaltos) saltar(0, c === K.ARRIBA ? -1 : 1); else empezarMovimiento(0, c === K.ARRIBA ? -1 : 1);
    }
    // (11) Botones de colores
    else if (c === COLORES.ROJO) abrirMenu(true);
    else if (c === COLORES.VERDE) { modoSaltos = !modoSaltos; osd(modoSaltos ? '🎯 Modo saltos' : '🖱 Modo cursor'); try { modoSaltos ? localStorage.setItem('navAlejandroSaltos', '1') : localStorage.removeItem('navAlejandroSaltos'); } catch (er) {} }
    else if (c === COLORES.AMARILLO) irInicio();
    else if (c === COLORES.AZUL) panelBloqueos();
    // (13) Video en pantalla completa: solo Play/Pausa, adelantar/atrasar y 0-9 (flechas y OK = flechita)
    else if (teclaPantallaCompleta(c)) { /* manejada por el video */ }
    else if (c === K.PLAYPAUSA) abrirMenu();
    else if (c === K.IZQ) modoSaltos ? saltar(-1, 0) : empezarMovimiento(-1, 0);
    else if (c === K.DER) modoSaltos ? saltar(1, 0) : empezarMovimiento(1, 0);
    else if (c === K.ARRIBA) modoSaltos ? saltar(0, -1) : empezarMovimiento(0, -1);
    else if (c === K.ABAJO) modoSaltos ? saltar(0, 1) : empezarMovimiento(0, 1);
    else if (c === K.OK) clic();
    else if (c === K.CANAL_MAS) scroll(-window.innerHeight * 0.85, true);
    else if (c === K.CANAL_MENOS) scroll(window.innerHeight * 0.85, true);
    else if (c === K.ADELANTAR || c === K.ATRASAR) {
      if (!controlVideo('saltar', c === K.ADELANTAR ? 10 : -10)) videoEnMarco('saltar', c === K.ADELANTAR ? 10 : -10);
    }
    else if (c === K.ATRAS) {
      var fs = document.fullscreenElement || document.webkitFullscreenElement;
      if (fs) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
      else {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        if (history.length > 1) history.back(); else abrirMenu();
      }
    }
    else manejada = false;

    if (manejada) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  // ---- Video en pantalla completa
  function pantallaCompleta() {
    var fs = pcom.el || realCompleto();
    if (!fs) return null;
    var v = videoEnCompleta();
    if (v) return { v: v };
    var f = fs.tagName === 'IFRAME' ? fs : (fs.querySelector ? fs.querySelector('iframe') : null);
    return f && f.contentWindow ? { win: f.contentWindow } : null;
  }
  function accionCompleta(pc, accion, valor) {
    if (pc.v) return controlVideo(accion, valor, pc.v);
    try { pc.win.postMessage({ __navAle: 1, t: 'video', accion: accion, valor: valor, completa: 1 }, '*'); } catch (e) { return false; }
    return true;
  }
  // Las flechas y OK NUNCA se usan para el video: son siempre de la flechita, tambien en
  // pantalla completa. El video solo responde a teclas que no sirven para otra cosa.
  function teclaPantallaCompleta(c) {
    var pc = pantallaCompleta();
    if (!pc) return false;
    if (c === K.PLAYPAUSA || c === 415 || c === 19) return accionCompleta(pc, 'pausa');
    if (c === K.ADELANTAR) return accionCompleta(pc, 'saltar', 10);
    if (c === K.ATRASAR) return accionCompleta(pc, 'saltar', -10);
    if (c >= 48 && c <= 57) return accionCompleta(pc, 'porcentaje', c - 48);
    return false;
  }
  alCambiarPantalla = function (dentro) {
    if (dentro) mostrar();
    if (dentro) { ocultarBarra(); ocultarEstado(); guia('video', true); }
    else { guia(null); osd('↩ Salió de pantalla completa'); }
  };
  addEvOrig.call(window, 'keydown', manejarTecla, true);

  addEvOrig.call(window, 'keyup', function (e) {
    if (e.keyCode >= 37 && e.keyCode <= 40) pararMovimiento();
  }, true);

  // ---------------------------------------------------------------- ARRANQUE
  function alCargar() {
    inyectarCSS();
    aplicarModos();
    crearCursor();
    pedirDibujo();
    aplicarZoom();
    if (EN_INICIO) return;                                  // la pagina de inicio tiene su propia interfaz
    mostrarBarra(3500);                                     // como en Samsung: se ve la direccion al cargar
    setTimeout(function () {                                // guia de teclas (como mucho cada 10 min por sitio)
      var t = 0;
      try { t = +sessionStorage.getItem('navAleGuiaPag') || 0; } catch (e) {}
      if (Date.now() - t < 600000) return;
      try { sessionStorage.setItem('navAleGuiaPag', String(Date.now())); } catch (e) {}
      guia('pagina');
    }, 1500);
    setTimeout(function () { abrirAlmacen(); guardarHistorial(); alAlmacen({ __navAle: 1, t: 'favs?' }); }, 1200);
    var intentos = 0;
    var t = setInterval(function () {                       // avisos de cookies: varios intentos
      if (rechazarCookies() || ++intentos > 8) clearInterval(t);
    }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alCargar);
  else alCargar();
  // Por si la pagina reemplaza el <html> o borra el cursor
  setInterval(function () { if (!document.hidden) { inyectarCSS(); crearCursor(); aplicarModos(); } }, 3000);
})();
