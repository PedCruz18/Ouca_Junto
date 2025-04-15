// Imports das Interfaces
import { tentarReproducao } from './Interfaces.js';

// Verifica se o script está rodando em produção ou desenvolvimento
const emProducao = !["localhost", "10.160.52.85"].includes(window.location.hostname);
const URL_SERVIDOR = emProducao 
    ? "https://ouca-junto.onrender.com"  // URL de produção
    : "http://10.160.52.85:5000";            // URL local para desenvolvimento

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

export const logger = {
    log: (...args) => {
      if (!emProducao) {
        console.log(...args);
      }
    },
    warn: (...args) => {
      if (!emProducao) {
        console.warn(...args);
      }
    },
    error: (...args) => {
      if (!emProducao) {
        console.error(...args);
      }
    },
    info: (...args) => {
      if (!emProducao) {
        console.info(...args);
      }
    },
    debug: (...args) => {
      if (!emProducao) {
        console.debug(...args);
      }
    }
  };

// -------------------------------------------------------------------
// Armazena os buffers de áudio das transmissões
const buffersAudios = {};
const totalPedacosPorTransmissao = {};

export let idTransmissaoAtual = null;
export let estaSincronizando = false;
export let estaTocando = false;
export const reprodutorAudio = document.getElementById('reprodutorAudio');
export let souAnfitriao = false;
let ultimoSeekTime = 0;

window.conectarComoOuvinte = conectarComoOuvinte;
window.sairDaTransmissao = sairDaTransmissao;

// ------------------------------------------------------------------
// Eventos do reprodutor de áudio
reprodutorAudio.addEventListener('play', () => {
    enviarControle('play');
});

reprodutorAudio.addEventListener('pause', () => {
    enviarControle('pause');
});

