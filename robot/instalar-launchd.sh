#!/bin/zsh
# Deja el robot de TAD corriendo solo en esta Mac (LaunchAgent del usuario).
#
#   robot/instalar-launchd.sh               instala (o reinstala) y arranca
#   robot/instalar-launchd.sh --desinstalar para y lo saca
#
# QUÉ HACE EL AGENTE
#   - Arranca al iniciar sesión (RunAtLoad) y lo reinicia si se cae (KeepAlive), con un
#     minuto de espera entre intentos (ThrottleInterval): un .env roto no puede quedar
#     loguéandose en miBA en loop.
#   - caffeinate -is: la Mac no se duerme mientras el robot corre. Sólo evita que se
#     duerma sola; si alguien la manda a dormir o cierra sesión, el robot para y las
#     revisiones esperan (la pantalla lo muestra: "el robot no revisa TAD desde…").
#   - Log en ~/Library/Logs/andamios-robot-tad.log (fuera del repo y de Desktop).
#
# DESPUÉS DE CAMBIAR EL CÓDIGO DEL ROBOT hay que reiniciarlo, porque el proceso vivo tiene
# el código viejo cargado: volver a correr este script alcanza.
#
# macOS protege ~/Desktop: si el log dice "Operation not permitted", darle a node acceso
# (Ajustes → Privacidad y seguridad → Archivos y carpetas o Acceso total al disco →
# /opt/homebrew/bin/node).

set -euo pipefail

ETIQUETA="ar.com.andamiosbuenosaires.robot-tad"
PLIST="$HOME/Library/LaunchAgents/$ETIQUETA.plist"
LOG="$HOME/Library/Logs/andamios-robot-tad.log"
REPO="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE="$(command -v node)"
DOMINIO="gui/$(id -u)"

launchctl bootout "$DOMINIO/$ETIQUETA" 2>/dev/null || true
# bootout vuelve antes de que el agente termine de irse (el robot cierra el navegador), y un
# bootstrap en ese momento falla con "5: Input/output error". Se espera hasta 30 s.
for _ in {1..30}; do
  launchctl print "$DOMINIO/$ETIQUETA" >/dev/null 2>&1 || break
  sleep 1
done

if [[ "${1:-}" == "--desinstalar" ]]; then
  rm -f "$PLIST"
  echo "Robot de TAD desinstalado."
  exit 0
fi

for f in "$REPO/.env.local" "$REPO/robot/.env.robot" "$REPO/robot/worker-tad.mjs"; do
  [[ -f "$f" ]] || { echo "Falta $f"; exit 1; }
done

mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$ETIQUETA</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-is</string>
    <string>$NODE</string>
    <string>--env-file=.env.local</string>
    <string>--env-file=robot/.env.robot</string>
    <string>robot/worker-tad.mjs</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>60</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
EOF

plutil -lint "$PLIST" >/dev/null
launchctl bootstrap "$DOMINIO" "$PLIST"
echo "Robot de TAD instalado. Log: $LOG"
