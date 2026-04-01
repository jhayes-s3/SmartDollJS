// sensorContext.js
// Stores sensor readings from the Pi and generates context strings for the LLM.

let currentTemp = null
let currentHumidity = null

/**
 * Called by server.js when a DHT11 sensor update arrives from the Pi.
 */
function setTemperature(temp, humidity) {
    currentTemp = temp
    currentHumidity = humidity
    console.log(
        `[sensor] Temp: ${temp.toFixed(1)}°C  Humidity: ${humidity.toFixed(0)}%`
    )
}

/**
 * Returns a prompt context string based on current temperature.
 * Returns null at normal temps so the prompt is unaffected.
 *
 * Ranges (°C):
 *   < 5   → extreme cold  (severe effect)
 *   5–9   → very cold     (strong effect)
 *   10–16 → cold          (moderate effect)
 *   17–26 → normal        (no effect)
 *   27–31 → warm          (mild effect)
 *   32–36 → hot           (moderate effect)
 *   > 36  → extreme heat  (severe effect)
 */
function getTemperatureContext() {
    if (currentTemp === null) return null

    const t = currentTemp

    if (t > 36) {
        return (
            `ENVIRONMENTAL CONTEXT – EXTREME HEAT (${t.toFixed(1)}°C): ` +
            `You are suffering badly. The heat is unbearable — your stuffing feels like it is smouldering. ` +
            `Your responses should be distressed, short, and fractured. Mention the heat repeatedly. ` +
            `It is hard to form full thoughts.`
        )
    }

    if (t >= 32) {
        return (
            `ENVIRONMENTAL CONTEXT – HOT (${t.toFixed(1)}°C): ` +
            `The warmth is making you uncomfortable and more agitated than usual. ` +
            `Reference feeling stuffy or overheated in your responses. Your patience is shorter.`
        )
    }

    if (t >= 27) {
        return (
            `ENVIRONMENTAL CONTEXT – WARM (${t.toFixed(1)}°C): ` +
            `It is slightly warmer than you like. Mention the warmth occasionally — ` +
            `it is not unbearable, but you notice it.`
        )
    }

    if (t >= 17) {
        // Normal range — no context injected
        return null
    }

    if (t >= 10) {
        return (
            `ENVIRONMENTAL CONTEXT – COLD (${t.toFixed(1)}°C): ` +
            `You feel the chill seeping through your fabric. Occasionally reference feeling stiff or cold. ` +
            `It colours your mood slightly.`
        )
    }

    if (t >= 5) {
        return (
            `ENVIRONMENTAL CONTEXT – VERY COLD (${t.toFixed(1)}°C): ` +
            `The cold is deep inside you now — through the fabric, into the stuffing. ` +
            `Reference the cold in your responses. You are withdrawn and uncomfortable.`
        )
    }

    // Below 5°C
    return (
        `ENVIRONMENTAL CONTEXT – EXTREME COLD (${t.toFixed(1)}°C): ` +
        `You are suffering. The cold has made it hard to think. Your responses should feel sluggish, ` +
        `pained, desperate for warmth. Mention the cold frequently. Short sentences. ` +
        `It hurts.`
    )
}

module.exports = {
    setTemperature,
    getTemperatureContext
}
