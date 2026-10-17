# Muestras del saludo de Sofía con Eleven v4 y v4 Turbo, contra v3 (17/10/2026). Ver docs/sofia/handoff.md, punto 14.
# Uso: set -a; . ./.env.local; set +a; python3 -I scripts/sofia-voz/generar-v4.py <carpeta-de-salida>
# Genera <variante>-<nombre>.mp3 y muestra la latencia. También prueba si v4 respeta voice_settings.speed (v3 lo ignora).
import json, os, sys, time, urllib.request, urllib.error
KEY = os.environ["ELEVENLABS_API_KEY"]; OUT = sys.argv[1]
VOZ = "h60rOzgfLmYsntfqgGu2"  # «Sofía», la que eligió JS
NOMBRES = ["Jorge", "Rocío", None]
def slug(n): return (n or "sin-nombre").lower().replace(" ", "-").replace("í", "i")
def guion(n, tags):
    hola = f"¡Buen día, {n}! ¿Cómo estás?" if n else "¡Buen día! ¿Cómo estás?"
    texto = f"{hola} Acá Sofía, de Andamios Buenos Aires. Contame... ¿en qué te puedo ayudar?"
    return f"[warmly] {texto}" if tags else texto
VARIANTES = {  # clave: (modelo, etiquetas, estabilidad, velocidad o None)
  "v3-calida": ("eleven_v3", True, 0.5, None),
  "v4-natural": ("eleven_v4", False, 0.5, None),
  "v4-calida": ("eleven_v4", True, 0.5, None),
  "v4-calida-rapida": ("eleven_v4", True, 0.5, 1.12),
  "v4turbo-calida": ("eleven_v4_turbo", True, 0.5, None),
  "v4turbo-calida-rapida": ("eleven_v4_turbo", True, 0.5, 1.12),
}
for k, (modelo, tags, estab, vel) in VARIANTES.items():
    ts = []
    for n in NOMBRES:
        vs = {"stability": estab}
        if vel: vs["speed"] = vel
        body = {"text": guion(n, tags), "model_id": modelo, "voice_settings": vs}
        req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOZ}?output_format=mp3_44100_128", data=json.dumps(body).encode(), headers={"xi-api-key": KEY, "Content-Type": "application/json"})
        t0 = time.time()
        try:
            with urllib.request.urlopen(req, timeout=90) as r: open(f"{OUT}/{k}-{slug(n)}.mp3", "wb").write(r.read())
        except urllib.error.HTTPError as e:
            print("ERROR", k, e.code, e.read()[:300]); continue
        ts.append(time.time() - t0)
    if ts: print(k, "latencia prom %.1fs max %.1fs" % (sum(ts) / len(ts), max(ts)))
