const WebSocket = require('ws');
const axios = require('axios');

const PORT = 8765;
const LM_STUDIO_URL = 'http://localhost:1234/v1/chat/completions';

// Create WebSocket server
const wss = new WebSocket.Server({ port: PORT });

console.log(`Server running on ws://0.0.0.0:${PORT}`);

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (message) => {
    const text = message.toString();
    console.log(`Received: ${text}`);

    try {
      // Call LM Studio API
      const response = await axios.post(LM_STUDIO_URL, {
        model: 'llama-3.2-3b-instruct',
        messages: [
          { role: 'user', content: text }
        ],
        temperature: 0.7
      });

      const reply = response.data.choices[0].message.content;
      console.log(`Sending: ${reply}\n`);

      // Send response back to client
      ws.send(reply);

    } catch (error) {
      console.error('Error calling LLM:', error.message);
      ws.send('Sorry, there was an error processing your request.');
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
});

wss.on('error', (error) => {
  console.error('Server error:', error.message);
});