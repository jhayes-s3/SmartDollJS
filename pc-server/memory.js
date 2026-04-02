const fs = require('fs')
const { getEmotionScores, setEmotionScores } = require('./emotion')

const MEMORY_FILE = './memory/conversation_memory.json'
let sessionMemory = []

function initMemory() {
    sessionMemory = [] // just an empty history, no system message
}

function loadMemory() {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            const data = fs.readFileSync(MEMORY_FILE, 'utf8')
            const parsedData = JSON.parse(data)

            if (Array.isArray(parsedData)) {
                // Old format — strip the system message, llm.js owns it now
                sessionMemory = parsedData.filter((m) => m.role !== 'system')
            } else if (Array.isArray(parsedData?.messages)) {
                sessionMemory = parsedData.messages.filter(
                    (m) => m.role !== 'system'
                )
                if (
                    parsedData.emotionScores &&
                    typeof parsedData.emotionScores === 'object'
                ) {
                    setEmotionScores(parsedData.emotionScores)
                }
            } else {
                throw new Error('Invalid memory file format')
            }

            return {
                success: true,
                message: `Loaded ${sessionMemory.length} messages from memory`
            }
        } else {
            initMemory()
            return {
                success: true,
                message: 'No existing memory found, starting fresh'
            }
        }
    } catch (error) {
        initMemory()
        return {
            success: false,
            message: 'Failed to load memory, initialized fresh',
            error: error.message
        }
    }
}

function saveMemory() {
    try {
        const dir = './memory'
        if (!fs.existsSync(dir)) fs.mkdirSync(dir)

        fs.writeFileSync(
            MEMORY_FILE,
            JSON.stringify(
                {
                    messages: sessionMemory,
                    emotionScores: getEmotionScores()
                },
                null,
                2
            )
        )
        console.log('STATUS: Memory saved')
        return { success: true }
    } catch (error) {
        console.error('Error saving memory:', error.message)
        return { success: false }
    }
}

function addMemory(role, content) {
    try {
        sessionMemory.push({ role, content })
        saveMemory()
        return { success: true }
    } catch (error) {
        return {
            success: false,
            message: 'Error saving memory:',
            error: error.message
        }
    }
}

function getMemory() {
    return sessionMemory
}

module.exports = {
    initMemory,
    loadMemory,
    saveMemory,
    addMemory,
    getMemory
}
