# (IMPORTS)---------------------------------------------------------
import random
import string
import eventlet
eventlet.monkey_patch()
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import os

#-------------------------------------------------------------------

# (Inicialização de Recursos)---------------------------------------

# Inicializa o aplicativo Flask
app = Flask(__name__)
app.config['SECRET_KEY'] = 'minha-chave-secreta'

# Configuração do SocketIO
CORS(app)

#-------------------------------------------------------------------

# (Detecta se está rodando em hospedagem ou desenvolvimento)-------------------------------------------------------------------

if os.getenv("RENDER") == "true":
    socketio = SocketIO(app, ping_timeout=120, ping_interval=20, async_mode='eventlet', cors_allowed_origins="*")
    HOST = "0.0.0.0"  # Para hospedagem, use "0.0.0.0"
    PORT = int(os.environ.get("PORT", 10000))  # Usa a porta definida pelo Render
    DEBUG_MODE = False  # Desativa o debug em produção
else:
    socketio = SocketIO(app, ping_timeout=120, ping_interval=20, async_mode='eventlet', cors_allowed_origins="*")
    HOST = "192.168.137.1"  # Para desenvolvimento, use "127.0.0.1"
    PORT = 5000  # Porta local
    DEBUG_MODE = True  # Ativa o debug em modo desenvolvimento

#------------------------------------------------------------------------------------------------------------------

# (Rotas e Interfaces)--------------------

# Rota do rádio --------------
@app.route('/')
def Rádio():
    return render_template('Rádio.html')

#-----------------------------------------

def generate_short_id():
    """Gera um ID de 5 caracteres alfanuméricos (ex: 'a3b9c')."""
    chars = string.ascii_lowercase + string.digits  # abcdefghijklmnopqrstuvwxyz0123456789
    return ''.join(random.choice(chars) for _ in range(5))

# Rota que seu frontend já chama (/get_client_id)
@app.route('/get_client_id')
def get_client_id():
    client_id = generate_short_id()
    print(f'[Backend] ID curto gerado: {client_id}')
    return jsonify({"client_id": client_id})  # Mantém a mesma estrutura que seu JS espera

# Evento de conexão do Socket.IO
@socketio.on('connect')
def handle_connect():
    client_id = request.args.get('client_id')
    if client_id and len(client_id) == 5:
        print(f'[Socket] Cliente conectado com ID curto válido: {client_id}')
    else:
        client_id = generate_short_id()
        print(f'[Socket] Gerado novo ID curto para cliente: {client_id}')
    
    emit('client_id_update', {'client_id': client_id})  # Envia o ID (curto) de volta

# Executor do servidor
if __name__ == '__main__':
    print(f"Iniciando servidor em modo {'produção' if not DEBUG_MODE else 'desenvolvimento'}...")
    socketio.run(app, host=HOST, port=PORT, debug=DEBUG_MODE)
