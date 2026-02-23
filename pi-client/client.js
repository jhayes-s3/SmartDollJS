const WebSocket = require('ws')
const { spawn } = require('child_process')
require('dotenv').config()

const SERVER_IP = process.env.SERVER_IP || '127.0.0.1'

console.log('Starting voice client...\n')

// Connect to WebSocket server
const ws = new WebSocket(`ws://${SERVER_IP}:8765`)

ws.on('open', () => {
    console.log(`Connected to server\n`)
    console.log('Listening...\n')

    // Start speech recognition
    const pythonScript = spawn('python3', ['speech_recognizer.py'])

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
        console.log(`\nSpeech recognition stopped`)
        ws.close()
    })

    process.on('SIGINT', () => {
        console.log('\n\nStopping...')
        pythonScript.kill()
        ws.close()
        process.exit(0)
    })
})

ws.on('message', async (data) => {
    const response = data.toString()
    console.log(`\n\nAssistant: ${response}\n`)

    const emotionRegex = /\[EMOTION:\w+:\d+\.?\d*\]/gi
    const stripped = response.replace(emotionRegex, '').trim()

    // Speak the response
    const tts = spawn('python3', ['tts.py', stripped])

    tts.on('close', () => {
        console.log('Listening...\n')
    })

    tts.on('error', (error) => {
        console.error('TTS error:', error.message)
    })
})

ws.on('close', () => {
    console.log('\nConnection closed')
    process.exit(0)
})

ws.on('error', (error) => {
    console.error('WebSocket error:', error.message)
})
