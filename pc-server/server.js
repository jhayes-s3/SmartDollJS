const WebSocket = require('ws')
const axios = require('axios')

const { loadMemory, saveMemory, addMemory, getMemory } = require('./memory.js')
const { genResponse } = require('./llm.js')
const { getMemoryWithEmotion } = require('./memory')
const { parseEmotionFromLLM } = require('./emotion')
const { setTemperature, getTemperatureContext } = require('./sensorContext')
const { updateEmotionScores } = require('./emotion')

const PORT = 8765
const LM_STUDIO_URL = 'http://localhost:1234/v1/chat/completions'

function extractTempFromMessage(text) {
    const match = text.match(/\[TEMP:\s*([\d.]+)C\]/i)
    if (match) {
        const temp = parseFloat(match[1])
        setTemperature(temp, 0) // humidity not sent from Pi currently
        return text.replace(match[0], '').trim() // strip tag from user-visible text
    }
    return text
}

async function handleUserMessage(rawText) {
    const text = extractTempFromMessage(rawText)
    // Add user message to history
    addMemory('user', text)

    // Get LLM response with full history
    // const history = getMemory()
    const history = getMemory()
    const response = await genResponse(history)
    const { cleanedText } = parseEmotionFromLLM(response.genMessage)
    addMemory('assistant', cleanedText)

    // Add llm response to history

    return response
}

async function handleImpact(ws, staticPhrase) {
    console.log(`[impact] Received on server — phrase: "${staticPhrase}"`)

    // Log the impact into memory as a system event
    addMemory('user', '[The owner just hit or struck SmartDoll]')
    addMemory('assistant', staticPhrase)

    // Directly push emotion toward angry/anxious
    updateEmotionScores('angry', 0.6)
    updateEmotionScores('anxious', 0.4)

    // Generate a follow-up LLM response
    try {
        const history = getMemory()
        const response = await genResponse(history)
        const { cleanedText } = parseEmotionFromLLM(response.genMessage)
        addMemory('assistant', cleanedText)

        console.log(`[impact] LLM follow-up: ${response.genMessage}`)

        ws.send(
            JSON.stringify({
                type: 'text',
                content: response.genMessage,
                isImpactResponse: true // 👈 signals client to allow through ttsLock
            })
        )
    } catch (error) {
        console.error('[impact] LLM follow-up failed:', error.message)
        // Release the client lock via a fallback message
        ws.send(
            JSON.stringify({
                type: 'text',
                content: '',
                isImpactResponse: true
            })
        )
    }
}

// Create WebSocket server
const wss = new WebSocket.Server({ port: PORT })
console.log(`Server running on ws://0.0.0.0:${PORT}`)

wss.on('connection', (ws) => {
    console.log('Client connected')

    ws.on('message', async (message) => {
        const raw = message.toString()

        let parsed
        try {
            parsed = JSON.parse(raw)
        } catch {
            parsed = { type: 'text', content: raw }
        }

        if (parsed.type === 'impact') {
            await handleImpact(ws, parsed.phrase)
            return
        }

        // Normal text message
        const text = parsed.content ?? raw
        console.log(`RECEIVED FROM PI: ${text}`)

        try {
            const response = await handleUserMessage(text)
            console.log(`LLM: ${JSON.stringify(response.genMessage)}`)
            ws.send(
                JSON.stringify({ type: 'text', content: response.genMessage })
            )
        } catch (error) {
            console.error('ws block error:', error.message)
            ws.send(
                JSON.stringify({
                    type: 'text',
                    content:
                        'Sorry, there was an error processing your request.'
                })
            )
        }
    })

    ws.on('close', () => {
        console.log('Client disconnected')
    })

    ws.on('error', (error) => {
        console.error('WebSocket error:', error.message)
    })
})

wss.on('error', (error) => {
    console.error('Server error:', error.message)
})

async function startServer() {
    console.log('Starting SmartDoll server...')

    // Load persistent memory
    loadMemory()
}

startServer()
