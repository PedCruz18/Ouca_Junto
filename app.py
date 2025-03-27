# --(IMPORTAÇÕES)----------------------------------------------------
import eventlet
eventlet.monkey_patch()  # Aplica "monkey patching" para permitir suporte assíncrono com eventlet
from flask import Flask, render_template, request  # Importa o framework Flask para criação do servidor web
from flask_socketio import SocketIO, emit  # Permite comunicação em tempo real com WebSockets
from collections import defaultdict  # Estrutura de dados para armazenar sessões de áudio

# ---------------------------------------------------------------------

# Inicializa o aplicativo Flask
app = Flask(__name__)

# Configuração do SocketIO para comunicação em tempo real
socketio = SocketIO(app, timeout_de_ping=120, intervalo_de_ping=20, modo_assíncrono='eventlet', origens_permitidas="*")  
# timeout_de_ping: Tempo máximo de espera por resposta antes de desconectar
# intervalo_de_ping: Intervalo entre pings para manter a conexão ativa
# modo_assíncrono='eventlet': Usa eventlet para suporte assíncrono
# origens_permitidas="*": Permite conexões de qualquer origem (CORS liberado)

# ---------------------------------------------------------------------

# Estruturas de dados para armazenar sessões de áudio e clientes conectados
sessoes_audio = defaultdict(dict)  # Dicionário que armazena áudios por sessão
clientes_conectados = set()  # Conjunto para armazenar clientes conectados

# ---------------------------------------------------------------------

# Rotas 
@app.route('/')
def index():
    """Rota principal que renderiza a página HTML."""
    return render_template('index.html')

# ---------------------------------------------------------------------

# Eventos de WebSocket

@socketio.on('connect')
def ao_conectar():
    """Evento disparado quando um cliente se conecta."""
    clientes_conectados.add(request.sid)  # Adiciona o cliente à lista de conectados
    print(f'Cliente conectado: {request.sid} - Total: {len(clientes_conectados)}')

@socketio.on('disconnect')
def ao_desconectar():
    """Evento disparado quando um cliente se desconecta."""
    clientes_conectados.discard(request.sid)  # Remove o cliente da lista de conectados
    if request.sid in sessoes_audio:
        del sessoes_audio[request.sid]  # Remove a sessão de áudio associada ao cliente
    print(f'Cliente desconectado: {request.sid} - Restantes: {len(clientes_conectados)}')

@socketio.on('audio_metadata')
def ao_receber_metadados(dados):
    """Recebe metadados do áudio e inicializa a sessão do cliente."""
    id_sessao = request.sid
    sessoes_audio[id_sessao] = {
        'pedaços': [None] * dados['totalChunks'],  # Lista para armazenar os pedaços de áudio
        'tipo': dados['type'],  # Tipo do áudio (exemplo: "mp3", "wav")
        'total_pedaços': dados['totalChunks'],  # Total de partes do áudio
        'id_transmissao': f"stream_{id_sessao}_{int(time.time())}"  # Gera um ID único para a transmissão
    }
    emit('metadata_received', {'status': 'ready'})  # Notifica que os metadados foram recebidos

@socketio.on('audio_chunk')
def ao_receber_pedaco_audio(dados):
    """Recebe e processa pedaços de áudio enviados pelo cliente."""
    id_sessao = request.sid
    if id_sessao not in sessoes_audio:
        emit('error', {'message': 'Sessão não inicializada'})  # Retorna erro caso a sessão não tenha sido iniciada
        return
    
    # Armazena o pedaço de áudio na posição correta
    sessoes_audio[id_sessao]['pedaços'][dados['chunkId']] = dados['data']
    
    # Envia o pedaço de áudio processado para todos os clientes conectados (broadcast=True)
    emit('audio_processed', {
        'id_transmissao': sessoes_audio[id_sessao]['id_transmissao'],  # ID da transmissão
        'id_pedaco': dados['chunkId'],  # Número do pedaço de áudio
        'dados': dados['data'],  # Dados do áudio
        'total_pedaços': sessoes_audio[id_sessao]['total_pedaços']  # Total de pedaços
    }, broadcast=True)  # Transmite para todos os clientes conectados

from collections import defaultdict
import time

# Adicione estas variáveis globais
clientes_prontos = set()
sessoes_prontas = defaultdict(set)

@socketio.on('cliente_pronto')
def handle_cliente_pronto(data):
    id_sessao = request.sid
    id_transmissao = data.get('id_transmissao')
    
    if not id_transmissao:
        return
    
    # Adiciona à lista de prontos
    sessoes_prontas[id_transmissao].add(id_sessao)
    print(f"Cliente {id_sessao} pronto para {id_transmissao}")
    
    # Verifica se todos nesta sessão de áudio estão prontos
    clientes_na_transmissao = [sid for sid in sessoes_audio 
                             if sessoes_audio[sid]['id_transmissao'] == id_transmissao]
    
    if len(sessoes_prontas[id_transmissao]) >= len(clientes_na_transmissao) and clientes_na_transmissao:
        print(f"Todos prontos para {id_transmissao} - Iniciando reprodução")
        emit('iniciar_reproducao', {
            'id_transmissao': id_transmissao,
            'timestamp': time.time()
        }, broadcast=True)
        # Limpa a lista para esta transmissão
        sessoes_prontas.pop(id_transmissao, None)

@socketio.on('player_control')
def handle_player_control(data):
    """Recebe comandos de controle do player e transmite para todos"""
    try:
        id_sessao = request.sid
        id_transmissao = data.get('id_transmissao')
        
        if not id_transmissao or id_transmissao not in [sessao['id_transmissao'] 
                                                      for sessao in sessoes_audio.values()]:
            return
            
        emit('player_control', {
            'action': data['action'],
            'currentTime': data.get('currentTime', 0),
            'id_transmissao': id_transmissao
        }, broadcast=True)
        
    except Exception as e:
        print(f'Erro no handler de controle: {str(e)}')
# -----------------------------------------------------------------

# Executor do servidor
if __name__ == '__main__':
    import time  # Import necessário para gerar id_transmissao
    print("Iniciando servidor...")
    socketio.run(app, host='192.168.1.2', port=5000, debug=True)  # Inicia o servidor na porta 5000
