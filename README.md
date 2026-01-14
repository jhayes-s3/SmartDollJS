# SmartDollJS

## Project file overview
### pc-server

```server.js```:  To be ran on Server PC. WebSocket server that accepts text from clients, forwards it to a local LM Studio LLM endpoint using Axios, and returns the LLM reply to the client. Main glue between voice client and the LLM.


### pi-client

```client.js```: Voice client that connects to the PC WebSocket server, spawns the Python speech recognizer, forwards transcribed text to the server, and prints assistant replies. 

```speech_recognizer.py```:  Python Vosk-based speech recognizer: captures microphone audio with PyAudio, runs the Kaldi/Vosk model, and prints PARTIAL: and TRANSCRIBED: lines.

## First time setup

### pc-server
1. **Install Node.js dependencies**: `npm install`
2. **Configure environment**: Create a `.env` file (see Configuration section)
3. **Start LM Studio**: Ensure LM Studio is running with a model loaded

### pi-client
1. **Install Node.js dependencies**: `npm install`
2. **Create virtual environment**: `python -m venv venv` (or `python3 -m venv venv`)
3. **Activate virtual environment**: `source venv/bin/activate` (Mac/Linux) or `venv\Scripts\activate` (Windows)
4. **Install Python dependencies**: `pip install -r requirements.txt`
5. **Download Vosk model**: [Add instructions for downloading the Vosk model if needed]
6. **Configure environment**: Create a `.env` file (see Configuration section)


## Run

**Start the PC server:**
```bash
cd pc-server
npm start
```

**Start the Pi client:**
```bash
cd pi-client
source venv/bin/activate  # On Mac/Linux
# or: venv\Scripts\activate  # On Windows
npm start
```

## Configuration

### pc-server/.env
```
LLM_ENDPOINT=http://localhost:1234/v1/chat/completions
PORT=8080
```

### pi-client/.env
```
SERVER_IP=<your-pc-server-ip>
SERVER_PORT=8080
```

## Prerequisites
- Node.js (v14 or higher)
- Python 3.7+
- LM Studio running locally on the PC
- Microphone connected to the client device
