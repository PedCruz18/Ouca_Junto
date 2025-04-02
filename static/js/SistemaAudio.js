// Imports de Interfaces
import { tentarReproducao, sendControl } from './Interfaces.js';

// Verifica se o script vai rodar em ambiente de produção ou desenvolvimento
const isProduction = window.location.hostname !== "localhost";
const SERVER_URL = isProduction 
    ? "https://ouca-junto.onrender.com"  // URL de produção
    : "http://192.168.137.1:5000";  // URL local para desenvolvimento

// Configura o socket.io com opções de reconexão
export const socket = io(SERVER_URL, {
    transports: ["websocket"],  // Usando apenas WebSocket
    secure: isProduction,  // Habilita SSL em produção
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

// ------------------------------------------------------------------

// Configura listeners de eventos para controle do player
audioPlayer.addEventListener('play', () => sendControl('play')); // -> Linstener para os clientes sempre ouvirem quando alguem dar play
audioPlayer.addEventListener('pause', () => sendControl('pause')); // -> Linstener para os clientes sempre ouvirem quando alguem dar pause
audioPlayer.addEventListener('seeked', () => {
    if (!audioPlayer.paused) { sendControl('play'); } // -> Linstener para os clientes sincronizar a posição exata da barra da musica
}); 

// ------------------------------------------------------------------

// Função que envia o áudio para o servidor em pedaços
window.enviarAudio = async function() {
    const entradaArquivo = document.getElementById('arquivoAudio');
    const arquivo = entradaArquivo.files[0];  // Obtém o arquivo selecionado

    window.toggleMenu();  // Fecha o menu de upload

    // Verifica se um arquivo foi selecionado
    if (!arquivo) {
        return;
    }
    
    document.getElementById('status').innerText = "Preparando envio...";  // Atualiza o status

    const tamanhoPedaco = 1024 * 512;  // Tamanho de cada pedaço do áudio em bytes
    const totalPedaços = Math.ceil(arquivo.size / tamanhoPedaco);  // Calcula o número total de pedaços
    console.log(`Total de pedaços: ${totalPedaços}`);  // Exibe no console para debug

    // Envia metadados do áudio (tipo e número de pedaços)
    socket.emit('audio_metadata', {
        type: arquivo.type,
        totalChunks: totalPedaços
    });

    // Envia cada pedaço do áudio
    for (let i = 0; i < totalPedaços; i++) {
        const inicio = i * tamanhoPedaco;
        const fim = Math.min(inicio + tamanhoPedaco, arquivo.size);
        const pedaco = arquivo.slice(inicio, fim);  // Extrai o pedaço do arquivo

        const leitor = new FileReader();
        leitor.readAsArrayBuffer(pedaco);

        // Aguarda o carregamento do pedaço para enviá-lo via socket
        await new Promise(resolve => {
            leitor.onload = function(e) {
                socket.emit('audio_chunk', {
                    chunkId: i,
                    data: e.target.result
                });
                resolve();
            };
        });
    }

    // Limpa o input de arquivo após o envio
    entradaArquivo.value = '';
    console.log("Envio de áudio completo");
};

// ------------------------------------------------------------------

// Recebe os pedaços de áudio processados
socket.on('audio_processed', function(dados) {
    currentStreamId = dados.id_transmissao;  // Atualiza o ID da transmissão

    // Atualiza o status com a informação do pedaço recebido
    document.getElementById('status').innerText = 
        `Recebendo pedaço ${dados.id_pedaco + 1} de ${dados.total_pedaços}`;

    // Inicializa o buffer se for um novo stream
    if (!buffersAudio[dados.id_transmissao]) {
        buffersAudio[dados.id_transmissao] = {
            pedaços: [],  // Armazena os pedaços recebidos
            recebidos: 0, // Contador de pedaços recebidos
            total: dados.total_pedaços  // Total de pedaços esperados
        };
    }

    // Armazena o pedaço recebido
    buffersAudio[dados.id_transmissao].pedaços[dados.id_pedaco] = dados.dados;
    buffersAudio[dados.id_transmissao].recebidos++;

    // Quando todos os pedaços forem recebidos, recria o áudio e configura o player
    if (buffersAudio[dados.id_transmissao].recebidos === dados.total_pedaços) {
        const pedaços = buffersAudio[dados.id_transmissao].pedaços;
        const blobAudio = new Blob(pedaços, { type: 'audio/*' });
        const urlAudio = URL.createObjectURL(blobAudio);
        
        audioPlayer.src = urlAudio;
        audioPlayer.onloadedmetadata = () => {
            document.getElementById('status').innerText = "Áudio pronto - aguardando sincronização...";
            socket.emit('cliente_pronto', {
                id_transmissao: currentStreamId  // Notifica o servidor que está pronto
            });
        };
        
        // Limpa o buffer após uso
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

// Recupera ou solicita um ID do backend
async function fetchOrCreateClientId() {
    let clientId = localStorage.getItem('backend_client_id');
    
    // Se não existir, busca um novo ID do backend
    if (!clientId) {
        console.log('[Client] Nenhum ID encontrado no cache. Solicitando novo ID ao backend...');
        const response = await fetch('/get_client_id');
        const data = await response.json();
        clientId = data.client_id;
        localStorage.setItem('backend_client_id', clientId);
        console.log('[Client] Novo ID gerado pelo backend:', clientId);
    } else {
        //console.log('[Client] ID recuperado do cache:', clientId);
    }
    
    return clientId;
}

// Conecta ao Socket.IO com o ID
async function setupSocket() {
    const clientId = await fetchOrCreateClientId();

    // Conecta ao Socket.IO passando o ID como parâmetro
    const socket = io({
        query: { client_id: clientId }
    });

    console.log('[Socket] Conectando ao servidor com ID:', clientId);

    // Eventos de conexão/desconexão nativos
    socket.on('connect', () => {
       // console.log('[Socket] Conectado ao servidor. ID da conexão Socket.IO:', socket.id);
    });

    socket.on('disconnect', () => {
        console.log('[Socket] Desconectado do servidor');
    });

    // Atualiza se o servidor enviar um novo ID (ex: sessão expirada)
    socket.on('client_id_update', (data) => {
        if (data.client_id !== clientId) {
            localStorage.setItem('backend_client_id', data.client_id);
            console.log('[Server] ID atualizado pelo servidor:', data.client_id);
        }
    });
}

setupSocket();