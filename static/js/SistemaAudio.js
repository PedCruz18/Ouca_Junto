// Imports das Interfaces
import { tentarReproducao } from './Interfaces.js';

// Verifica se o script está rodando em produção ou desenvolvimento
const emProducao = !["localhost", "127.0.0.1"].includes(window.location.hostname);
const URL_SERVIDOR = emProducao 
    ? "https://ouca-junto.onrender.com"  // URL de produção
    : "http://localhost:5000";            // URL local para desenvolvimento

// Configura o socket.io com opções de reconexão
export const socket = io(URL_SERVIDOR, {
    transports: ["websocket", "polling"],
    secure: emProducao,
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000
});

// ------------------------------------------------------------------

// Armazena os buffers de áudio das transmissões
const buffersAudios = {};

export let idTransmissaoAtual = null;
console.log('ID da transmissão no frontend:', idTransmissaoAtual);
export let estaSincronizando = false;
export let estaTocando = false;
export const reprodutorAudio = document.getElementById('reprodutorAudio');
export let souAnfitriao = false;

window.conectarComoOuvinte = conectarComoOuvinte;
window.sairDaTransmissao = sairDaTransmissao;

// ------------------------------------------------------------------
// Eventos do reprodutor de áudio
reprodutorAudio.addEventListener('play', () => {
    console.log('Evento: play acionado');
    enviarControle('play');
});

reprodutorAudio.addEventListener('pause', () => {
    console.log('Evento: pause acionado');
    enviarControle('pause');
});

reprodutorAudio.addEventListener('seeked', () => {
    console.log('Evento: seeked na posição:', reprodutorAudio.currentTime);

    if (!estaSincronizando) {
        enviarControle('play');
    }
});

// ------------------------------------------------------------------
// Envio de arquivo de áudio
window.enviarAudio = async function () {
    const entrada = document.getElementById("arquivoAudio");
    const arquivo = entrada.files[0];

    window.alternarMenu();

    if (!arquivo) {
        console.warn("⚠️ Nenhum arquivo selecionado.");
        return;
    }

    document.getElementById("status").innerText = "Preparando envio...";

    const tamanhoPedaco = 1024 * 512;
    const totalPedaços = Math.ceil(arquivo.size / tamanhoPedaco);
    console.log(`🔄 Total de pedaços a enviar: ${totalPedaços}`);

    socket.emit("audio_metadata", {
        id_transmissao: idTransmissaoAtual, 
        type: arquivo.type,
        totalChunks: totalPedaços
    });

    while (!idTransmissaoAtual) {
        console.log("⏳ Aguardando ID da transmissão...");
        await new Promise(res => setTimeout(res, 100));
    }

    console.log(`🎧 Conectando automaticamente à transmissão ${idTransmissaoAtual}...`);
    socket.emit("cliente_pronto", { id_transmissao: idTransmissaoAtual });
    document.getElementById("status").innerText = `🔄 Aguardando áudio da transmissão ${idTransmissaoAtual}...`;

    for (let i = 0; i < totalPedaços; i++) {
        const inicio = i * tamanhoPedaco;
        const fim = Math.min(inicio + tamanhoPedaco, arquivo.size);
        const pedaco = arquivo.slice(inicio, fim);

        await new Promise((resolve) => {
            const leitor = new FileReader();
            leitor.onload = function (e) {
                socket.emit("audio_chunk", {
                    id_transmissao: idTransmissaoAtual,
                    chunkId: i,
                    data: e.target.result
                });
                console.log(`📦 Pedaço ${i + 1}/${totalPedaços} enviado (${fim - inicio} bytes)`);
                resolve();
            };
            leitor.readAsArrayBuffer(pedaco);
        });
    }

    entrada.value = "";
    console.log("✅ Envio de áudio finalizado");
};

// ------------------------------------------------------------------
// Atualiza o rodapé com o ID da sala
function atualizarNavbar(id) {
    const divConectar = document.getElementById("conectar");
    const divInfoSala = document.getElementById("salaInfo");
    const spanIdSala = document.getElementById("idSala");

    if (id) {
        divConectar.style.display = "none";
        divInfoSala.style.display = "flex";
        spanIdSala.innerText = `Sala: ${id}`;
    } else {
        divConectar.style.display = "flex";
        divInfoSala.style.display = "none";
    }
}

// Conecta como ouvinte
function conectarComoOuvinte() {
    const input = document.getElementById("idTransmissao");
    const id = input.value.trim();

    if (!id) {
        alert("⚠️ Por favor, insira um ID de transmissão.");
        return;
    }

    idTransmissaoAtual = id;
    console.log(`🎧 Conectando à transmissão ${idTransmissaoAtual}...`);
    socket.emit("cliente_pronto", { id_transmissao: idTransmissaoAtual });

    atualizarNavbar(idTransmissaoAtual);
    input.value = "";
}

