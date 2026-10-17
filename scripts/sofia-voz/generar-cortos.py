# Saludos más cortos en Eleven v4, con Sofía y Tomás, tono normal (17/10/2026). Ver docs/sofia/handoff.md, punto 14.
# Uso: set -a; . ./.env.local; set +a; python3 -I scripts/sofia-voz/generar-cortos.py <D> [guiones, p. ej. efgh] [voces, p. ej. tomas]
# Espera <D>/amb/oficina.mp3 (o copiar scripts/sofia-voz/amb-v4-oficina.mp3). Deja <D>/cortos/<guion>-<voz>-{limpio,oficina}.mp3.
# Igual que mezclar-v4.py: voz ×1,10 a -16 LUFS, oficina a -26 LUFS (el nivel «notorio»), arrancando medio segundo antes.
import json, os, subprocess, sys, urllib.request
KEY = os.environ["ELEVENLABS_API_KEY"]; D = sys.argv[1]; O = f"{D}/cortos"; T = f"{D}/tmp"
os.makedirs(O, exist_ok=True); os.makedirs(T, exist_ok=True)
VOCES = {"sofia": ("h60rOzgfLmYsntfqgGu2", "Sofía"), "tomas": ("QK4xDwo9ESPHA4JNUpX3", "Tomás")}
GUIONES = {
  "a": "¡Hola Jorge, buen día! Soy {q}, de Andamios Buenos Aires. ¿En qué te ayudo?",
  "b": "¡Buen día, Jorge! Te habla {q}, de Andamios Buenos Aires. Contame qué necesitás.",
  "c": "Hola Jorge, ¿cómo va? {q}, de Andamios Buenos Aires. Decime.",
  "d": "¡Buen día, Jorge! Acá {q}, de Andamios Buenos Aires. ¿Qué andás necesitando?",
  # Más cortos todavía (JS: «siento que el saludo es muy largo»), manteniendo la empresa.
  "e": "¡Hola Jorge! {q}, de Andamios Buenos Aires. ¿En qué te ayudo?",
  "f": "¡Buen día, Jorge! {q}, de Andamios Buenos Aires. Contame.",
  "g": "¡Hola Jorge! Soy {q}, de Andamios Buenos Aires. Contame.",
  "h": "Jorge, buen día. {q}, de Andamios Buenos Aires, ¿en qué te ayudo?",
}
if len(sys.argv) > 2: GUIONES = {k: GUIONES[k] for k in sys.argv[2]}  # p. ej. «efgh» para generar sólo esos
if len(sys.argv) > 3: VOCES = {k: VOCES[k] for k in sys.argv[3].split(",")}  # p. ej. «tomas»
def run(*a): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)
def dur(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
run("-i", f"{D}/amb/oficina.mp3", "-af", "loudnorm=I=-26:TP=-3:LRA=11", "-ar", "44100", "-ac", "1", f"{T}/amb.wav")
for g, texto in GUIONES.items():
    for v, (vid, q) in VOCES.items():
        body = {"text": texto.format(q=q), "model_id": "eleven_v4", "voice_settings": {"stability": 0.85}}
        req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128", data=json.dumps(body).encode(), headers={"xi-api-key": KEY, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=90) as r: open(f"{T}/{g}-{v}.mp3", "wb").write(r.read())
        vw = f"{T}/{g}-{v}.wav"
        run("-i", f"{T}/{g}-{v}.mp3", "-af", "atempo=1.10,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "1", vw)
        run("-i", vw, "-b:a", "128k", f"{O}/{g}-{v}-limpio.mp3")
        tot = dur(vw) + 1.3; fo = tot - 0.5
        fc = (f"[0:a]adelay=550:all=1,apad[v];[1:a]afade=t=in:d=0.15,afade=t=out:st={fo:.2f}:d=0.5[r];"
              f"[v][r]amix=inputs=2:duration=shortest:normalize=0,atrim=0:{tot:.2f},highpass=f=90[o]")
        run("-i", vw, "-i", f"{T}/amb.wav", "-filter_complex", fc, "-map", "[o]", "-b:a", "128k", f"{O}/{g}-{v}-oficina.mp3")
        print(g, v, "%.1fs" % dur(vw))
