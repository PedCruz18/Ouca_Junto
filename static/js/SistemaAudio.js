// Imports das Interfaces
import { tentarReproducao } from './Interfaces.js';

// Verifica se o script está rodando em produção ou desenvolvimento
const emProducao = !["localhost", "192.168.1.3"].includes(window.location.hostname);
const URL_SERVIDOR = emProducao 
    ? "https://ouca-junto.onrender.com"  // URL de produção
    : "http://192.168.1.3:5000";            // URL local para desenvolvimento

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
    logger.log('Evento: play acionado');
    enviarControle('play');
});

reprodutorAudio.addEventListener('pause', () => {
    logger.log('Evento: pause acionado');
    enviarControle('pause');
});

reprodutorAudio.addEventListener('seeked', () => {
    const agora = Date.now();
    // Debounce: só processa seeks com >500ms de intervalo
    if (agora - ultimoSeekTime < 500) {
        logger.log("⏩ Seek ignorado (debounce)");
        return;
    }
    ultimoSeekTime = agora;

    logger.log('⏭️ Seek para:', reprodutorAudio.currentTime);
    
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

    console.log(`🎧 Conectando automaticamente à transmissão ${idTransmissaoAtual}...`);
    socket.emit("cliente_pronto", { id_transmissao: idTransmissaoAtual });
    document.getElementById("status").innerText = `🔄 Aguardando áudio da transmissão ${idTransmissaoAtual}...`;

    for (let i = 0; i < totalpedacos; i++) {
        const inicio = i * tamanhoPedaco;
        const fim = Math.min(inicio + tamanhoPedaco, arquivo.size);
        const pedaco = arquivo.slice(inicio, fim);

        // Verifica se o ID da transmissão é válido antes de enviar
        if (!idTransmissaoAtual) {
            console.error("❌ ID de transmissão não definido, abortando envio de pedaços.");
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
                console.log(`📦 Pedaço ${i + 1}/${totalpedacos} enviado (${fim - inicio} bytes)`);
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

// ------------------------------------------------------------------
// Eventos do socket

socket.on("transmissao_iniciada", (dados) => {
    idTransmissaoAtual = dados.id_transmissao;
    console.log("📡 Transmissão iniciada! ID:", idTransmissaoAtual);
    atualizarNavbar(idTransmissaoAtual);
});

socket.on('audio_processed', function(dados) {
    console.log('📡 Dados recebidos:', dados); // Log completo para depurar a estrutura de dados
    
    const id = dados.id_transmissao;
    const totalPedacos = dados.total_pedacos; // Agora você tem o total_pedacos
    console.log('Total de pedaços:', totalPedacos);

    // Verifique se o ID da transmissão é válido
    if (!id || id !== idTransmissaoAtual) {
        console.error(`❌ Transmissão com ID ${id} não encontrada ou inválida! ID esperado: ${idTransmissaoAtual}`);
        return; // Interrompe a execução se o ID não for válido
    }

    // Checagem se o total de pedaços foi definido corretamente
    if (dados.total_pedacos === undefined || dados.total_pedacos <= 0) {
        console.error("❌ Erro: 'total_pedacos' não foi corretamente definido");
        setTimeout(() => {
            console.log("🔄 Tentando uma nova requisição ao backend...");
            socket.emit('requisitar_total_pedacos', { id_transmissao: id }); // Tenta requisitar o total_pedacos novamente
        }, 1000); // Tenta novamente após 1 segundo
        return; // Interrompe a execução se 'total_pedacos' for inválido
    }

    // Só reinicializa o buffer se for o primeiro pedaço (id_pedaco === 0)
    if (dados.id_pedaco === 0 && buffersAudios[id]) {
        console.warn(`🔁 Reinicializando buffer da transmissão ${id} - novo envio detectado`);
        delete buffersAudios[id];
    }

    // Inicializa o buffer se não existir ainda
    if (!buffersAudios[id]) {
        console.log(`🔧 Inicializando buffer para ${id} com ${dados.total_pedacos} pedaços.`);
        buffersAudios[id] = {
            pedacos: new Array(dados.total_pedacos).fill(null), // Inicializa o array de pedaços com 'null'
            recebidos: 0,
            total: dados.total_pedacos  // Definindo o número total de pedaços
        };
    }

    const buffer = buffersAudios[id];

    // Verifique se o valor total é válido
    if (buffer.total === undefined) {
        console.error(`❌ Erro: 'total' não foi corretamente definido para o id ${id}.`);
        setTimeout(() => {
            console.log("🔄 Tentando uma nova requisição ao backend...");
            socket.emit('requisitar_total_pedacos', { id_transmissao: id }); // Tenta requisitar o total_pedacos novamente
        }, 1000); // Tenta novamente após 1 segundo
        return;  // Interrompe a execução se o total não for válido
    } else {
        console.log(`🔧 Pedaços totais para ${id}: ${buffer.total}`);
    }

    // Atualiza status para o usuário
    document.getElementById('status').innerText =
        `📥 Recebendo pedaço ${dados.id_pedaco + 1} de ${buffer.total}`;

    // Se for duplicado, só substitui sem contar de novo
    if (buffer.pedacos[dados.id_pedaco] !== null) {
        console.warn(`♻️ Pedaço ${dados.id_pedaco} duplicado — será sobrescrito`);
    } else {
        buffer.recebidos++;
    }

    // Sempre armazena (sobrescreve se necessário)
    buffer.pedacos[dados.id_pedaco] = dados.dados;

    console.log(`✅ Pedaço ${dados.id_pedaco} armazenado (${buffer.recebidos}/${buffer.total})`);

    // Se todos os pedaços foram recebidos, monta o áudio
    if (buffer.recebidos === buffer.total) {
        console.log("📦 Todos os pedaços recebidos, montando áudio...");

        // Verifica se algum pedaço está faltando
        if (buffer.pedacos.includes(null)) {
            console.error("❌ Erro: Alguns pedaços estão faltando!");
            setTimeout(() => {
                console.log("🔄 Tentando uma nova requisição ao backend...");
                socket.emit('requisitar_total_pedacos', { id_transmissao: id }); // Tenta requisitar o total_pedacos novamente
            }, 1000); // Tenta novamente após 1 segundo
            return;
        }

        // Monta o áudio a partir dos pedaços
        const blobAudio = new Blob(buffer.pedacos, { type: 'audio/*' });
        const urlAudio = URL.createObjectURL(blobAudio);

        console.log("🎵 Áudio montado com sucesso!");

        // Configura o reprodutor de áudio
        reprodutorAudio.src = urlAudio;
        reprodutorAudio.onloadedmetadata = () => {
            // Atualiza o status para indicar que o áudio está pronto
            document.getElementById('status').innerText = "🎵 Áudio pronto!";
            console.log("🟢 Tentando reproduzir...");
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

socket.on("connect", () => {
    console.log("✅ Conectado ao servidor:", URL_SERVIDOR);
});

socket.on("connect_error", (erro) => {
    console.error("❌ Erro de conexão:", erro.message);
});

socket.on("disconnect", (motivo) => {
    console.warn("⚠️ Desconectado do servidor:", motivo);
});
