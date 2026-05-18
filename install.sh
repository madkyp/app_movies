#!/usr/bin/env bash

# ─────────────────────────────────────────────────────────────
#  TheFoundry StreamDeck — Instalador / Actualizador para Linux
#  Uso:
#    bash install.sh           # instalación completa
#    bash install.sh update    # actualizar versión instalada
# ─────────────────────────────────────────────────────────────

REPO="https://github.com/madkyp/app_movies.git"
APP_DIR="$HOME/.local/share/streamdeck"
BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
MODE="${1:-install}"

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

if [ "$MODE" = "update" ]; then
    echo ""
    echo -e "${BOLD}  ╔══════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}  ║   TheFoundry StreamDeck Updater      ║${RESET}"
    echo -e "${BOLD}  ╚══════════════════════════════════════╝${RESET}"
    echo ""

    if [ ! -d "$APP_DIR/.git" ]; then
        die "No se encontró instalación previa en $APP_DIR\n  Ejecuta primero: bash install.sh"
    fi
else
    echo ""
    echo -e "${BOLD}  ╔══════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}  ║   TheFoundry StreamDeck Installer    ║${RESET}"
    echo -e "${BOLD}  ╚══════════════════════════════════════╝${RESET}"
    echo ""
    echo "  Compilando desde fuente (~500MB, 5-10 min)"
    echo ""
fi

# ── Funciones ────────────────────────────────────────────────

is_like() { echo "$DISTRO_ID $DISTRO_LIKE" | grep -qw "$1"; }

install_system_deps() {
    echo ""
    info "Instalando dependencias del sistema..."

    if [ ! -f /etc/os-release ]; then
        die "/etc/os-release no encontrado."
    fi

    DISTRO_ID=$(grep "^ID=" /etc/os-release | cut -d= -f2 | tr -d '"')
    DISTRO_LIKE=$(grep "^ID_LIKE=" /etc/os-release | cut -d= -f2 | tr -d '"')
    success "Distribución: $DISTRO_ID ${DISTRO_LIKE:+(like: $DISTRO_LIKE)}"

    if is_like arch || [ "$DISTRO_ID" = "arch" ] || [ "$DISTRO_ID" = "cachyos" ] || [ "$DISTRO_ID" = "manjaro" ]; then
        sudo pacman -Sy --needed --noconfirm \
            base-devel git curl \
            webkit2gtk-4.1 gtk3 openssl \
            appmenu-gtk-module libappindicator-gtk3 librsvg xdotool \
            ffmpeg mpv yt-dlp samba fuse2 \
            || die "Falló pacman."

    elif is_like debian || is_like ubuntu || [ "$DISTRO_ID" = "ubuntu" ] || [ "$DISTRO_ID" = "debian" ] || [ "$DISTRO_ID" = "linuxmint" ]; then
        sudo apt-get update -qq || die "Falló apt-get update."
        sudo apt-get install -y \
            build-essential git curl \
            libwebkit2gtk-4.1-dev libssl-dev libgtk-3-dev \
            libayatana-appindicator3-dev librsvg2-dev libxdo-dev patchelf \
            ffmpeg mpv yt-dlp smbclient libfuse2 \
            || die "Falló apt."

    elif is_like fedora || is_like rhel || [ "$DISTRO_ID" = "fedora" ]; then
        sudo dnf install -y \
            @development-tools git curl \
            webkit2gtk4.1-devel openssl-devel gtk3-devel \
            libappindicator-gtk3-devel librsvg2-devel libxdo-devel \
            ffmpeg mpv yt-dlp samba-client fuse \
            || die "Falló dnf."

    elif is_like opensuse || is_like suse || [ "$DISTRO_ID" = "opensuse-tumbleweed" ]; then
        sudo zypper install -y \
            gcc gcc-c++ make git curl \
            webkit2gtk3-soup2-devel libopenssl-devel gtk3-devel \
            libappindicator3-1 librsvg-devel \
            ffmpeg mpv yt-dlp samba-client fuse \
            || die "Falló zypper."
    else
        die "Distribución '$DISTRO_ID' no soportada."
    fi

    success "Dependencias instaladas."
}

install_rust() {
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
        rustup update stable || warn "No se pudo actualizar Rust."
    fi
}

