# TheFoundry StreamDeck

Una aplicación de escritorio para Linux que unifica tu experiencia multimedia: catálogo de películas y series con streaming por torrent, integración con Plex, y acceso a carpetas de red (NAS/SMB) — todo desde una interfaz elegante inspirada en las grandes plataformas de streaming.

Construida con **Tauri 2** (Rust) + **React** + **TypeScript**.

---

## Capturas de pantalla

### Inicio — Catálogo y tendencias
![Inicio](docs/screenshots/home.png)

### Detalle de película
![Detalle](docs/screenshots/detail.png)

### Selección de fuente torrent
![Torrents](docs/screenshots/torrents.png)

### Series — Temporadas y episodios
![Series](docs/screenshots/series.png)

### Plex — Bibliotecas
![Plex bibliotecas](docs/screenshots/plex-libraries.png)

### Plex — Contenido de biblioteca
![Plex contenido](docs/screenshots/plex-content.png)

### Mis Carpetas — Gestor de carpetas de red
![Mis Carpetas](docs/screenshots/folders.png)

### Mis Carpetas — Explorador de archivos NAS
![Archivos NAS](docs/screenshots/nas-files.png)

---

## Características

### Catálogo inteligente
- **Inicio** con sección hero, tendencias de la semana, películas y series populares
- **Búsqueda global** de películas y series en tiempo real
- **Vista de detalle**: sinopsis, puntuación, año, duración, géneros y reparto principal
- **Mi Lista**: guarda contenido para verlo más tarde
- Datos obtenidos de la **API de TMDB**

### Streaming por torrent
- Busca fuentes en **YTS** (películas) y **EZTV** (series) directamente desde la app
- Muestra calidad (4K / 1080p), idioma (ESP / LAT / DUAL), códec (x265 / x264), peso y número de seeds
- Empieza a reproducir mientras descarga — motor integrado **librqbit**
- El vídeo se sirve localmente vía HTTP y se reproduce con el player integrado

### Integración Plex
- Conecta con tu servidor **Plex Media Server** y navega tus bibliotecas
- Vista de biblioteca en cuadrícula con posters
- Reproduce directamente desde Plex con un clic

### Mis Carpetas — NAS y red local
- Añade carpetas locales o **recursos de red SMB** (`smb://usuario:contraseña@host/share`)
- Navega la estructura de directorios del NAS con breadcrumb
- Comprobación de conexión al guardar una carpeta
- Reproducción directa de archivos MKV y otros formatos desde el NAS
- Descarga en segundo plano con inicio de reproducción temprano (streaming a partir de los primeros 10 MB)
- Soporte **SMB2** vía `smbclient`

### Reproductor integrado
- Player de vídeo con controles de reproducción, barra de progreso y seek
- Selector de **pista de audio** (para archivos con múltiples idiomas)
- Soporte de subtítulos
- Opción de abrir en **mpv** como reproductor externo
- Compatible con torrents activos, archivos locales y archivos de red

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

## Requisitos del sistema

- **Linux** (desarrollado y probado en CachyOS / Arch)
- [Rust](https://rustup.rs/) 1.77.2+
- [Node.js](https://nodejs.org/) 20+
- `ffmpeg` instalado en el sistema
- `mpv` instalado en el sistema (opcional, para reproductor externo)
- `smbclient` instalado (para acceso a carpetas de red SMB)

```bash
# Arch / CachyOS
sudo pacman -S ffmpeg mpv samba
```

---

## Instalación y desarrollo

### 1. Clona el repositorio

```bash
git clone https://github.com/madkyp/app_movies.git
cd app_movies
```

### 2. Instala dependencias

```bash
npm install
```

### 3. Ejecuta en modo desarrollo

```bash
npm run tauri dev
```

### 4. Compila para producción

```bash
npm run tauri build
```

El instalador se generará en `src-tauri/target/release/bundle/`.

### 5. Configura Plex (opcional)

Abre la app → **Ajustes** → introduce tu Plex URL y token. Las credenciales se guardan localmente en el dispositivo y nunca salen del mismo.

> Para obtener tu token de Plex: https://support.plex.tv/articles/204059436

---

## Configuración de Mis Carpetas (NAS/SMB)

Para añadir una carpeta de red:

1. Ve a **Mis Carpetas** en la barra lateral
2. Haz clic en **Añadir carpeta**
3. Introduce un nombre descriptivo
4. En la ruta usa el formato SMB: `smb://usuario:contraseña@192.168.1.10/NombreShare`
5. La app comprobará la conexión antes de guardar

Las credenciales se guardan localmente en `~/.config/streamdeck/folders.json` y se enmascaran en la interfaz.

---

## Estructura del proyecto

```
app_movies/
├── src/                        # Frontend React
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
├── src-tauri/                  # Backend Rust (Tauri)
│   └── src/
│       ├── commands.rs         # Comandos Tauri: torrents, SMB, ffmpeg, mpv
│       ├── torrent_manager.rs  # Motor de torrents (librqbit)
│       └── lib.rs              # Setup de la app
└── .env.local                  # Variables de entorno (no se sube a git)
```

---

## Licencia

MIT
