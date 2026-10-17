# Otras voces de hombre «no tan locutor» (JS, 17/10/2026), con el saludo y la cadena de producción (estabilidad 0,2,
# ×1,25, a un metro: audio-whatsapp.py modo «uno1m»). Voces argentinas de la biblioteca de ElevenLabs que se describen
# como conversacionales, relajadas o «sin pulir» (no narrador, locutor ni publicidad). Ver docs/sofia/handoff.md, punto 14.
# Uso: set -a; . ./.env.local; set +a; python3 -I scripts/sofia-voz/otras-voces.py <D> <dir con ofidep-1.mp3> [como-lalo]
import json, os, subprocess, sys, urllib.error, urllib.request
KEY = os.environ["ELEVENLABS_API_KEY"]; D, AMB = sys.argv[1], sys.argv[2]
os.makedirs(f"{D}/crudo", exist_ok=True)
GUION = "Hola, Jorge, acá Tomás de Andamios Buenos Aires. Contame... en qué te puedo ayudar."
VOCES = {
  "tomas": "QK4xDwo9ESPHA4JNUpX3",     # la de producción, para comparar
  "agustin": "ByVRQtaK1WDOvTmP1PKO",   # Agustín - Relaxed, Warm and Approachable
  "ramiro": "MiJJKGin5bH1BLsDszL2",    # Ramiro - Rugged and Friendly («unpolished charm»)
  "lalo": "XmoCtjPCefjeLDu0eMSl",      # Lalo - Pleasant, Paternal and Relaxed («chat with friends»)
  "arturo": "AB1IS77tR10t1pvLXl5T",    # Arturo - Clear, Friendly and Relaxed
  "diego": "5da4nOCHLuswM3TyAUSo",     # Diego - Casual & Friendly
  "nikolas": "PadrefepT3XCgwEQJiux",   # Nikolas Kafka - Friendly and Clear
}
# Segunda vuelta: a JS le gustó Lalo (más grande, del norte, tranquilo) y pidió otras parecidas. La búsqueda de voces
# similares de ElevenLabs devolvió casi todas de otros países; éstas son argentinas, elegidas a mano.
COMO_LALO = {
  "lalo": "XmoCtjPCefjeLDu0eMSl",      # la elegida, para comparar
  "alejandro": "R8Gr2izsNoWFXQ4X2u44", # Alejandro Tuzzi - Casual & Natural (40 años, Mendoza y Córdoba)
  "luis": "pLGo8DgPimNCMX5RXboe",      # Luis - cordobés neutro, voseo
  "pablo": "JXKQ929SO0LLl7spbEAI",     # Pablo - Argentino, Córdoba
  "gabi": "xDZJO6bbSnscJEAbhpRF",      # Gabi B - mendocino
  "manuel": "L7pBVwjueW3IPcQt4Ej9",    # Manuel - Calm, Approachable
  "marcelo": "kq2txNbA7gDo4YxPud8y",   # Marcelo - Approachable and Serene
}
if len(sys.argv) > 3 and sys.argv[3] == "como-lalo": VOCES = COMO_LALO
for k, voz in VOCES.items():
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voz}?output_format=mp3_44100_128",
        data=json.dumps({"text": GUION, "model_id": "eleven_v4", "voice_settings": {"stability": 0.2}}).encode(),
        headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r: open(f"{D}/crudo/{k}.mp3", "wb").write(r.read())
    except urllib.error.HTTPError as e:
        print("ERROR", k, e.code, e.read()[:200]); continue
    subprocess.run([sys.executable, "-I", os.path.join(os.path.dirname(__file__), "audio-whatsapp.py"), f"{D}/crudo/{k}.mp3", AMB, D, "uno1m", f"voz-{k}"], check=True, stdout=subprocess.DEVNULL)
    print("ok", k)
