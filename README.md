# SmartDollJS

## Project file overview
### pc-server

```server.js```  — To be ran on Server PC. WebSocket server that accepts text from clients, forwards it to a local LM Studio LLM endpoint using Axios, and returns the LLM reply to the client. Main glue between voice client and the LLM.

### pi-client

```client.js``` — Voice client that connects to the PC WebSocket server, spawns the Python speech recognizer, forwards transcribed text to the server, and prints assistant replies. Reads SERVER_IP from environment via dotenv.
package.json — npm manifest for the Pi client; includes runtime deps (ws, dotenv) and start script.
speech_recognizer.py — Python Vosk-based speech recognizer: captures microphone audio with PyAudio, runs the Kaldi/Vosk model, and prints PARTIAL: and TRANSCRIBED: lines to stdout that client.js consumes.
model


```speech_recognizer.py``` — Python Vosk-based speech recognizer: captures microphone audio with PyAudio, runs the Kaldi/Vosk model, and prints PARTIAL: and TRANSCRIBED: lines to stdout that client.js consumes.

**Start the PC server:** ```npm start```

**Start the Pi client:** 

1. **Enter virtual environment:** ```source venv/bin/activate```
2. Run client: ```npm start```

ensure ```SERVER_IP```is set in .env
