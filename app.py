from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
from config import socketio_config, DEBUG_MODE, HOST, PORT
from modules.routes import init_routes
from modules.sockets import init_sockets

app = Flask(__name__)
app.config['SECRET_KEY'] = 'minha-chave-secreta'
CORS(app)

socketio = SocketIO(app, **socketio_config)

# Inicializa rotas e sockets
init_routes(app)
init_sockets(socketio)

if __name__ == '__main__':
    print(f"Iniciando servidor em modo {'produção' if not DEBUG_MODE else 'desenvolvimento'}...")
    socketio.run(app, host=HOST, port=PORT, debug=DEBUG_MODE)
