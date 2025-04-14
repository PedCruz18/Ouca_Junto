from flask import request
from flask_socketio import emit, join_room
from modules.utils import gerar_id_curto, cliente_pertence_transmissao, obter_host
from time import time

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
            emit("erro_transmissao", {"mensagem": "Transmissão não encontrada"}, to=request.sid)
            print(f"⚠️ Cliente {request.sid} tentou acessar transmissão inexistente: {id_transmissao}")
            return

        # 1. Adiciona cliente à sala e lista de prontos
        join_room(id_transmissao)
        transmissoes[host_sid]["clientes_prontos"].append(request.sid)
        print(f"🎧 Cliente {request.sid} entrou na transmissão {id_transmissao}")

        # 2. Envia metadados primeiro (tipo/tamanho do áudio)
        emit("audio_metadata", {
            "id_transmissao": id_transmissao,
            "type": transmissoes[host_sid]["tipo"],
            "total_pedaços": transmissoes[host_sid]["total_pedacos"]
        }, to=request.sid)

        # 3. Envia pedaços prioritários (primeiros 10% para buffer inicial)
        pedacos = list(transmissoes[host_sid]["pedaços"].items())
        primeiros_pedacos = pedacos[:int(len(pedacos) * 0.1)]
        
        for chunk_id, chunk_data in primeiros_pedacos:
            emit("audio_processed", {
                "id_transmissao": id_transmissao,
                "id_pedaco": chunk_id,
                "dados": chunk_data,
                "priority": True  # Sinaliza que são pedaços prioritários
            }, to=request.sid)

        # 4. Envia o restante dos pedaços
        for chunk_id, chunk_data in pedacos[int(len(pedacos) * 0.1):]:
            emit("audio_processed", {
                "id_transmissao": id_transmissao,
                "id_pedaco": chunk_id,
                "dados": chunk_data
            }, to=request.sid)

        # 5. Sincronização precisa:
        tempo_atual_host = transmissoes[host_sid].get("tempo_atual", 0)
        latencia_estimada = 0.5  # Valor inicial (ajustável dinamicamente)

        emit("iniciar_reproducao", {
            "id_transmissao": id_transmissao,
            "tempo_atual": tempo_atual_host + latencia_estimada,  # Compensa latência
            "server_time": time(),  # Timestamp de referência
            "buffer_minimo": 3.0  # Tempo mínimo de buffer sugerido
        }, to=request.sid)

        print(f"🔄 Sincronização enviada para {request.sid} | Tempo: {tempo_atual_host:.2f}s")

    COMANDOS_VALIDOS = ['play', 'pause', 'seek']

    @socketio.on("controle_player")
    def controle_player(data):
        try:
            # Validação reforçada
            if (not data or 
                data.get("action") not in COMANDOS_VALIDOS or
                not isinstance(data.get("currentTime"), (int, float)) or
                not data.get("id_transmissao")):
                
                print(f"🚫 Comando inválido bloqueado: {data}")
                return

            # Adiciona timestamp do servidor
            dados_validados = {
                **data,
                "server_time": time(),
                "valid": True
            }

            print(f"📡 Retransmitindo comando {data['action']} @ {data['currentTime']:.2f}s")
            emit("player_control", dados_validados, room=data["id_transmissao"])
            
        except Exception as e:
            print(f"🔥 Erro no controle_player: {e}\nDados: {data}")
        
    @socketio.on("solicitar_sincronizacao")
    def sincronizar_tempo(data):
        id_transmissao = data.get("id_transmissao")
        host_sid = obter_host(transmissoes, id_transmissao)
        if not host_sid:
            return

        emit("atualizar_tempo", {
            "id_transmissao": id_transmissao,
            "tempo_atual": transmissoes[host_sid].get("tempo_atual", 0),
            "server_time": time()
        }, room=id_transmissao)