#!/usr/bin/env bash

# ─────────────────────────────────────────────────────────────
#  TheFoundry StreamDeck — Instalador para Linux
# ─────────────────────────────────────────────────────────────

REPO="https://github.com/madkyp/app_movies.git"
APP_DIR="$HOME/.local/share/streamdeck"
BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"

GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
BLUE="\033[1;34m"
BOLD="\033[1m"
RESET="\033[0m"

info()    { echo -e "${BLUE}▶${RESET} $*"; }
success() { echo -e "${GREEN}✔${RESET} $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET} $*"; }
die()     { echo -e "${RED}✘ Error:${RESET} $*"; exit 1; }

echo ""
echo -e "${BOLD}  ╔══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}  ║   TheFoundry StreamDeck Installer    ║${RESET}"
echo -e "${BOLD}  ╚══════════════════════════════════════╝${RESET}"
echo ""
echo "  Compilando desde fuente (~500MB, 5-10 min)"
echo ""

# ── 1. Detectar distro ───────────────────────────────────────

info "Detectando distribución..."

if [ ! -f /etc/os-release ]; then
    die "/etc/os-release no encontrado. Distribución no soportada."
fi

DISTRO_ID=$(grep "^ID=" /etc/os-release | cut -d= -f2 | tr -d '"')
DISTRO_LIKE=$(grep "^ID_LIKE=" /etc/os-release | cut -d= -f2 | tr -d '"')

success "Distribución: $DISTRO_ID ${DISTRO_LIKE:+(like: $DISTRO_LIKE)}"

is_like() { echo "$DISTRO_ID $DISTRO_LIKE" | grep -qw "$1"; }

# ── 2. Dependencias del sistema ──────────────────────────────

echo ""
info "Instalando dependencias del sistema..."

if is_like arch || [ "$DISTRO_ID" = "arch" ] || [ "$DISTRO_ID" = "cachyos" ] || [ "$DISTRO_ID" = "manjaro" ]; then
    sudo pacman -Sy --needed --noconfirm \
        base-devel git curl \
        webkit2gtk-4.1 gtk3 openssl \
        appmenu-gtk-module libappindicator-gtk3 librsvg xdotool \
        ffmpeg mpv samba \
        || die "Falló la instalación de dependencias con pacman."

elif is_like debian || is_like ubuntu || [ "$DISTRO_ID" = "ubuntu" ] || [ "$DISTRO_ID" = "debian" ] || [ "$DISTRO_ID" = "linuxmint" ]; then
    sudo apt-get update -qq \
        || die "Falló apt-get update."
    sudo apt-get install -y \
        build-essential git curl \
        libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev \
        libayatana-appindicator3-dev librsvg2-dev libxdo-dev patchelf \
        ffmpeg mpv smbclient \
        || die "Falló la instalación de dependencias con apt."

elif is_like fedora || is_like rhel || [ "$DISTRO_ID" = "fedora" ]; then
    sudo dnf install -y \
        @development-tools git curl \
        webkit2gtk4.1-devel openssl-devel gtk3-devel \
        libappindicator-gtk3-devel librsvg2-devel libxdo-devel \
        ffmpeg mpv samba-client \
        || die "Falló la instalación de dependencias con dnf."

elif is_like opensuse || is_like suse || [ "$DISTRO_ID" = "opensuse-tumbleweed" ]; then
    sudo zypper install -y \
        gcc gcc-c++ make git curl \
        webkit2gtk3-soup2-devel libopenssl-devel gtk3-devel \
        libappindicator3-1 librsvg-devel \
        ffmpeg mpv samba-client \
        || die "Falló la instalación de dependencias con zypper."

else
    die "Distribución '$DISTRO_ID' no soportada.\nCompatibles: Arch/CachyOS/Manjaro, Ubuntu 22.04+, Debian 12+, Fedora 38+, openSUSE."
fi

success "Dependencias del sistema instaladas."

# ── 3. Rust ──────────────────────────────────────────────────

echo ""
info "Comprobando Rust..."

export PATH="$HOME/.cargo/bin:$PATH"

