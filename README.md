# SmartDollJS

## Project file overview
### pc-server

```server.js```:  To be ran on Server PC. WebSocket server that accepts text from clients, forwards it to a local LM Studio LLM endpoint using Axios, and returns the LLM reply to the client. Main glue between voice client and the LLM.


### pi-client

```client.js```: Voice client that connects to the PC WebSocket server, spawns the Python speech recognizer, forwards transcribed text to the server, and prints assistant replies. 

```speech_recognizer.py```:  Python Vosk-based speech recognizer: captures microphone audio with PyAudio, runs the Kaldi/Vosk model, and prints PARTIAL: and TRANSCRIBED: lines.


## Run

**Start the PC server:** ```npm start``` in pc-server


**Start the Pi client:** 

In pi-client:
1. **Enter virtual environment:** ```source venv/bin/activate```
2. Run client: ```npm start```

Ensure ```SERVER_IP``` is set in .env
