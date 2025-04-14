from flask import request
from flask_socketio import emit, join_room
from modules.utils import gerar_id_curto, cliente_pertence_transmissao, obter_host

transmissoes = {}

def init_sockets(socketio):
    @socketio.on("audio_metadata")
    def receber_metadata(data):
        sid = request.sid
        if not data or "type" not in data or "totalChunks" not in data:
            emit("erro_transmissao", {"mensagem": "Metadados incompletos"}, to=sid)
            print(f"⚠️ Erro: Metadados incompletos recebidos de {sid}")
            return

        if "id_transmissao" not in data or not data["id_transmissao"]:
            id_transmissao = gerar_id_curto()
            while any(info["id"] == id_transmissao for info in transmissoes.values()):
                id_transmissao = gerar_id_curto()

            transmissoes[sid] = {
                "id": id_transmissao,
                "pedaços": {},
                "clientes_prontos": [sid],
                "total_pedacos": data["totalChunks"],
                "tipo": data["type"],
                "status": "iniciando"
            }
            print(f"🔴 Transmissão iniciada com o ID {id_transmissao} para o cliente {sid}")
            emit("transmissao_iniciada", {"id_transmissao": id_transmissao}, to=sid)
            return

        id_transmissao = data["id_transmissao"]
        host_sid = obter_host(transmissoes, id_transmissao)
        if not host_sid or not cliente_pertence_transmissao(transmissoes, sid, id_transmissao):
            print(f"⚠️ Cliente {sid} não autorizado ou transmissão inexistente para ID {id_transmissao}")
            emit("erro_transmissao", {"mensagem": "Não autorizado ou inexistente"}, to=sid)
            return

        transmissoes[host_sid].update({
            "pedaços": {},
            "total_pedacos": data["totalChunks"],
            "tipo": data["type"],
            "status": "recebendo_audio"
        })
        print(f"📡 Transmissão {id_transmissao} atualizada - recebendo áudio")
        emit("transmissao_atualizada", data, room=id_transmissao)

    @socketio.on("audio_chunk")
    def receber_pedaco(data):
        id_transmissao = data.get("id_transmissao")
        id_pedaco = data.get("chunkId")
        chunk_data = data.get("data")

        host_sid = obter_host(transmissoes, id_transmissao)
        if not host_sid or id_pedaco is None:
            return

        if id_pedaco in transmissoes[host_sid]["pedaços"]:
            return

        transmissoes[host_sid]["pedaços"][id_pedaco] = chunk_data
        emit("audio_processed", {
            "id_transmissao": id_transmissao,
            "id_pedaco": id_pedaco,
            "total_pedaços": transmissoes[host_sid]["total_pedacos"],
            "dados": chunk_data
        }, room=id_transmissao)

    @socketio.on("cliente_pronto")
    def cliente_pronto(data):
        id_transmissao = data.get("id_transmissao")
        host_sid = obter_host(transmissoes, id_transmissao)
        if not host_sid:
            return

        print(f"🎉 Cliente {request.sid} pronto para a transmissão {id_transmissao}")
        join_room(id_transmissao)
        transmissoes[host_sid]["clientes_prontos"].append(request.sid)

        # Enviando os pedaços de áudio para o novo cliente
        for chunk_id, chunk_data in transmissoes[host_sid]["pedaços"].items():
            emit("audio_processed", {
                "id_transmissao": id_transmissao,
                "id_pedaco": chunk_id,
                "total_pedaços": transmissoes[host_sid]["total_pedacos"],
                "dados": chunk_data
            }, to=request.sid)

        emit("iniciar_reproducao", {"id_transmissao": id_transmissao}, to=request.sid)

    @socketio.on("controle_player")
    def controle_player(data):
        id_transmissao = data.get("id_transmissao")
        acao = data.get("action")
        tempo_atual = data.get("currentTime", 0) 

        if not obter_host(transmissoes, id_transmissao):
            print(f"⚠️ Falha: Não encontrado host para a transmissão {id_transmissao}")
            return

        print(f"🔄 Enviando comando {acao} para a transmissão {id_transmissao} (Tempo: {tempo_atual}s)")

        # Emitindo para todos os clientes da sala
        emit("player_control", { 
            "id_transmissao": id_transmissao,
            "action": acao, 
            "currentTime": tempo_atual 
        }, room=id_transmissao)

        print(f"✅ Comando {acao} enviado com sucesso para todos os clientes da transmissão {id_transmissao}")

