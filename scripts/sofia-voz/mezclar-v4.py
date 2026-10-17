# Mezcla el saludo de v4 (tono normal, sin [warmly]) con un ambiente de oficina más notorio (17/10/2026). Ver docs/sofia/handoff.md, punto 14.
# Espera en <D>: crudo/<voz>-firme.mp3 (v4, estabilidad 0,85) y amb/{oficina,deposito}.mp3 (API de efectos de ElevenLabs).
# Uso: python3 -I scripts/sofia-voz/mezclar-v4.py <D>. Necesita ffmpeg. Deja <D>/mix/<voz>-<ambiente>-<nivel>.mp3.
# La voz se acelera ×1,10 (v4 ignora speed) y se lleva a -16 LUFS; el ambiente, 14 dB (medio) o 10 dB (notorio) por debajo.
import subprocess, sys, os
D = sys.argv[1]; T = f"{D}/tmp"; O = f"{D}/mix"
os.makedirs(T, exist_ok=True); os.makedirs(O, exist_ok=True)
def run(*a): subprocess.run(["ffmpeg", "-loglevel", "error", "-y", *a], check=True)
def dur(p): return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", p], capture_output=True, text=True).stdout)
VOCES = ["sofia", "tomas", "leandro"]; AMB = ["oficina", "deposito"]; NIVEL = {"medio": -30, "notorio": -26}
for a in AMB:
    for niv, lufs in NIVEL.items():
        run("-i", f"{D}/amb/{a}.mp3", "-af", f"loudnorm=I={lufs}:TP=-3:LRA=11", "-ar", "44100", "-ac", "1", f"{T}/amb-{a}-{niv}.wav")
for v in VOCES:
    vw = f"{T}/voz-{v}.wav"
    run("-i", f"{D}/crudo/{v}-firme.mp3", "-af", "atempo=1.10,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "1", vw)
    run("-i", vw, "-b:a", "128k", f"{O}/{v}-limpio.mp3")
    tot = dur(vw) + 1.3; fo = tot - 0.5
    for a in AMB:
        for niv in NIVEL:
            # El ambiente arranca medio segundo antes que la voz, como cuando alguien empieza a grabar un audio.
            fc = (f"[0:a]adelay=550:all=1,apad[v];[1:a]afade=t=in:d=0.15,afade=t=out:st={fo:.2f}:d=0.5[r];"
                  f"[v][r]amix=inputs=2:duration=shortest:normalize=0,atrim=0:{tot:.2f},highpass=f=90[o]")
            run("-i", vw, "-i", f"{T}/amb-{a}-{niv}.wav", "-filter_complex", fc, "-map", "[o]", "-b:a", "128k", f"{O}/{v}-{a}-{niv}.mp3")
print(len(os.listdir(O)), "archivos")
