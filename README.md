# The Foundry: StreamDeck

Una aplicación de escritorio para **Linux y Windows** que unifica tu experiencia multimedia: catálogo de películas y series con streaming por torrent, integración con Plex, y acceso a carpetas de red (NAS/SMB) — todo desde una interfaz elegante inspirada en las grandes plataformas de streaming.

Construida con **Tauri 2** (Rust) + **React** + **TypeScript**.

---

## Índice

- [Capturas de pantalla](#capturas-de-pantalla)
- [Características](#características)
  - [Catálogo inteligente](#catálogo-inteligente)
  - [Continuar viendo](#continuar-viendo)
  - [Detalle de película o serie](#detalle-de-película-o-serie)
  - [Streaming por torrent](#streaming-por-torrent)
  - [Series — Temporadas y episodios](#series--temporadas-y-episodios)
  - [Integración Plex](#integración-plex)
  - [Mis Carpetas — NAS y red local](#mis-carpetas--nas-y-red-local)
  - [Reproductor integrado](#reproductor-integrado)
  - [Reproductor MPV (máxima calidad)](#reproductor-mpv-máxima-calidad)
  - [Blu-ray ISO](#blu-ray-iso)
  - [Subtítulos externos](#subtítulos-externos)
  - [Historial](#historial)
- [Plataformas](#plataformas)
- [Stack tecnológico](#stack-tecnológico)
- [Instalación en Linux](#instalación-en-linux)
- [Instalación en Windows](#instalación-en-windows)
- [Configuración](#configuración)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Licencia](#licencia)

---

## Capturas de pantalla

| | |
|---|---|
| ![Inicio](docs/screenshots/home.png) | ![Detalle](docs/screenshots/detail.png) |
| ![Torrents](docs/screenshots/torrents.png) | ![Series](docs/screenshots/series.png) |
| ![Plex bibliotecas](docs/screenshots/plex-libraries.png) | ![Plex contenido](docs/screenshots/plex-content.png) |
| ![Mis Carpetas](docs/screenshots/folders.png) | ![Archivos NAS](docs/screenshots/nas-files.png) |

---

## Características

### Catálogo inteligente

Pantalla de inicio con sección hero, tendencias de la semana, películas y series populares. Búsqueda global en tiempo real. Los datos del catálogo se obtienen de la **API de TMDB** (API key incluida, no se necesita configurar nada).

### Continuar viendo

La app guarda automáticamente el progreso de reproducción cada 10 segundos. La pantalla de inicio muestra una fila **"Continuar viendo"** con las películas y series a medio ver, con barra de progreso y tiempo restante.

Al pulsar sobre un elemento el reproductor retoma exactamente donde lo dejaste:
- **Torrents**: se guarda el magnet link junto al progreso. Al reanudar, el torrent arranca automáticamente sin pasar por el selector de fuentes y salta al minuto guardado mediante priorización de piezas en librqbit.
- **Archivos locales / NAS**: abre el archivo y posiciona el reproductor en el segundo guardado.
- **Plex**: reanuda desde el offset exacto via ffmpeg.

La misma funcionalidad está disponible en la sección **Historial**, que además muestra una barra de progreso en cada miniatura.

### Detalle de película o serie

Vista con sinopsis, puntuación, año, duración, géneros y reparto principal. Incluye el **tráiler oficial de YouTube** (abre en el navegador) y **reseñas de TMDB**. Desde aquí puedes reproducir vía torrent, vía Plex o añadir a **Mi Lista**.

### Streaming por torrent

Busca fuentes en **YTS** (películas) y **EZTV** (series) directamente desde la app. Cada resultado muestra la calidad (4K / 1080p), idioma (ESP / LAT / DUAL), códec (x265 / x264), tamaño y número de seeds. Los resultados se ordenan **primero por idioma español** (ESP, LAT, DUAL) y después por seeds descendente.

Al pulsar Play, la descarga empieza y la reproducción comienza de inmediato gracias al motor integrado **librqbit**. El reproductor soporta **seek real**: al avanzar a un punto no descargado, librqbit prioriza automáticamente las piezas de ese offset y reanuda la reproducción en cuanto tiene buffer suficiente, sin necesidad de descargar desde el principio.

### Series — Temporadas y episodios

Vista de serie con pestañas por temporada y listado de episodios con miniatura, sinopsis y fecha. Cada episodio tiene su propio buscador de fuentes torrent.

### Integración Plex

Conecta con un servidor **Plex Media Server** preconfigurado o introduce tus propias credenciales en Ajustes. Navega tus bibliotecas en cuadrícula y reproduce cualquier archivo con un clic. El vídeo se transcodifica localmente mediante ffmpeg para máxima compatibilidad. Al avanzar en la reproducción, ffmpeg retoma desde la nueva posición de forma transparente con reintentos automáticos si la reconexión tarda.

### Mis Carpetas — NAS y red local

Añade carpetas locales o recursos de red via **SMB**:

- **Linux**: `smb://host/share` (modo invitado) o `smb://usuario:contraseña@host/share`
- **Windows**: acceso nativo via rutas UNC (`\\host\share`) con autenticación automática

Navega la estructura de directorios con breadcrumb. Los archivos del NAS se cachean en `~/.cache/streamdeck/smb/` (no en RAM) y se eliminan automáticamente al salir del reproductor y al iniciar la app, evitando que ocupen espacio en disco de forma permanente.

### Blu-ray ISO

Los archivos `.iso` aparecen en el navegador de carpetas y se reproducen automáticamente con mpv usando el protocolo `bluray://` y `libbluray`. Se requiere `libbluray` instalado en el sistema (`pacman -S libbluray` en Arch).

> **Nota**: los ISOs deben estar en una carpeta **local** o montada localmente. libbluray no puede leer rutas de red `smb://` directamente — si el ISO está en un NAS, monta la carpeta via CIFS primero y accede desde «Carpeta local»:
> ```bash
> sudo mount -t cifs //servidor/carpeta /mnt/punto -o uid=$(id -u),gid=$(id -g)
> ```

### Reproductor integrado

Player con controles completos para las tres fuentes (torrent, Plex y archivos locales/NAS):

| Acción | Control |
|--------|---------|
| Play / Pausa | `Space` o clic |
| Retroceder 10 s | `←` |
| Avanzar 10 s | `→` |
| Pantalla completa | `F` |
| Silenciar | `M` |
| Seek preciso | Barra de progreso (−30s / −10s / +10s / +30s) |

Selector de **pista de audio** para archivos con varios idiomas. El audio multicanal (TrueHD Atmos 7.1, DTS-X) se mezcla automáticamente a 5.1 para garantizar compatibilidad con el navegador.

### Reproductor MPV (máxima calidad)

Todos los modos de reproducción (torrent, Plex y archivos locales) incluyen un botón **MPV** que lanza el vídeo en [mpv](https://mpv.io/) con máxima calidad: `vo=gpu-next`, Vulkan, `ewa_lanczossharp`, deband y la configuración que tengas en `~/.config/mpv/mpv.conf`.

La app mantiene el control mediante un **overlay IPC** que permanece visible mientras mpv está abierto:

| Acción | Control |
|--------|---------|
| Play / Pausa | Botón en el overlay |
| −30s / −10s / +10s / +30s | Botones de salto rápido |
| Seek preciso | Barra de progreso del overlay |
| Cerrar MPV | Botón «Volver» |

El progreso se sincroniza con el historial de la app cada segundo. Si cierras la ventana de mpv desde fuera, el overlay lo detecta y muestra una pantalla de aviso en lugar de navegar silenciosamente.

### Subtítulos externos

Busca y descarga subtítulos de **OpenSubtitles** desde el panel de subtítulos en el reproductor. Compatible con los tres modos de reproducción. Requiere una API key gratuita de OpenSubtitles (configurable en Ajustes).

### Historial

Registro completo de reproducciones con miniatura, barra de progreso, fuente (torrent / Plex / local) y tiempo transcurrido. Permite reanudar cualquier entrada con un clic — los torrents con magnet guardado arrancan directamente al minuto guardado, igual que desde "Continuar viendo". Entradas individuales eliminables o borrado completo del historial.

---

## Plataformas

| | Linux | Windows |
|---|---|---|
| **Instalación** | Script automático | Installer `.exe` (NSIS) |
| **Torrents** | ✅ | ✅ |
| **Plex** | ✅ | ✅ |
| **NAS / SMB** | smbclient | UNC nativo (`net use`) |
| **ffmpeg / mpv** | Sistema | Incluidos en el installer |

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework de escritorio | [Tauri 2](https://tauri.app/) |
| Backend | Rust |
| Motor de torrents | [librqbit](https://github.com/ikatson/rqbit) |
| Frontend | React 19 + TypeScript |
| Estilos | Tailwind CSS v4 |
| Build tool | Vite |
| API de catálogo | TMDB API |
| Streaming de vídeo | ffmpeg (servidor HTTP local en puerto 7777) |
| Reproductor externo | mpv |
| Estado global | Zustand (con persistencia) |
| Subtítulos | OpenSubtitles API |
| Acceso NAS (Linux) | smbclient (Samba) |
| Acceso NAS (Windows) | UNC paths + net use |

---

## Instalación en Linux

El script detecta tu distribución, instala todas las dependencias, compila la app y crea un acceso directo en el menú de aplicaciones.

```bash
curl -fsSL "https://raw.githubusercontent.com/madkyp/app_movies/main/install.sh" -o /tmp/install_streamdeck.sh && bash /tmp/install_streamdeck.sh
```

Una vez completado, ejecuta `streamdeck` desde la terminal o búscala en el menú de tu escritorio.

### Actualización

```bash
curl -fsSL "https://raw.githubusercontent.com/madkyp/app_movies/main/install.sh" -o /tmp/install_streamdeck.sh && bash /tmp/install_streamdeck.sh update
```

**Distribuciones compatibles:**

| Distribución | Versión mínima |
|---|---|
| Arch Linux / Manjaro / CachyOS / EndeavourOS | cualquiera |
| Ubuntu / Linux Mint / Pop!\_OS | 22.04+ |
| Debian | 12+ |
| Fedora | 38+ |
| openSUSE | Tumbleweed |

> Ubuntu 20.04 y anteriores **no son compatibles** (webkit2gtk-4.1 no disponible).

---

## Instalación en Windows

[![Descargar para Windows](https://img.shields.io/badge/Descargar-Windows%20Installer-0078d4?logo=windows)](https://github.com/madkyp/app_movies/releases/download/Pre-release/The.Foundry.StreamDeck_main_x64-setup.zip)

Descarga el ZIP desde el botón de arriba o desde la sección [**Releases**](https://github.com/madkyp/app_movies/releases). Extrae el ZIP y ejecuta el `.exe` que hay dentro.

**ffmpeg, ffprobe y mpv van incluidos** — no necesitas instalar nada más.

---

## Configuración

### Plex

La app incluye un servidor Plex preconfigurado. Si quieres usar el tuyo:

Abre la app → **Ajustes** → introduce tu URL de Plex y token.

> Para obtener tu token de Plex: https://support.plex.tv/articles/204059436

Si el servidor preconfigurado no responde, aparecerá un botón **Quitar servidor** para limpiar la configuración y añadir la tuya.

### NAS / SMB (Linux)

1. Ve a **Mis Carpetas** en la barra lateral
2. Haz clic en **Añadir carpeta**
3. Introduce un nombre y la ruta: `smb://host/NombreShare` (invitado) o `smb://usuario:contraseña@IP/Share`
4. La app comprobará la conexión antes de guardar

Los archivos grandes del NAS se cachean en `~/.cache/streamdeck/smb/` antes de reproducirse. La caché se limpia automáticamente al salir del reproductor.

### NAS / SMB (Windows)

En Windows el acceso SMB es nativo. Usa el mismo formato `smb://host/share` y si el recurso requiere credenciales introdúcelas en la URL: `smb://usuario:contraseña@host/share`.

### OpenSubtitles

1. Crea una cuenta gratuita en [opensubtitles.com](https://www.opensubtitles.com)
2. Genera una API key en tu perfil
3. Abre la app → **Ajustes** → pega la API key en el campo correspondiente
4. En el reproductor, pulsa el botón **CC** para buscar subtítulos

---

## Estructura del proyecto

```
app_movies/
├── src/
│   ├── views/
│   │   ├── Home.tsx            # Inicio: hero, tendencias, continuar viendo
│   │   ├── Movies.tsx          # Listado de películas
│   │   ├── Series.tsx          # Listado de series
│   │   ├── Detail.tsx          # Detalle + tráiler + reseñas
│   │   ├── Player.tsx          # Reproductor (torrent / Plex / local)
│   │   ├── Search.tsx          # Búsqueda global
│   │   ├── Watchlist.tsx       # Mi Lista
│   │   ├── History.tsx         # Historial de reproducción
│   │   ├── PlexBrowser.tsx     # Navegador Plex
│   │   ├── NetworkFolders.tsx  # Mis Carpetas (NAS/SMB)
│   │   └── Settings.tsx        # Ajustes
│   ├── components/             # Componentes reutilizables
│   ├── hooks/                  # usePlex, useTmdb
│   ├── store/                  # Estado global con persistencia (Zustand)
│   └── types/                  # Tipos TypeScript
└── src-tauri/
    └── src/
        ├── commands.rs         # SMB, subtítulos, mpv
        ├── torrent_manager.rs  # Motor de torrents + servidor ffmpeg
        └── lib.rs              # Setup de la app
```

---

## Licencia

MIT
