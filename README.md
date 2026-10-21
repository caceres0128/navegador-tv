# Navegador Alejandro

Navegador ligero para TV Samsung (Tizen), como modulo de TizenBrew.

## Control remoto
| Tecla | Accion |
|---|---|
| Flechas | Mover el cursor (mantener = mas rapido; en el borde hace scroll) |
| OK | Clic |
| Atras | Pagina anterior |
| Play/Pausa | Abrir/cerrar el menu (buscar, direccion, favoritos, zoom) |
| Canal +/- | Subir/bajar una pantalla |
| Adelantar/Atrasar | +/-10 s en videos |

## Mouse y touchpad
Funciona tambien con el touchpad de la app de control remoto del celular, o con un mouse USB/Bluetooth:
la flechita sigue al mouse real y los clics funcionan normal. Se pueden usar las flechas y el touchpad a la vez.

## Comodidad
- Flechita tipo mouse y recuadro azul sobre lo que vas a pulsar.
- Cerca de botones y enlaces el cursor frena para no pasarse.
- En videos el cursor se esconde solo.
- Zoom recordado por cada sitio.
- Menu: Inicio, Video completo, Ir arriba, Centrar cursor.

## Bloqueo
- Pop-ups que se abren solos: descartados.
- Anuncios visuales comunes: ocultos por CSS.
- Anuncios de red: usar DNS de AdGuard (94.140.14.14) en el TV.

## Instalar
TizenBrew > Module Manager > Anadir modulo GitHub > `caceres0128/navegador-tv`

## Favoritos
Editar la lista `FAVORITOS` al inicio de `inject.js`.
