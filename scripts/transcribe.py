"""Local transcription of family interviews with Whisper (faster-whisper).

Usage (from the project root, with the Whisper virtual environment):

    python scripts/transcribe.py assets/interviews/2026-11-02-jmeno-pametnika

The folder must contain audio/cast-1.m4a, audio/cast-2.m4a, ... in recording
order. An optional prompt.txt in the same folder lists names, places and words
spoken in the interview, so the model spells them correctly. The script writes,
next to the audio folder:

    transcript.json   segments with part number, start/end in seconds within the
                      part and in the whole interview, text and word timings
    transcript.srt    subtitles on the whole-interview timeline
    transcript.txt    readable text with [h:mm:ss] marks every paragraph

Everything runs locally; audio is never uploaded. A GPU is used when available.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

# Fallback hint when the interview folder has no prompt.txt. Proper nouns of the
# family (surnames, villages, trades) in prompt.txt help the model spell them.
DEFAULT_PROMPT = "Rozhovor s pamětníkem o rodině, dětství, práci a místech, kde rodina žila."


def interview_prompt(folder):
    prompt_file = folder / "prompt.txt"
    if prompt_file.is_file():
        return " ".join(prompt_file.read_text(encoding="utf-8").split())
    return DEFAULT_PROMPT


def add_cuda_dll_paths():
    """pip-installed NVIDIA wheels keep their DLLs outside PATH on Windows."""
    if os.name != "nt":
        return
    for package in ("nvidia.cublas", "nvidia.cudnn"):
        try:
            module = __import__(package, fromlist=["__path__"])
        except ImportError:
            continue
        for root in module.__path__:
            for sub in ("bin", "lib"):
                path = Path(root) / sub
                if path.is_dir():
                    os.add_dll_directory(str(path))
                    os.environ["PATH"] = f"{path}{os.pathsep}{os.environ['PATH']}"


def load_audio(path):
    """Decode with ffmpeg to 16 kHz mono float32 (avoids PyAV version issues)."""
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.int16).astype(np.float32) / 32768.0


def timestamp(seconds, comma=True):
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    millis = int(round((secs - int(secs)) * 1000))
    if millis == 1000:
        secs, millis = secs + 1, 0
    separator = "," if comma else "."
    return f"{int(hours):02d}:{int(minutes):02d}:{int(secs):02d}{separator}{millis:03d}"


def main(folder):
    folder = Path(folder)
    parts = sorted((folder / "audio").glob("cast-*.m4a"), key=lambda path: int(path.stem.split("-")[1]))
    if not parts:
        raise SystemExit(f"V {folder / 'audio'} nejsou soubory cast-N.m4a.")
    prompt = interview_prompt(folder)
    add_cuda_dll_paths()
    from faster_whisper import WhisperModel

    try:
        model = WhisperModel("large-v3", device="cuda", compute_type="float16")
        device = "cuda"
    except Exception as error:  # No usable GPU: fall back to the (slower) CPU.
        print(f"GPU nelze použít ({error}); přepisuji na procesoru.", file=sys.stderr)
        model = WhisperModel("large-v3", device="cpu", compute_type="int8")
        device = "cpu"

    segments_out = []
    offset = 0.0
    for number, path in enumerate(parts, start=1):
        audio = load_audio(path)
        duration = len(audio) / 16000
        print(f"Část {number}/{len(parts)} ({duration / 60:.1f} min) na {device}…", flush=True)
        segments, _ = model.transcribe(
            audio, language="cs", initial_prompt=prompt, vad_filter=True,
            word_timestamps=True, beam_size=5, condition_on_previous_text=True,
        )
        for segment in segments:
            segments_out.append({
                "part": number,
                "start": round(segment.start, 2),
                "end": round(segment.end, 2),
                "interviewStart": round(offset + segment.start, 2),
                "interviewEnd": round(offset + segment.end, 2),
                "text": segment.text.strip(),
                "words": [{"start": round(word.start, 2), "end": round(word.end, 2), "word": word.word} for word in (segment.words or [])],
            })
        offset += duration

    (folder / "transcript.json").write_text(json.dumps({
        "model": "faster-whisper large-v3", "language": "cs",
        "parts": [path.name for path in parts], "segments": segments_out,
    }, ensure_ascii=False, indent=1), encoding="utf-8")

    srt = []
    for index, segment in enumerate(segments_out, start=1):
        srt.append(f"{index}\n{timestamp(segment['interviewStart'])} --> {timestamp(segment['interviewEnd'])}\n{segment['text']}\n")
    (folder / "transcript.srt").write_text("\n".join(srt), encoding="utf-8")

    lines, paragraph, last_mark = [], [], -999.0
    for segment in segments_out:
        if segment["interviewStart"] - last_mark >= 60 and paragraph:
            lines.append(" ".join(paragraph))
            paragraph = []
        if not paragraph:
            last_mark = segment["interviewStart"]
            paragraph.append(f"[{timestamp(segment['interviewStart'], comma=False)[:8]} · část {segment['part']}]")
        paragraph.append(segment["text"])
    if paragraph:
        lines.append(" ".join(paragraph))
    (folder / "transcript.txt").write_text("\n\n".join(lines) + "\n", encoding="utf-8")
    print(f"Hotovo: {len(segments_out)} úseků, {offset / 3600:.2f} h.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("Použití: python scripts/transcribe.py assets/interviews/<id-rozhovoru>")
    main(sys.argv[1])
