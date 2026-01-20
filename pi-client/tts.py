import sys
import subprocess
import tempfile
import os

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
                '-s', '140',         # Slow speed
                '-a', '130',         # Moderate volume
                '-g', '6',           # Pauses between words
                '--stdout',
                text
            ]
            
            # Add haunted/echoing effects with sox
            sox_cmd = [
                'sox',
                '-t', 'wav', '-',
                '-t', 'wav', tmp_path,
                'reverb', '50', '50', '100',        # Room reverb
                'echo', '0.8', '0.7', '500', '0.3', # Ghostly echo
            ]
            
            # Run espeak and pipe to sox
            espeak_process = subprocess.Popen(espeak_cmd, stdout=subprocess.PIPE)
            sox_process = subprocess.Popen(sox_cmd, stdin=espeak_process.stdout,
                                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            espeak_process.stdout.close()
            sox_process.wait()
            
            # Play the audio
            subprocess.run(['aplay', '-q', tmp_path], check=True)
            
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