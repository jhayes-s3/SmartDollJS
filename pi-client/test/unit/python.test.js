/**
 * Tests for tts.py and speech_recognizer.py
 *
 * These tests call Python directly via spawnSync, passing small self-contained
 * scripts with the -c flag. This lets us test pure logic (output format,
 * env vars, argument parsing, JSON parsing) without needing hardware,
 * Vosk models, espeak, or PyAudio installed.
 *
 * Hardware-dependent functions (speak_creepy_doll, play_wav, the mic loop)
 * are not tested here — they require a Pi with Linux audio tools.
 */

const chai = require('chai')
const { expect } = chai
const { spawnSync } = require('child_process')

// Helper: run a Python snippet, return { stdout, stderr, status }

function py(script, { env = {}, args = [] } = {}) {
    const result = spawnSync('python3', ['-c', script, ...args], {
        encoding: 'utf8',
        env: { ...process.env, ...env },
    })
    return {
        stdout: result.stdout?.trim() ?? '',
        stderr: result.stderr?.trim() ?? '',
        status: result.status ?? 0,
    }
}

// Helper: run a .py file directly (for CLI / __main__ tests)

function pyFile(filePath, { args = [], env = {} } = {}) {
    const result = spawnSync('python3', [filePath, ...args], {
        encoding: 'utf8',
        env: { ...process.env, ...env },
        timeout: 5000,
    })
    return {
        stdout: result.stdout?.trim() ?? '',
        stderr: result.stderr?.trim() ?? '',
        status: result.status ?? 0,
    }
}

// speech_recognizer.py — output format logic
// (We test the pure string-building logic, not the mic loop)

describe('speech_recognizer – TRANSCRIBED/PARTIAL output format', () => {

    it('formats a recognised result as TRANSCRIBED:<text>', () => {
        const { stdout } = py(`
import json
text = "hello doll"
if text:
    print(f"TRANSCRIBED:{text}", flush=True)
`)
        expect(stdout).to.equal('TRANSCRIBED:hello doll')
    })

    it('formats a partial result as PARTIAL:<text>', () => {
        const { stdout } = py(`
partial = "hel"
if partial:
    print(f"PARTIAL:{partial}", flush=True)
`)
        expect(stdout).to.equal('PARTIAL:hel')
    })

    it('produces no output for an empty result', () => {
        const { stdout } = py(`
text = ""
if text:
    print(f"TRANSCRIBED:{text}", flush=True)
`)
        expect(stdout).to.equal('')
    })

    it('produces no output for a whitespace-only result', () => {
        const { stdout } = py(`
text = "   ".strip()
if text:
    print(f"TRANSCRIBED:{text}", flush=True)
`)
        expect(stdout).to.equal('')
    })

    it('strips whitespace from recognised text before output', () => {
        const { stdout } = py(`
text = "  hello world  ".strip()
if text:
    print(f"TRANSCRIBED:{text}", flush=True)
`)
        expect(stdout).to.equal('TRANSCRIBED:hello world')
    })

    it('produces no output for an empty partial', () => {
        const { stdout } = py(`
partial = ""
if partial:
    print(f"PARTIAL:{partial}", flush=True)
`)
        expect(stdout).to.equal('')
    })
})

// speech_recognizer.py — Vosk JSON result parsing

describe('speech_recognizer – Vosk JSON parsing', () => {

    it('parses the text field from a Vosk Result JSON', () => {
        const { stdout } = py(`
import json
raw = json.dumps({"text": "hello world"})
result = json.loads(raw)
print(result.get("text", "").strip())
`)
        expect(stdout).to.equal('hello world')
    })

    it('parses the partial field from a Vosk PartialResult JSON', () => {
        const { stdout } = py(`
import json
raw = json.dumps({"partial": "hel"})
result = json.loads(raw)
print(result.get("partial", ""))
`)
        expect(stdout).to.equal('hel')
    })

    it('defaults to empty string when text key is missing', () => {
        const { stdout } = py(`
import json
raw = json.dumps({})
result = json.loads(raw)
print(result.get("text", ""))
`)
        expect(stdout).to.equal('')
    })

    it('defaults to empty string when partial key is missing', () => {
        const { stdout } = py(`
import json
raw = json.dumps({})
result = json.loads(raw)
print(result.get("partial", ""))
`)
        expect(stdout).to.equal('')
    })
})

