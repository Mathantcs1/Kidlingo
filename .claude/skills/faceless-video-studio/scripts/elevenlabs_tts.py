#!/usr/bin/env python3
"""Credit-safe ElevenLabs narration. Auth is injected by the sandbox proxy (no key needed here).
Usage: elevenlabs_tts.py --script script.txt --voice VOICE_ID --out voiceover.mp3 [--dry-run] [--force] [--speed 1.0]
Refuses to overwrite an existing mp3 unless --force. --dry-run prints characters and balance only."""
import argparse, json, os, subprocess, sys

def curl_json(url):
    r = subprocess.run(["curl", "-sS", "-m", "30", url], capture_output=True, text=True)
    return json.loads(r.stdout)

ap = argparse.ArgumentParser()
ap.add_argument("--script", required=True); ap.add_argument("--voice", required=True); ap.add_argument("--out", required=True)
ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--force", action="store_true"); ap.add_argument("--speed", type=float, default=1.0)
a = ap.parse_args()
text = open(a.script, encoding="utf-8").read()
sub = curl_json("https://api.elevenlabs.io/v1/user/subscription")
left = sub["character_limit"] - sub["character_count"]
print(f"script characters: {len(text)}  | credit left: {left} of {sub['character_limit']}")
if a.dry_run: sys.exit(0)
if os.path.exists(a.out) and not a.force: sys.exit(f"{a.out} exists; not regenerating (credit). Use --force only if the script truly changed.")
if len(text) > left: sys.exit("not enough credit")
body = json.dumps({"text": text, "model_id": "eleven_multilingual_v2",
                   "voice_settings": {"stability": 0.45, "similarity_boost": 0.75, "style": 0.35, "speed": a.speed}})
r = subprocess.run(["curl", "-sS", "-m", "240", "-X", "POST", f"https://api.elevenlabs.io/v1/text-to-speech/{a.voice}?output_format=mp3_44100_128",
                    "-H", "Content-Type: application/json", "-d", body, "-o", a.out, "-w", "%{http_code}"], capture_output=True, text=True)
print("HTTP", r.stdout, "->", a.out)