install_node() {
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
                | bash || die "Falló la instalación de nvm."
        fi
        # shellcheck source=/dev/null
        . "$NVM_DIR/nvm.sh"
        nvm install 20 || die "Falló la instalación de Node.js."
        nvm use 20
        nvm alias default 20
        success "Node.js $(node --version) instalado."
    fi
}

build_and_install() {
    # Repositorio
    echo ""
    info "Preparando repositorio..."

    if [ -d "$APP_DIR/.git" ]; then
        info "Descargando última versión..."
        git -C "$APP_DIR" fetch origin \
            && git -C "$APP_DIR" reset --hard origin/main \
            || die "Falló la actualización del repositorio."
    else
        git clone "$REPO" "$APP_DIR" || die "Falló la clonación del repositorio."
    fi

    cd "$APP_DIR" || die "No se puede acceder a $APP_DIR."

    # Dependencias npm
    info "Instalando dependencias npm..."
    npm install || die "Falló npm install."

    # tauri-cli
    export PATH="$HOME/.cargo/bin:$PATH"
    if ! command -v cargo-tauri &>/dev/null; then
        info "Instalando tauri-cli..."
        cargo install tauri-cli --version "^2" --locked \
            || die "Falló la instalación de tauri-cli."
    fi

    # Compilar
    echo ""
    info "Compilando (esto puede tardar varios minutos)..."
    cargo tauri build --bundles deb,appimage \
        || cargo tauri build --bundles deb \
        || die "Falló la compilación."

    success "Compilación completada."

    # Copiar binario
    echo ""
    info "Instalando binario..."

    BINARY=$(find "$APP_DIR/src-tauri/target/release" -maxdepth 1 -type f -executable \
        ! -name "*.d" ! -name "*.rlib" 2>/dev/null | head -1)

    if [ -z "$BINARY" ]; then
        die "No se encontró el binario en src-tauri/target/release/"
    fi

    mkdir -p "$BIN_DIR"
    cp "$BINARY" "$BIN_DIR/streamdeck"
    chmod +x "$BIN_DIR/streamdeck"
    success "Binario instalado en $BIN_DIR/streamdeck"

    # Acceso directo (solo en instalación, no en update)
    if [ "$MODE" = "install" ]; then
        mkdir -p "$DESKTOP_DIR"
        cat > "$DESKTOP_DIR/streamdeck.desktop" <<DESKTOP
[Desktop Entry]
Name=StreamDeck
Comment=Tu centro de entretenimiento multimedia
Exec=$BIN_DIR/streamdeck
Icon=$APP_DIR/src/assets/logo.png
Type=Application
Categories=AudioVideo;Video;Player;
StartupNotify=true
DESKTOP
        success "Acceso directo creado."

        if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
            SHELL_RC="$HOME/.bashrc"
            [ -f "$HOME/.zshrc" ] && SHELL_RC="$HOME/.zshrc"
            echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
            warn "Añadido $BIN_DIR al PATH en $SHELL_RC — ejecuta: source $SHELL_RC"
        fi
    fi
}

# ── Main ─────────────────────────────────────────────────────

if [ "$MODE" = "update" ]; then
    export PATH="$HOME/.cargo/bin:$PATH"
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    build_and_install
else
    install_system_deps
    install_rust
    install_node
    build_and_install
fi

# ── Resultado ────────────────────────────────────────────────

echo ""
if [ "$MODE" = "update" ]; then
    echo -e "${GREEN}${BOLD}  ════════════════════════════════════════${RESET}"
    echo -e "${GREEN}${BOLD}  ✔  StreamDeck actualizado correctamente  ${RESET}"
    echo -e "${GREEN}${BOLD}  ════════════════════════════════════════${RESET}"
else
    echo -e "${GREEN}${BOLD}  ════════════════════════════════════════${RESET}"
    echo -e "${GREEN}${BOLD}  ✔  StreamDeck instalado correctamente   ${RESET}"
    echo -e "${GREEN}${BOLD}  ════════════════════════════════════════${RESET}"
    echo ""
    echo "  Ejecuta: streamdeck"
    echo "  O búscalo en el menú de aplicaciones."
fi
echo ""
