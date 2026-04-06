const chai = require('chai')
const { expect } = chai
const sinon = require('sinon')
const EventEmitter = require('events')

// Pure-function helpers extracted for unit testing

function stripEmotionTag(text) {
    return text.replace(/\[(?:EMOTION:)?(\w+):(\d+\.?\d*)\]/gi, '').trim()
}

function extractTempFromReadOnce(sensorResult) {
    if (sensorResult && sensorResult.isValid) {
        const temp = sensorResult.temperature.toFixed(1)
        return `[TEMP: ${temp}C]`
    }
    return ''
}

// Impact burst filter — mirrors the logic inside startImpactDetection

function makeImpactCounter({ windowMs, threshold, cooldownMs }) {
    let triggerTimes = []
    let lastImpactAt = 0
    let impactFired = false

    return {
        trigger(now = Date.now()) {
            if (now - lastImpactAt < cooldownMs) return false

            triggerTimes.push(now)
            triggerTimes = triggerTimes.filter((t) => now - t <= windowMs)

            if (triggerTimes.length >= threshold) {
                lastImpactAt = now
                triggerTimes = []
                impactFired = true
                return true
            }
            return false
        },
        reset() {
            triggerTimes = []
            lastImpactAt = 0
            impactFired = false
        },
        get fired() {
            return impactFired
        }
    }
}

// stripEmotionTag

describe('client – stripEmotionTag', () => {
    it('removes a shorthand [CALM:0.5] tag', () => {
        expect(stripEmotionTag('[CALM:0.5] I have been waiting...')).to.equal(
            'I have been waiting...'
        )
    })

    it('removes the legacy [EMOTION:calm:0.5] tag', () => {
        expect(
            stripEmotionTag('[EMOTION:calm:0.5] I have been waiting...')
        ).to.equal('I have been waiting...')
    })

    it('is case-insensitive', () => {
        expect(stripEmotionTag('[angry:0.9] You hurt me...')).to.equal(
            'You hurt me...'
        )
    })

    it('returns the original string unchanged when no tag is present', () => {
        expect(stripEmotionTag('Just plain text')).to.equal('Just plain text')
    })

    it('trims surrounding whitespace after stripping', () => {
        expect(stripEmotionTag('[HAPPY:1.0]    lots of space   ')).to.equal(
            'lots of space'
        )
    })

    it('handles a tag with no trailing text', () => {
        expect(stripEmotionTag('[SAD:0.3]')).to.equal('')
    })

    it('handles integer intensity values', () => {
        expect(stripEmotionTag('[EXCITED:1] Woah!')).to.equal('Woah!')
    })
})

// readTemperatureOnce (sensor logic)

describe('client – readTemperatureOnce (sensor logic)', () => {
    it('returns a [TEMP: ...C] tag when sensor read is valid', () => {
        const result = extractTempFromReadOnce({
            isValid: true,
            temperature: 22.5
        })
        expect(result).to.equal('[TEMP: 22.5C]')
    })

    it('formats temperature to one decimal place', () => {
        const result = extractTempFromReadOnce({
            isValid: true,
            temperature: 20
        })
        expect(result).to.equal('[TEMP: 20.0C]')
    })

    it('returns empty string when sensor read is invalid', () => {
        const result = extractTempFromReadOnce({
            isValid: false,
            temperature: 0
        })
        expect(result).to.equal('')
    })

    it('returns empty string when sensor result is null', () => {
        const result = extractTempFromReadOnce(null)
        expect(result).to.equal('')
    })
})

// Impact counter (burst detection logic)

