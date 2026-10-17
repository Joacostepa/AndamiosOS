# Hace que el saludo suene grabado con un celular en una oficina chica, sin fondo inventado (17/10/2026). Ver docs/sofia/handoff.md, punto 14.
# A JS los fondos de la API de efectos le sonaron falsos («parece un call center» y después «se nota muy falso»).
# Uso: python3 -I scripts/sofia-voz/nota-de-voz.py <D> [guiones, p. ej. efgh]. Espera <D>/cortos/<guion>-tomas-limpio.mp3 (salida de generar-cortos.py).
# Deja <D>/nota/<guion>-tomas-{cuarto,cuarto-vivo}.mp3. Necesita ffmpeg.
import os, subprocess, sys
D = sys.argv[1]; O = f"{D}/nota"; T = f"{D}/tmp"
os.makedirs(O, exist_ok=True); os.makedirs(T, exist_ok=True)
def run(*a): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)
# Respuesta de un cuarto chico: ruido que se apaga en unos 0,35 s (0,25 s en el seco). Más largo suena a baño.
for k, decae in (("seco", 22), ("vivo", 13)):
    run("-f", "lavfi", "-i", "anoisesrc=d=0.4:c=pink:r=44100:a=1", "-af", f"volume='exp(-t*{decae})':eval=frame,lowpass=f=5000", "-ac", "1", f"{T}/ir-{k}.wav")
# Micrófono de celular: corta graves y agudos, un poco de presencia y la compresión que aplica el teléfono.
CEL = "highpass=f=160,lowpass=f=7500,equalizer=f=2500:t=q:w=1:g=3,acompressor=threshold=-20dB:ratio=3:attack=5:release=80"
# Ruido de la sala muy bajo, para que los silencios no queden en cero digital.
SALA = "anoisesrc=d=8:c=brown:r=44100:a=0.004"
for g in (sys.argv[2] if len(sys.argv) > 2 else "abcd"):
    src = f"{D}/cortos/{g}-tomas-limpio.mp3"
    for k, ir, mezcla in (("cuarto", "seco", "8 2"), ("cuarto-vivo", "vivo", "7 3")):
        fc = (f"[0:a]adelay=300:all=1,apad=pad_dur=0.6[v];[v]asplit[d][w];[w][1:a]afir=dry=0:wet=1[r];"
              f"[d][r]amix=inputs=2:weights={mezcla}:normalize=1:duration=first[m];[2:a]lowpass=f=400[n];"
              f"[m][n]amix=inputs=2:normalize=0:duration=first,{CEL},loudnorm=I=-16:TP=-1.5[o]")
        run("-i", src, "-i", f"{T}/ir-{ir}.wav", "-f", "lavfi", "-i", SALA, "-filter_complex", fc, "-map", "[o]", "-ac", "1", "-b:a", "128k", f"{O}/{g}-tomas-{k}.mp3")
print(len(os.listdir(O)), "archivos")
