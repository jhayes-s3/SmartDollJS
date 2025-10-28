const WebSocket = require('ws');
const vosk = require('vosk');
const mic = require('mic');
const fs = require('fs');
require('dotenv').config();

const SERVER_IP = process.env.SERVER_IP || '127.0.0.1';
const MODEL_PATH = process.env.VOSK_MODEL_PATH || 'model';
const SAMPLE_RATE = 16000;

// Check if model exists
if (!fs.existsSync(MODEL_PATH)) {
  console.error(`Error: Vosk model not found at '${MODEL_PATH}'`);
  process.exit(1);
}

console.log('Loading Vosk model...');
vosk.setLogLevel(0); // Reduce Vosk logging
const model = new vosk.Model(MODEL_PATH);
const rec = new vosk.Recognizer({ model: model, sampleRate: SAMPLE_RATE });

// Setup microphone
const micInstance = mic({
  rate: String(SAMPLE_RATE),
  channels: '1',
  debug: false,
  exitOnSilence: 6
});

const micInputStream = micInstance.getAudioStream();

console.log('Microphone ready!');

// Connect to WebSocket server
const ws = new WebSocket(`ws://${SERVER_IP}:8765`);

ws.on('open', () => {
  console.log(`Connected to ws://${SERVER_IP}:8765\n`);
  console.log('Listening...\n');
  
  // Start recording
  micInstance.start();
});

ws.on('message', (data) => {
  const response = data.toString();
  console.log(`\nAssistant: ${response}\n`);
});

ws.on('close', () => {
  console.log('\nConnection closed');
  micInstance.stop();
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error.message);
});

// Process audio from microphone
micInputStream.on('data', (data) => {
  if (rec.acceptWaveform(data)) {
    // Final result (end of speech)
    const result = JSON.parse(rec.result());
    const text = result.text?.trim();
    
    if (text) {
      console.log(`\nYou: ${text}`);
      ws.send(text);
    }
  } else {
    // Partial result (still speaking)
    const partialResult = JSON.parse(rec.partialResult());
    const partial = partialResult.partial;
    
    if (partial) {
      process.stdout.write(`\rListening: ${partial}`);
    }
  }
});

micInputStream.on('error', (error) => {
  console.error('Microphone error:', error);
});

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n\nStopped');
  rec.free();
  model.free();
  micInstance.stop();
  ws.close();
  process.exit(0);
});