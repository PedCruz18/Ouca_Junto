# (IMPORTS)---------------------------------------------------------
import random
import eventlet
eventlet.monkey_patch()
from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from flask_cors import CORS
import os

#-------------------------------------------------------------------

# (Inicialização de Recursos)---------------------------------------

app = Flask(__name__)
app.config['SECRET_KEY'] = 'minha-chave-secreta'
CORS(app)

if os.getenv("RENDER", "false").lower() == "true":
    socketio = SocketIO(app, ping_timeout=120, ping_interval=20, async_mode='eventlet', cors_allowed_origins="*")
    HOST = "0.0.0.0"
    PORT = int(os.environ.get("PORT", 10000))
    DEBUG_MODE = False
else:
    socketio = SocketIO(app, ping_timeout=120, ping_interval=20, async_mode='eventlet', cors_allowed_origins="*")
    HOST = "192.168.1.2"
    PORT = 5000
    DEBUG_MODE = True

#-------------------------------------------------------------------
# Estrutura para armazenar transmissões de áudio
transmissoes = {}

@socketio.on("audio_metadata")
def receber_metadata(data):
    """Recebe os metadados do áudio enviado por um cliente."""
    transmissao_id = ''.join(random.choices("abcdefghijklmnopqrstuvwxyz0123456789", k=8))
    transmissoes[transmissao_id] = {
        "total_pedacos": data["totalChunks"],
        "tipo": data["type"],
        "pedaços": {},
        "clientes_prontos": []
    }
    print(f"📡 Nova transmissão iniciada: {transmissao_id}")
    emit("transmissao_iniciada", {"id_transmissao": transmissao_id}, broadcast=True)


@socketio.on("audio_chunk")
def receber_pedaco(data):
    """Recebe um pedaço do áudio e armazena."""
    id_transmissao = data.get("id_transmissao")
    id_pedaco = data.get("chunkId")
    chunk_data = data.get("data")

    if id_transmissao not in transmissoes:
        print("❌ Erro: Transmissão não encontrada")
        return
    
    transmissoes[id_transmissao]["pedaços"][id_pedaco] = chunk_data
    total_pedacos = transmissoes[id_transmissao]["total_pedacos"]

    print(f"📥 Recebido pedaço {id_pedaco + 1}/{total_pedacos} da transmissão {id_transmissao}")

    # Reenvia o pedaço para os clientes
    emit("audio_processed", {
        "id_transmissao": id_transmissao,
        "id_pedaco": id_pedaco,
        "total_pedaços": total_pedacos,
        "dados": chunk_data
    }, broadcast=True)


@socketio.on("cliente_pronto")
def cliente_pronto(data):
    """Marca um cliente como pronto para reprodução."""
    id_transmissao = data.get("id_transmissao")

    if id_transmissao not in transmissoes:
        print("❌ Erro: Transmissão não encontrada")
        return

    transmissoes[id_transmissao]["clientes_prontos"].append(request.sid)

    print(f"🎧 Cliente {request.sid} pronto para transmissão {id_transmissao}")

    # Se todos os pedaços foram recebidos, iniciamos a reprodução
    if len(transmissoes[id_transmissao]["pedaços"]) == transmissoes[id_transmissao]["total_pedacos"]:
        emit("iniciar_reproducao", {"id_transmissao": id_transmissao}, room=request.sid)


@app.route('/')
def Rádio():
    return render_template('Rádio.html')


if __name__ == '__main__':
    print(f"Iniciando servidor em modo {'produção' if not DEBUG_MODE else 'desenvolvimento'}...")
    socketio.run(app, host=HOST, port=PORT, debug=DEBUG_MODE)