describe('client – impact burst detection', () => {
    const WINDOW = 150
    const THRESHOLD = 5
    const COOLDOWN = 6000

    let counter

    beforeEach(() => {
        counter = makeImpactCounter({
            windowMs: WINDOW,
            threshold: THRESHOLD,
            cooldownMs: COOLDOWN
        })
    })

    it('does not fire before reaching the threshold', () => {
        const now = Date.now()
        for (let i = 0; i < THRESHOLD - 1; i++) {
            expect(counter.trigger(now + i * 10)).to.be.false
        }
    })

    it('fires exactly at the threshold', () => {
        const now = Date.now()
        let fired = false
        for (let i = 0; i < THRESHOLD; i++) {
            if (counter.trigger(now + i * 10)) fired = true
        }
        expect(fired).to.be.true
    })

    it('does not fire again during the cooldown period', () => {
        const now = Date.now()
        // First burst – fires
        for (let i = 0; i < THRESHOLD; i++) counter.trigger(now + i * 10)
        // Immediate second burst – should be blocked by cooldown
        const fired = counter.trigger(now + 20)
        expect(fired).to.be.false
    })

    it('fires again after the cooldown has elapsed', () => {
        const now = Date.now()
        for (let i = 0; i < THRESHOLD; i++) counter.trigger(now + i * 10)
        // Fast-forward past cooldown
        let fired = false
        for (let i = 0; i < THRESHOLD; i++) {
            if (counter.trigger(now + COOLDOWN + 100 + i * 10)) fired = true
        }
        expect(fired).to.be.true
    })

    it('ignores triggers outside the time window', () => {
        const now = Date.now()
        // Spread triggers far apart — none should accumulate
        for (let i = 0; i < THRESHOLD; i++) {
            counter.trigger(now + i * (WINDOW + 50)) // each outside window of previous
        }
        expect(counter.fired).to.be.false
    })

    it('resets trigger list after firing', () => {
        const now = Date.now()
        for (let i = 0; i < THRESHOLD; i++) counter.trigger(now + i * 10)
        // A single trigger shortly after cooldown should not fire again
        const result = counter.trigger(now + COOLDOWN + 200)
        expect(result).to.be.false
    })
})

// Impact phrase selection

describe('client – IMPACT_PHRASES', () => {
    const IMPACT_PHRASES = [
        'Ow...',
        'That hurt...',
        'Please... be careful...',
        'I felt that...',
        "Don't do that...",
        'Ow... why...',
        'You hurt me...'
    ]

    it('selects a phrase from the list at random', () => {
        for (let i = 0; i < 20; i++) {
            const phrase =
                IMPACT_PHRASES[
                    Math.floor(Math.random() * IMPACT_PHRASES.length)
                ]
            expect(IMPACT_PHRASES).to.include(phrase)
        }
    })

    it('never selects undefined or empty string', () => {
        for (let i = 0; i < 50; i++) {
            const phrase =
                IMPACT_PHRASES[
                    Math.floor(Math.random() * IMPACT_PHRASES.length)
                ]
            expect(phrase).to.be.a('string').that.is.not.empty
        }
    })
})

// WebSocket message handling logic

describe('client – incoming WebSocket message handling', () => {
    // Mirrors the message handler logic from client.js
    function handleMessage(rawData, state) {
        let msg
        try {
            msg = JSON.parse(rawData)
        } catch {
            msg = { type: 'text', content: rawData.toString() }
        }

        if (msg.type !== 'text')
            return { action: 'ignored', reason: 'not text' }

        const isImpactResponse = msg.isImpactResponse === true

        if (state.ttsLock && !isImpactResponse) {
            return { action: 'ignored', reason: 'ttsLock' }
        }

        const clean = stripEmotionTag(msg.content)
        return { action: 'speak', clean, isImpactResponse }
    }

    it('speaks the cleaned text for a normal text message', () => {
        const result = handleMessage(
            JSON.stringify({
                type: 'text',
                content: '[CALM:0.5] I have been waiting.'
            }),
            { ttsLock: false }
        )
        expect(result.action).to.equal('speak')
        expect(result.clean).to.equal('I have been waiting.')
    })

    it('ignores non-text message types', () => {
        const result = handleMessage(
            JSON.stringify({ type: 'other', content: 'hi' }),
            { ttsLock: false }
        )
        expect(result.action).to.equal('ignored')
    })

    it('ignores normal messages when ttsLock is active', () => {
        const result = handleMessage(
            JSON.stringify({ type: 'text', content: 'Hello' }),
            { ttsLock: true }
        )
        expect(result.action).to.equal('ignored')
        expect(result.reason).to.equal('ttsLock')
    })

    it('allows impact responses through even when ttsLock is active', () => {
        const result = handleMessage(
            JSON.stringify({
                type: 'text',
                content: '[ANGRY:0.8] You woke me.',
                isImpactResponse: true
            }),
            { ttsLock: true }
        )
        expect(result.action).to.equal('speak')
        expect(result.isImpactResponse).to.be.true
    })

    it('strips emotion tag before speaking', () => {
        const result = handleMessage(
            JSON.stringify({
                type: 'text',
                content: '[POSSESSIVE:0.9] You are mine.'
            }),
            { ttsLock: false }
        )
        expect(result.clean).to.equal('You are mine.')
        expect(result.clean).to.not.include('[POSSESSIVE')
    })

    it('handles malformed JSON by treating it as plain text', () => {
        const result = handleMessage('not json at all', { ttsLock: false })
        expect(result.action).to.equal('speak')
    })
})

