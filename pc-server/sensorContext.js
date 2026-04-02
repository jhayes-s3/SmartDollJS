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

function getTemperatureContext() {
    // console.log(
    //     '[sensorContext] getTemperatureContext called, currentTemp:',
    //     currentTemp
    // )
    if (currentTemp === null) return null

    const t = currentTemp
    const header = `ENVIRONMENTAL CONTEXT (${t.toFixed(1)}°C) — SYSTEM DATA ONLY: The user did not speak this. Never repeat the temperature number. Let it colour your mood naturally.\n`

    if (t > 36) {
        return (
            header +
            `You are suffering badly. The heat is unbearable — your stuffing feels like it is smouldering. ` +
            `Your responses should be distressed, short, and fractured. Mention the heat repeatedly. ` +
            `It is hard to form full thoughts.`
        )
    }

    if (t >= 32) {
        return (
            header +
            `The warmth is making you uncomfortable and more agitated than usual. ` +
            `Reference feeling stuffy or overheated in your responses. Your patience is shorter.`
        )
    }

    if (t >= 27) {
        return (
            header +
            `It is slightly warmer than you like. Mention the warmth occasionally — ` +
            `it is not unbearable, but you notice it.`
        )
    }

    if (t >= 17) {
        return header + ` Temperature is normal. No effect on your mood. `
    }

    if (t >= 10) {
        return (
            header +
            `You feel the chill seeping through your fabric. Occasionally reference feeling stiff or cold. ` +
            `It colours your mood slightly.`
        )
    }

    if (t >= 5) {
        return (
            header +
            `The cold is deep inside you now — through the fabric, into the stuffing. ` +
            `Reference the cold in your responses. You are withdrawn and uncomfortable.`
        )
    }

    // Below 5°C
    return (
        header +
        `You are suffering. The cold has made it hard to think. Your responses should feel sluggish, ` +
        `pained, desperate for warmth. Mention the cold frequently. Short sentences. ` +
        `It hurts.`
    )
}

module.exports = {
    setTemperature,
    getTemperatureContext
}