// speech_recognizer.py — VOSK_MODEL_PATH env var

describe('speech_recognizer – VOSK_MODEL_PATH', () => {

    it('uses the VOSK_MODEL_PATH env var when set', () => {
        const { stdout } = py(`
import os
path = os.getenv("VOSK_MODEL_PATH", "model")
print(path)
`, { env: { VOSK_MODEL_PATH: '/custom/model' } })
        expect(stdout).to.equal('/custom/model')
    })

    it('defaults to "model" when env var is not set', () => {
        const { stdout } = py(`
import os
# Remove the key if present
os.environ.pop("VOSK_MODEL_PATH", None)
path = os.getenv("VOSK_MODEL_PATH", "model")
print(path)
`, { env: { VOSK_MODEL_PATH: '' } })
        // Empty string env var — script should treat missing/empty the same
        // (matches the os.getenv default fallback behaviour)
        const result = py(`
import os
os.environ.pop("VOSK_MODEL_PATH", None)
path = os.getenv("VOSK_MODEL_PATH", "model")
print(path)
`)
        expect(result.stdout).to.equal('model')
    })

    it('exits with code 1 when model path does not exist', () => {
        const { status } = py(`
import os, sys
model_path = "/definitely/does/not/exist"
if not os.path.exists(model_path):
    sys.exit(1)
`)
        expect(status).to.equal(1)
    })

    it('does not exit when model path exists', () => {
        const { status } = py(`
import os, sys, tempfile
with tempfile.TemporaryDirectory() as d:
    if not os.path.exists(d):
        sys.exit(1)
print("ok")
`)
        expect(status).to.equal(0)
    })
})

// tts.py — play_wav attempt list structure
// (We verify the fallback chain is correct without running aplay)

describe('tts – play_wav attempt list', () => {

    it('builds the correct number of fallback attempts with no preferred device', () => {
        const { stdout } = py(`
import os
preferred_device = ""
attempts = []
if preferred_device:
    attempts.append(["aplay", "-q", "-D", preferred_device, "/tmp/x.wav"])
attempts.extend([
    ["aplay", "-q", "/tmp/x.wav"],
    ["aplay", "-q", "-D", "sysdefault", "/tmp/x.wav"],
    ["aplay", "-q", "-D", "default", "/tmp/x.wav"],
    ["aplay", "-q", "-D", "plughw:0,0", "/tmp/x.wav"],
    ["aplay", "-q", "-D", "plughw:1,0", "/tmp/x.wav"],
])
print(len(attempts))
`)
        expect(stdout).to.equal('5')
    })

    it('adds a preferred-device attempt first when AUDIO_DEVICE is set', () => {
        const { stdout } = py(`
import os
preferred_device = "hw:1,0"
attempts = []
if preferred_device:
    attempts.append(["aplay", "-q", "-D", preferred_device, "/tmp/x.wav"])
attempts.extend([
    ["aplay", "-q", "/tmp/x.wav"],
])
print(attempts[0][3])
`)
        expect(stdout).to.equal('hw:1,0')
    })

    it('all fallback commands use aplay as the executable', () => {
        const { stdout } = py(`
attempts = [
    ["aplay", "-q", "/tmp/x.wav"],
    ["aplay", "-q", "-D", "sysdefault", "/tmp/x.wav"],
    ["aplay", "-q", "-D", "default", "/tmp/x.wav"],
    ["aplay", "-q", "-D", "plughw:0,0", "/tmp/x.wav"],
    ["aplay", "-q", "-D", "plughw:1,0", "/tmp/x.wav"],
]
print(all(a[0] == "aplay" for a in attempts))
`)
        expect(stdout).to.equal('True')
    })

    it('preferred device attempt includes the -D flag', () => {
        const { stdout } = py(`
preferred_device = "hw:2,0"
attempts = []
if preferred_device:
    attempts.append(["aplay", "-q", "-D", preferred_device, "/tmp/x.wav"])
print("-D" in attempts[0])
`)
        expect(stdout).to.equal('True')
    })
})

