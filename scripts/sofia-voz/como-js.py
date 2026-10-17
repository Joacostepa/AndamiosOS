# Tomás «como el audio de JS» (17/10/2026). JS mandó un audio suyo de referencia («Hola, Jorge, acá Joaquín de Andamios
# Buenos Aires. Contame en qué te puedo ayudar»). Comparado con el de producción: la misma velocidad (3,5 palabras/s),
# pero el de JS tiene rango dinámico natural (LRA 4,6 LU) y el de Tomás quedaba plano (1,0 LU) por la compresión. Ver
# docs/sofia/handoff.md, punto 14.
# Uso: set -a; . ./.env.local; set +a; python3 -I scripts/sofia-voz/como-js.py <D> <dir con ofidep-1.mp3> <audio de JS>
# Deja en <D>: tts-<variante>-<cadena>.mp3 (Tomás con el texto de JS) y sts-<cadena>.mp3 (la grabación de JS con la voz de Tomás).
import json, os, subprocess, sys, urllib.error, urllib.request, uuid
KEY = os.environ["ELEVENLABS_API_KEY"]; D, AMB, REF = sys.argv[1], sys.argv[2], sys.argv[3]; T = f"{D}/tmp"
os.makedirs(T, exist_ok=True)
VOZ = "QK4xDwo9ESPHA4JNUpX3"  # Tomás
def run(*a): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)
def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"xi-api-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r: return r.read()
def sts(ruta):  # speech-to-speech: la entonación y los tiempos de la grabación, con la voz de Tomás
    b = uuid.uuid4().hex; datos = open(ruta, "rb").read()
    cuerpo = (f"--{b}\r\nContent-Disposition: form-data; name=\"model_id\"\r\n\r\neleven_multilingual_sts_v2\r\n"
              f"--{b}\r\nContent-Disposition: form-data; name=\"remove_background_noise\"\r\n\r\ntrue\r\n"
              f"--{b}\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"ref.m4a\"\r\nContent-Type: audio/mp4\r\n\r\n").encode() + datos + f"\r\n--{b}--\r\n".encode()
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/speech-to-speech/{VOZ}?output_format=mp3_44100_128", data=cuerpo,
        headers={"xi-api-key": KEY, "Content-Type": f"multipart/form-data; boundary={b}"})
    with urllib.request.urlopen(req, timeout=120) as r: return r.read()
# Dos cadenas: «produccion» (la de voz.ts) y «natural» (sin el volumen automático ni la compresión fuerte: deja que la voz
# suba y baje; el fondo un poco más bajo y medio segundo más de silencio al arrancar, como cuando alguien empieza a grabar).
CADENAS = {
  "produccion": dict(vel=1.15, lead=350, fondo=-34, fin="highpass=f=130,lowpass=f=6800,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3000:t=q:w=1.2:g=3,dynaudnorm=f=120:g=11:m=12:p=0.9,acompressor=threshold=-22dB:ratio=4:attack=3:release=60:makeup=2,loudnorm=I=-16:TP=-1.5"),
  "natural": dict(vel=1.10, lead=900, fondo=-38, fin="highpass=f=130,lowpass=f=6800,equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3000:t=q:w=1.2:g=3,acompressor=threshold=-18dB:ratio=1.8:attack=10:release=150,loudnorm=I=-16:TP=-1.5:LRA=11:linear=true"),
}
def cadena(voz, nombre, c, vel=None):
    v = vel if vel is not None else c["vel"]
    fc = (f"[0:a]{'atempo=%s,' % v if v != 1 else ''}loudnorm=I=-18:TP=-2,aresample=44100,adelay={c['lead']}:all=1,apad=pad_dur=0.6,asplit[d][w];"
          f"[w][1:a]afir=dry=0:wet=1[r];[d]lowpass=f=4500[dd];[dd][r]amix=inputs=2:weights=5 5:normalize=1:duration=first[v];"
          f"[2:a]lowpass=f=1200[s];[3:a]loudnorm=I={c['fondo']}:TP=-4,aresample=44100[f];"
          f"[v][s][f]amix=inputs=3:normalize=0:duration=first,{c['fin']},aresample=16000[o]")
    ogg = f"{T}/{nombre}.ogg"
    run("-i", voz, "-f", "lavfi", "-i", "anoisesrc=d=0.6:c=pink:r=44100:a=1,volume='exp(-t*10)':eval=frame,lowpass=f=5000",
        "-f", "lavfi", "-i", "anoisesrc=d=30:c=brown:r=44100:a=0.012", "-i", f"{AMB}/ofidep-1.mp3",
        "-filter_complex", fc, "-map", "[o]", "-ac", "1", "-c:a", "libopus", "-b:a", "24k", "-application", "voip", ogg)
    run("-i", ogg, "-ar", "44100", "-b:a", "96k", f"{D}/{nombre}.mp3")
TEXTO_JS = "Hola, Jorge, acá Tomás de Andamios Buenos Aires. Contame en qué te puedo ayudar."
for k, est in (("est04", 0.4), ("est02", 0.2)):
    crudo = f"{T}/tts-{k}.mp3"
    open(crudo, "wb").write(post(f"https://api.elevenlabs.io/v1/text-to-speech/{VOZ}?output_format=mp3_44100_128",
        {"text": TEXTO_JS, "model_id": "eleven_v4", "voice_settings": {"stability": est}}))
    for c in CADENAS: cadena(crudo, f"tts-{k}-{c}", CADENAS[c])
# La grabación de JS sin el silencio del principio, convertida a la voz de Tomás (dice «Joaquín»: es para oír la forma).
recorte = f"{T}/ref.m4a"
run("-i", REF, "-af", "silenceremove=start_periods=1:start_threshold=-45dB", "-c:a", "aac", recorte)
try:  # necesita el permiso de speech-to-speech en la clave: la «Sofía saludo» no lo tiene (401 el 17/10)
    crudo = f"{T}/sts.mp3"; open(crudo, "wb").write(sts(recorte))
    for c in CADENAS: cadena(crudo, f"sts-{c}", CADENAS[c], vel=1)
except urllib.error.HTTPError as e:
    print("speech-to-speech no disponible:", e.code)
print("listo")
