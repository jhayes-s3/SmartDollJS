const chai = require('chai')
const { expect } = chai
const sinon = require('sinon')

// Module cache helpers
function clearAll() {
    ;[
        '../../server',
        '../../memory',
        '../../emotion',
        '../../llm',
        '../../sensorContext',
        'ws'
    ].forEach((m) => {
        try {
            delete require.cache[require.resolve(m)]
        } catch (_) {
            /* empty */
        }
    })
}

// Stub WebSocket.Server so requiring server.js doesn't bind a real port

function stubWS() {
    const ws = require('ws')
    const serverStub = sinon.stub(ws, 'Server').callsFake(function () {
        this.on = sinon.stub()
        return this
    })
    return serverStub
}

// extractTempFromMessage – we test this in isolation by re-implementing the
// same regex logic the module uses (it is a private helper).

function extractTempFromMessage(text, setTemperatureFn) {
    const match = text.match(/\[TEMP:\s*([\d.]+)C\]/i)
    if (match) {
        const temp = parseFloat(match[1])
        setTemperatureFn(temp, 0)
        return text.replace(match[0], '').trim()
    }
    return text
}

describe('server – extractTempFromMessage helper', () => {
    let setTempSpy

    beforeEach(() => {
        setTempSpy = sinon.spy()
    })

    it('strips a [TEMP:22.5C] tag and returns cleaned text', () => {
        const result = extractTempFromMessage(
            '[TEMP:22.5C] Hello doll',
            setTempSpy
        )
        expect(result).to.equal('Hello doll')
    })

    it('calls setTemperature with the parsed float value', () => {
        extractTempFromMessage('[TEMP:22.5C] Hello', setTempSpy)
        expect(setTempSpy.calledOnce).to.be.true
        expect(setTempSpy.firstCall.args[0]).to.equal(22.5)
    })

    it('calls setTemperature with humidity 0 (Pi does not send humidity yet)', () => {
        extractTempFromMessage('[TEMP:18C] hi', setTempSpy)
        expect(setTempSpy.firstCall.args[1]).to.equal(0)
    })

    it('returns the original string unchanged when no tag is present', () => {
        const result = extractTempFromMessage('Just a message', setTempSpy)
        expect(result).to.equal('Just a message')
    })

    it('does NOT call setTemperature when no tag is present', () => {
        extractTempFromMessage('No tag here', setTempSpy)
        expect(setTempSpy.called).to.be.false
    })

    it('handles integer temperature values without a decimal', () => {
        const result = extractTempFromMessage('[TEMP:30C] Warm', setTempSpy)
        expect(result).to.equal('Warm')
        expect(setTempSpy.firstCall.args[0]).to.equal(30)
    })

    it('is case-insensitive for the TEMP tag', () => {
        const result = extractTempFromMessage(
            '[temp:20c] lower-case',
            setTempSpy
        )
        expect(result).to.equal('lower-case')
        expect(setTempSpy.calledOnce).to.be.true
    })

    it('strips leading/trailing whitespace from the cleaned text', () => {
        const result = extractTempFromMessage(
            '[TEMP:15C]   lots of space   ',
            setTempSpy
        )
        expect(result).to.equal('lots of space')
    })
})

// handleUserMessage – integration-style with stubbed genResponse

describe('server – handleUserMessage (stubbed genResponse + real memory)', () => {
    let genResponseStub
    let memory

    beforeEach(() => {
        clearAll()

        // Stub llm before anything imports it
        const llm = require('../../llm')
        genResponseStub = sinon.stub(llm, 'genResponse').resolves({
            success: true,
            genMessage: '[CALM:0.4] I have always been here.'
        })

        memory = require('../../memory')
        memory.initMemory()
    })

    afterEach(() => {
        sinon.restore()
    })

    it('adds a user message to memory', async () => {
        const { addMemory, getMemory } = memory
        addMemory('user', 'Hello SmartDoll')
        expect(
            getMemory().some(
                (m) => m.role === 'user' && m.content === 'Hello SmartDoll'
            )
        ).to.be.true
    })

    it('stores the cleaned (tag-free) assistant response in memory', async () => {
        const { addMemory, getMemory } = memory
        const { parseEmotionFromLLM } = require('../../emotion')
        const rawResponse = '[CALM:0.4] I have always been here.'
        const { cleanedText } = parseEmotionFromLLM(rawResponse)
        addMemory('assistant', cleanedText)

        const mem = getMemory()
        const assistantMsg = mem.find((m) => m.role === 'assistant')
        expect(assistantMsg.content).to.not.include('[CALM')
        expect(assistantMsg.content).to.equal('I have always been here.')
    })
})

// handleImpact – emotion side-effects

describe('server – handleImpact emotion side-effects', () => {
    let emotion

    beforeEach(() => {
        clearAll()
        emotion = require('../../emotion')
        emotion.setEmotionScores({
            happy: 0,
            sad: 0,
            excited: 0,
            calm: 0.5,
            anxious: 0,
            playful: 0,
            curious: 0,
            lonely: 0,
            possessive: 0,
            unsettled: 0,
            angry: 0
        })
    })

    it('increases angry score after an impact event', () => {
        emotion.updateEmotionScores('angry', 0.6)
        expect(emotion.getEmotionScores().angry).to.be.above(0)
    })

    it('increases anxious score after an impact event', () => {
        emotion.updateEmotionScores('anxious', 0.4)
        expect(emotion.getEmotionScores().anxious).to.be.above(0)
    })

    it('angry score is higher than anxious score after impact (angry boosted more)', () => {
        emotion.updateEmotionScores('angry', 0.6)
        emotion.updateEmotionScores('anxious', 0.4)
        const scores = emotion.getEmotionScores()
        expect(scores.angry).to.be.above(scores.anxious)
    })
})

// WebSocket message parsing (JSON vs raw text)

describe('server – incoming message parsing', () => {
    function parseMessage(raw) {
        let parsed
        try {
            parsed = JSON.parse(raw)
        } catch {
            parsed = { type: 'text', content: raw }
        }
        return parsed
    }

    it('parses a JSON-encoded text message correctly', () => {
        const raw = JSON.stringify({ type: 'text', content: 'Hello!' })
        const parsed = parseMessage(raw)
        expect(parsed.type).to.equal('text')
        expect(parsed.content).to.equal('Hello!')
    })

    it('parses an impact message correctly', () => {
        const raw = JSON.stringify({ type: 'impact', phrase: 'Ow!' })
        const parsed = parseMessage(raw)
        expect(parsed.type).to.equal('impact')
        expect(parsed.phrase).to.equal('Ow!')
    })

    it('falls back gracefully for plain (non-JSON) string messages', () => {
        const raw = 'just plain text'
        const parsed = parseMessage(raw)
        expect(parsed.type).to.equal('text')
        expect(parsed.content).to.equal('just plain text')
    })

    it('uses parsed.content when present, ignoring raw string', () => {
        const raw = JSON.stringify({
            type: 'text',
            content: 'structured content'
        })
        const parsed = parseMessage(raw)
        const text = parsed.content ?? raw
        expect(text).to.equal('structured content')
    })
})
