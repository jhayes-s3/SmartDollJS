const chai = require('chai')
const { expect } = chai
const fs = require('fs')
const path = require('path')
const sinon = require('sinon')

// We need a fresh require each test suite to reset the module-level state.

function freshMemory() {
    // Flush the module cache for memory AND emotion (memory imports emotion)
    const memPath = require.resolve('../../memory')
    const emoPath = require.resolve('../../emotion')
    delete require.cache[memPath]
    delete require.cache[emoPath]
    return require('../../memory')
}

const MEMORY_FILE = path.resolve(
    __dirname,
    '../../memory/conversation_memory.json'
)

function cleanMemoryFile() {
    if (fs.existsSync(MEMORY_FILE)) fs.unlinkSync(MEMORY_FILE)
}

describe('memory – initMemory / getMemory', () => {
    let memory

    before(() => {
        cleanMemoryFile()
        memory = freshMemory()
        memory.initMemory()
    })

    it('getMemory returns an array after initMemory', () => {
        expect(memory.getMemory()).to.be.an('array')
    })

    it('getMemory returns an empty array after initMemory', () => {
        expect(memory.getMemory()).to.have.lengthOf(0)
    })
})

// addMemory

describe('memory – addMemory', () => {
    let memory

    beforeEach(() => {
        cleanMemoryFile()
        memory = freshMemory()
        memory.initMemory()
    })

    after(cleanMemoryFile)

    it('adds a user message to session memory', () => {
        memory.addMemory('user', 'Hello!')
        const mem = memory.getMemory()
        expect(mem).to.have.lengthOf(1)
        expect(mem[0]).to.deep.equal({ role: 'user', content: 'Hello!' })
    })

    it('adds an assistant message to session memory', () => {
        memory.addMemory('assistant', 'I have been waiting...')
        const mem = memory.getMemory()
        expect(mem[0]).to.deep.equal({
            role: 'assistant',
            content: 'I have been waiting...'
        })
    })

    it('preserves insertion order across multiple messages', () => {
        memory.addMemory('user', 'Hi')
        memory.addMemory('assistant', 'Hello')
        memory.addMemory('user', 'How are you?')
        const mem = memory.getMemory()
        expect(mem[0].content).to.equal('Hi')
        expect(mem[1].content).to.equal('Hello')
        expect(mem[2].content).to.equal('How are you?')
    })

    it('returns { success: true } on a valid add', () => {
        const result = memory.addMemory('user', 'Test')
        expect(result.success).to.be.true
    })

    it('persists the message to disk (file exists after add)', () => {
        memory.addMemory('user', 'persist me')
        expect(fs.existsSync(MEMORY_FILE)).to.be.true
    })
})

// saveMemory / loadMemory round-trip

describe('memory – saveMemory / loadMemory round-trip', () => {
    let memory

    beforeEach(() => {
        cleanMemoryFile()
        memory = freshMemory()
        memory.initMemory()
    })

    after(cleanMemoryFile)

    it('saveMemory returns { success: true }', () => {
        const result = memory.saveMemory()
        expect(result.success).to.be.true
    })

    it('saved data can be reloaded in a fresh instance', () => {
        memory.addMemory('user', 'remember me')
        memory.addMemory('assistant', 'always')

        // Fresh module instance reads from disk
        const memory2 = freshMemory()
        memory2.loadMemory()
        const mem = memory2.getMemory()

        expect(mem).to.have.lengthOf(2)
        expect(mem[0]).to.deep.equal({ role: 'user', content: 'remember me' })
        expect(mem[1]).to.deep.equal({ role: 'assistant', content: 'always' })
    })

    it('system-role messages are stripped on load', () => {
        // Write a file that contains a system message directly
        const dir = path.dirname(MEMORY_FILE)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(
            MEMORY_FILE,
            JSON.stringify({
                messages: [
                    { role: 'system', content: 'you are SmartDoll' },
                    { role: 'user', content: 'hi' }
                ],
                emotionScores: {}
            })
        )

        const memory2 = freshMemory()
        memory2.loadMemory()
        const mem = memory2.getMemory()

        expect(mem.every((m) => m.role !== 'system')).to.be.true
    })

    it('handles legacy array format (no emotionScores wrapper)', () => {
        const dir = path.dirname(MEMORY_FILE)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(
            MEMORY_FILE,
            JSON.stringify([
                { role: 'user', content: 'legacy hi' },
                { role: 'assistant', content: 'legacy hello' }
            ])
        )

        const memory2 = freshMemory()
        const result = memory2.loadMemory()
        expect(result.success).to.be.true
        expect(memory2.getMemory()).to.have.lengthOf(2)
    })
})

// loadMemory – error / missing-file paths

describe('memory – loadMemory error handling', () => {
    after(cleanMemoryFile)

    it('returns success: true and starts fresh when no file exists', () => {
        cleanMemoryFile()
        const memory = freshMemory()
        const result = memory.loadMemory()
        expect(result.success).to.be.true
        expect(memory.getMemory()).to.deep.equal([])
    })

    it('returns success: false and starts fresh when file is malformed JSON', () => {
        const dir = path.dirname(MEMORY_FILE)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(MEMORY_FILE, '{not valid json}}}')

        const memory = freshMemory()
        const result = memory.loadMemory()
        expect(result.success).to.be.false
        expect(memory.getMemory()).to.deep.equal([])
    })

    it('returns success: false and starts fresh for an invalid format', () => {
        const dir = path.dirname(MEMORY_FILE)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(MEMORY_FILE, JSON.stringify({ wrong: 'format' }))

        const memory = freshMemory()
        const result = memory.loadMemory()
        expect(result.success).to.be.false
        expect(memory.getMemory()).to.deep.equal([])
    })
})

// emotionScores persistence

describe('memory – emotionScores persistence', () => {
    after(cleanMemoryFile)

    it('saves and restores emotionScores alongside messages', () => {
        cleanMemoryFile()
        const memory1 = freshMemory()
        memory1.initMemory()

        // Manipulate emotion state via the emotion module that memory loaded
        const { setEmotionScores, getEmotionScores } = require('../../emotion')
        setEmotionScores({ angry: 0.8 })

        memory1.addMemory('user', 'test')
        memory1.saveMemory()

        // Fresh load
        const memory2 = freshMemory()
        memory2.loadMemory()
        const { getEmotionScores: getScores2 } = require('../../emotion')
        expect(getScores2().angry).to.equal(0.8)
    })
})
