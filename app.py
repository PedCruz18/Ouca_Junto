import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
from collections import defaultdict

app = Flask(__name__)
socketio = SocketIO(app, 
                  ping_timeout=120, 
                  ping_interval=20, 
                  async_mode='eventlet',
                  cors_allowed_origins="*")  # Permite conexões de qualquer origem

# Estrutura para armazenar áudios por sessão
audio_sessions = defaultdict(dict)
connected_clients = set()

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    connected_clients.add(request.sid)
    print(f'Cliente conectado: {request.sid} - Total: {len(connected_clients)}')

@socketio.on('disconnect')
def handle_disconnect():
    connected_clients.discard(request.sid)
    if request.sid in audio_sessions:
        del audio_sessions[request.sid]
    print(f'Cliente desconectado: {request.sid} - Restantes: {len(connected_clients)}')

@socketio.on('audio_metadata')
def handle_metadata(data):
    session_id = request.sid
    audio_sessions[session_id] = {
        'chunks': [None] * data['totalChunks'],
        'type': data['type'],
        'total_chunks': data['totalChunks'],
        'stream_id': f"stream_{session_id}_{int(time.time())}"  # ID único para a transmissão
    }
    emit('metadata_received', {'status': 'ready'})

@socketio.on('audio_chunk')
def handle_audio_chunk(data):
    session_id = request.sid
    if session_id not in audio_sessions:
        emit('error', {'message': 'Sessão não inicializada'})
        return
    
    # Armazena o chunk
    audio_sessions[session_id]['chunks'][data['chunkId']] = data['data']
    
    # Envia para TODOS os clientes conectados (broadcast=True)
    emit('audio_processed', {
        'stream_id': audio_sessions[session_id]['stream_id'],
        'chunkId': data['chunkId'],
        'data': data['data'],
        'total_chunks': audio_sessions[session_id]['total_chunks']
    }, broadcast=True)  # Esta é a linha crucial que estava faltando

if __name__ == '__main__':
    import time  # Import para gerar stream_id
    print("Iniciando servidor...")
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)