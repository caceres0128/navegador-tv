# Navegador Alejandro

Navegador para TV Samsung (Tizen 2024), como módulo de TizenBrew.

## Requisitos
- **TizenBrew corregido** (TizenBrew-Alejandro.wgt): en el oficial 2.0.5 la opción
  `evaluateScriptOnDocumentStart` está rota y la pantalla se queda esperando.
- **GitHub Pages activado** en este repositorio (Settings → Pages → Branch `main` / root):
  ahí viven la pantalla de inicio (`index.html`) y el almacén compartido (`almacen.html`).

## Archivos
| Archivo | Para qué |
|---|---|
| `inject.js` | El navegador (se inyecta en cada página) |
| `package.json` | Datos del módulo para TizenBrew |
| `index.html` | Pantalla de inicio: hora, dólar, clima, favoritos, historial |
| `almacen.html` | Guarda favoritos e historial en un solo lugar (se carga oculto) |
| `lista.txt` | Dominios extra para bloquear; el TV la descarga solo cada 6 h |

## Control remoto
| Tecla | Acción |
|---|---|
| Flechas | Mover el cursor (o saltar entre enlaces en modo saltos) |
| OK | Clic (también dentro de los reproductores) |
| Atrás | Página anterior / salir de pantalla completa / cerrar teclado |
| Play/Pausa | Menú |
| 🔴 Rojo | Escribir dirección o buscar |
| 🟢 Verde | Cambiar entre cursor y saltos |
| 🟡 Amarillo | Inicio |
| 🔵 Azul | Panel de bloqueos |

### Con un video reproduciéndose (grande o en pantalla completa)
| Tecla | Acción |
|---|---|
| OK / Play-Pausa | Pausar / reproducir (al pausar vuelve el cursor) |
| ⬅ ➡ | −10 s / +10 s |
| ⬆ ⬇ | Volumen |
| 0 – 9 | Saltar al 0 % – 90 % |

## Bloqueo
1. Scripts, iframes, píxeles y peticiones de ~70 redes de anuncios, antes de ejecutarse.
2. **Caja de arena**: los iframes de otros sitios no pueden cambiar tu página ni abrir ventanas.
3. Vigilantes de "primer clic" (popunders) desactivados.
4. Librerías de popunder conocidas neutralizadas.
5. Recargas forzadas (`meta refresh`) bloqueadas.
6. Escudo contra redirecciones y capas invisibles.
7. Avisos de cookies rechazados automáticamente.
8. Lista extra en `lista.txt`, sin publicar versión nueva.

Desde el menú: **Escudo** y **Caja iframes** se pueden apagar por sitio si algo se rompe.

## Comodidad
- Cursor fluido (flechas, touchpad del celular o mouse), modo saltos.
- Recuerda en qué minuto quedaste de cada video.
- Velocidad 1x / 1.25x / 1.5x / 2x.
- Modo oscuro, modo lectura y modo ahorro (por sitio).
- El teclado del TV solo se abre cuando eliges una casilla.

## Instalar
TizenBrew → Module Manager → Añadir módulo GitHub → `caceres0128/navegador-tv@v1.7.0`