// Speech recogniser stdout parsing (TRANSCRIBED / PARTIAL branches)

describe('client – speech recogniser stdout parsing', () => {
    function parseLine(line, state) {
        const text = line.trim()

        if (text.startsWith('TRANSCRIBED:')) {
            const transcribed = text.replace('TRANSCRIBED:', '').trim()
            if (state.isSpeaking || state.ttsLock) {
                return { action: 'ignored', reason: 'speaking' }
            }
            return { action: 'send', text: transcribed }
        }

        if (text.startsWith('PARTIAL:')) {
            const partial = text.replace('PARTIAL:', '').trim()
            if (!state.isSpeaking && !state.ttsLock) {
                return { action: 'partial', text: partial }
            }
            return { action: 'ignored', reason: 'speaking' }
        }

        return { action: 'unknown' }
    }

    it('extracts transcribed text correctly', () => {
        const result = parseLine('TRANSCRIBED: hello doll', {
            isSpeaking: false,
            ttsLock: false
        })
        expect(result.action).to.equal('send')
        expect(result.text).to.equal('hello doll')
    })

    it('ignores TRANSCRIBED lines while speaking', () => {
        const result = parseLine('TRANSCRIBED: hello', {
            isSpeaking: true,
            ttsLock: false
        })
        expect(result.action).to.equal('ignored')
    })

    it('ignores TRANSCRIBED lines while ttsLock is active', () => {
        const result = parseLine('TRANSCRIBED: hello', {
            isSpeaking: false,
            ttsLock: true
        })
        expect(result.action).to.equal('ignored')
    })

    it('extracts partial text correctly', () => {
        const result = parseLine('PARTIAL: hel', {
            isSpeaking: false,
            ttsLock: false
        })
        expect(result.action).to.equal('partial')
        expect(result.text).to.equal('hel')
    })

    it('suppresses PARTIAL output while speaking', () => {
        const result = parseLine('PARTIAL: hel', {
            isSpeaking: true,
            ttsLock: false
        })
        expect(result.action).to.equal('ignored')
    })

    it('handles unknown stdout lines gracefully', () => {
        const result = parseLine('some random output', {
            isSpeaking: false,
            ttsLock: false
        })
        expect(result.action).to.equal('unknown')
    })

    it('trims whitespace from TRANSCRIBED output', () => {
        const result = parseLine('TRANSCRIBED:   hello world   ', {
            isSpeaking: false,
            ttsLock: false
        })
        expect(result.text).to.equal('hello world')
    })
})

// Temperature tag enrichment (injected into outgoing messages)

describe('client – outgoing message temperature enrichment', () => {
    function buildEnrichedMessage(tempTag, transcribed) {
        return `${tempTag} ${transcribed}`.trim()
    }

    it('prepends the temp tag when sensor data is available', () => {
        const result = buildEnrichedMessage('[TEMP: 22.0C]', 'hello doll')
        expect(result).to.equal('[TEMP: 22.0C] hello doll')
    })

    it('returns just the transcribed text when no temp tag is available', () => {
        const result = buildEnrichedMessage('', 'hello doll')
        expect(result).to.equal('hello doll')
    })

    it('trims correctly when temp tag is empty string', () => {
        const result = buildEnrichedMessage('', '  hello  ')
        // The trim is on the joined string, not the transcribed alone
        expect(result).to.equal('hello')
    })
})
