from flask import request
from flask_socketio import emit, join_room, leave_room
from modules.utils import gerar_id_curto, obter_host
from time import time

transmissoes = {}
COMANDOS_VALIDOS = ['play', 'pause', 'seek']

def init_sockets(socketio):
    @socketio.on("audio_metadata")
    def receber_metadata(data):
        print("-------------------------------------------------------------")
        print(f"🧑🏻‍💻 {request.sid} enviou metadados: {data} 📡")
        sid = request.sid

        # Verificação dos metadados recebidos
        if not data or "type" not in data or "totalChunks" not in data:
            emit("erro_transmissao", {"mensagem": "Metadados incompletos"}, to=sid)
            print(f"⚠️ Erro: Metadados incompletos recebidos de {sid}")
            return

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

            print(f"🔴 Transmissão iniciada na SALA: {id_transmissao} para o cliente: {sid}")
            print("-------------------------------------------------------------")
            
            emit("transmissao_iniciada", {"id_transmissao": id_transmissao}, to=sid)
            
            # 👇 NOVO: Emite lista de participantes para a nova transmissão
            emit("atualizar_participantes", {
                "participantes": transmissoes[sid]["clientes_prontos"]
            }, room=id_transmissao)
            
            return

        # Atualização de uma transmissão existente
        id_transmissao = data["id_transmissao"]
        host_sid = obter_host(transmissoes, id_transmissao)

        if host_sid:
            print(f"♻️ Reinicializando pedaços e metadados da transmissão existente: {id_transmissao}")

            # Resetando apenas os dados relevantes
            transmissoes[host_sid]["pedacos"] = {}
            transmissoes[host_sid]["total_pedacos"] = data["totalChunks"]
            transmissoes[host_sid]["tipo"] = data["type"]
            transmissoes[host_sid]["status"] = "reiniciada"

            join_room(id_transmissao)

            print(f"📤 ✅ Transmissão {id_transmissao} atualizada com novo total de pedaços: {data['totalChunks']}")

            # Notifica os clientes da atualização
            emit("transmissao_atualizada", data, room=id_transmissao)

            # Envia também os metadados atualizados para todo mundo na sala
            emit("audio_metadata", {
                "id_transmissao": id_transmissao,
                "type": data["type"],
                "total_pedacos": data["totalChunks"]
            }, room=id_transmissao)
            
            # 👇 NOVO: Emite lista atualizada de participantes
            emit("atualizar_participantes", {
                "participantes": transmissoes[host_sid]["clientes_prontos"]
            }, room=id_transmissao)

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

        print("-------------------------------------------------------------")

        # Retransmitindo apenas para clientes que já estão na sala
        for cliente_sid in transmissoes[host_sid]["clientes_prontos"]:
            print(f"🔁 Enviando pedaço {id_pedaco} da transmissão {id_transmissao} para o cliente: 🧑🏻‍💻 {cliente_sid}")
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
            emit("erro_transmissao", {"mensagem": "Sala não existe!"}, to=request.sid)
            print(f"⚠️ 🧑🏻‍� Cliente: {request.sid} tentou acessar uma transmissão inexistente: {id_transmissao}")
            return

        join_room(id_transmissao)  # O cliente entra na sala (mesmo que já esteja, não causa problemas)

        # 👇 Verifica se o cliente já estava na lista antes de adicioná-lo
        if request.sid not in transmissoes[host_sid]["clientes_prontos"]:
            transmissoes[host_sid]["clientes_prontos"].append(request.sid)
            print(f"🧑🏻‍💻 ✅ Cliente: {request.sid} entrou na SALA: {id_transmissao}")
            
            # Emite a lista atualizada APENAS se era um novo cliente
            emit("atualizar_participantes", {
                "participantes": transmissoes[host_sid]["clientes_prontos"]
            }, room=id_transmissao)
        else:
            print(f"ℹ️ Cliente {request.sid} já estava na lista de participantes")



        # Resto do código (envio de metadados e pedaços de áudio)...
        total_pedacos = transmissoes[host_sid].get("total_pedacos")

        if not total_pedacos or total_pedacos <= 0:
            emit("erro_transmissao", {"mensagem": "Total de pedaços inválido ou não definido."}, to=request.sid)
            print(f"⚠️ Transmissão {id_transmissao} não tem total_pedacos válido.")
            return

        print(f"📦 ✅ Enviando metadados para {request.sid}: total_pedacos = {total_pedacos}")
        emit("audio_metadata", {
            "id_transmissao": id_transmissao,
            "type": transmissoes[host_sid]["tipo"],
            "total_pedacos": total_pedacos
        }, to=request.sid)

        # Envia os pedaços (priorizando os primeiros 10%)
        pedacos = list(transmissoes[host_sid]["pedacos"].items())
        
        for chunk_id, chunk_data in pedacos[:int(len(pedacos) * 0.1)]:
            emit("audio_processed", {
                "id_transmissao": id_transmissao,
                "id_pedaco": chunk_id,
                "dados": chunk_data,
                "total_pedacos": total_pedacos,
                "priority": True
            }, to=request.sid)

        for chunk_id, chunk_data in pedacos[int(len(pedacos) * 0.1):]:
            emit("audio_processed", {
                "id_transmissao": id_transmissao,
                "id_pedaco": chunk_id,
                "dados": chunk_data,
                "total_pedacos": total_pedacos
            }, to=request.sid)

        emit("transmissao_iniciada", {
            "id_transmissao": id_transmissao
        }, to=request.sid)
        
    @socketio.on("controle_player")
    def controle_player(data):
        try:
            if (not data or 
                data.get("action") not in COMANDOS_VALIDOS or
                not isinstance(data.get("currentTime"), (int, float)) or
                not data.get("id_transmissao")):
                
                print(f"🚫 Comando inválido bloqueado: {data}")
                return

            id_transmissao = data["id_transmissao"]
            host_sid = obter_host(transmissoes, id_transmissao)

            if "total_pedacos" not in transmissoes.get(host_sid, {}):
                emit("erro_transmissao", {"mensagem": "Erro: 'total_pedacos' não definido corretamente"}, to=request.sid)
                return

            dados_validados = {
                **data,
                "server_time": time(),
                "valid": True
            }

            print("-------------------------------------------------------------")
            print(f"🎮 Comando de PLAYER recebido do cliente 🧑🏻‍💻 {request.sid}")
            print(f"➡️  Ação: {data['action']}")
            print(f"🕒 Tempo atual (cliente): {data['currentTime']:.3f}s")
            print(f"🆔 Transmissão: {id_transmissao}")
            print(f"🕰️ Timestamp do servidor: {dados_validados['server_time']:.3f}")
            print("📡 Retransmitindo comando para os clientes na sala...")
            print("-------------------------------------------------------------")

            emit("player_control", dados_validados, room=id_transmissao)

        except Exception as e:
            print(f"🔥 Erro no controle_player: {e}\nDados: {data}")

            if (not data or 
                data.get("action") not in COMANDOS_VALIDOS or
                not isinstance(data.get("currentTime"), (int, float)) or
                not data.get("id_transmissao")):
                return

            id_transmissao = data["id_transmissao"]
            host_sid = obter_host(transmissoes, id_transmissao)

            # Verifica se total_pedacos está ok
            if "total_pedacos" not in transmissoes.get(host_sid, {}):
                emit("erro_transmissao", {"mensagem": "Erro: 'total_pedacos' não definido corretamente"}, to=request.sid)
                return

            # Enriquecendo com tempo do servidor (sincronia)
            dados_validados = {
                **data,
                "server_time": time(),
                "valid": True
            }

            emit("player_control", dados_validados, room=id_transmissao)

    @socketio.on("sair_transmissao")
    def sair_transmissao(data):
        sid = request.sid
        id_transmissao = data.get("id_transmissao")

        if not id_transmissao:
            emit("erro_transmissao", {"mensagem": "ID da transmissão não fornecido."}, to=sid)
            return

        host_sid = obter_host(transmissoes, id_transmissao)

        if not host_sid:
            emit("erro_transmissao", {"mensagem": "Transmissão não encontrada."}, to=sid)
            return

        # Se for o host
        if sid == host_sid:
            print(f"🚪 Host {sid} saiu manualmente da transmissão {id_transmissao}. Encerrando...")
            emit("transmissao_encerrada", {
                "id_transmissao": id_transmissao,
                "mensagem": "O host encerrou a transmissão."
            }, room=id_transmissao)

            leave_room(id_transmissao)
            del transmissoes[sid]

        # Se for ouvinte
        elif sid in transmissoes[host_sid]["clientes_prontos"]:
            print(f"👋 Cliente {sid} saiu manualmente da transmissão {id_transmissao}.")
            transmissoes[host_sid]["clientes_prontos"].remove(sid)

            leave_room(id_transmissao)
            emit("voce_saiu_da_transmissao", {
                "id_transmissao": id_transmissao,
                "mensagem": "Você saiu da transmissão."
            }, to=sid)

            # ✅ Mostra os participantes restantes
            print(f"👥 Participantes restantes na transmissão {id_transmissao}: {transmissoes[host_sid]['clientes_prontos']}")

            # Notifica a sala com a nova lista de clientes
            emit("atualizar_participantes", {
                "participantes": transmissoes[host_sid]["clientes_prontos"]
            }, room=id_transmissao)


        else:
            print(f"⚠️ Cliente {sid} tentou sair da transmissão {id_transmissao}, mas não estava participando.")
            emit("erro_transmissao", {"mensagem": "Você não estava participando dessa transmissão."}, to=sid)

            sid = request.sid
            id_transmissao = data.get("id_transmissao")

            if not id_transmissao:
                emit("erro_transmissao", {"mensagem": "ID da transmissão não fornecido."}, to=sid)
                return

            host_sid = obter_host(transmissoes, id_transmissao)

            if not host_sid:
                emit("erro_transmissao", {"mensagem": "Transmissão não encontrada."}, to=sid)
                return

            # Se for o host
            if sid == host_sid:
                print(f"🚪 Host {sid} saiu manualmente da transmissão {id_transmissao}. Encerrando...")
                emit("transmissao_encerrada", {
                    "id_transmissao": id_transmissao,
                    "mensagem": "O host encerrou a transmissão."
                }, room=id_transmissao)

                leave_room(id_transmissao)
                del transmissoes[sid]

            # Se for ouvinte
            elif sid in transmissoes[host_sid]["clientes_prontos"]:
                print(f"👋 Cliente {sid} saiu manualmente da transmissão {id_transmissao}.")
                transmissoes[host_sid]["clientes_prontos"].remove(sid)

                leave_room(id_transmissao)
                emit("voce_saiu_da_transmissao", {
                    "id_transmissao": id_transmissao,
                    "mensagem": "Você saiu da transmissão."
                }, to=sid)

                # ✅ Mostra os participantes restantes
                print(f"👥 Participantes restantes na transmissão {id_transmissao}: {transmissoes[host_sid]['clientes_prontos']}")
                # Notifica a sala com a nova lista de clientes
                emit("atualizar_participantes", {
                    "participantes": transmissoes[host_sid]["clientes_prontos"]
                }, room=id_transmissao)


            else:
                print(f"⚠️ Cliente {sid} tentou sair da transmissão {id_transmissao}, mas não estava participando.")
                emit("erro_transmissao", {"mensagem": "Você não estava participando dessa transmissão."}, to=sid)

                sid = request.sid
                id_transmissao = data.get("id_transmissao")

                if not id_transmissao:
                    emit("erro_transmissao", {"mensagem": "ID da transmissão não fornecido."}, to=sid)
                    return

                host_sid = obter_host(transmissoes, id_transmissao)

                if not host_sid:
                    emit("erro_transmissao", {"mensagem": "Transmissão não encontrada."}, to=sid)
                    return

                # Se o cliente for o host
                if sid == host_sid:
                    print(f"🚪 Host {sid} saiu manualmente da transmissão {id_transmissao}. Encerrando...")
                    emit("transmissao_encerrada", {
                        "id_transmissao": id_transmissao,
                        "mensagem": "O host encerrou a transmissão."
                    }, room=id_transmissao)

                    leave_room(id_transmissao)
                    del transmissoes[sid]

                # Se o cliente for ouvinte
                elif sid in transmissoes[host_sid]["clientes_prontos"]:
                    print(f"👋 Cliente {sid} saiu manualmente da transmissão {id_transmissao}.")
                    transmissoes[host_sid]["clientes_prontos"].remove(sid)

                    leave_room(id_transmissao)
                    emit("voce_saiu_da_transmissao", {
                        "id_transmissao": id_transmissao,
                        "mensagem": "Você saiu da transmissão."
                    }, to=sid)

                                        # Notifica a sala com a nova lista de clientes
                    emit("atualizar_participantes", {
                        "participantes": transmissoes[host_sid]["clientes_prontos"]
                    }, room=id_transmissao)


                else:
                    print(f"⚠️ Cliente {sid} tentou sair da transmissão {id_transmissao}, mas não estava participando.")
                    emit("erro_transmissao", {"mensagem": "Você não estava participando dessa transmissão."}, to=sid)