import sys
import subprocess
import tempfile
import os
import signal

# Track child processes for cleanup
_children = []

def _cleanup(signum=None, frame=None):
    for p in _children:
        try:
            p.kill()
        except Exception:
            pass
    sys.exit(0)

signal.signal(signal.SIGTERM, _cleanup)
signal.signal(signal.SIGINT, _cleanup)

def play_wav(tmp_path):
    preferred_device = os.getenv('AUDIO_DEVICE', '').strip()
    attempts = []

    if preferred_device:
        attempts.append(['aplay', '-q', '-D', preferred_device, tmp_path])

    attempts.extend([
        ['aplay', '-q', tmp_path],
        ['aplay', '-q', '-D', 'sysdefault', tmp_path],
        ['aplay', '-q', '-D', 'default', tmp_path],
        ['aplay', '-q', '-D', 'plughw:0,0', tmp_path],
        ['aplay', '-q', '-D', 'plughw:1,0', tmp_path],
    ])

    for cmd in attempts:
        # Use Popen so we can register and kill the process if needed
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        _children.append(proc)
        proc.wait()
        _children.remove(proc)
        if proc.returncode == 0:
            return True

    return False

def speak_creepy_doll(text):
    try:
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
            tmp_path = tmp_file.name

        try:
            espeak_cmd = [
                'espeak',
                '-v', 'en+f3',
                '-p', '75',
                '-s', '300',
                '-a', '130',
                '-g', '1',
                '--stdout',
                text
            ]

            sox_cmd = [
                'sox',
                '-t', 'wav', '-',
                '-t', 'wav', tmp_path,
                'reverb', '50', '50', '100',
            ]

            espeak_process = subprocess.Popen(espeak_cmd, stdout=subprocess.PIPE)
            sox_process = subprocess.Popen(
                sox_cmd,
                stdin=espeak_process.stdout,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )

            # Register both so _cleanup can kill them
            _children.extend([espeak_process, sox_process])

            espeak_process.stdout.close()
            sox_process.wait()

            _children.remove(sox_process)
            _children.remove(espeak_process)

            if not play_wav(tmp_path):
                return False

        finally:
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
