import string
import random

def gerar_id_curto():
    caracteres = string.ascii_uppercase + string.digits
    return ''.join(random.choices(caracteres, k=5))

def cliente_pertence_transmissao(transmissoes, sid, id_transmissao):
    for host_sid, info in transmissoes.items():
        if info["id"] == id_transmissao and sid in info["clientes_prontos"]:
            return True
    return False

def obter_host(transmissoes, id_transmissao):
    #print(f"🔍 [obter_host] Procurando host com id_transmissao: {id_transmissao}")
    for sid, info in transmissoes.items():
        #print(f"➡️ Verificando SID {sid} com ID de transmissão: {info.get('id')}")
        if info.get("id") == id_transmissao:
            print(f"✅ Host encontrado: {sid}")
            return sid
    #print(f"❌ Nenhum host encontrado para id_transmissao: {id_transmissao}")
    return None
