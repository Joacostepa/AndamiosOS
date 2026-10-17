# Genera un ambiente con la API de efectos de ElevenLabs (17/10/2026). Ver docs/sofia/handoff.md, punto 14.
# Uso: set -a; . ./.env.local; set +a; python3 -I scripts/sofia-voz/generar-ambiente.py <salida.mp3> "<descripción en inglés>" [segundos]
import json, os, sys, urllib.request
KEY = os.environ["ELEVENLABS_API_KEY"]; OUT, TEXTO = sys.argv[1], sys.argv[2]; SEG = float(sys.argv[3]) if len(sys.argv) > 3 else 10
req = urllib.request.Request("https://api.elevenlabs.io/v1/sound-generation",
    data=json.dumps({"text": TEXTO, "duration_seconds": SEG, "prompt_influence": 0.5}).encode(),
    headers={"xi-api-key": KEY, "Content-Type": "application/json"})
with urllib.request.urlopen(req, timeout=120) as r: open(OUT, "wb").write(r.read())
print("ok", OUT)
