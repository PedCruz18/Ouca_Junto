import eventlet
eventlet.monkey_patch()

import os
from flask import Flask, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO
from config import SOCKETIO_CONFIG, DEBUG_MODE, HOST, PORT, SERVER_URL, IS_PRODUCTION
from modules.routes import init_routes
from modules.sockets import init_sockets

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'minha-chave-secreta-dev')  # Melhor para segurança
CORS(app)

# Socket.IO com configurações dinâmicas
socketio = SocketIO(app, **SOCKETIO_CONFIG)

# Rota para verificar configurações (opcional)
@app.route('/api/config')
def show_config():
    """Endpoint que mostra as configurações ativas (útil para debug)"""
    return jsonify({
        'server_url': SERVER_URL,
        'host': HOST,
        'port': PORT,
        'debug_mode': DEBUG_MODE,
        'production': IS_PRODUCTION
    })

# Inicializa rotas e sockets
init_routes(app)
init_sockets(socketio)

if __name__ == '__main__':
    print(f"\n{'='*50}")
    print(f"Servidor iniciando em modo {'PRODUÇÃO' if IS_PRODUCTION else 'DESENVOLVIMENTO'}")
    print(f"URL do servidor: {SERVER_URL}")
    print(f"Host: {HOST} | Porta: {PORT}")
    print(f"Debug mode: {'ON' if DEBUG_MODE else 'OFF'}")
    print(f"{'='*50}\n")
    
    socketio.run(app, host=HOST, port=PORT, debug=DEBUG_MODE)