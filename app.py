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

# Inicializa rotas e sockets
init_routes(app)
init_sockets(socketio)

if __name__ == '__main__':
    print(f"Servidor iniciando em modo {'PRODUÇÃO' if IS_PRODUCTION else 'DESENVOLVIMENTO'}")
    socketio.run(app, host=HOST, port=PORT, debug=DEBUG_MODE)