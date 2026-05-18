#!/usr/bin/env bash
set -e

# ─────────────────────────────────────────────────────────────
#  TheFoundry StreamDeck — Instalador para Linux
#  Compilación desde fuente
# ─────────────────────────────────────────────────────────────

REPO="https://github.com/madkyp/app_movies.git"
APP_DIR="$HOME/.local/share/streamdeck"
BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"

BOLD="\033[1m"
GREEN="\033[1;32m"
YELLOW="\033[1;33m"
RED="\033[1;31m"
BLUE="\033[1;34m"
RESET="\033[0m"

info()    { echo -e "${BLUE}▶${RESET} $*"; }
success() { echo -e "${GREEN}✔${RESET} $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET} $*"; }
error()   { echo -e "${RED}✘ Error:${RESET} $*"; exit 1; }
header()  { echo -e "\n${BOLD}$*${RESET}\n"; }

# ── Detectar distro ──────────────────────────────────────────

detect_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO_ID="${ID}"
        DISTRO_ID_LIKE="${ID_LIKE:-}"
    else
        error "No se puede detectar la distribución. /etc/os-release no encontrado."
    fi
}

is_like() {
    echo "$DISTRO_ID $DISTRO_ID_LIKE" | grep -qw "$1"
}

# ── Instalar dependencias del sistema ────────────────────────

install_deps_arch() {
    info "Instalando dependencias (pacman)..."
    sudo pacman -Sy --needed --noconfirm \
        base-devel \
        webkit2gtk-4.1 \
        gtk3 \
        openssl \
        appmenu-gtk-module \
        libappindicator-gtk3 \
        librsvg \
        xdotool \
        ffmpeg \
        mpv \
        samba \
        curl \
        git
}

install_deps_debian() {
    info "Actualizando índice de paquetes..."
    sudo apt-get update -qq

    info "Instalando dependencias (apt)..."
    sudo apt-get install -y \
        build-essential \
        curl \
        git \
        libwebkit2gtk-4.1-dev \
        libssl-dev \
        libgtk-3-dev \
        libayatana-appindicator3-dev \
        librsvg2-dev \
        libxdo-dev \
        patchelf \
        ffmpeg \
        mpv \
        smbclient
}

install_deps_fedora() {
    info "Instalando dependencias (dnf)..."
    sudo dnf install -y \
        @development-tools \
        curl \
        git \
        webkit2gtk4.1-devel \
        openssl-devel \
        gtk3-devel \
        libappindicator-gtk3-devel \
        librsvg2-devel \
        libxdo-devel \
        ffmpeg \
        mpv \
        samba-client
}

install_deps_opensuse() {
    info "Instalando dependencias (zypper)..."
    sudo zypper install -y \
        gcc \
        gcc-c++ \
        make \
        curl \
        git \
        webkit2gtk3-soup2-devel \
        libopenssl-devel \
        gtk3-devel \
        libappindicator3-1 \
        librsvg-devel \
        ffmpeg \
        mpv \
        samba-client
}

install_system_deps() {
    header "1/5  Dependencias del sistema"

    if is_like arch; then
        install_deps_arch
    elif is_like debian || is_like ubuntu; then
        install_deps_debian
    elif is_like fedora || is_like rhel; then
        install_deps_fedora
    elif is_like opensuse || is_like suse; then
        install_deps_opensuse
    else
        error "Distribución no soportada: $DISTRO_ID\nDistros compatibles: Arch, Ubuntu/Debian, Fedora, openSUSE"
    fi

    success "Dependencias del sistema instaladas."
}

# ── Instalar Rust ────────────────────────────────────────────

install_rust() {
    header "2/5  Rust"

    if command -v rustc &>/dev/null; then
        RUST_VER=$(rustc --version | awk '{print $2}')
        success "Rust ya instalado (v$RUST_VER)"
    else
        info "Instalando Rust via rustup..."
        curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
        export PATH="$HOME/.cargo/bin:$PATH"
        success "Rust instalado."
    fi

    # Asegurar que cargo está en PATH
    export PATH="$HOME/.cargo/bin:$PATH"

    # Verificar versión mínima
    RUST_VER=$(rustc --version | awk '{print $2}')
    RUST_MAJOR=$(echo "$RUST_VER" | cut -d. -f1)
    RUST_MINOR=$(echo "$RUST_VER" | cut -d. -f2)
    if [ "$RUST_MAJOR" -lt 1 ] || { [ "$RUST_MAJOR" -eq 1 ] && [ "$RUST_MINOR" -lt 77 ]; }; then
        info "Actualizando Rust a la versión más reciente..."
        rustup update stable
    fi
}

