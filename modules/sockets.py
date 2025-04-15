from flask import request
from flask_socketio import emit, join_room
from modules.utils import gerar_id_curto, cliente_pertence_transmissao, obter_host
from time import time

transmissoes = {}
COMANDOS_VALIDOS = ['play', 'pause', 'seek']

def init_sockets(socketio):
    @socketio.on("audio_metadata")
    def receber_metadata(data):
        print(f"🛬 Metadados recebidos no início: {data}") 
        sid = request.sid

        # Verificação dos metadados recebidos
        if not data or "type" not in data or "totalChunks" not in data:
            emit("erro_transmissao", {"mensagem": "Metadados incompletos"}, to=sid)
            print(f"⚠️ Erro: Metadados incompletos recebidos de {sid}")
            return

        print(f"📥 totalChunks recebido do cliente {sid}: {data['totalChunks']}")

        # Criação de nova transmissão
        if "id_transmissao" not in data or not data["id_transmissao"]:
            id_transmissao = gerar_id_curto()
            while any(info["id"] == id_transmissao for info in transmissoes.values()):
                id_transmissao = gerar_id_curto()

            join_room(id_transmissao)

            transmissoes[sid] = {
                "id": id_transmissao,
                "pedacos": {},
                "clientes_prontos": [sid],
                "total_pedacos": data["totalChunks"],
                "tipo": data["type"],
                "status": "iniciando"
            }

            print(f"🔴 Transmissão iniciada com o ID {id_transmissao} para o cliente {sid}")
            print(f"✅ total_pedacos definido (nova transmissão): {data['totalChunks']}")

            emit("transmissao_iniciada", {"id_transmissao": id_transmissao}, to=sid)
            return

        # Atualização de uma transmissão existente
        id_transmissao = data["id_transmissao"]
        host_sid = obter_host(transmissoes, id_transmissao)
        if host_sid:
            transmissoes[host_sid].update({
                "pedacos": {},
                "total_pedacos": data["totalChunks"],
                "tipo": data["type"],
                "status": "recebendo_audio"
            })

            print(f"♻️ total_pedacos atualizado para a transmissão {id_transmissao}: {data['totalChunks']}")
            print(f"📤 Emitindo metadados atualizados para sala {id_transmissao} com total_pedacos = {data['totalChunks']}")
            
            emit("transmissao_atualizada", data, room=id_transmissao)

    @socketio.on("audio_chunk")
    def receber_pedaco(data):
        id_transmissao = data.get("id_transmissao")
        id_pedaco = data.get("chunkId")
        chunk_data = data.get("data")
        sid = request.sid

        host_sid = obter_host(transmissoes, id_transmissao)
        if not host_sid or id_pedaco is None:
            print(f"⚠️ Pedaço ignorado: id_transmissao inválido ({id_transmissao}) ou id_pedaco ausente.")
            return

        # Verifica se 'total_pedacos' foi definido antes de processar os pedaços
        if "total_pedacos" not in transmissoes[host_sid]:
            print(f"❌ total_pedacos não definido para a transmissão {id_transmissao} (host: {host_sid})")
            emit("erro_transmissao", {"mensagem": "Erro: 'total_pedacos' não definido corretamente"}, to=sid)
            return

        # Evita sobrescrever pedaços já existentes
        if id_pedaco in transmissoes[host_sid]["pedacos"]:
            print(f"🔁 Pedaço {id_pedaco} já processado para a transmissão {id_transmissao}. Ignorando.")
            return

        # Armazena o pedaço
        transmissoes[host_sid]["pedacos"][id_pedaco] = chunk_data

        print(f"✅ Cliente {sid} enviou pedaço {id_pedaco} para a transmissão {id_transmissao}")
        #print(f"📡 Retransmitindo pedaço {id_pedaco} para a sala {id_transmissao}")

        # Retransmitindo apenas para clientes que já estão na sala
        for cliente_sid in transmissoes[host_sid]["clientes_prontos"]:
            print(f"🔁 Enviando pedaço {id_pedaco} da transmissão {id_transmissao} para o cliente {cliente_sid}")
            emit("audio_processed", {
                "id_transmissao": id_transmissao,
                "id_pedaco": id_pedaco,
                "total_pedacos": transmissoes[host_sid]["total_pedacos"],
                "dados": chunk_data
            }, to=cliente_sid)

    @socketio.on("cliente_pronto")
    def cliente_pronto(data):
        id_transmissao = data.get("id_transmissao")
        host_sid = obter_host(transmissoes, id_transmissao)

        # Verifica se a transmissão existe
        if not host_sid:
            emit("erro_transmissao", {"mensagem": "Transmissão não encontrada"}, to=request.sid)
            print(f"⚠️ Cliente {request.sid} tentou acessar uma transmissão inexistente: {id_transmissao}")
            return

        join_room(id_transmissao)
        if request.sid not in transmissoes[host_sid]["clientes_prontos"]:
            transmissoes[host_sid]["clientes_prontos"].append(request.sid)
        print(f"🎧 Cliente {request.sid} entrou na transmissão {id_transmissao}")

        # Obtém o total de pedaços da transmissão
        total_pedacos = transmissoes[host_sid].get("total_pedacos")

        # Verifica se o total_pedacos é válido
        if not total_pedacos or total_pedacos <= 0:
            emit("erro_transmissao", {"mensagem": "Total de pedaços inválido ou não definido."}, to=request.sid)
            print(f"⚠️ Transmissão {id_transmissao} não tem total_pedacos válido.")
            return

        # Envia metadados da transmissão para o cliente
        print(f"📦 Enviando metadados para {request.sid}: total_pedacos = {total_pedacos}")
        emit("audio_metadata", {
            "id_transmissao": id_transmissao,
            "type": transmissoes[host_sid]["tipo"],
            "total_pedacos": total_pedacos
        }, to=request.sid)

        # Obtém todos os pedaços da transmissão
        pedacos = list(transmissoes[host_sid]["pedacos"].items())

        # Envia todos os pedaços processados para o cliente novo
        print(f"📡 Enviando pedaços para o cliente {request.sid}...")
        # Envia os pedaços restantes sem prioridade
        for chunk_id, chunk_data in pedacos[int(len(pedacos) * 0.1):]:
            print(f"🔁 Enviando pedaço {chunk_id} da transmissão {id_transmissao} para o cliente {request.sid}")
            emit("audio_processed", {
                "id_transmissao": id_transmissao,
                "id_pedaco": chunk_id,
                "dados": chunk_data
                
    }, to=request.sid)
        # Envia os primeiros 10% dos pedaços com prioridade
        primeiros_pedacos = pedacos[:int(len(pedacos) * 0.1)]
        for chunk_id, chunk_data in primeiros_pedacos:
            emit("audio_processed", {
                "id_transmissao": id_transmissao,
                "id_pedaco": chunk_id,
                "dados": chunk_data,
                "priority": True
            }, to=request.sid)

        # Envia os pedaços restantes sem prioridade
        for chunk_id, chunk_data in pedacos[int(len(pedacos) * 0.1):]:
            emit("audio_processed", {
                "id_transmissao": id_transmissao,
                "id_pedaco": chunk_id,
                "dados": chunk_data
            }, to=request.sid)
            
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

            id_transmissao = data["id_transmissao"]
            host_sid = obter_host(transmissoes, id_transmissao)

            # Verifica se 'total_pedacos' está presente antes de processar
            if "total_pedacos" not in transmissoes.get(host_sid, {}):
                emit("erro_transmissao", {"mensagem": "Erro: 'total_pedacos' não definido corretamente"}, to=request.sid)
                return
            #print(f"🎮 Comando player recebido com total_pedacos = {transmissoes[host_sid]['total_pedacos']}")

            # Adiciona timestamp do servidor
            dados_validados = {
                **data,
                "server_time": time(),
                "valid": True
            }

            #print(f"📡 Retransmitindo comando {data['action']} @ {data['currentTime']:.2f}s")
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
