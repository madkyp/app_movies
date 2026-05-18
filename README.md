# TheFoundry StreamDeck

Una aplicación de escritorio para Linux que unifica tu experiencia multimedia: catálogo de películas y series con streaming por torrent, integración con Plex, y acceso a carpetas de red (NAS/SMB) — todo desde una interfaz elegante inspirada en las grandes plataformas de streaming.

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
Pantalla de inicio con sección hero, tendencias de la semana, películas y series populares. Búsqueda global en tiempo real. Los datos del catálogo se obtienen de la **API de TMDB**.

### Detalle de película o serie
Vista con sinopsis, puntuación, año, duración, géneros y reparto principal. Desde aquí puedes reproducir vía torrent, vía Plex (si está configurado) o añadir a **Mi Lista**.

### Streaming por torrent
Busca fuentes en **YTS** (películas) y **EZTV** (series) directamente desde la app. Cada resultado muestra la calidad (4K / 1080p), idioma (ESP / LAT / DUAL), códec (x265 / x264), tamaño y número de seeds. Al pulsar Play, la descarga empieza y la reproducción comienza de inmediato gracias al motor integrado **librqbit**.

### Series — Temporadas y episodios
Vista de serie con pestañas por temporada y listado de episodios con miniatura, sinopsis y fecha. Cada episodio tiene su propio buscador de fuentes torrent.

### Integración Plex
Conecta con tu servidor **Plex Media Server** configurando la URL y el token en Ajustes. Navega tus bibliotecas en cuadrícula y reproduce cualquier archivo con un clic. Las credenciales se guardan solo en tu dispositivo.

### Mis Carpetas — NAS y red local
Añade carpetas locales o recursos de red via **SMB** (`smb://usuario:contraseña@host/share`). Navega la estructura de directorios con breadcrumb. Al añadir una carpeta la app comprueba la conexión antes de guardar. Los archivos del NAS se descargan en segundo plano y la reproducción empieza en cuanto llegan los primeros 10 MB.

### Reproductor integrado
Player con controles completos (play/pausa, seek, barra de progreso), selector de **pista de audio** para archivos con varios idiomas, y opción de abrir en **mpv** como reproductor externo. Compatible con torrents activos, archivos locales y archivos de red.

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
| Acceso NAS | smbclient (Samba) |

---

## Instalación

### Instalación

El script detecta tu distribución, instala todas las dependencias, compila la app y crea un acceso directo en el menú de aplicaciones.

```bash
curl -fsSL "https://raw.githubusercontent.com/madkyp/app_movies/main/install.sh" -o /tmp/install_streamdeck.sh && bash /tmp/install_streamdeck.sh
```

Una vez completado, ejecuta `streamdeck` desde la terminal o búscala en el menú de tu escritorio.

### Actualización

Para actualizar a la última versión (más rápido, omite la instalación de dependencias):

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

## Configuración

### Plex

Abre la app → **Ajustes** → introduce tu Plex URL y token. Las credenciales se guardan localmente y nunca salen del dispositivo.

> Para obtener tu token de Plex: https://support.plex.tv/articles/204059436

### NAS / SMB

1. Ve a **Mis Carpetas** en la barra lateral
2. Haz clic en **Añadir carpeta**
3. Introduce un nombre y la ruta: `smb://usuario:contraseña@IP_DEL_NAS/NombreShare`
4. La app comprobará la conexión antes de guardar

Las credenciales se guardan localmente y se enmascaran en la interfaz.

---

## Estructura del proyecto

```
app_movies/
├── src/
│   ├── views/
│   │   ├── Home.tsx            # Pantalla de inicio con catálogo
│   │   ├── Movies.tsx          # Listado de películas
│   │   ├── Series.tsx          # Listado de series
│   │   ├── Detail.tsx          # Detalle de película/serie
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
