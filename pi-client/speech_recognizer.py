import os
import sys
import json
import pyaudio
from vosk import Model, KaldiRecognizer

RATE = 16000
CHUNK = 4096

# Get model path from environment or use default
MODEL_PATH = os.getenv("VOSK_MODEL_PATH", "model")

if not os.path.exists(MODEL_PATH):
    print(f"Error: Model not found at '{MODEL_PATH}'", file=sys.stderr)
    sys.exit(1)

# Load model
model = Model(MODEL_PATH)
recognizer = KaldiRecognizer(model, RATE)

# Setup microphone
p = pyaudio.PyAudio()
stream = p.open(
    format=pyaudio.paInt16,
    channels=1,
    rate=RATE,
    input=True,
    frames_per_buffer=CHUNK
)
stream.start_stream()

print("Speech recognition ready", file=sys.stderr)

try:
    while True:
        data = stream.read(CHUNK, exception_on_overflow=False)
        
        if recognizer.AcceptWaveform(data):
            result = json.loads(recognizer.Result())
            text = result.get('text', '').strip()
            
            if text:
                # Send transcribed text to Node.js
                print(f"TRANSCRIBED:{text}", flush=True)
        else:
            partial = json.loads(recognizer.PartialResult())
            partial_text = partial.get('partial', '')
            
            if partial_text:
                # Send partial results to Node.js
                print(f"PARTIAL:{partial_text}", flush=True)

except KeyboardInterrupt:
    pass
finally:
    stream.stop_stream()
    stream.close()
    p.terminate()