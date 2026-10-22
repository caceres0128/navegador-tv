# Navegador Alejandro v1.8.2

Navegador para TV Samsung (Tizen 2024), como módulo de TizenBrew.

## Requisitos
- **TizenBrew corregido v2** (`TizenBrew-Alejandro-v2.wgt`):
  - arregla `evaluateScriptOnDocumentStart` (en el oficial 2.0.5 la pantalla se queda esperando);
  - **modo PC**: los servidores ven un Chrome de Windows (Facebook y otros ya no mandan la versión de celular).
    Al abrir otro módulo (TizenTube) vuelve solo el agente normal del TV.
- **GitHub Pages activado** en este repositorio (Settings → Pages → Branch `main` / root):
  ahí viven la pantalla de inicio (`index.html`) y el almacén compartido (`almacen.html`).

## Archivos
| Archivo | Para qué |
|---|---|
| `inject.js` | El navegador (se inyecta en cada página) |
| `package.json` | Datos del módulo para TizenBrew (`modoEscritorio: true` = modo PC) |
| `index.html` | Pantalla de inicio: hora, dólar, clima, favoritos, historial |
| `almacen.html` | Guarda favoritos e historial en un solo lugar (se carga oculto) |
| `lista.txt` | Dominios extra para bloquear; el TV la descarga sola cada 6 h |

## Control remoto
| Tecla | Acción |
|---|---|
| Flechas | Mover la flechita (o saltar entre botones en modo saltos) |
| ⬆ arriba del todo | Aparece la **barra**: ◀ ▶ ⌂ · dirección · ⟳ · 🛡 · ⭐ · A− 100% A+ · ↗ · ☰ |
| OK | Clic (también dentro de los reproductores) |
| Atrás | Página anterior / salir de pantalla completa / cerrar teclado |
| Play/Pausa | Menú |
| 🔴 Rojo | Escribir dirección o buscar |
| 🟢 Verde | Cambiar entre flechita y saltos |
| 🟡 Amarillo | Inicio |
| 🔵 Azul | Panel de bloqueos |

### Video en pantalla completa
Las flechas y OK son **siempre** de la flechita, también en pantalla completa: se mueve igual y hace clic en los
botones del reproductor. Nada se roba las flechas ni el volumen, y la flechita nunca desaparece (quieta solo se atenúa).

| Tecla | Acción |
|---|---|
| Flechas / OK | Flechita y clic, como siempre |
| Play/Pausa | Pausar / seguir |
| 0 – 9 | Saltar al 0 % – 90 % |
| ⏪ ⏩ (si el control los tiene) | −10 s / +10 s |
| Atrás | Salir de pantalla completa |
| Volumen del control | Volumen |

La pantalla completa es "de TV": el reproductor se estira a todo el televisor con CSS y la página cree que es
la real. Así la flechita, los avisos y las guías se ven encima del video.

## Escribir y buscar
- OK sobre cualquier casilla abre el teclado del TV.
- **Completado** del teclado = Enter: busca o envía en cualquier página (Google, buscadores de los sitios,
  tu inicio, el menú) y suelta la casilla para que la flechita siga.
- **Cancelar** o **Atrás** cierran el teclado. Con la casilla activa y el teclado cerrado, ⬆ ⬇ la sueltan.

## Guías automáticas
Abajo aparecen las teclas que sirven en cada momento (página, barra, reproductor, pantalla completa, casillas
de texto, teclado). Abajo a la izquierda se ve a dónde lleva un enlace (naranja = otro sitio).
Se apagan en Menú → 💬 Guías. Menú → ❓ Ayuda muestra todo.

## Bloqueo
1. Scripts, iframes, píxeles y peticiones de ~70 redes de anuncios, antes de ejecutarse.
2. **Ventana falsa**: cuando una página abre su anuncio en otra pestaña (y no te deja ver el video hasta
   que lo hace), recibe una ventana de mentira, se desbloquea sola y tú no ves nada.
   Si era algo que sí querías, ábrelo con **↗** (barra o menú).
3. **Caja de arena**: los iframes de otros sitios no pueden cambiar tu página ni abrir ventanas.
   Los enlaces "abrir en otra pestaña" dentro de un reproductor no se abren (quedan en ↗).
4. Vigilantes de "primer clic" (popunders) desactivados; librerías de popunder conocidas neutralizadas.
5. Recargas forzadas (`meta refresh`), redirecciones y capas invisibles bloqueadas.
6. Avisos de cookies rechazados automáticamente.
7. Lista extra en `lista.txt`, sin publicar versión nueva.

Desde el menú: **Escudo** y **Caja iframes** se pueden apagar por sitio si algo se rompe.

## Modo PC
Las páginas ven `Windows NT 10.0 … Chrome/<versión real del TV>`, plataforma `Win32`, sin pantalla táctil.
En el módulo esto vale para lo que la página revisa con JavaScript; el TizenBrew corregido v2 además cambia el
encabezado que llega al servidor (lo que decide, por ejemplo, Facebook).

## Comodidad
- Flechita fluida (flechas, touchpad del celular o mouse), modo saltos.
- Recuerda en qué minuto quedaste de cada video. Velocidad 1x / 1.25x / 1.5x / 2x.
- Tamaño de página (A− / A+) por sitio. Modo oscuro, lectura y ahorro (por sitio).
- El teclado del TV solo se abre cuando eliges una casilla.

## Instalar
TizenBrew → Module Manager → Añadir módulo GitHub → `caceres0128/navegador-tv@v1.8.2`
