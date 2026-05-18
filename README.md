# TheFoundry StreamDeck

Una aplicación de escritorio para **Linux y Windows** que unifica tu experiencia multimedia: catálogo de películas y series con streaming por torrent, integración con Plex, y acceso a carpetas de red (NAS/SMB) — todo desde una interfaz elegante inspirada en las grandes plataformas de streaming.

Construida con **Tauri 2** (Rust) + **React** + **TypeScript**.

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

### Detalle de película o serie
Vista con sinopsis, puntuación, año, duración, géneros y reparto principal. Incluye el **tráiler oficial de YouTube** (abre en el navegador) y **reseñas de TMDB**. Desde aquí puedes reproducir vía torrent, vía Plex o añadir a **Mi Lista**.

### Streaming por torrent
Busca fuentes en **YTS** (películas) y **EZTV** (series) directamente desde la app. Cada resultado muestra la calidad (4K / 1080p), idioma (ESP / LAT / DUAL), códec (x265 / x264), tamaño y número de seeds. Al pulsar Play, la descarga empieza y la reproducción comienza de inmediato gracias al motor integrado **librqbit**, con soporte para trackers públicos como fallback.

### Series — Temporadas y episodios
Vista de serie con pestañas por temporada y listado de episodios con miniatura, sinopsis y fecha. Cada episodio tiene su propio buscador de fuentes torrent.

### Integración Plex
Conecta con un servidor **Plex Media Server** preconfigurado o introduce tus propias credenciales en Ajustes. Navega tus bibliotecas en cuadrícula y reproduce cualquier archivo con un clic. Si el servidor no está disponible aparece un botón para **quitarlo** y configurar el tuyo propio.

### Mis Carpetas — NAS y red local
Añade carpetas locales o recursos de red via **SMB**:
- **Linux**: `smb://usuario:contraseña@host/share` (vía smbclient)
- **Windows**: acceso nativo via rutas UNC (`\\host\share`) con autenticación automática

Navega la estructura de directorios con breadcrumb. Los archivos del NAS se reproducen directamente sin necesidad de descarga previa en Windows.

### Reproductor integrado
Player con controles completos (play/pausa, seek, barra de progreso), selector de **pista de audio** para archivos con varios idiomas, y opción de abrir en **mpv** como reproductor externo. Compatible con torrents activos, archivos locales y archivos de red.

---

## Plataformas

| | Linux | Windows |
|---|---|---|
| **Instalación** | Script automático | Installer `.msi` / `.exe` |
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

Descarga el installer `.msi` o `.exe` desde la sección [Releases](https://github.com/madkyp/app_movies/releases). ffmpeg, ffprobe y mpv van incluidos — no necesitas instalar nada más.

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
3. Introduce un nombre y la ruta: `smb://usuario:contraseña@IP_DEL_NAS/NombreShare`
4. La app comprobará la conexión antes de guardar

### NAS / SMB (Windows)

En Windows el acceso SMB es nativo. Usa el mismo formato `smb://host/share` y si el recurso requiere credenciales introdúcelas en la URL: `smb://usuario:contraseña@host/share`. La autenticación se gestiona automáticamente con `net use`.

---

## Estructura del proyecto

```
app_movies/
├── src/
│   ├── views/
│   │   ├── Home.tsx            # Pantalla de inicio con catálogo
│   │   ├── Movies.tsx          # Listado de películas
│   │   ├── Series.tsx          # Listado de series
│   │   ├── Detail.tsx          # Detalle + tráiler + reseñas
│   │   ├── Player.tsx          # Reproductor integrado
│   │   ├── Search.tsx          # Búsqueda global
│   │   ├── Watchlist.tsx       # Mi Lista
│   │   ├── PlexBrowser.tsx     # Navegador Plex
│   │   ├── NetworkFolders.tsx  # Mis Carpetas (NAS/SMB)
│   │   └── Settings.tsx        # Ajustes
│   ├── components/             # Componentes reutilizables
│   ├── hooks/                  # usePlex, useTmdb
│   ├── store/                  # Estado global (Zustand)
│   └── types/                  # Tipos TypeScript
└── src-tauri/
    └── src/
        ├── commands.rs         # Torrents, SMB, ffmpeg, mpv
        ├── torrent_manager.rs  # Motor de torrents (librqbit)
        └── lib.rs              # Setup de la app
```

---

## Licencia

MIT
