const chai = require('chai')
const { expect } = chai
const {
    parseEmotionFromLLM,
    getEmotionScores,
    setEmotionScores,
    updateEmotionScores,
    getEmotionInstructions
} = require('../../emotion')

const DEFAULT_SCORES = {
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
}

function resetScores() {
    setEmotionScores({ ...DEFAULT_SCORES })
}

describe('parseEmotionFromLLM', () => {
    beforeEach(resetScores)

    //  make sure that it can parse multiple formats as the llm sometimes forgets

    it('parses [CALM:0.5] shorthand format', () => {
        const result = parseEmotionFromLLM('[CALM:0.5] I have been waiting...')
        expect(result.found).to.be.true
        expect(result.emotion).to.equal('calm')
        expect(result.intensity).to.equal(0.5)
        expect(result.cleanedText).to.equal('I have been waiting...')
    })

    it('parses legacy [EMOTION:calm:0.5] format', () => {
        const result = parseEmotionFromLLM(
            '[EMOTION:calm:0.5] I have been waiting...'
        )
        expect(result.found).to.be.true
        expect(result.emotion).to.equal('calm')
        expect(result.intensity).to.equal(0.5)
    })

    it('is case-insensitive for emotion name', () => {
        const result = parseEmotionFromLLM('[happy:0.9] Hello!')
        expect(result.found).to.be.true
        expect(result.emotion).to.equal('happy')
    })

    it('parses integer intensity (no decimal point)', () => {
        const result = parseEmotionFromLLM('[SAD:1] Goodbye...')
        expect(result.found).to.be.true
        expect(result.intensity).to.equal(1)
    })

    // make sure it cleans text correctly

    it('strips the tag from cleanedText', () => {
        const result = parseEmotionFromLLM('[ANGRY:0.8] You hurt me...')
        expect(result.cleanedText).to.equal('You hurt me...')
    })

    it('trims whitespace from cleanedText', () => {
        const result = parseEmotionFromLLM('[CALM:0.3]   lots of spaces   ')
        expect(result.cleanedText).to.equal('lots of spaces')
    })

    //  not-found cases

    it('returns found: false when no tag is present', () => {
        const result = parseEmotionFromLLM('I have been waiting...')
        expect(result.found).to.be.false
        expect(result.cleanedText).to.equal('I have been waiting...')
    })

    it('returns found: false for an unrecognised emotion', () => {
        const result = parseEmotionFromLLM('[CONFUSED:0.5] Hmm...')
        expect(result.found).to.be.false
    })

    it('still returns cleanedText when emotion is unrecognised', () => {
        const result = parseEmotionFromLLM('[CONFUSED:0.5] Hmm...')
        // tag is NOT stripped because emotion was rejected
        expect(result.cleanedText).to.be.a('string')
    })

    //  score side-effects

    it('increases the triggered emotion score', () => {
        parseEmotionFromLLM('[ANGRY:0.8] You hurt me...')
        const scores = getEmotionScores()
        expect(scores.angry).to.be.above(0)
    })

    it('does not push score above 1', () => {
        // Trigger repeatedly to attempt overflow
        for (let i = 0; i < 20; i++) parseEmotionFromLLM('[EXCITED:1.0] Yay!')
        const scores = getEmotionScores()
        expect(scores.excited).to.be.at.most(1)
    })

    it('applies decay to other scores on each parse', () => {
        setEmotionScores({ ...DEFAULT_SCORES, happy: 0.5 })
        parseEmotionFromLLM('[SAD:0.5] I am sad.')
        const scores = getEmotionScores()
        // happy should have decayed
        expect(scores.happy).to.be.below(0.5)
    })

    it('applies decay even when no tag is found', () => {
        setEmotionScores({ ...DEFAULT_SCORES, happy: 0.5 })
        parseEmotionFromLLM('no tag here')
        const scores = getEmotionScores()
        expect(scores.happy).to.be.below(0.5)
    })

    it('does not let any score go below 0 via decay', () => {
        setEmotionScores({ ...DEFAULT_SCORES, angry: 0 })
        for (let i = 0; i < 10; i++) parseEmotionFromLLM('no tag')
        const scores = getEmotionScores()
        Object.values(scores).forEach((v) => expect(v).to.be.at.least(0))
    })
})

describe('updateEmotionScores', () => {
    beforeEach(resetScores)

    it('boosts the specified emotion', () => {
        updateEmotionScores('playful', 0.7)
        expect(getEmotionScores().playful).to.be.above(0)
    })

    it('clamps the boosted score to 1', () => {
        for (let i = 0; i < 30; i++) updateEmotionScores('playful', 1.0)
        expect(getEmotionScores().playful).to.be.at.most(1)
    })

    it('does not set other scores below 0', () => {
        updateEmotionScores('lonely', 0.5)
        const scores = getEmotionScores()
        Object.values(scores).forEach((v) => expect(v).to.be.at.least(0))
    })

    it('ignores invalid emotion names without throwing', () => {
        expect(() => updateEmotionScores('nonexistent', 0.9)).to.not.throw()
    })
})

// getEmotionInstructions

describe('getEmotionInstructions', () => {
    it('returns a non-empty string', () => {
        const instructions = getEmotionInstructions()
        expect(instructions).to.be.a('string').that.is.not.empty
    })

    it('lists all expected emotion names', () => {
        const instructions = getEmotionInstructions()
        const expectedEmotions = [
            'happy',
            'sad',
            'excited',
            'calm',
            'anxious',
            'playful',
            'curious',
            'lonely',
            'possessive',
            'unsettled',
            'angry'
        ]
        expectedEmotions.forEach((e) => {
            expect(instructions.toLowerCase()).to.include(e)
        })
    })

    it('describes the expected tag format', () => {
        const instructions = getEmotionInstructions()
        // Should mention the format with intensity
        expect(instructions).to.match(
            /\d+\.?\d*.*intensity|intensity.*\d+\.?\d*/i
        )
    })
})

// getEmotionScores / setEmotionScores round-trip

describe('getEmotionScores / setEmotionScores', () => {
    beforeEach(resetScores)

    it('get returns a copy, not the internal reference', () => {
        const scores = getEmotionScores()
        scores.happy = 999
        expect(getEmotionScores().happy).to.not.equal(999)
    })

    it('setEmotionScores merges partial updates', () => {
        setEmotionScores({ happy: 0.8 })
        const scores = getEmotionScores()
        expect(scores.happy).to.equal(0.8)
        // Other keys should still exist
        expect(scores.sad).to.be.a('number')
    })
})