# ── Instalar Node.js ─────────────────────────────────────────

install_node() {
    header "3/5  Node.js"

    if command -v node &>/dev/null; then
        NODE_VER=$(node --version | tr -d 'v')
        NODE_MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
        if [ "$NODE_MAJOR" -ge 20 ]; then
            success "Node.js ya instalado (v$NODE_VER)"
            return
        else
            warn "Node.js v$NODE_VER es demasiado antiguo. Se instalará v20 via nvm."
        fi
    fi

    if ! command -v nvm &>/dev/null && [ ! -f "$HOME/.nvm/nvm.sh" ]; then
        info "Instalando nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    fi

    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

    info "Instalando Node.js 20 LTS..."
    nvm install 20
    nvm use 20
    nvm alias default 20
    success "Node.js $(node --version) instalado."
}

# ── Clonar y compilar ────────────────────────────────────────

build_app() {
    header "4/5  Compilación"

    if [ -d "$APP_DIR" ]; then
        info "Actualizando repositorio existente..."
        git -C "$APP_DIR" pull --ff-only
    else
        info "Clonando repositorio en $APP_DIR..."
        git clone "$REPO" "$APP_DIR"
    fi

    cd "$APP_DIR"

    info "Instalando dependencias npm..."
    npm install --prefer-offline 2>&1 | tail -5

    info "Compilando la aplicación (esto puede tardar 5-10 minutos)..."
    npm run tauri build 2>&1 | grep -E "Compiling|Finished|error|warning: unused" | tail -30

    success "Compilación completada."
}

# ── Instalar binario y acceso directo ────────────────────────

install_app() {
    header "5/5  Instalación"

    # Buscar el binario generado
    BINARY=$(find "$APP_DIR/src-tauri/target/release" -maxdepth 1 -type f -name "app" -o -name "streamdeck" 2>/dev/null | head -1)

    if [ -z "$BINARY" ]; then
        # Buscar en bundle también
        BINARY=$(find "$APP_DIR/src-tauri/target/release/bundle" -type f -executable -name "app*" 2>/dev/null | head -1)
    fi

    if [ -z "$BINARY" ]; then
        error "No se encontró el binario compilado. Revisa los errores de compilación."
    fi

    # Crear directorio bin si no existe
    mkdir -p "$BIN_DIR"

    # Copiar binario
    cp "$BINARY" "$BIN_DIR/streamdeck"
    chmod +x "$BIN_DIR/streamdeck"
    success "Binario instalado en $BIN_DIR/streamdeck"

    # Crear entrada .desktop
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
    success "Acceso directo creado en el menú de aplicaciones."

    # Añadir ~/.local/bin al PATH si no está
    SHELL_RC=""
    if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ] || [ "$SHELL" = "/usr/bin/zsh" ]; then
        SHELL_RC="$HOME/.zshrc"
    else
        SHELL_RC="$HOME/.bashrc"
    fi

    if ! echo "$PATH" | grep -q "$BIN_DIR"; then
        echo "" >> "$SHELL_RC"
        echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
        warn "Se añadió $BIN_DIR al PATH en $SHELL_RC"
        warn "Ejecuta: source $SHELL_RC  (o abre una nueva terminal)"
    fi
}

# ── Main ─────────────────────────────────────────────────────

main() {
    clear
    echo -e "${BOLD}"
    echo "  ╔══════════════════════════════════════╗"
    echo "  ║   TheFoundry StreamDeck Installer    ║"
    echo "  ╚══════════════════════════════════════╝"
    echo -e "${RESET}"

    echo "  Este script instalará StreamDeck compilando desde fuente."
    echo "  Se necesitan ~500MB de espacio y conexión a Internet."
    echo ""
    read -r -p "  ¿Continuar? [s/N] " confirm
    case "$confirm" in
        [sS]*) ;;
        *) echo "Instalación cancelada."; exit 0 ;;
    esac
    echo ""

    detect_distro
    info "Distribución detectada: $DISTRO_ID ${DISTRO_ID_LIKE:+(like: $DISTRO_ID_LIKE)}"

    install_system_deps
    install_rust
    install_node
    build_app
    install_app

    echo ""
    echo -e "${GREEN}${BOLD}════════════════════════════════════════${RESET}"
    echo -e "${GREEN}${BOLD}  ✔  StreamDeck instalado correctamente  ${RESET}"
    echo -e "${GREEN}${BOLD}════════════════════════════════════════${RESET}"
    echo ""
    echo "  Ejecuta:   streamdeck"
    echo "  O búscalo en el menú de aplicaciones de tu escritorio."
    echo ""
}

main "$@"
