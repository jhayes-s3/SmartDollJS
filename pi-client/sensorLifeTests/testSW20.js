const Gpio = require('pigpio').Gpio;

// GPIO27 input
const vibration = new Gpio(27, {
  mode: Gpio.INPUT,
  alert: true
});

vibration.on('alert', (level, tick) => {
  if (level === 1) {
    console.log('?? Vibration detected!');
  }
});

console.log('SW-420 pigpio test started...');
