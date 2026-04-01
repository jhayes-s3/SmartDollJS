// client.js
const WebSocket = require('ws')
const { spawn } = require('child_process')
require('dotenv').config()

const SERVER_IP      = process.env.SERVER_IP      || '127.0.0.1'
const DHT11_PIN      = parseInt(process.env.DHT11_PIN      || '4')   // BCM pin for DHT11 data line
const SW420_PIN      = parseInt(process.env.SW420_PIN      || '27')  // BCM pin for SW-420 (matches testSW20.js)
const TEMP_INTERVAL  = parseInt(process.env.TEMP_INTERVAL  || '30000') // ms between DHT11 polls

// ─── Impact detection tuning ────────────────────────────────────────────────
// The SW-420 is very sensitive and fires constantly on small vibrations.
// We only treat a burst of IMPACT_THRESHOLD or more level=1 transitions
// within IMPACT_WINDOW_MS as a real impact, then ignore the sensor for
// IMPACT_COOLDOWN_MS afterwards.
const IMPACT_WINDOW_MS   = 150   // sliding window width (ms)
const IMPACT_THRESHOLD   = 5    // minimum triggers in window = impact
const IMPACT_COOLDOWN_MS = 6000  // lockout after an impact (ms)

// Phrases spoken immediately on impact (no LLM round-trip needed)
const IMPACT_PHRASES = [
    'Ow...',
    'That hurt...',
    'Please... be careful...',
    'I felt that...',
    "Don't do that...",
    'Ow... why...',
    'You hurt me...',
]

// ─── State ───────────────────────────────────────────────────────────────────
let ws = null
let currentTTSProcess = null

// ─── TTS helpers ─────────────────────────────────────────────────────────────

/** Strip [EMOTION:name:intensity] tags before sending text to TTS. */
function stripEmotionTag(text) {
    return text.replace(/\[EMOTION:[^\]]*\]/gi, '').trim()
}

/** Speak text via tts.py. Kills any in-progress speech first. */
function speak(text) {
    const clean = stripEmotionTag(text)
    if (!clean) return

    // Interrupt whatever is currently playing
    stopSpeech()

    currentTTSProcess = spawn('/home/james/Desktop/SmartDollJS/pi-client/venv/bin/python', ['tts.py', clean])
    currentTTSProcess.stderr.on('data', d => console.warn(`[tts] ${d.toString().trim()}`))
    currentTTSProcess.on('close', () => { currentTTSProcess = null })
}

/** Kill the current TTS subprocess if one is running. */
function stopSpeech() {
    if (currentTTSProcess) {
        currentTTSProcess.kill('SIGTERM')
        currentTTSProcess = null
    }
}

// ─── SW-420 Impact Detection ─────────────────────────────────────────────────

function startImpactDetection() {
    let Gpio
    try {
        Gpio = require('pigpio').Gpio
    } catch (e) {
        console.warn('[impact] pigpio not available — impact detection disabled')
        return
    }

    const vibration = new Gpio(SW420_PIN, {
        mode: Gpio.INPUT,
        alert: true
    })

    let triggerTimes  = []
    let lastImpactAt  = 0

    vibration.on('alert', (level) => {
        // Only count rising edges (sensor going HIGH)
        if (level !== 1) return

        const now = Date.now()

        // Still in cooldown after last impact — ignore
        if (now - lastImpactAt < IMPACT_COOLDOWN_MS) return

        // Slide the window: keep only recent triggers
        triggerTimes.push(now)
        triggerTimes = triggerTimes.filter(t => now - t <= IMPACT_WINDOW_MS)

        if (triggerTimes.length >= IMPACT_THRESHOLD) {
            // Confirmed impact burst
            lastImpactAt = now
            triggerTimes = []
            handleImpact()
        }
    })

    console.log(`[impact] SW-420 impact detection started on GPIO${SW420_PIN}`)
}

function handleImpact() {
    console.log('[impact] Impact detected — interrupting speech')

    // Immediately interrupt TTS and say an ouch phrase
    const phrase = IMPACT_PHRASES[Math.floor(Math.random() * IMPACT_PHRASES.length)]
    speak(phrase)
}

// ─── DHT11 Temperature Polling ───────────────────────────────────────────────

function startTemperaturePolling() {
    let sensor
    try {
        sensor = require('node-dht-sensor')
    } catch (e) {
        console.warn('[temp] node-dht-sensor not available — temperature disabled')
        console.warn('[temp] Install with: npm install node-dht-sensor')
        return
    }

    function poll() {
        try {
            const result = sensor.read(11, DHT11_PIN) // DHT type 11, BCM pin
            if (result.isValid) {
                const temp     = result.temperature
                const humidity = result.humidity
                console.log(`[temp] ${temp.toFixed(1)}°C  ${humidity.toFixed(0)}% RH`)

                // Forward to the PC server so it can colour the LLM prompt
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type:     'sensor',
                        sensor:   'dht11',
                        temp:     temp,
                        humidity: humidity
                    }))
                }
            } else {
                console.warn('[temp] DHT11 returned invalid reading — retrying next poll')
            }
        } catch (e) {
            console.warn(`[temp] Read error: ${e.message}`)
        }
    }

    poll() // Read immediately on startup
    setInterval(poll, TEMP_INTERVAL)
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log('Starting voice client...')

ws = new WebSocket(`ws://${SERVER_IP}:8765`)

ws.on('open', () => {
    console.log(`Connected to ws://${SERVER_IP}:8765\n`)
    console.log('Listening...\n')

    // Start hardware sensors
    startTemperaturePolling()
    startImpactDetection()

    // Start speech recognition
    const pythonScript = spawn('/home/james/Desktop/SmartDollJS/pi-client/venv/bin/python', ['speech_recognizer.py'])

    pythonScript.stdout.on('data', (data) => {
        const text = data.toString().trim()

        if (text.startsWith('TRANSCRIBED:')) {
            const transcribed = text.replace('TRANSCRIBED:', '').trim()
            console.log(`You: ${transcribed}`)
            ws.send(transcribed)
        } else if (text.startsWith('PARTIAL:')) {
            const partial = text.replace('PARTIAL:', '').trim()
            process.stdout.write(`\rListening: ${partial}`)
        }
    })

    pythonScript.stderr.on('data', (data) => {
        console.warn(`[speech] ${data.toString().trim()}`)
    })

    pythonScript.on('close', (code) => {
        console.log(`\nSpeech recognition stopped (${code})`)
        ws.close()
    })

    process.on('SIGINT', () => {
        console.log('\n\nStopping...')
        stopSpeech()
        pythonScript.kill()
        ws.close()
        process.exit(0)
    })
})

ws.on('message', (data) => {
    const response = data.toString()
    console.log(`\n\nAssistant: ${response}\n`)
    speak(response) // Speaks and strips [EMOTION:...] tag automatically
})

ws.on('close', () => {
    console.log('\nConnection closed')
    process.exit(0)
})

ws.on('error', (error) => {
    console.error('WebSocket error:', error.message)
})
