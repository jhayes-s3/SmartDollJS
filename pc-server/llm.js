const axios = require('axios')

const MODEL = 'llama-3.2-3b-instruct'
const LM_STUDIO_URL = 'http://localhost:1234/v1/chat/completions'

async function genResponse(messages = {}) {
    try {
        console.log('Generating response...')
        // console.log(JSON.stringify(messages, null, 2))

        const response = await axios.post(
            LM_STUDIO_URL,
            {
                model: MODEL,
                messages: messages,
                temperature: 0.7
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        )

        const content = response.data.choices[0].message.content

        // console.log('LM Studio response:', content)

        return {
            success: true,
            genMessage: content
        }
    } catch (error) {
        console.error('LM Studio error:', error.message)

        if (error.response) {
            console.error('Response status:', error.response.status)
            console.error('Response data:', error.response.data)
        }

        return {
            success: false,
            genMessage: null,
            error: error.message,
            details: error.response?.data || null
        }
    }
}

module.exports = {
    genResponse
}
