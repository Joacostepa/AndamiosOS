#!/bin/bash
# Carga los datos de la tarjeta con la que el robot paga la encomienda del CPAU ($50.000) en
# robot/.env.robot, preguntando uno por uno en la terminal. El número y el código no se ven al
# escribirlos y nada queda en el historial de la terminal ni en git (.env.robot está ignorado).
#
# Correr en la Mac mini:   bash robot/cargar-tarjeta.sh
# Enter sin escribir nada deja el valor que ya estaba.
set -euo pipefail
cd "$(dirname "$0")/.."
ARCHIVO=robot/.env.robot

guardar() { # clave valor
  python3 - "$ARCHIVO" "$1" "$2" <<'PY'
import re, sys
archivo, clave, valor = sys.argv[1:4]
texto = open(archivo).read()
linea = f"{clave}={valor}"
if re.search(rf"^{clave}=.*$", texto, flags=re.M):
    texto = re.sub(rf"^{clave}=.*$", lambda _: linea, texto, flags=re.M)
else:
    texto = texto.rstrip("\n") + "\n" + linea + "\n"
open(archivo, "w").write(texto)
PY
}

pedir() { # clave, pregunta, patrón (regex), oculto (si/no), sin espacios (si/no)
  local valor
  while true; do
    if [ "$4" = "si" ]; then read -r -s -p "$2: " valor; echo; else read -r -p "$2: " valor; fi
    [ -z "$valor" ] && { echo "  (sin cambios)"; return; }
    [ "$5" = "si" ] && valor="$(printf '%s' "$valor" | tr -d ' ')"
    if printf '%s' "$valor" | grep -Eq "$3"; then guardar "$1" "$valor"; echo "  guardado"; return; fi
    echo "  No tiene el formato esperado, probá de nuevo."
  done
}

echo "Datos de la tarjeta para pagar la encomienda del CPAU (se guardan en $ARCHIVO)."
pedir CPAU_TARJETA_TITULAR     "Nombre como figura en la tarjeta"      '^.{3,30}$'            no no
pedir CPAU_TARJETA_NUMERO      "Número de la tarjeta (no se ve)"       '^[0-9]{15,16}$'       si si
pedir CPAU_TARJETA_VENCIMIENTO "Vencimiento MMAA (ej. 0829)"           '^(0[1-9]|1[0-2])[0-9]{2}$' no si
pedir CPAU_TARJETA_CODIGO      "Código de seguridad (no se ve)"        '^[0-9]{3,4}$'         si si
pedir CPAU_TARJETA_MAIL        "Mail del titular"                      '^[^@ ]+@[^@ ]+\.[^@ ]+$' no si
pedir CPAU_TARJETA_DNI         "DNI del titular (sin puntos)"          '^[0-9]{7,8}$'         no si
pedir CPAU_TARJETA_CALLE       "Calle del domicilio de la tarjeta"     '^.{2,20}$'            no no
pedir CPAU_TARJETA_NRO_PUERTA  "Número de puerta"                      '^[0-9]{1,6}$'         no si
pedir CPAU_TARJETA_NACIMIENTO  "Fecha de nacimiento DDMMAAAA"          '^[0-9]{8}$'           no si

echo
echo "Listo. Campos cargados:"
grep -E '^CPAU_TARJETA_' "$ARCHIVO" | awk -F= '{ printf "  %-26s %s\n", $1, (length($2) > 0 ? "cargado" : "VACÍO") }'
