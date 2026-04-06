/**
 * Tests for llm.js
 *
 * llm.js calls axios.post to hit LM Studio.  We stub axios so these tests
 * run offline and remain fast.  We also verify that the system prompt is
 * constructed correctly from the emotion / sensor modules.
 */

const chai = require('chai')
const { expect } = chai
const sinon = require('sinon')
const axios = require('axios')

// Helpers to reset module cache between tests

function freshLLM() {
    const deps = ['../../llm', '../../emotion', '../../sensorContext']
    deps.forEach((d) => {
        delete require.cache[require.resolve(d)]
    })
    return require('../../llm')
}

// Stub factory – returns a successful axios response

function makeSuccessStub(content = '[CALM:0.5] I have been waiting...') {
    return sinon.stub(axios, 'post').resolves({
        data: {
            choices: [{ message: { content } }]
        }
    })
}

function makeErrorStub(message = 'Network Error') {
    return sinon.stub(axios, 'post').rejects(new Error(message))
}

// genResponse – happy path

describe('llm – genResponse (stubbed axios)', () => {
    let stub

    afterEach(() => {
        if (stub) stub.restore()
    })

    it('returns { success: true } on a successful LM Studio response', async () => {
        stub = makeSuccessStub()
        const { genResponse } = freshLLM()
        const result = await genResponse([])
        expect(result.success).to.be.true
    })

    it('returns the raw LLM content as genMessage', async () => {
        const content = '[CALM:0.5] Hello there.'
        stub = makeSuccessStub(content)
        const { genResponse } = freshLLM()
        const result = await genResponse([])
        expect(result.genMessage).to.equal(content)
    })

    it('passes conversation history through to axios', async () => {
        stub = makeSuccessStub()
        const { genResponse } = freshLLM()
        const messages = [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello' }
        ]
        await genResponse(messages)

        const payload = stub.firstCall.args[1]
        const userMessages = payload.messages.filter((m) => m.role === 'user')
        expect(userMessages.some((m) => m.content === 'Hi')).to.be.true
    })

    it('always includes a system message in the payload', async () => {
        stub = makeSuccessStub()
        const { genResponse } = freshLLM()
        await genResponse([])

        const payload = stub.firstCall.args[1]
        const systemMessages = payload.messages.filter(
            (m) => m.role === 'system'
        )
        expect(systemMessages.length).to.be.at.least(1)
    })

    it('system prompt includes SmartDoll identity text', async () => {
        stub = makeSuccessStub()
        const { genResponse } = freshLLM()
        await genResponse([])

        const payload = stub.firstCall.args[1]
        const systemContent = payload.messages
            .filter((m) => m.role === 'system')
            .map((m) => m.content)
            .join(' ')

        expect(systemContent.toLowerCase()).to.include('smartdoll')
    })

    it('system prompt includes emotion instructions', async () => {
        stub = makeSuccessStub()
        const { genResponse } = freshLLM()
        await genResponse([])

        const payload = stub.firstCall.args[1]
        const systemContent = payload.messages
            .filter((m) => m.role === 'system')
            .map((m) => m.content)
            .join(' ')

        // getEmotionInstructions lists all emotion names
        expect(systemContent.toLowerCase()).to.include('calm')
        expect(systemContent.toLowerCase()).to.include('intensity')
    })

    it('posts to the correct LM Studio URL', async () => {
        stub = makeSuccessStub()
        const { genResponse } = freshLLM()
        await genResponse([])

        const url = stub.firstCall.args[0]
        expect(url).to.include('localhost:1234')
        expect(url).to.include('/v1/chat/completions')
    })

    it('sends Content-Type: application/json', async () => {
        stub = makeSuccessStub()
        const { genResponse } = freshLLM()
        await genResponse([])

        const config = stub.firstCall.args[2]
        expect(config.headers['Content-Type']).to.equal('application/json')
    })
})

// genResponse – error path

describe('llm – genResponse error handling', () => {
    let stub

    afterEach(() => {
        if (stub) stub.restore()
    })

    it('returns { success: false } when axios throws', async () => {
        stub = makeErrorStub('Network Error')
        const { genResponse } = freshLLM()
        const result = await genResponse([])
        expect(result.success).to.be.false
    })

    it('returns genMessage: null on failure', async () => {
        stub = makeErrorStub('timeout')
        const { genResponse } = freshLLM()
        const result = await genResponse([])
        expect(result.genMessage).to.be.null
    })

    it('includes the error message on failure', async () => {
        stub = makeErrorStub('connection refused')
        const { genResponse } = freshLLM()
        const result = await genResponse([])
        expect(result.error).to.equal('connection refused')
    })

    it('does not throw – resolves even on network failure', async () => {
        stub = makeErrorStub()
        const { genResponse } = freshLLM()
        let result
        // If genResponse throws, the test itself will fail — that's the assertion
        result = await genResponse([])
        expect(result).to.be.an('object')
    })
})

// System prompt temperature context integration

describe('llm – system prompt includes temperature context when set', () => {
    let stub

    afterEach(() => {
        if (stub) stub.restore()
    })

    it('includes temperature band text in system prompt when sensor data is available', async () => {
        stub = makeSuccessStub()

        // Set a temperature via sensorContext before loading llm
        delete require.cache[require.resolve('../../sensorContext')]
        const { setTemperature } = require('../../sensorContext')
        setTemperature(40, 50) // extreme heat

        delete require.cache[require.resolve('../../llm')]
        const { genResponse } = require('../../llm')
        await genResponse([])

        const payload = stub.firstCall.args[1]
        const systemContent = payload.messages
            .filter((m) => m.role === 'system')
            .map((m) => m.content)
            .join(' ')

        expect(systemContent.toLowerCase()).to.match(
            /suffer|distress|unbearable/
        )
    })
})
