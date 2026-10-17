# Ambientes con más ruido («que no parezca un call center», JS, 17/10/2026) mezclados con el saludo A. Ver docs/sofia/handoff.md, punto 14.
# Uso: set -a; . ./.env.local; set +a; python3 -I scripts/sofia-voz/ambientes-quilombo.py <D>
# Genera <D>/amb/<ambiente>.mp3 con la API de efectos de ElevenLabs (si ya existe, lo reusa) y el saludo A en v4 (Sofía y Tomás,
# estabilidad 0,85, ×1,10, -16 LUFS). Deja <D>/quilombo/<ambiente>-<voz>-<nivel>.mp3: ambiente a -23 LUFS (fuerte) o -20 (muy fuerte).
import json, os, subprocess, sys, urllib.request
KEY = os.environ["ELEVENLABS_API_KEY"]; D = sys.argv[1]; O = f"{D}/quilombo"; T = f"{D}/tmp"; A = f"{D}/amb"
for p in (O, T, A): os.makedirs(p, exist_ok=True)
AMBIENTES = {
  "oficina": "Phone recording in a cramped, chaotic small-business office in Buenos Aires: several people talking loudly at the same time in Spanish, someone laughing, a desk phone ringing, a chair scraping, a door closing, keyboard typing. Busy and messy, not a call center. No music.",
  "deposito": "Phone recording in a scaffolding company yard: workers shouting to each other in Spanish, steel tubes clanging as they are loaded onto a truck, a truck engine idling, a hammer hitting metal, a forklift reversing beep. Loud and busy. No music.",
  "calle": "Phone recording on the sidewalk of a busy street in Buenos Aires: a city bus passing and braking, a car horn, a motorcycle accelerating, people talking as they walk by, distant construction. No music.",
  "camioneta": "Phone recording inside a work van driving through city traffic with the window half open: engine and road noise, the turn signal clicking, wind, traffic around, a horn in the distance. No music.",
}
VOCES = {"sofia": ("h60rOzgfLmYsntfqgGu2", "Sofía"), "tomas": ("QK4xDwo9ESPHA4JNUpX3", "Tomás")}
GUION = "¡Hola Jorge, buen día! Soy {q}, de Andamios Buenos Aires. ¿En qué te ayudo?"
NIVEL = {"fuerte": -23, "muyfuerte": -20}
def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r: return r.read()
def run(*a): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)
def dur(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
for k, texto in AMBIENTES.items():
    if not os.path.exists(f"{A}/{k}.mp3"):
        open(f"{A}/{k}.mp3", "wb").write(post("https://api.elevenlabs.io/v1/sound-generation", {"text": texto, "duration_seconds": 10, "prompt_influence": 0.5}))
    for niv, lufs in NIVEL.items():
        run("-i", f"{A}/{k}.mp3", "-af", f"loudnorm=I={lufs}:TP=-2:LRA=15", "-ar", "44100", "-ac", "1", f"{T}/amb-{k}-{niv}.wav")
for v, (vid, q) in VOCES.items():
    vw = f"{T}/a-{v}.wav"
    if not os.path.exists(vw):
        open(f"{T}/a-{v}.mp3", "wb").write(post(f"https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128", {"text": GUION.format(q=q), "model_id": "eleven_v4", "voice_settings": {"stability": 0.85}}))
        run("-i", f"{T}/a-{v}.mp3", "-af", "atempo=1.10,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "1", vw)
    tot = dur(vw) + 1.3; fo = tot - 0.5
    for k in AMBIENTES:
        for niv in NIVEL:
            fc = (f"[0:a]adelay=550:all=1,apad[v];[1:a]afade=t=in:d=0.1,afade=t=out:st={fo:.2f}:d=0.5[r];"
                  f"[v][r]amix=inputs=2:duration=shortest:normalize=0,atrim=0:{tot:.2f},highpass=f=80,alimiter=limit=0.95[o]")
            run("-i", vw, "-i", f"{T}/amb-{k}-{niv}.wav", "-filter_complex", fc, "-map", "[o]", "-b:a", "128k", f"{O}/{k}-{v}-{niv}.mp3")
print(len(os.listdir(O)), "archivos")
