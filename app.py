import eventlet
eventlet.monkey_patch()
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
from collections import defaultdict
import time
from flask_cors import CORS
import os

# Inicializa o aplicativo Flask
app = Flask(__name__)
app.config['SECRET_KEY'] = 'minha-chave-secreta'

# Configuração do SocketIO
CORS(app)  # Permitir CORS em toda a API

# Detecta se está rodando em produção ou local
if os.getenv("RENDER") == "true":
    socketio = SocketIO(app, ping_timeout=120, ping_interval=20, async_mode='eventlet', cors_allowed_origins="*")
    HOST = "0.0.0.0"  # Para produção, use "0.0.0.0"
    PORT = int(os.environ.get("PORT", 10000))  # Usa a porta definida pelo Render
    DEBUG_MODE = False  # Desativa o debug em produção
else:
    socketio = SocketIO(app, ping_timeout=120, ping_interval=20, async_mode='eventlet', cors_allowed_origins="*")
    HOST = "192.168.1.2"  # Para desenvolvimento, use "127.0.0.1"
    PORT = 5000  # Porta local
    DEBUG_MODE = True  # Ativa o debug em modo desenvolvimento

# Estruturas de dados para armazenar sessões de áudio e clientes conectados
sessoes_audio = defaultdict(dict)
clientes_conectados = set()
sessoes_prontas = defaultdict(set)

# Rota principal
@app.route('/')
def index():
    return render_template('index.html')

# Eventos de WebSocket
@socketio.on('connect')
def ao_conectar():
    clientes_conectados.add(request.sid)
    print(f'Cliente conectado: {request.sid} - Total: {len(clientes_conectados)}')

@socketio.on('disconnect')
def ao_desconectar():
    clientes_conectados.discard(request.sid)
    if request.sid in sessoes_audio:
        del sessoes_audio[request.sid]
    print(f'Cliente desconectado: {request.sid} - Restantes: {len(clientes_conectados)}')

@socketio.on('audio_metadata')
def ao_receber_metadados(dados):
    id_sessao = request.sid
    sessoes_audio[id_sessao] = {
        'pedaços': [None] * dados['totalChunks'],
        'tipo': dados['type'],
        'total_pedaços': dados['totalChunks'],
        'id_transmissao': f"stream_{id_sessao}_{int(time.time())}"
    }
    emit('metadata_received', {'status': 'ready'}, room=request.sid)

@socketio.on('audio_chunk')
def ao_receber_pedaco_audio(dados):
    id_sessao = request.sid
    if id_sessao not in sessoes_audio:
        emit('error', {'message': 'Sessão não inicializada'}, room=request.sid)
        return
    
    sessoes_audio[id_sessao]['pedaços'][dados['chunkId']] = dados['data']
    for cliente in clientes_conectados:
        emit('audio_processed', {
            'id_transmissao': sessoes_audio[id_sessao]['id_transmissao'],
            'id_pedaco': dados['chunkId'],
            'dados': dados['data'],
            'total_pedaços': sessoes_audio[id_sessao]['total_pedaços']
        }, room=cliente)

@socketio.on('cliente_pronto')
def handle_cliente_pronto(data):
    id_sessao = request.sid
    id_transmissao = data.get('id_transmissao')
    
    if not id_transmissao:
        return
    
    sessoes_prontas[id_transmissao].add(id_sessao)
    print(f"Cliente {id_sessao} pronto para {id_transmissao}")
    
    clientes_na_transmissao = [sid for sid in sessoes_audio if sessoes_audio[sid]['id_transmissao'] == id_transmissao]
    
    if len(sessoes_prontas[id_transmissao]) >= len(clientes_na_transmissao) and clientes_na_transmissao:
        print(f"Todos prontos para {id_transmissao} - Iniciando reprodução")
        emit('iniciar_reproducao', {
            'id_transmissao': id_transmissao,
            'timestamp': time.time()
        }, broadcast=True)
        sessoes_prontas.pop(id_transmissao, None)

@socketio.on('player_control')
def handle_player_control(data):
    try:
        id_transmissao = data.get('id_transmissao')
        
        if not id_transmissao or id_transmissao not in [sessao['id_transmissao'] for sessao in sessoes_audio.values()]:
            return
        
        emit('player_control', {
            'action': data['action'],
            'currentTime': data.get('currentTime', 0),
            'id_transmissao': id_transmissao
        }, broadcast=True)
        
    except Exception as e:
        print(f'Erro no handler de controle: {str(e)}')

# Executor do servidor
if __name__ == '__main__':
    print(f"Iniciando servidor em modo {'produção' if not DEBUG_MODE else 'desenvolvimento'}...")
    socketio.run(app, host=HOST, port=PORT, debug=DEBUG_MODE)
