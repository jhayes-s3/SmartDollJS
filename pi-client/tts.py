import sys
import subprocess
import tempfile
import os


def play_wav(tmp_path):
    """
    Play wav with ALSA and fallbacks.
    Optional override: AUDIO_DEVICE (e.g. 'plughw:1,0').
    """
    preferred_device = os.getenv('AUDIO_DEVICE', '').strip()
    attempts = []

    if preferred_device:
        attempts.append(['aplay', '-q', '-D', preferred_device, tmp_path])

    attempts.extend([
        ['aplay', '-q', tmp_path],                         # ALSA default
        ['aplay', '-q', '-D', 'sysdefault', tmp_path],    # System default
        ['aplay', '-q', '-D', 'default', tmp_path],       # Explicit default
        ['aplay', '-q', '-D', 'plughw:0,0', tmp_path],    # Common onboard card
        ['aplay', '-q', '-D', 'plughw:1,0', tmp_path],    # Common USB card
    ])

    errors = []
    for cmd in attempts:
        result = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        if result.returncode == 0:
            return True
        error_text = (result.stderr or '').strip()
        errors.append(f"{' '.join(cmd)} -> {error_text or 'unknown error'}")

    print('Audio playback failed on all tested devices:', file=sys.stderr)
    for err in errors:
        print(f'  - {err}', file=sys.stderr)
    print("Set AUDIO_DEVICE to your working ALSA output (example: plughw:1,0).", file=sys.stderr)
    return False

def speak_creepy_doll(text):
    """
    Creepy doll voice with advanced audio effects.
    Requires: espeak, sox, alsa-utils
    """
    try:
        # Create temporary file for audio
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
            tmp_path = tmp_file.name
        
        try:
            # Generate creepy doll voice
            espeak_cmd = [
                'espeak',
                '-v', 'en+f3',      # Female voice
                '-p', '75',          # High pitch (childlike)
                '-s', '300',         # Slow speed
                '-a', '130',         # Moderate volume
                '-g', '1',           # Pauses between words
                '--stdout',
                text
            ]
            
            # Add haunted/echoing effects with sox
            sox_cmd = [
                'sox',
                '-t', 'wav', '-',
                '-t', 'wav', tmp_path,
                'reverb', '50', '50', '100',        # Room reverb
            ]
            
            # Run espeak and pipe to sox
            espeak_process = subprocess.Popen(espeak_cmd, stdout=subprocess.PIPE)
            sox_process = subprocess.Popen(sox_cmd, stdin=espeak_process.stdout,
                                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            espeak_process.stdout.close()
            sox_process.wait()
            
            # Play the audio with robust fallback device handling
            if not play_wav(tmp_path):
                return False
            
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        
        return True
        
    except Exception as e:
        print(f"TTS error: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 tts.py <text>", file=sys.stderr)
        sys.exit(1)
    
    text_to_speak = ' '.join(sys.argv[1:])
    speak_creepy_doll(text_to_speak)