reprodutorAudio.addEventListener('seeked', () => {
    const agora = Date.now();
    // Debounce: só processa seeks com >500ms de intervalo
    if (agora - ultimoSeekTime < 500) {
        return;
    }
    ultimoSeekTime = agora;
    
    if (!estaSincronizando && estaTocando) {
        enviarControle('seek', reprodutorAudio.currentTime);
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
    const totalpedacos = Math.ceil(arquivo.size / tamanhoPedaco);
    console.log(`🔄 Total de pedaços a enviar: ${totalpedacos}`);

    socket.emit("audio_metadata", {
        id_transmissao: idTransmissaoAtual, 
        type: arquivo.type,
        totalChunks: totalpedacos
    });

    while (!idTransmissaoAtual) {
        console.log("⏳ Aguardando ID da transmissão...");
        await new Promise(res => setTimeout(res, 100)); // Aguarda até o ID estar disponível
    }

    socket.emit("cliente_pronto", { id_transmissao: idTransmissaoAtual });
    document.getElementById("status").innerText = `🔄 Aguardando áudio da transmissão ${idTransmissaoAtual}...`;

    // ✅ 1. Abre o grupo UMA VEZ (antes do loop)
    console.groupCollapsed(`📦 Enviando ${totalpedacos} pedaços`);

    for (let i = 0; i < totalpedacos; i++) {
        const inicio = i * tamanhoPedaco;
        const fim = Math.min(inicio + tamanhoPedaco, arquivo.size);
        const pedaco = arquivo.slice(inicio, fim);

        // Verifica se o ID da transmissão é válido antes de enviar
        if (!idTransmissaoAtual) {
            console.error("❌ ID de transmissão não definido, abortando envio de pedaços.");
            console.groupEnd(); // Fecha o grupo se houver erro
            return;
        }

        await new Promise((resolve) => {
            const leitor = new FileReader();
            leitor.onload = function (e) {
                socket.emit("audio_chunk", {
                    id_transmissao: idTransmissaoAtual,
                    chunkId: i,
                    data: e.target.result
                });
                // ✅ 2. Log de cada pedaço DENTRO do grupo
                console.log(`➡️ Pedaço ${i + 1}/${totalpedacos} | ${fim - inicio} bytes`);
                resolve();
            };
            leitor.readAsArrayBuffer(pedaco);
        });
    }

    // ✅ 3. Fecha o grupo DEPOIS do loop
    console.groupEnd();

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

export function enviarControle(acao, tempoEspecifico = null) {
    if (estaSincronizando) {
        console.log("🔄 Ignorando comando durante sincronização");
        return;
    }

    const dados = {
        action: acao,
        currentTime: tempoEspecifico !== null ? tempoEspecifico : reprodutorAudio.currentTime,
        id_transmissao: idTransmissaoAtual,
        originador: socket.id // Identifica quem iniciou o comando
    };

    console.log("📤 Enviando controle:", dados);
    socket.emit('controle_player', dados);
}

function validarComando(dados) {
    const COMANDOS_VALIDOS = ['play', 'pause', 'seek'];
    return (
        dados &&
        COMANDOS_VALIDOS.includes(dados.action) &&
        typeof dados.currentTime === 'number' &&
        dados.id_transmissao === idTransmissaoAtual
    );
}

function executarComandoSincronizado(dados) {
    estaSincronizando = true;
    
    try {
        // Sincroniza o tempo primeiro
        reprodutorAudio.currentTime = dados.currentTime;
        
        // Executa a ação (play/pause)
        if (dados.action === 'play') {
            reprodutorAudio.play();
        } else if (dados.action === 'pause') {
            reprodutorAudio.pause();
        }
    } catch (error) {
        console.error("❌ Erro na sincronização do comando:", error);
    }

    estaSincronizando = false;
}
// ------------------------------------------------------------------
// Eventos do socket

socket.on("transmissao_iniciada", (dados) => {
    idTransmissaoAtual = dados.id_transmissao;
    console.log("📡 Conectado a SALA:", idTransmissaoAtual);
    atualizarNavbar(idTransmissaoAtual);
});

socket.on('audio_metadata', function(dados) {
    console.log('📡 Metadados recebidos:', dados);

    const id = dados.id_transmissao;
    const totalPedacos = dados.total_pedacos;  // total_pedacos enviado do backend

    // Armazenar o total_pedacos para esse id de transmissão
    totalPedacosPorTransmissao[id] = totalPedacos;

    // Inicializa o buffer para a transmissão
    if (!buffersAudios[id]) {
        console.log(`🔧 Inicializando buffer para a transmissão ${id} com ${totalPedacos} pedaços.`);
        buffersAudios[id] = {
            pedacos: new Array(totalPedacos).fill(null), // Preenche com 'null' inicialmente
            recebidos: 0,
            total: totalPedacos  // Definindo o número total de pedaços
        };
    }

    // Atualiza o status de recebimento
    document.getElementById('status').innerText = 
        `📥 Recebendo pedaço 0 de ${totalPedacos}`;
});

socket.on('audio_processed', function(dados) {
    const id = dados.id_transmissao;
    const id_pedaco = dados.id_pedaco;
    const dadosPedaco = dados.dados;

    // Verifica se o ID da transmissão é válido
    if (!id || id !== idTransmissaoAtual) {
        console.error(`❌ Transmissão com ID ${id} não encontrada ou inválida!`);
        return;
    }

    // Verifica se o total_pedacos foi armazenado
    const totalPedacos = totalPedacosPorTransmissao[id];
    if (totalPedacos === undefined || totalPedacos <= 0) {
        console.error("❌ total_pedacos não definido ou inválido.");
        return;
    }

    // Cria um grupo colapsado para os pedaços recebidos (se for o primeiro pedaço)
    if (id_pedaco === 0) {
        console.groupCollapsed(`📥 Recebendo ${totalPedacos} pedaços (Transmissão ${id})`);
    }

    // Se for o primeiro pedaço, reinicia o buffer
    if (id_pedaco === 0 && buffersAudios[id]) {
        console.warn(`🔁 Reinicializando buffer da transmissão ${id} - novo envio detectado.`);
        delete buffersAudios[id];
    }

    // Inicializa o buffer se não existir
    if (!buffersAudios[id]) {
        buffersAudios[id] = {
            pedacos: new Array(totalPedacos).fill(null),
            recebidos: 0,
            total: totalPedacos
        };
    }

    const buffer = buffersAudios[id];

    // Evita armazenar pedaços duplicados
    if (buffer.pedacos[id_pedaco] !== null) {
        console.warn(`♻️ Pedaço ${id_pedaco} duplicado, substituindo...`);
    } else {
        buffer.recebidos++;
    }

    buffer.pedacos[id_pedaco] = dadosPedaco;

    // Log do pedaço recebido (dentro do grupo)
    console.log(`✅ Pedaço ${id_pedaco + 1}/${buffer.total} (${dadosPedaco.byteLength} bytes)`);

    // Atualiza o status de progresso dinamicamente
    document.getElementById('status').innerText = 
        `📥 Recebendo pedaço ${buffer.recebidos} de ${buffer.total}`;

    // Se todos os pedaços foram recebidos, monta o áudio e fecha o grupo
    if (buffer.recebidos === buffer.total) {
        console.log("📦 Todos os pedaços recebidos, montando áudio...");
        console.groupEnd(); // Fecha o grupo de recebimento

        // Verifica se algum pedaço está faltando
        if (buffer.pedacos.includes(null)) {
            console.error("❌ Alguns pedaços estão faltando!");
            return;
        }

        // Monta o áudio a partir dos pedaços
        const blobAudio = new Blob(buffer.pedacos, { type: 'audio/*' });
        const urlAudio = URL.createObjectURL(blobAudio);

        console.log("🎵🟢 Áudio montado com sucesso, Tentando reproduzir...");

        // Configura o reprodutor de áudio
        reprodutorAudio.src = urlAudio;
        reprodutorAudio.onloadedmetadata = () => {
            document.getElementById('status').innerText = "🎵 Áudio pronto!";
            reprodutorAudio.play().catch(err => {
                console.warn("🔴 Falha na reprodução automática:", err);
                document.getElementById('status').innerText = "Clique para reproduzir!";
            });
        };

        // Limpa o buffer após 1 segundo
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
    // Ignora comandos do próprio usuário
    if (dados.originador === socket.id) {
        console.log("🔄 Comando próprio ignorado");
        return;
    }

    // Validação reforçada
    if (!validarComando(dados)) return;

    console.log(`🎮 Controle externo: ${dados.action} @ ${dados.currentTime}s`);
    
    executarComandoSincronizado(dados);
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
