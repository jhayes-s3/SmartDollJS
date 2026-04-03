const chai = require('chai')
const { expect } = chai
const { setTemperature, getTemperatureContext } = require('../../sensorContext')

// Helper – set temp and immediately retrieve context
function ctx(temp) {
    setTemperature(temp, 50)
    return getTemperatureContext()
}

describe('sensorContext', () => {
    describe('before any temperature is set', () => {
        before(() => {
            // Force the module back to its null state by loading a fresh instance.
            // Because Node caches modules we work around this by deleting the cache key.
            delete require.cache[require.resolve('../../sensorContext')]
        })

        it('getTemperatureContext returns null when no reading has been set', () => {
            const {
                getTemperatureContext: freshGet
            } = require('../../sensorContext')
            expect(freshGet()).to.be.null
        })
    })

    // Temperature band: > 36 °C  (suffering / distressed)

    describe('temperature > 36 °C', () => {
        it('returns a non-null string', () => {
            expect(ctx(37)).to.be.a('string').that.is.not.empty
        })

        it('context conveys severe distress', () => {
            const result = ctx(37)
            expect(result.toLowerCase()).to.match(
                /suffer|distress|unbearable|smouldering/
            )
        })

        it('includes the system-data header', () => {
            const result = ctx(37)
            expect(result).to.include('ENVIRONMENTAL CONTEXT')
        })

        it('instructs LLM not to repeat the temperature number', () => {
            const result = ctx(37)
            expect(result.toLowerCase()).to.include(
                'never repeat the temperature'
            )
        })
    })

    // Temperature band: 32–36 °C  (uncomfortable / agitated)

    describe('temperature 32–36 °C', () => {
        it('returns a non-null string', () => {
            expect(ctx(34)).to.be.a('string').that.is.not.empty
        })

        it('context conveys discomfort / agitation', () => {
            const result = ctx(34)
            expect(result.toLowerCase()).to.match(
                /uncomfortable|agitated|stuffy|overheated/
            )
        })
    })

    // Temperature band: 27–31 °C  (slightly warm)

    describe('temperature 27–31 °C', () => {
        it('returns a non-null string', () => {
            expect(ctx(29)).to.be.a('string').that.is.not.empty
        })

        it('context mentions warmth but not extreme distress', () => {
            const result = ctx(29)
            expect(result.toLowerCase()).to.include('warm')
            expect(result.toLowerCase()).to.not.match(/suffer|unbearable/)
        })
    })

    // Temperature band: 17–26 °C  (normal)

    describe('temperature 17–26 °C (normal range)', () => {
        it('returns a non-null string', () => {
            expect(ctx(22)).to.be.a('string').that.is.not.empty
        })

        it('context states normal temperature / no mood effect', () => {
            const result = ctx(22)
            expect(result.toLowerCase()).to.match(/normal|no effect/)
        })
    })

    // Temperature band: 10–16 °C  (chilly)

    describe('temperature 10–16 °C', () => {
        it('returns a non-null string', () => {
            expect(ctx(13)).to.be.a('string').that.is.not.empty
        })

        it('context references chill or coldness', () => {
            const result = ctx(13)
            expect(result.toLowerCase()).to.match(/chill|cold|stiff/)
        })
    })

    // Temperature band: 5–9 °C  (deep cold)

    describe('temperature 5–9 °C', () => {
        it('returns a non-null string', () => {
            expect(ctx(7)).to.be.a('string').that.is.not.empty
        })

        it('context conveys deeper cold and withdrawal', () => {
            const result = ctx(7)
            expect(result.toLowerCase()).to.match(/cold|withdraw|uncomfortable/)
        })
    })

    // Temperature band: < 5 °C  (extreme cold / suffering)

    describe('temperature < 5 °C', () => {
        it('returns a non-null string', () => {
            expect(ctx(2)).to.be.a('string').that.is.not.empty
        })

        it('context conveys suffering and sluggishness from cold', () => {
            const result = ctx(2)
            expect(result.toLowerCase()).to.match(/suffer|pain|cold|hurt/)
        })
    })

    // Exact boundary values

    describe('boundary temperatures', () => {
        it('exactly 36 °C falls into the 32–36 band', () => {
            const result = ctx(36)
            expect(result.toLowerCase()).to.match(
                /uncomfortable|agitated|stuffy/
            )
        })

        it('exactly 32 °C falls into the 32–36 band', () => {
            const result = ctx(32)
            expect(result.toLowerCase()).to.match(
                /uncomfortable|agitated|stuffy/
            )
        })

        it('exactly 27 °C falls into the 27–31 band', () => {
            const result = ctx(27)
            expect(result.toLowerCase()).to.include('warm')
        })

        it('exactly 17 °C falls into the normal band', () => {
            const result = ctx(17)
            expect(result.toLowerCase()).to.match(/normal|no effect/)
        })

        it('exactly 10 °C falls into the chilly band', () => {
            const result = ctx(10)
            expect(result.toLowerCase()).to.match(/chill|cold|stiff/)
        })

        it('exactly 5 °C falls into the deep-cold band', () => {
            const result = ctx(5)
            expect(result.toLowerCase()).to.match(/cold|withdraw|uncomfortable/)
        })
    })

    // setTemperature side-effects

    describe('setTemperature', () => {
        it('does not throw with valid temperature and humidity', () => {
            expect(() => setTemperature(21, 60)).to.not.throw()
        })

        it('updates the reading used by getTemperatureContext', () => {
            setTemperature(40, 30)
            const hot = getTemperatureContext()
            setTemperature(1, 30)
            const cold = getTemperatureContext()
            // They should produce different context strings
            expect(hot).to.not.equal(cold)
        })
    })
})
