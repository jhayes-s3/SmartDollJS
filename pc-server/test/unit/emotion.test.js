const chai = require('chai')
const { expect } = chai
const {
    parseEmotionFromLLM,
    getEmotionScores,
    setEmotionScores
} = require('../../emotion')

describe('parseEmotionFromLLM', () => {
    beforeEach(() => {
        // Reset emotion scores before each test
        setEmotionScores({
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

    it('parses [CALM:0.5] format correctly', () => {
        const result = parseEmotionFromLLM('[CALM:0.5] I have been waiting...')
        expect(result.found).to.be.true
        expect(result.emotion).to.equal('calm')
        expect(result.intensity).to.equal(0.5)
        expect(result.cleanedText).to.equal('I have been waiting...')
    })

    it('parses legacy [EMOTION:calm:0.5] format correctly', () => {
        const result = parseEmotionFromLLM(
            '[EMOTION:calm:0.5] I have been waiting...'
        )
        expect(result.found).to.be.true
        expect(result.emotion).to.equal('calm')
    })

    it('returns found: false when no tag present', () => {
        const result = parseEmotionFromLLM('I have been waiting...')
        expect(result.found).to.be.false
        expect(result.cleanedText).to.equal('I have been waiting...')
    })

    it('returns found: false for unrecognised emotion', () => {
        const result = parseEmotionFromLLM(
            '[CONFUSED:0.5] I have been waiting...'
        )
        expect(result.found).to.be.false
    })

    it('updates emotion scores after parsing', () => {
        parseEmotionFromLLM('[ANGRY:0.8] You hurt me...')
        const scores = getEmotionScores()
        expect(scores.angry).to.be.above(0)
    })
})
