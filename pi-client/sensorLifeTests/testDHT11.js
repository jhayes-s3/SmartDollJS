const sensor = require('node-dht-sensor').promises;

// DHT11 = type 11
// GPIO4 = pin 4 (BCM numbering)
const DHT_TYPE = 11;
const GPIO_PIN = 4;

async function readSensor() {
  try {
    const res = await sensor.read(DHT_TYPE, GPIO_PIN);
    console.log(`Temp: ${res.temperature}°C`);
    console.log(`Humidity: ${res.humidity}%`);
  } catch (err) {
    console.error('Failed to read sensor:', err);
  }
}

setInterval(readSensor, 2000);
