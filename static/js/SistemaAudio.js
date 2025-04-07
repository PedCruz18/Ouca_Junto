// Imports de Interfaces
import { tentarReproducao, sendControl } from './Interfaces.js';

// Verifica se o script vai rodar em ambiente de produção ou desenvolvimento
const isProduction = !["localhost", "127.0.0.1", "10.160.52.85"].includes(window.location.hostname);
const SERVER_URL = isProduction 
    ? "https://ouca-junto.onrender.com"  // URL de produção
    : "http://10.160.52.85:5000";  // URL local para desenvolvimento

// Configura o socket.io com opções de reconexão
export const socket = io(SERVER_URL, {
    transports: ["websocket", "polling"],  // Permite fallback para polling
    secure: isProduction,  // Habilita SSL em produção
    withCredentials: true, // Para CORS em alguns servidores
    reconnection: true,  // Habilita reconexão automática
    reconnectionAttempts: 5,  // Limita a 5 tentativas de reconexão
    reconnectionDelay: 2000  // Intervalo de 2 segundos entre as tentativas de reconexão
});

// ------------------------------------------------------------------

// Armazena os buffers de áudio de diferentes transmissões
const buffersAudio = {};  

// Variáveis para controle da sincronização e do estado do player
export let currentStreamId = null;  // ID da transmissão atual
export let isSyncing = false;        // Flag que indica se está sincronizando
export let isPlaying = false;        // Flag que indica se o áudio está tocando
export const audioPlayer = document.getElementById('reprodutorAudio');  // Elemento de player de áudio

// ------------------------------------------------------------------

audioPlayer.addEventListener('play', () => {
    console.log('Evento: play acionado');
    sendControl('play');
});

audioPlayer.addEventListener('pause', () => {
    console.log('Evento: pause acionado');
    sendControl('pause');
});

audioPlayer.addEventListener('seeked', () => {
    console.log('Evento: seeked acionado na posição:', audioPlayer.currentTime);
    
    if (!isSyncing) {  // ✅ Evita enviar comandos em loop
        sendControl('play'); 
    }
});

// ------------------------------------------------------------------

