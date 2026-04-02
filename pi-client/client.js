const WebSocket = require('ws')
const { spawn } = require('child_process')
require('dotenv').config()

const SERVER_IP  = '192.168.4.72'
const DHT11_PIN = parseInt(process.env.DHT11_PIN || '4')
const SW420_PIN = parseInt(process.env.SW420_PIN || '27')

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
let ttsLock = false   // 🔒 impact priority lock

// ─── Helpers ────────────────────────────────────────────────────────────────

function stripEmotionTag(text) {
    return text.replace(/\[EMOTION:[^\]]*\]/gi, '').trim()
}

function stopTTS() {
    if (currentTTSProcess) {
        try {
            currentTTSProcess.kill('SIGTERM') // lets Python clean up children
            console.log('STATUS: TTS Killed')
        } catch (e) {}
        currentTTSProcess = null
    }
}

// ─── Temperature (ON-DEMAND) ────────────────────────────────────────────────

function readTemperatureOnce() {
    try {
        const sensor = require('node-dht-sensor')
        const result = sensor.read(11, DHT11_PIN)

        if (result.isValid) {
            const temp = result.temperature.toFixed(1)

            return `[TEMP: ${temp}C]`
        }
    } catch (e) {
        console.warn('[temp] Read failed:', e.message)
    }

    return '' // fallback if sensor fails
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

    let triggerTimes = []
    let lastImpactAt = 0

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

    ttsLock = true
    stopTTS()

    const clean = stripEmotionTag(phrase)

    isSpeaking = true

    currentTTSProcess = spawn(
        '/home/james/Desktop/SmartDollJS/pi-client/venv/bin/python',
        ['tts.py', clean]
    )

    currentTTSProcess.on('close', () => {
        currentTTSProcess = null

        setTimeout(() => {
            isSpeaking = false
            ttsLock = false
            console.log('Listening...\n')
        }, 600)
    })
}

// ─── Main ────────────────────────────────────────────────────────────────────

console.log('Starting voice client...')

ws = new WebSocket(`ws://${SERVER_IP}:8765`)

ws.on('open', () => {
    console.log(`Connected to ws://${SERVER_IP}:8765\n`)
    console.log('Listening...\n')

    startImpactDetection()

    const pythonScript = spawn(
        '/home/james/Desktop/SmartDollJS/pi-client/venv/bin/python',
        ['speech_recognizer.py']
    )

    pythonScript.stdout.on('data', (data) => {
        const text = data.toString().trim()

        if (text.startsWith('TRANSCRIBED:')) {
            const transcribed = text.replace('TRANSCRIBED:', '').trim()

            if (isSpeaking || ttsLock) {
                console.log(`[Ignored while speaking]: ${transcribed}`)
                return
            }

            // Inject temperature HERE
            const tempTag = readTemperatureOnce()
            const enriched = `${tempTag} ${transcribed}`.trim()

            console.log(`You: ${enriched}`)
            ws.send(enriched)

        } else if (text.startsWith('PARTIAL:')) {
            const partial = text.replace('PARTIAL:', '').trim()

            if (!isSpeaking && !ttsLock) {
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
        stopTTS()
        pythonScript.kill()
        ws.close()
        process.exit(0)
    })
})

// ─── Incoming messages (TTS trigger) ─────────────────────────────────────────

ws.on('message', (data) => {
    let msg

    try {
        msg = JSON.parse(data)
    } catch {
        msg = { type: 'text', content: data.toString() }
    }

    if (msg.type !== 'text') return

    if (ttsLock) {
        console.log('[ws] Ignored due to impact priority')
        return
    }

    const response = msg.content

    console.log(`\n\nAssistant: ${response}\n`)

    const clean = stripEmotionTag(response)

    stopTTS()

    isSpeaking = true

    currentTTSProcess = spawn(
        '/home/james/Desktop/SmartDollJS/pi-client/venv/bin/python',
        ['tts.py', clean]
    )

    currentTTSProcess.on('close', () => {
        currentTTSProcess = null

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
