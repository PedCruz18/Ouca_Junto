import random
import eventlet
eventlet.monkey_patch()
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room
from flask_cors import CORS
import os

#-------------------------------------------------------------------

app = Flask(__name__)
app.config['SECRET_KEY'] = 'minha-chave-secreta'
CORS(app)

# Configuração do ambiente
socketio_config = {
    "ping_timeout": 120,
    "ping_interval": 20,
    "async_mode": "eventlet",
    "cors_allowed_origins": "*"
}

if os.getenv("RENDER", "false").lower() == "true":
    HOST, PORT, DEBUG_MODE = "0.0.0.0", int(os.environ.get("PORT", 10000)), False
else:
    HOST, PORT, DEBUG_MODE = "10.160.52.85", 5000, True

socketio = SocketIO(app, **socketio_config)

#-------------------------------------------------------------------

# Estrutura para armazenar transmissões de áudio
transmissoes = {}

def obter_host(id_transmissao):
    """Obtém o host associado a uma transmissão, retornando None se não existir."""
    for sid, info in transmissoes.items():
        if info["id"] == id_transmissao:
            return sid
    print("❌ Erro: Transmissão não encontrada")
    return None

@socketio.on("audio_metadata")
def receber_metadata(data):
    """Recebe os metadados do áudio e mantém o mesmo ID para transmissões do mesmo host."""
    sid = request.sid
    transmissao_id = None

    # Se já existe uma transmissão ativa, usamos o mesmo ID
    for host_sid, info in transmissoes.items():
        if sid in info["clientes_prontos"]:  # O cliente já está em uma transmissão
            transmissao_id = info["id"]
            break

    # Se não existe um ID definido, é um novo host
    if transmissao_id is None:
        transmissao_id = ''.join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=8))
        transmissoes[sid] = {
            "id": transmissao_id,
            "total_pedacos": data["totalChunks"],
            "tipo": data["type"],
            "pedaços": {},
            "clientes_prontos": [sid]  # Adiciona o próprio host
        }

    print(f"📡 Transmissão ativa: {transmissao_id} para {sid}")

    emit("transmissao_iniciada", {"id_transmissao": transmissao_id}, to=sid)


@socketio.on("audio_chunk")
def receber_pedaco(data):
    """Recebe um pedaço do áudio e o envia apenas para os clientes conectados à transmissão."""
    id_transmissao = data.get("id_transmissao")
    id_pedaco = data.get("chunkId")
    chunk_data = data.get("data")

    host_sid = obter_host(id_transmissao)
    if not host_sid:
        return

    # Evita reprocessar pedaços duplicados
    if id_pedaco in transmissoes[host_sid]["pedaços"]:
        print(f"⚠️ Pedaço {id_pedaco} já foi recebido, ignorando...")
        return

    transmissoes[host_sid]["pedaços"][id_pedaco] = chunk_data
    total_pedacos = transmissoes[host_sid]["total_pedacos"]

    print(f"📥 Recebido pedaço {id_pedaco + 1}/{total_pedacos} da transmissão {id_transmissao}")

    emit("audio_processed", {
        "id_transmissao": id_transmissao,
        "id_pedaco": id_pedaco,
        "total_pedaços": total_pedacos,
        "dados": chunk_data
    }, room=id_transmissao)

@socketio.on("cliente_pronto")
def cliente_pronto(data):
    """Adiciona o cliente à sala e envia os pedaços do áudio já recebidos."""
    id_transmissao = data.get("id_transmissao")

    host_sid = obter_host(id_transmissao)
    if not host_sid:
        return

    join_room(id_transmissao)
    transmissoes[host_sid]["clientes_prontos"].append(request.sid)

    print(f"🎧 Cliente {request.sid} conectado à transmissão {id_transmissao}")

    # Reenviar os pedaços já recebidos para o novo cliente
    for chunk_id, chunk_data in transmissoes[host_sid]["pedaços"].items():
        emit("audio_processed", {
            "id_transmissao": id_transmissao,
            "id_pedaco": chunk_id,
            "total_pedaços": transmissoes[host_sid]["total_pedacos"],
            "dados": chunk_data
        }, to=request.sid)

    emit("iniciar_reproducao", {"id_transmissao": id_transmissao}, to=request.sid)

@socketio.on("player_control")
def controle_player(data):
    """Repassa o controle do player apenas para os clientes da transmissão."""
    id_transmissao = data.get("id_transmissao")
    action = data.get("action")
    current_time = data.get("currentTime", 0)

    if not obter_host(id_transmissao):
        return

    print(f"🔄 Comando recebido: {action} @ {current_time}s")

    emit("player_control", {
        "id_transmissao": id_transmissao,
        "action": action,
        "currentTime": current_time
    }, room=id_transmissao)

#-------------------------------------------------------------------

@app.route('/')
def Rádio():
    return render_template('Rádio.html')

#-------------------------------------------------------------------

if __name__ == '__main__':
    print(f"Iniciando servidor em modo {'produção' if not DEBUG_MODE else 'desenvolvimento'}...")
    socketio.run(app, host=HOST, port=PORT, debug=DEBUG_MODE)
