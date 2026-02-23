const WebSocket = require('ws')
const axios = require('axios')

const { loadMemory, saveMemory, addMemory, getMemory } = require('./memory.js')
const { genResponse } = require('./llm.js')
const { getMemoryWithEmotion } = require('./memory')

const PORT = 8765
const LM_STUDIO_URL = 'http://localhost:1234/v1/chat/completions'

async function handleUserMessage(text) {
    // Add user message to history
    addMemory('user', text)

    // Get LLM response with full history
    // const history = getMemory()
    const history = getMemoryWithEmotion()
    const response = await genResponse(history)

    // Add llm response to history
    addMemory('assistant', response.genMessage)

    return response
}

// Create WebSocket server
const wss = new WebSocket.Server({ port: PORT })
console.log(`Server running on ws://0.0.0.0:${PORT}`)

wss.on('connection', (ws) => {
    console.log('Client connected')

    ws.on('message', async (message) => {
        const text = message.toString()
        console.log(`RECEIVED FROM PI: ${text}`)

        try {
            const response = await handleUserMessage(text)
            console.log(`LLM: ${JSON.stringify(response.genMessage)}`)
            ws.send(response.genMessage)
        } catch (error) {
            console.error('ws block error:', error.message)
            ws.send('Sorry, there was an error processing your request.')
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
