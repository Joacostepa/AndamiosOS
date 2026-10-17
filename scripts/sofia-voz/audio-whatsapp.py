# Hace que el saludo suene como un audio de WhatsApp grabado con el celular, no como un micrófono de estudio (17/10/2026).
# Ver docs/sofia/handoff.md, punto 14. JS eligió el saludo H con la voz de Tomás, y después «depósito, rápido» (×1,15),
# con más fondo y la voz un poco más lejos del micrófono.
# Uso: python3 -I scripts/sofia-voz/audio-whatsapp.py <toma.mp3> <ambientes: dir con oficina.mp3 y deposito.mp3> <salida> [ronda6|lejos|ofidep|uno <nombre>|afinar|distancia|uno1m <nombre>]
# Cadena: velocidad → eco de cuarto → fondo debajo (antes del micrófono, así se ensucia junto con la voz) + siseo →
# micrófono de celular → control automático de volumen (sube el ruido en las pausas) → Opus 24 kb/s a 16 kHz, como WhatsApp.
# El .mp3 es para la página de muestras; en producción se manda el .ogg (queda en <salida>/tmp).
import os, subprocess, sys
SRC, AMB, O = sys.argv[1], sys.argv[2], sys.argv[3]; MODO = sys.argv[4] if len(sys.argv) > 4 else "lejos"; T = f"{O}/tmp"
os.makedirs(T, exist_ok=True)
def run(*a): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)
def dur(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
CEL = ("highpass=f=130,lowpass=f=6800,equalizer=f=250:t=q:w=1:g=2,equalizer=f=3000:t=q:w=1.2:g=3,"
       "dynaudnorm=f=120:g=11:m=12:p=0.9,acompressor=threshold=-22dB:ratio=4:attack=3:release=60:makeup=2")
# Distancia al micrófono: cuánto eco (seco:eco), cuánto dura el eco y cuánto agudo pierde la voz directa.
# Más lejos = más cuarto, menos agudos y sin el refuerzo de graves de tener el celular pegado a la boca.
DIST = {
  "cerca": {"mezcla": "8 2", "decae": 20, "agudos": 9000, "graves": 2},
  "media": {"mezcla": "6 4", "decae": 14, "agudos": 6000, "graves": 0},
  "lejos": {"mezcla": "5 5", "decae": 10, "agudos": 4500, "graves": -2},
  "mas-lejos": {"mezcla": "4 6", "decae": 8, "agudos": 3800, "graves": -4},
  "muy-lejos": {"mezcla": "3 7", "decae": 7, "agudos": 3200, "graves": -5},
  # 17/10, segunda vuelta: JS no notó diferencia entre «más lejos» y «muy lejos». La distancia se oye cuando el cuarto
  # pesa más que la voz directa, el eco llega con retraso (las paredes), el fondo sube en proporción (la voz baja y la
  # oficina no) y se pierden los graves de hablar pegado al teléfono. «hp» corta graves, «retraso» en ms, «fondo» en dB.
  "1m": {"mezcla": "4 6", "decae": 6, "agudos": 4000, "graves": -4, "hp": 180, "retraso": 8, "fondo": 3},
  "2m": {"mezcla": "25 75", "decae": 4.5, "agudos": 3400, "graves": -6, "hp": 240, "retraso": 14, "fondo": 6},
  "3m": {"mezcla": "15 85", "decae": 3.5, "agudos": 2800, "graves": -8, "hp": 300, "retraso": 20, "fondo": 8},
}
def armar(vel, fondo, nivel, dist, nombre):
    d = DIST[dist]
    ret = d.get("retraso", 0)
    ir = f"{T}/ir-{d['decae']}-{ret}.wav"
    if not os.path.exists(ir):
        larga = 1.2 if d["decae"] < 6 else 0.6
        run("-f", "lavfi", "-i", f"anoisesrc=d={larga}:c=pink:r=44100:a=1", "-af", f"volume='exp(-t*{d['decae']})':eval=frame,lowpass=f=5000{',adelay=%d' % ret if ret else ''}", "-ac", "1", ir)
    nivel = nivel + d.get("fondo", 0)
    vw = f"{T}/voz-{os.path.basename(SRC)}-{vel}.wav"  # por toma: si no, «uno» reusa la voz de otra
    if not os.path.exists(vw):
        run("-i", SRC, "-af", f"atempo={vel},loudnorm=I=-18:TP=-2", "-ar", "44100", "-ac", "1", vw)
    tot = dur(vw) + 0.9
    cel = CEL.replace("equalizer=f=250:t=q:w=1:g=2", f"equalizer=f=250:t=q:w=1:g={d['graves']}")
    entradas = ["-i", vw, "-i", ir, "-f", "lavfi", "-i", f"anoisesrc=d={tot:.2f}:c=brown:r=44100:a=0.012"]
    fc = (f"[0:a]adelay=350:all=1,apad=pad_dur=0.6,asplit[d][w];[w][1:a]afir=dry=0:wet=1[r];[d]lowpass=f={d['agudos']}{',highpass=f=%d' % d['hp'] if d.get('hp') else ''}[dd];"
          f"[dd][r]amix=inputs=2:weights={d['mezcla']}:normalize=1:duration=first[v];[2:a]lowpass=f=1200[s];")
    if fondo:
        entradas += ["-i", f"{AMB}/{fondo}.mp3"]
        fc += (f"[3:a]loudnorm=I={-18 + nivel}:TP=-4,aresample=44100,atrim=0:{tot:.2f}[f];"
               f"[v][s][f]amix=inputs=3:normalize=0:duration=first,{cel}[o]")
    else:
        fc += f"[v][s]amix=inputs=2:normalize=0:duration=first,{cel}[o]"
    ogg = f"{T}/{nombre}.ogg"
    run(*entradas, "-filter_complex", fc, "-map", "[o]", "-ac", "1", "-ar", "16000", "-c:a", "libopus", "-b:a", "24k", "-application", "voip", ogg)
    run("-i", ogg, "-af", "loudnorm=I=-16:TP=-1.5", "-ar", "44100", "-b:a", "96k", f"{O}/{nombre}.mp3")
if MODO == "ronda6":  # sala, oficina y depósito, a ×1,15 y ×1,22, con la voz cerca
    for vel in (1.15, 1.22):
        for fondo, nivel in ((None, 0), ("oficina", -21), ("deposito", -23)):
            armar(vel, fondo, nivel, "cerca", f"h-{fondo or 'sala'}-v{round(vel*100)}")
elif MODO == "uno":  # la cadena elegida (×1,15, ofidep-1, -16 dB, lejos) para una toma; argv[5] = nombre de salida
    armar(1.15, "ofidep-1", -16, "lejos", sys.argv[5])
elif MODO == "uno1m":  # la cadena de producción desde el 17/10 a la tarde (voz.ts): ×1,25, ofidep-1, a un metro
    armar(1.25, "ofidep-1", -16, "1m", sys.argv[5])
elif MODO == "distancia":  # ×1,25 (JS, 17/10) a 1, 2 y 3 metros del celular, y la de antes («lejos») para comparar
    for dist in ("lejos", "1m", "2m", "3m"):
        armar(1.25, "ofidep-1", -16, dist, f"tomas-v125-{dist}")
elif MODO == "afinar":  # 17/10: la toma de Tomás con el texto de JS (estabilidad 0,2), más rápida y más lejos del micrófono
    for vel in (1.20, 1.25):
        for dist in ("mas-lejos", "muy-lejos"):
            armar(vel, "ofidep-1", -16, dist, f"tomas-v{round(vel*100)}-{dist}")
elif MODO == "ofidep":  # la que eligió JS (×1,15, -16 dB, lejos) con ambientes de oficina con el depósito atrás
    # ofidep-3 = la oficina caótica adelante y el depósito detrás de una puerta (sin agudos y 5 dB más bajo).
    run("-i", f"{AMB}/oficina.mp3", "-i", f"{AMB}/deposito.mp3", "-filter_complex",
        "[1:a]lowpass=f=2500,volume=-5dB[d];[0:a][d]amix=inputs=2:normalize=0:duration=shortest[o]", "-map", "[o]", "-b:a", "128k", f"{AMB}/ofidep-3.mp3")
    for k in ("deposito", "ofidep-1", "ofidep-2", "ofidep-3"):
        armar(1.15, k, -16, "lejos", f"h-{k}-f16-lejos")
else:  # depósito ×1,15: el fondo a -19 o -16 dB de la voz, con la voz a media distancia o lejos
    for nivel in (-19, -16):
        for dist in ("media", "lejos"):
            armar(1.15, "deposito", nivel, dist, f"h-deposito-f{-nivel}-{dist}")
print("listo")
