# Muestras del saludo de Sofía con Eleven v3 (17/10/2026). Ver docs/sofia/handoff.md, punto 14.
# Uso: set -a; . ./.env.local; set +a; python3 -I scripts/sofia-voz/generar-v3.py <carpeta-de-salida>
# Genera <variante>-<nombre>.mp3. Ojo: v3 ignora voice_settings.speed; la velocidad se cambia después con ffmpeg (atempo).
import json, os, sys, time, urllib.request, urllib.error
KEY = os.environ["ELEVENLABS_API_KEY"]; OUT = sys.argv[1]
NOMBRES = ["Jorge", "Juan Pablo", "Rocío", None]
def slug(n): return (n or "sin-nombre").lower().replace(" ", "-").replace("í", "i")
def guion(n, tags):
    hola = f"¡Buen día, {n}! ¿Cómo estás?" if n else "¡Buen día! ¿Cómo estás?"
    if tags: return f"[warmly] {hola} Acá Sofía, de Andamios Buenos Aires. Contame... ¿en qué te puedo ayudar?"
    return f"{hola} Acá Sofía, de Andamios Buenos Aires. Contame... ¿en qué te puedo ayudar?"
VARIANTES = {  # clave: (voz, etiquetas de tono, estabilidad v3: 0 creativa, 0.5 natural, 1 robusta)
  "sofia-natural": ("h60rOzgfLmYsntfqgGu2", False, 0.5),
  "sofia-calida": ("h60rOzgfLmYsntfqgGu2", True, 0.5),
  "sofia-suelta": ("h60rOzgfLmYsntfqgGu2", True, 0.0),
  "melanie-calida": ("bN1bDXgDIGX5lw0rtY2B", True, 0.5),
  "agustina-calida": ("TZvhlMgMw2P4gPSuD8v7", True, 0.5),
}
for k, (voz, tags, estab) in VARIANTES.items():
    ts = []
    for n in NOMBRES:
        body = {"text": guion(n, tags), "model_id": "eleven_v3", "voice_settings": {"stability": estab}}
        req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voz}?output_format=mp3_44100_128", data=json.dumps(body).encode(), headers={"xi-api-key": KEY, "Content-Type": "application/json"})
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=90) as r: open(f"{OUT}/{k}-{slug(n)}.mp3", "wb").write(r.read())
        except urllib.error.HTTPError as e:
            print("ERROR", k, e.code, e.read()[:300]); sys.exit(1)
        ts.append(time.time() - t0)
    print(k, "latencia prom %.1fs max %.1fs" % (sum(ts) / len(ts), max(ts)))
