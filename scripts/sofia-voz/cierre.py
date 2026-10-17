# El cierre del saludo sonaba «robótico» (17/10/2026): Tomás decía «Contame en qué te puedo ayudar» de un tirón (0,06 s
# entre «Contame» y «en»); JS, en su audio de referencia, hace una pausa de 0,22 s. Prueba cierres con la cadena de
# producción (estabilidad 0,2, ×1,25, a un metro: audio-whatsapp.py modo «uno1m»). Ver docs/sofia/handoff.md, punto 14.
# Uso: set -a; . ./.env.local; set +a; python3 -I scripts/sofia-voz/cierre.py <D> <dir con ofidep-1.mp3>
import json, os, subprocess, sys, urllib.request
KEY = os.environ["ELEVENLABS_API_KEY"]; D, AMB = sys.argv[1], sys.argv[2]
os.makedirs(f"{D}/crudo", exist_ok=True)
INICIO = "Hola, Jorge, acá Tomás de Andamios Buenos Aires. "
CIERRES = {
  "actual": "Contame en qué te puedo ayudar.",
  "pausa": "Contame... en qué te puedo ayudar.",
  "pregunta": "Contame, ¿en qué te puedo ayudar?",
  "necesitas": "Contame qué necesitás.",
  "decime": "Decime, ¿en qué te ayudo?",
  "contame-solo": "Contame.",
}
for k, cierre in CIERRES.items():
    req = urllib.request.Request("https://api.elevenlabs.io/v1/text-to-speech/QK4xDwo9ESPHA4JNUpX3?output_format=mp3_44100_128",
        data=json.dumps({"text": INICIO + cierre, "model_id": "eleven_v4", "voice_settings": {"stability": 0.2}}).encode(),
        headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r: open(f"{D}/crudo/{k}.mp3", "wb").write(r.read())
    subprocess.run([sys.executable, "-I", os.path.join(os.path.dirname(__file__), "audio-whatsapp.py"), f"{D}/crudo/{k}.mp3", AMB, D, "uno1m", f"cierre-{k}"], check=True, stdout=subprocess.DEVNULL)
    print("ok", k)
