# Mezcla el ambiente de oficina (oficina-a.mp3 / oficina-b.mp3, generados con la API de efectos de ElevenLabs)
# debajo de la voz acelerada. Espera en <D>: audios6/sofia-calida-<nombre>.mp3 (salida de generar-v3.py) y
# amb/oficina-{a,b}.mp3. Uso: python3 -I scripts/sofia-voz/mezclar-ambiente.py <D>. Necesita ffmpeg (brew install ffmpeg).
# Niveles: el ambiente crudo mide unos -45 dB; se lleva a -36 (suave), -31 (medio) o -27 (notorio); la voz queda en -15.
import subprocess, sys, os
D = sys.argv[1]; T = f"{D}/tmpwav"; O = f"{D}/audios9"
os.makedirs(T, exist_ok=True); os.makedirs(O, exist_ok=True)
for f in os.listdir(O): os.remove(f"{O}/{f}")
def run(*a): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)
def dur(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
RAW = {"a": -44.9, "b": -47.2}; OBJ = {"suave": -36, "medio": -31, "notorio": -27}
for amb in RAW: run("-i", f"{D}/amb/oficina-{amb}.mp3", "-ar", "44100", "-ac", "1", f"{T}/amb-{amb}.wav")
n = 0
for vel in (110, 115, 120):
    for nom in ("jorge", "juan-pablo", "rocio", "sin-nombre"):
        vw = f"{T}/v{vel}-{nom}.wav"
        run("-i", f"{D}/audios6/sofia-calida-{nom}.mp3", "-af", f"atempo={vel/100}", "-ar", "44100", "-ac", "1", vw)
        tot = dur(vw) + 1.1; fo = tot - 0.6
        for amb in RAW:
            for niv, obj in OBJ.items():
                g = obj - RAW[amb]
                fc = (f"[0:a]adelay=450:all=1,apad[v];[1:a]volume={g:.1f}dB,afade=t=in:d=0.35,afade=t=out:st={fo:.2f}:d=0.6[r];"
                      f"[v][r]amix=inputs=2:duration=shortest:normalize=0,atrim=0:{tot:.2f}[o]")
                run("-i", vw, "-i", f"{T}/amb-{amb}.wav", "-filter_complex", fc, "-map", "[o]", "-b:a", "128k", f"{O}/{amb}-{niv}-v{vel}-{nom}.mp3")
                n += 1
print(n, "archivos")
