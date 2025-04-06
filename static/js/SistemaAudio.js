// Imports de Interfaces
import { tentarReproducao, sendControl } from './Interfaces.js';

// Verifica se o script vai rodar em ambiente de produção ou desenvolvimento
const isProduction = !["localhost", "127.0.0.1", "192.168.1.2"].includes(window.location.hostname);
const SERVER_URL = isProduction 
    ? "https://ouca-junto.onrender.com"  // URL de produção
    : "http://192.168.1.2:5000";  // URL local para desenvolvimento

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
    if (!audioPlayer.paused) { 
        sendControl('play'); 
    }
});

// ------------------------------------------------------------------

// Captura o ID da transmissão quando o backend responde
socket.on("transmissao_iniciada", (data) => {
    currentStreamId = data.id_transmissao;
    console.log("📡 Nova transmissão iniciada! ID:", currentStreamId);
});

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

    // 🔴 ESPERA O BACKEND ENVIAR O ID DA TRANSMISSÃO
    while (!currentStreamId) {
        console.log("⏳ Aguardando ID da transmissão...");
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("📤 Iniciando envio de áudio com ID:", currentStreamId);

    // Envio dos pedaços do áudio
    for (let i = 0; i < totalPedaços; i++) {
        const inicio = i * tamanhoPedaco;
        const fim = Math.min(inicio + tamanhoPedaco, arquivo.size);
        const pedaco = arquivo.slice(inicio, fim);

        await new Promise((resolve) => {
            const leitor = new FileReader();
            leitor.onload = function (e) {
                socket.emit("audio_chunk", {
                    id_transmissao: currentStreamId,  // ✅ Agora enviamos o ID correto
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

socket.on('audio_processed', function(dados) {
    currentStreamId = dados.id_transmissao;
    document.getElementById('status').innerText = 
        `📥 Recebendo pedaço ${dados.id_pedaco + 1} de ${dados.total_pedaços}`;

    if (!buffersAudio[dados.id_transmissao]) {
        buffersAudio[dados.id_transmissao] = {
            pedaços: new Array(dados.total_pedaços).fill(null),
            recebidos: 0,
            total: dados.total_pedaços,
            timer: null
        };
    }

    buffersAudio[dados.id_transmissao].pedaços[dados.id_pedaco] = dados.dados;
    buffersAudio[dados.id_transmissao].recebidos++;

    // Reinicia um timer para verificar pacotes perdidos após 3 segundos
    if (buffersAudio[dados.id_transmissao].timer) {
        clearTimeout(buffersAudio[dados.id_transmissao].timer);
    }
    buffersAudio[dados.id_transmissao].timer = setTimeout(() => {
        console.error(`❌ Timeout: Nem todos os pedaços foram recebidos! ${buffersAudio[dados.id_transmissao].recebidos}/${dados.total_pedaços}`);
    }, 3000);

    if (buffersAudio[dados.id_transmissao].recebidos === dados.total_pedaços) {
        clearTimeout(buffersAudio[dados.id_transmissao].timer); // Cancela o timeout se tudo chegou
        
        const pedaços = buffersAudio[dados.id_transmissao].pedaços;
        if (pedaços.includes(null)) {
            console.error("❌ Pacote de áudio corrompido! Falta algum pedaço.");
            return;
        }

        const blobAudio = new Blob(pedaços, { type: 'audio/*' });
        const urlAudio = URL.createObjectURL(blobAudio);
        
        audioPlayer.src = urlAudio;
        audioPlayer.onloadedmetadata = () => {
            document.getElementById('status').innerText = "🎵 Áudio pronto - aguardando sincronização...";
            socket.emit('cliente_pronto', { id_transmissao: currentStreamId });
        };

        delete buffersAudio[dados.id_transmissao];
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

// Recebe comandos de controle (play/pause)
socket.on('player_control', function(data) {
    try {
        if (!data || !data.action || data.id_transmissao !== currentStreamId) {
            return;
        }

        // Se for um comando de play e não estivermos reproduzindo ainda
        if (data.action === 'play' && !isPlaying) {
            return;  // Ignora, a reprodução será iniciada pelo 'iniciar_reproducao'
        }

        console.log(`Recebido ${data.action} @ ${data.currentTime}s`);
        
        isSyncing = true;
        audioPlayer.currentTime = data.currentTime || 0;
        
        // Controla a reprodução (play ou pause)
        if (data.action === 'play' && isPlaying) {
            audioPlayer.play().catch(e => console.error("Autoplay bloqueado:", e));
        } else {
            audioPlayer.pause();
        }
        
        // Atualiza o status com a ação recebida
        document.getElementById('status').innerText = 
            `Controle: ${data.action} @ ${data.currentTime.toFixed(2)}s`;
        
    } catch (e) {
        console.error("Erro no handler de controle:", e);
    } finally {
        setTimeout(() => isSyncing = false, 100);  // Garante que a sincronização seja finalizada
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
