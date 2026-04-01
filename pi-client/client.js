// client.js
const WebSocket = require('ws')
const { spawn } = require('child_process')
require('dotenv').config()

const SERVER_IP      = process.env.SERVER_IP      || '127.0.0.1'
const DHT11_PIN      = parseInt(process.env.DHT11_PIN      || '4')
const SW420_PIN      = parseInt(process.env.SW420_PIN      || '27')
const TEMP_INTERVAL  = parseInt(process.env.TEMP_INTERVAL  || '30000')

// ─── Impact detection tuning ────────────────────────────────────────────────
const IMPACT_WINDOW_MS   = 150
const IMPACT_THRESHOLD   = 5
const IMPACT_COOLDOWN_MS = 6000

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
let isSpeaking = false   

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripEmotionTag(text) {
    return text.replace(/\[EMOTION:[^\]]*\]/gi, '').trim()
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
        if (level !== 1) return

        const now = Date.now()
        if (now - lastImpactAt < IMPACT_COOLDOWN_MS) return

        triggerTimes.push(now)
        triggerTimes = triggerTimes.filter(t => now - t <= IMPACT_WINDOW_MS)

        if (triggerTimes.length >= IMPACT_THRESHOLD) {
            lastImpactAt = now
            triggerTimes = []
            handleImpact()
        }
    })

    console.log(`[impact] SW-420 impact detection started on GPIO${SW420_PIN}`)
}

function handleImpact() {
    console.log('[impact] Impact detected — interrupting speech')

    const phrase = IMPACT_PHRASES[Math.floor(Math.random() * IMPACT_PHRASES.length)]

    // Interrupt current speech
    if (currentTTSProcess) {
        currentTTSProcess.kill('SIGTERM')
        currentTTSProcess = null
    }

    const clean = stripEmotionTag(phrase)

    isSpeaking = true  

    currentTTSProcess = spawn('/home/james/Desktop/SmartDollJS/pi-client/venv/bin/python', ['tts.py', clean])

    currentTTSProcess.stderr.on('data', d => console.warn(`[tts] ${d.toString().trim()}`))

    currentTTSProcess.on('close', () => {
        currentTTSProcess = null

        // ✅ cooldown buffer to prevent mic bleed
        setTimeout(() => {
            isSpeaking = false
            console.log('Listening...\n')
        }, 400)
    })
}

// ─── DHT11 Temperature Polling ───────────────────────────────────────────────

function startTemperaturePolling() {
    let sensor
    try {
        sensor = require('node-dht-sensor')
    } catch (e) {
        console.warn('[temp] node-dht-sensor not available — temperature disabled')
        return
    }

    function poll() {
        try {
            const result = sensor.read(11, DHT11_PIN)
            if (result.isValid) {
                const temp     = result.temperature
                const humidity = result.humidity
                console.log(`[temp] ${temp.toFixed(1)}°C  ${humidity.toFixed(0)}% RH`)

                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type:     'sensor',
                        sensor:   'dht11',
                        temp,
                        humidity
                    }))
                }
            }
        } catch (e) {
            console.warn(`[temp] Read error: ${e.message}`)
        }
    }

    poll()
    setInterval(poll, TEMP_INTERVAL)
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log('Starting voice client...')

ws = new WebSocket(`ws://${SERVER_IP}:8765`)

ws.on('open', () => {
    console.log(`Connected to ws://${SERVER_IP}:8765\n`)
    console.log('Listening...\n')

    startTemperaturePolling()
    startImpactDetection()

    const pythonScript = spawn('/home/james/Desktop/SmartDollJS/pi-client/venv/bin/python', ['speech_recognizer.py'])

    pythonScript.stdout.on('data', (data) => {
        const text = data.toString().trim()

        if (text.startsWith('TRANSCRIBED:')) {
            const transcribed = text.replace('TRANSCRIBED:', '').trim()

            if (isSpeaking) {
                console.log(`[Ignored while speaking]: ${transcribed}`)
                return
            }

            console.log(`You: ${transcribed}`)
            ws.send(transcribed)

        } else if (text.startsWith('PARTIAL:')) {
            const partial = text.replace('PARTIAL:', '').trim()

            if (!isSpeaking) {
                process.stdout.write(`\rListening: ${partial}`)
            }
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
        if (currentTTSProcess) currentTTSProcess.kill()
        pythonScript.kill()
        ws.close()
        process.exit(0)
    })
})

// ─── Incoming messages (TTS trigger) ─────────────────────────────────────────

ws.on('message', (data) => {
    const response = data.toString()
    console.log(`\n\nAssistant: ${response}\n`)

    const clean = stripEmotionTag(response)

    // Interrupt existing speech
    if (currentTTSProcess) {
        currentTTSProcess.kill('SIGTERM')
        currentTTSProcess = null
    }

    isSpeaking = true  // ✅ CRITICAL: set BEFORE spawning TTS

    currentTTSProcess = spawn('/home/james/Desktop/SmartDollJS/pi-client/venv/bin/python', ['tts.py', clean])

    currentTTSProcess.stderr.on('data', (data) => {
        console.warn(`[tts] ${data.toString().trim()}`)
    })

    currentTTSProcess.on('close', () => {
        currentTTSProcess = null

        // ✅ buffer prevents self-hearing
        setTimeout(() => {
            isSpeaking = false
            console.log('Listening...\n')
        }, 400)
    })
})

ws.on('close', () => {
    console.log('\nConnection closed')
    process.exit(0)
})

ws.on('error', (error) => {
    console.error('WebSocket error:', error.message)
})
