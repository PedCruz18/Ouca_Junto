# (IMPORTS)---------------------------------------------------------
import eventlet
eventlet.monkey_patch()
from flask import Flask, render_template
from flask_socketio import SocketIO
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



# Executor do servidor
if __name__ == '__main__':
    print(f"Iniciando servidor em modo {'produção' if not DEBUG_MODE else 'desenvolvimento'}...")
    socketio.run(app, host=HOST, port=PORT, debug=DEBUG_MODE)