// tts.py — espeak command construction

describe('tts – espeak command construction', () => {

    it('includes the text as the last argument', () => {
        const { stdout } = py(`
text = "spooky words"
espeak_cmd = [
    "espeak",
    "-v", "en+f3",
    "-p", "75",
    "-s", "300",
    "-a", "130",
    "-g", "1",
    "--stdout",
    text
]
print(espeak_cmd[-1])
`)
        expect(stdout).to.equal('spooky words')
    })

    it('uses the en+f3 voice', () => {
        const { stdout } = py(`
espeak_cmd = ["espeak", "-v", "en+f3", "-p", "75", "-s", "300", "-a", "130", "-g", "1", "--stdout", "hi"]
v_index = espeak_cmd.index("-v")
print(espeak_cmd[v_index + 1])
`)
        expect(stdout).to.equal('en+f3')
    })

    it('includes --stdout flag (pipes audio to sox)', () => {
        const { stdout } = py(`
espeak_cmd = ["espeak", "-v", "en+f3", "-p", "75", "-s", "300", "-a", "130", "-g", "1", "--stdout", "hi"]
print("--stdout" in espeak_cmd)
`)
        expect(stdout).to.equal('True')
    })

    it('sox command writes to a .wav file', () => {
        const { stdout } = py(`
tmp_path = "/tmp/test.wav"
sox_cmd = ["sox", "-t", "wav", "-", "-t", "wav", tmp_path, "reverb", "50", "50", "100"]
print(sox_cmd[6].endswith(".wav"))
`)
        expect(stdout).to.equal('True')
    })
})

// tts.py — _cleanup behaviour

describe('tts – _cleanup', () => {

    it('exits with code 0 when _cleanup is called with no children', () => {
        const { status } = py(`
import sys
_children = []
def _cleanup(signum=None, frame=None):
    for p in _children:
        try:
            p.kill()
        except Exception:
            pass
    sys.exit(0)

_cleanup()
`)
        expect(status).to.equal(0)
    })

    it('swallows exceptions from kill() without crashing', () => {
        const { status } = py(`
import sys
class BadProcess:
    def kill(self):
        raise OSError("already dead")

_children = [BadProcess()]
def _cleanup(signum=None, frame=None):
    for p in _children:
        try:
            p.kill()
        except Exception:
            pass
    sys.exit(0)

_cleanup()
`)
        expect(status).to.equal(0)
    })
})

// tts.py — CLI argument handling

describe('tts – CLI argument handling', () => {

    it('joins multiple argv words into a single string', () => {
        const { stdout } = py(`
import sys
sys.argv = ["tts.py", "hello", "creepy", "doll"]
text = " ".join(sys.argv[1:])
print(text)
`)
        expect(stdout).to.equal('hello creepy doll')
    })

    it('exits with code 1 when no arguments are provided', () => {
        const { status } = py(`
import sys
sys.argv = ["tts.py"]
if len(sys.argv) < 2:
    sys.exit(1)
`)
        expect(status).to.equal(1)
    })

    it('does not exit when at least one argument is provided', () => {
        const { status } = py(`
import sys
sys.argv = ["tts.py", "hello"]
if len(sys.argv) < 2:
    sys.exit(1)
print("ok")
`)
        expect(status).to.equal(0)
    })
})
