const fs = require('fs')

const MEMORY_FILE = './memory/conversation_memory.json'
let sessionMemory = []

function initMemory(){
    const systemPrompt = 'System prompt'

    //we need to use roles so that the llm understands what is what
    sessionMemory = [
        { role: 'system', content: systemPrompt }
    ]
}

function loadMemory() {
    try {
        if (fs.existsSync(MEMORY_FILE)) {
            const data = fs.readFileSync(MEMORY_FILE, 'utf8')
            sessionHistory = JSON.parse(data)
            
            return {
                success: true,
                message: `Loaded ${sessionHistory.length - 1} messages from memory`
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
        
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir)
        }

        fs.writeFileSync(MEMORY_FILE, JSON.stringify(sessionMemory, null, 2))
        console.log('Memory saved')
        
        return {
            success: true,
        }
    } catch (error) {
        console.error('Error saving memory:', error.message)
        
        return {
            success: false,
        }
    }
}

function addMemory(role, content) {
    try {
        sessionMemory.push({ role, content })
        saveMemory()
        return {
            success: true,
            message: 'Memory added successfully',
        }
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