// Sai da transmissão
function sairDaTransmissao() {
    if (!idTransmissaoAtual) return;

    console.log("🚪 Saindo da transmissão...");
    socket.emit("sair_transmissao", { id_transmissao: idTransmissaoAtual });

    reprodutorAudio.pause();
    reprodutorAudio.src = "";
    reprodutorAudio.load();

    document.getElementById('status').innerText = "🔇 Nenhuma transmissão ativa";

    idTransmissaoAtual = null;
    souAnfitriao = false;
    atualizarNavbar(null);
}

export function enviarControle(acao) {
    if (estaSincronizando || !idTransmissaoAtual || !estaTocando) return;

    console.log(`🔄 Enviando controle: ${acao} @ ${reprodutorAudio.currentTime}s para a transmissão ${idTransmissaoAtual}`);

    socket.emit('controle_player', {
        acao: acao,
        tempoAtual: reprodutorAudio.currentTime,
        id_transmissao: idTransmissaoAtual
    });

    console.log(`Comando ${acao} enviado para o servidor!`);
}

// ------------------------------------------------------------------
// Eventos do socket

socket.on("transmissao_iniciada", (dados) => {
    idTransmissaoAtual = dados.id_transmissao;
    console.log("📡 Transmissão iniciada! ID:", idTransmissaoAtual);
    atualizarNavbar(idTransmissaoAtual);
});

socket.on('audio_processed', function(dados) {
    const id = dados.id_transmissao;

    if (!buffersAudios[id]) {
        buffersAudios[id] = {
            pedaços: new Array(dados.total_pedaços).fill(null),
            recebidos: 0,
            total: dados.total_pedaços
        };
    }

    if (buffersAudios[id].pedaços[dados.id_pedaco] !== null) {
        console.warn(`⚠️ Pedaço ${dados.id_pedaco} já recebido, ignorando...`);
        return;
    }

    document.getElementById('status').innerText = 
        `📥 Recebendo pedaço ${dados.id_pedaco + 1} de ${dados.total_pedaços}`;

    buffersAudios[id].pedaços[dados.id_pedaco] = dados.dados;
    buffersAudios[id].recebidos++;

    console.log(`✅ Pedaço ${dados.id_pedaco} armazenado (${buffersAudios[id].recebidos}/${dados.total_pedaços})`);

    if (buffersAudios[id].recebidos === buffersAudios[id].total) {
        console.log("📦 Todos os pedaços recebidos, montando áudio...");

        if (buffersAudios[id].pedaços.includes(null)) {
            console.error("❌ Erro: Alguns pedaços estão faltando!");
            return;
        }

        const blobAudio = new Blob(buffersAudios[id].pedaços, { type: 'audio/*' });
        const urlAudio = URL.createObjectURL(blobAudio);

        console.log("🎵 Áudio montado com sucesso!");

        reprodutorAudio.src = urlAudio;
        reprodutorAudio.onloadedmetadata = () => {
            document.getElementById('status').innerText = "🎵 Áudio pronto!";
            console.log("🟢 Tentando reproduzir...");
            reprodutorAudio.play().catch(err => {
                console.warn("🔴 Falha na reprodução automática:", err);
                document.getElementById('status').innerText = "Clique para reproduzir!";
            });
        };

        setTimeout(() => {
            console.log("🧹 Limpando buffer...");
            delete buffersAudios[id];
        }, 1000);
    }
});

socket.on('iniciar_reproducao', function(dados) {
    if (dados.id_transmissao === idTransmissaoAtual) {
        estaTocando = true;
        reprodutorAudio.currentTime = 0;
        tentarReproducao();
        document.getElementById('status').innerText = "Reproduzindo sincronizado!";
    }
});

socket.on('player_control', function (dados) {
    console.log('🚨 Comando recebido:', dados);
    try {
        console.log(`🎮 Recebido controle: ${dados.action} @ ${dados.currentTime}s`);

        if (!dados || !dados.action || dados.id_transmissao !== idTransmissaoAtual) {
            console.log("⚠️ Ignorando controle, dados inválidos ou id de transmissão diferente.");
            return;
        }

        // Aqui, podemos fazer a sincronização para todos os clientes
        estaSincronizando = true;
        reprodutorAudio.currentTime = dados.currentTime || 0;

        if (dados.action === 'play') {
            console.log(`🎶 Reproduzindo áudio...`);
            reprodutorAudio.play().catch(e => console.error("Autoplay bloqueado:", e));
        } else if (dados.action === 'pause') {
            console.log(`⏸️ Pausando áudio...`);
            reprodutorAudio.pause();
        }

        document.getElementById('status').innerText = 
            `Controle: ${dados.action} @ ${dados.currentTime.toFixed(2)}s`;

    } catch (e) {
        console.error("Erro no controle:", e);
    } finally {
        setTimeout(() => estaSincronizando = false, 100);
    }
});

socket.on("connect", () => {
    console.log("✅ Conectado ao servidor:", URL_SERVIDOR);
});

socket.on("connect_error", (erro) => {
    console.error("❌ Erro de conexão:", erro.message);
});

socket.on("disconnect", (motivo) => {
    console.warn("⚠️ Desconectado do servidor:", motivo);
});
