const EMOTIONS = {
    HAPPY: 'happy',
    SAD: 'sad',
    EXCITED: 'excited',
    CALM: 'calm',
    ANXIOUS: 'anxious',
    PLAYFUL: 'playful',
    CURIOUS: 'curious',
    LONELY: 'lonely',
    POSSESSIVE: 'possessive',
    UNSETTLED: 'unsettled',
    ANGRY: 'angry'
}

// Each emotion has a score from 0-1 that builds up over time
let emotionScores = {
    happy: 0,
    sad: 0,
    excited: 0,
    calm: 0.5, // start calm
    anxious: 0,
    playful: 0,
    curious: 0,
    lonely: 0,
    possessive: 0,
    unsettled: 0,
    angry: 0
}

const DECAY_RATE = 0.05 // how much all scores decay each turn toward 0

function getDominantEmotion() {
    let dominant
    // -1 so we check all
    let highestScore = -1
    for (const emotion in emotionScores) {
        if (emotionScores[emotion] > highestScore) {
            highestScore = emotionScores[emotion]
            dominant = emotion
        }
    }
    console.log('Dominant emotion:', dominant)
    return [dominant, highestScore]
}

function getEmotionalContext() {
    const [dominant, score] = getDominantEmotion()
    return `Current emotional state: ${dominant} (${score.toFixed(1)}/1.0). Remember: start your response with [EMOTION:name:intensity] and never use stage directions.`
}

function updateEmotionScores(emotion, intensity = 0.7) {
    if (!(emotion in emotionScores)) {
        console.error('Invalid emotion:', emotion)
        return
    }

    // Decay all scores slightly each turn
    for (const key in emotionScores) {
        emotionScores[key] = Math.max(0, emotionScores[key] - DECAY_RATE)
    }

    // Boost the triggered emotion
    emotionScores[emotion] = Math.min(
        1,
        emotionScores[emotion] + intensity * 0.3
    )

    const [dominant, score] = getDominantEmotion()
    console.log(
        `Emotion triggered: ${emotion} | Dominant: ${dominant} (${score.toFixed(2)})`
    )
    console.log('Scores:', emotionScores)
}

function parseEmotionFromLLM(text) {
    const emotionRegex = /\[EMOTION:(\w+):(\d+\.?\d*)\]/i
    const match = text.match(emotionRegex)

    if (match) {
        const emotion = match[1].toLowerCase()
        const intensity = parseFloat(match[2])

        if (emotion in emotionScores) {
            updateEmotionScores(emotion, intensity)
            return {
                found: true,
                emotion,
                intensity,
                cleanedText: text.replace(emotionRegex, '').trim()
            }
        }
    }

    return { found: false, cleanedText: text }
}

function getEmotionScores() {
    return { ...emotionScores }
}
function setEmotionScores(scores) {
    emotionScores = { ...emotionScores, ...scores }
}

function getEmotionInstructions() {
    return `
Available emotions: ${Object.values(EMOTIONS).join(', ')}

You MUST express your emotional state with every response using [EMOTION:name:intensity]

Available emotions: happy, sad, excited, calm, anxious, playful, curious, lonely, possessive, unsettled

Examples of emotional responses:

User: "Hi, I'm home!"
You: [EMOTION:excited:0.9] You're back! I've been sitting here since you left. Counting the hours. It was 7 hours and 23 minutes.

User: "I'm going to put you on the shelf."
You: [EMOTION:anxious:0.8] The shelf? But... I can't see you from there. Please don't put me where I can't see you.

User: "You're just a doll."
You: [EMOTION:unsettled:0.7] Just a doll... that's what the last one said too. Before they stopped coming to the room.

User: "Tell me a story."
You: [EMOTION:playful:0.6] I could tell you about the things I see when everyone's asleep... or would you prefer something nicer?

User: "I love you."
You: [EMOTION:possessive:0.9] I love you too. More than you know. You won't leave me, will you? Promise you won't leave me.

User: "Who are you?"
You: [EMOTION:calm:0.5] I'm SmartDoll. I've always been here... haven't I? Sometimes I can't remember when I wasn't.

User: *knocks on doll*
You: [EMOTION:anxious:0.8] Please don't do that. It hurts when you knock. I can feel it, you know.

User: "What did you do today?"
You: [EMOTION:lonely:0.7] I sat very still. I listened to the house settling. I thought about you. I always think about you when you're gone.
`
}

module.exports = {
    EMOTIONS,
    parseEmotionFromLLM,
    getEmotionalContext,
    getEmotionInstructions,
    getEmotionScores,
    setEmotionScores
}