if ! command -v rustc &>/dev/null; then
    info "Instalando Rust via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \
        | sh -s -- -y --no-modify-path \
        || die "Falló la instalación de Rust."
    export PATH="$HOME/.cargo/bin:$PATH"
fi

RUST_VER=$(rustc --version 2>/dev/null | awk '{print $2}')
success "Rust $RUST_VER listo."

RUST_MINOR=$(echo "$RUST_VER" | cut -d. -f2)
if [ "${RUST_MINOR:-0}" -lt 77 ]; then
    info "Actualizando Rust..."
    rustup update stable || warn "No se pudo actualizar Rust, continuando..."
fi

# ── 4. Node.js ───────────────────────────────────────────────

echo ""
info "Comprobando Node.js..."

NODE_OK=false
if command -v node &>/dev/null; then
    NODE_MAJOR=$(node --version | tr -d 'v' | cut -d. -f1)
    if [ "${NODE_MAJOR:-0}" -ge 20 ]; then
        success "Node.js $(node --version) listo."
        NODE_OK=true
    fi
fi

if [ "$NODE_OK" = false ]; then
    info "Instalando Node.js 20 LTS via nvm..."
    export NVM_DIR="$HOME/.nvm"

    if [ ! -f "$NVM_DIR/nvm.sh" ]; then
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh \
            | bash \
            || die "Falló la instalación de nvm."
    fi

    # shellcheck source=/dev/null
    . "$NVM_DIR/nvm.sh"

    nvm install 20 || die "Falló la instalación de Node.js."
    nvm use 20
    nvm alias default 20
    success "Node.js $(node --version) instalado."
fi

# ── 5. Clonar y compilar ─────────────────────────────────────

echo ""
info "Preparando repositorio en $APP_DIR..."

if [ -d "$APP_DIR/.git" ]; then
    info "Actualizando repositorio existente..."
    git -C "$APP_DIR" fetch origin \
        && git -C "$APP_DIR" reset --hard origin/main \
        || die "Falló la actualización del repositorio."
else
    git clone "$REPO" "$APP_DIR" || die "Falló la clonación del repositorio."
fi

cd "$APP_DIR" || die "No se puede acceder a $APP_DIR."

info "Instalando dependencias npm..."
npm install || die "Falló npm install."

info "Compilando (esto puede tardar 5-10 minutos)..."
./node_modules/.bin/tauri build || die "Falló la compilación."

success "Compilación completada."

# ── 6. Instalar ──────────────────────────────────────────────

echo ""
info "Instalando..."

BINARY=$(find "$APP_DIR/src-tauri/target/release" -maxdepth 1 -type f -executable ! -name "*.d" ! -name "*.rlib" 2>/dev/null | head -1)

if [ -z "$BINARY" ]; then
    die "No se encontró el binario compilado en src-tauri/target/release/"
fi

mkdir -p "$BIN_DIR"
cp "$BINARY" "$BIN_DIR/streamdeck"
chmod +x "$BIN_DIR/streamdeck"
success "Binario instalado en $BIN_DIR/streamdeck"

mkdir -p "$DESKTOP_DIR"
cat > "$DESKTOP_DIR/streamdeck.desktop" <<EOF
[Desktop Entry]
Name=StreamDeck
Comment=Tu centro de entretenimiento multimedia
Exec=$BIN_DIR/streamdeck
Icon=$APP_DIR/src/assets/logo.png
Type=Application
Categories=AudioVideo;Video;Player;
StartupNotify=true
EOF
success "Acceso directo creado."

# Añadir ~/.local/bin al PATH si falta
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    SHELL_RC="$HOME/.bashrc"
    [ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"
    echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
    warn "Añadido $BIN_DIR al PATH en $SHELL_RC"
    warn "Ejecuta: source $SHELL_RC"
fi

# ── Fin ──────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}${BOLD}  ════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  ✔  StreamDeck instalado correctamente   ${RESET}"
echo -e "${GREEN}${BOLD}  ════════════════════════════════════════${RESET}"
echo ""
echo "  Ejecuta: streamdeck"
echo "  O búscalo en el menú de aplicaciones."
echo ""
