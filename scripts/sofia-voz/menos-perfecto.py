# Tomás «menos perfecto» (17/10/2026): a JS le dijeron que la voz del saludo suena demasiado perfecta.
# Ver docs/sofia/handoff.md, punto 14. Prueba menos estabilidad (más variación en cada toma) y guiones con
# las muletillas de un audio real. Cada toma pasa por la cadena elegida (audio-whatsapp.py, modo «uno»).
# Uso: set -a; . ./.env.local; set +a; python3 -I scripts/sofia-voz/menos-perfecto.py <D> <dir con ofidep-1.mp3>
import json, os, subprocess, sys, urllib.request
KEY = os.environ["ELEVENLABS_API_KEY"]; D, AMB = sys.argv[1], sys.argv[2]
os.makedirs(f"{D}/crudo", exist_ok=True)
VOZ = "QK4xDwo9ESPHA4JNUpX3"  # Tomás
H = "Jorge, buen día. Tomás, de Andamios Buenos Aires, ¿en qué te ayudo?"
TOMAS = {  # clave: (texto, estabilidad)
  "actual": (H, 0.85),
  "est-05": (H, 0.5),
  "est-02": (H, 0.2),
  "eh": ("Eh, Jorge, buen día. Tomás, de Andamios Buenos Aires... ¿en qué te ayudo?", 0.4),
  "suelto": ("Jorge, buen día, ¿cómo va? Tomás, de Andamios Buenos Aires. Decime, ¿en qué te ayudo?", 0.4),
  "respira": ("[inhales] Jorge, buen día. Eh... Tomás, de Andamios Buenos Aires, ¿en qué te ayudo?", 0.3),
  "casual": ("[casual] Jorge, buen día. Tomás, de Andamios Buenos Aires, ¿en qué te ayudo?", 0.3),
}
for k, (texto, est) in TOMAS.items():
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOZ}?output_format=mp3_44100_128",
        data=json.dumps({"text": texto, "model_id": "eleven_v4", "voice_settings": {"stability": est}}).encode(),
        headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r: open(f"{D}/crudo/{k}.mp3", "wb").write(r.read())
    subprocess.run([sys.executable, "-I", os.path.join(os.path.dirname(__file__), "audio-whatsapp.py"), f"{D}/crudo/{k}.mp3", AMB, D, "uno", f"tomas-{k}"], check=True)
    print("ok", k)
