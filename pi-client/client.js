const WebSocket = require('ws')
const { spawn } = require('child_process')
require('dotenv').config()

const SERVER_IP = process.env.SERVER_IP || '127.0.0.1'

console.log('Starting voice client...\n')

// Connect to WebSocket server
const ws = new WebSocket(`ws://${SERVER_IP}:8765`)

// NEW: Track if the doll is currently speaking (defined at module level)
let isSpeaking = false
let pythonScript = null

ws.on('open', () => {
    console.log(`Connected to server\n`)
    console.log('Listening...\n')

    // Start speech recognition
    const pythonScript = spawn('python3', ['speech_recognizer.py'])

    // Handle transcribed text from Python
    pythonScript.stdout.on('data', (data) => {
        const text = data.toString().trim()

        if (text.startsWith('TRANSCRIBED:')) {
            const transcribed = text.replace('TRANSCRIBED:', '').trim()

            // Ignore transcriptions if doll is currently speaking
            if (isSpeaking) {
                console.log(`[Ignored while speaking]: ${transcribed}`)
                return
            }

            console.log(`You: ${transcribed}`)
            ws.send(transcribed)
        } else if (text.startsWith('PARTIAL:')) {
            const partial = text.replace('PARTIAL:', '').trim()

            // Only show partial results when not speaking
            if (!isSpeaking) {
                process.stdout.write(`\rListening: ${partial}`)
            }
        }
    })

    pythonScript.stderr.on('data', (data) => {
        console.warn(`[speech] ${data.toString().trim()}`)
    })

    pythonScript.on('close', (code) => {
        console.log(`\nSpeech recognition stopped`)
        ws.close()
    })

    // Cleanup on process exit
    process.on('SIGINT', () => {
        console.log('\n\nStopping...')
        pythonScript.kill()
        ws.close()
        process.exit(0)
    })
})

ws.on('message', (data) => {
    const response = data.toString()
    console.log(`\n\nAssistant: ${response}\n`)

    const emotionRegex = /\[EMOTION:\w+:\d+\.?\d*]/gi
    const stripped = response.replace(emotionRegex, '').trim()

    isSpeaking = true
    const tts = spawn('python3', ['tts.py', stripped])

    //  When TTS finishes, re-enable speech recognition
    tts.on('close', (code) => {
        isSpeaking = false
        console.log('Listening...\n')
    })

    //  Log any TTS errors
    tts.stderr.on('data', (data) => {
        console.warn(`[TTS] ${data.toString().trim()}`)
    })
})

ws.on('close', () => {
    console.log('\nConnection closed')
    process.exit(0)
})

ws.on('error', (error) => {
    console.error('WebSocket error:', error.message)
})