window.enviarAudio = async function () {
    const entradaArquivo = document.getElementById("arquivoAudio");
    const arquivo = entradaArquivo.files[0];

    window.toggleMenu();

    if (!arquivo) {
        console.warn("⚠️ Nenhum arquivo selecionado para envio.");
        return;
    }

    document.getElementById("status").innerText = "Preparando envio...";

    const tamanhoPedaco = 1024 * 512;
    const totalPedaços = Math.ceil(arquivo.size / tamanhoPedaco);
    console.log(`🔄 Total de pedaços a serem enviados: ${totalPedaços}`);

    // Envia os metadados para iniciar a transmissão
    socket.emit("audio_metadata", {
        type: arquivo.type,
        totalChunks: totalPedaços
    });
    console.log("📤 Metadados enviados:", { type: arquivo.type, totalChunks: totalPedaços });

    // 🔴 Aguarda o ID da transmissão
    while (!currentStreamId) {
        console.log("⏳ Aguardando ID da transmissão...");
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // ✅ **AUTOCONECTA** o cliente que enviou o áudio à transmissão
    console.log(`🎧 Conectando automaticamente à transmissão ${currentStreamId}...`);
    socket.emit("cliente_pronto", { id_transmissao: currentStreamId });
    document.getElementById("status").innerText = `🔄 Aguardando áudio da transmissão ${currentStreamId}...`;

    // Envio dos pedaços do áudio
    for (let i = 0; i < totalPedaços; i++) {
        const inicio = i * tamanhoPedaco;
        const fim = Math.min(inicio + tamanhoPedaco, arquivo.size);
        const pedaco = arquivo.slice(inicio, fim);

        await new Promise((resolve) => {
            const leitor = new FileReader();
            leitor.onload = function (e) {
                socket.emit("audio_chunk", {
                    id_transmissao: currentStreamId,
                    chunkId: i,
                    data: e.target.result
                });
                console.log(`📦 Pedaço ${i + 1}/${totalPedaços} enviado (${fim - inicio} bytes)`);
                resolve();
            };
            leitor.readAsArrayBuffer(pedaco);
        });
    }

    entradaArquivo.value = "";
    console.log("✅ Envio de áudio completo");
};

// ------------------------------------------------------------------
window.conectarTransmissao = conectarTransmissao;
window.sairTransmissao = sairTransmissao;
let isHost = false; // Define se o usuário é o transmissor

function atualizarNavbar(id) {
    const conectarDiv = document.getElementById("conectar");
    const salaInfoDiv = document.getElementById("salaInfo");
    const idSalaElemento = document.getElementById("idSala");

    if (id) {
        // Se há um ID, esconde o campo de conexão e exibe os detalhes da sala
        conectarDiv.style.display = "none";
        salaInfoDiv.style.display = "flex";
        idSalaElemento.innerText = `Sala: ${id}`;
    } else {
        // Se não há ID, exibe o campo de conexão novamente
        conectarDiv.style.display = "flex";
        salaInfoDiv.style.display = "none";
    }
}

// Conectar como ouvinte
function conectarTransmissao() {
    const input = document.getElementById("idTransmissao");
    const idTransmissao = input.value.trim();

    if (!idTransmissao) {
        alert("⚠️ Por favor, digite um ID de transmissão válido.");
        return;
    }

    currentStreamId = idTransmissao;
    console.log(`🎧 Conectando à transmissão ${currentStreamId}...`);
    socket.emit("cliente_pronto", { id_transmissao: currentStreamId });

    atualizarNavbar(currentStreamId);
    input.value = "";
}

// Sair da transmissão (para ouvintes e hosts)
function sairTransmissao() {
    if (!currentStreamId) return;

    console.log("🚪 Saindo da transmissão...");
    socket.emit("sair_transmissao", { id_transmissao: currentStreamId });

    // Reseta o player de áudio
    audioPlayer.pause();
    audioPlayer.src = "";
    audioPlayer.load(); // Garante que o player seja resetado completamente
    document.getElementById('status').innerText = "🔇 Nenhuma transmissão ativa";

    currentStreamId = null;
    isHost = false;
    atualizarNavbar(null);
}

// Quando o backend inicia uma transmissão e envia o ID
socket.on("transmissao_iniciada", (data) => {
    currentStreamId = data.id_transmissao;
    console.log("📡 Nova transmissão iniciada! ID:", currentStreamId);

    // Atualiza o rodapé com o ID da sala
    atualizarNavbar(currentStreamId);
});


socket.on('audio_processed', function(dados) {
    const id = dados.id_transmissao;

    if (!buffersAudio[id]) {
        buffersAudio[id] = {
            pedaços: new Array(dados.total_pedaços).fill(null),
            recebidos: 0,
            total: dados.total_pedaços
        };
    }

    // Verifica se o pedaço já foi recebido
    if (buffersAudio[id].pedaços[dados.id_pedaco] !== null) {
        console.warn(`⚠️ Pedaço ${dados.id_pedaco} já recebido, ignorando...`);
        return;
    }

    document.getElementById('status').innerText = 
        `📥 Recebendo pedaço ${dados.id_pedaco + 1} de ${dados.total_pedaços}`;

    // Armazena o pedaço no buffer
    buffersAudio[id].pedaços[dados.id_pedaco] = dados.dados;
    buffersAudio[id].recebidos++;

    console.log(`✅ Pedaço ${dados.id_pedaco} armazenado (${buffersAudio[id].recebidos}/${dados.total_pedaços})`);

    // Se todos os pedaços foram recebidos, monta o áudio
    if (buffersAudio[id].recebidos === buffersAudio[id].total) {
        console.log("📦 Todos os pedaços recebidos, montando áudio...");

        if (buffersAudio[id].pedaços.includes(null)) {
            console.error("❌ Erro: Alguns pedaços estão faltando!");
            return;
        }

        const blobAudio = new Blob(buffersAudio[id].pedaços, { type: 'audio/*' });
        const urlAudio = URL.createObjectURL(blobAudio);

        console.log("🎵 Áudio montado com sucesso!");

        audioPlayer.src = urlAudio;
        audioPlayer.onloadedmetadata = () => {
            document.getElementById('status').innerText = "🎵 Áudio pronto para reprodução!";
            console.log("🟢 Tentando reproduzir áudio...");
            audioPlayer.play().catch(err => {
                console.warn("🔴 Falha ao iniciar reprodução automática:", err);
                document.getElementById('status').innerText = "Clique para reproduzir!";
            });
        };

        delete buffersAudio[id]; // Limpa o buffer após processamento
    }
});


// Tenta iniciar a reprodução sincronizada
socket.on('iniciar_reproducao', function(data) {
    if (data.id_transmissao === currentStreamId) {
        isPlaying = true;
        audioPlayer.currentTime = 0;
        tentarReproducao();  // Ativa a reprodução na interface
        document.getElementById('status').innerText = "Reproduzindo sincronizado!";
    }
});

socket.on('player_control', function(data) {
    try {
        if (!data || !data.action || data.id_transmissao !== currentStreamId) {
            return;
        }

        console.log(`Recebido ${data.action} @ ${data.currentTime}s`);

        isSyncing = true;  // 🔹 Evita loops de atualização
        audioPlayer.currentTime = data.currentTime || 0;  // 🔹 Atualiza o tempo exato antes de reproduzir
        
        if (data.action === 'play') {
            audioPlayer.play().catch(e => console.error("Autoplay bloqueado:", e));
        } else {
            audioPlayer.pause();
        }

        document.getElementById('status').innerText = 
            `Controle: ${data.action} @ ${data.currentTime.toFixed(2)}s`;

    } catch (e) {
        console.error("Erro no handler de controle:", e);
    } finally {
        setTimeout(() => isSyncing = false, 100);  // 🔹 Pequeno atraso para garantir sincronização
    }
});



// ------------------------------------------------------------------

socket.on("connect", () => {
    console.log("✅ Conectado ao servidor:", SERVER_URL);
});

socket.on("connect_error", (err) => {
    console.error("❌ Erro de conexão:", err.message);
});

socket.on("disconnect", (reason) => {
    console.warn("⚠️ Desconectado do servidor:", reason);
});
