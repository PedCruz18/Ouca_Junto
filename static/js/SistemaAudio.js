// Imports das Interfaces
import { tentarReproducao } from "./Interfaces.js";
import { logger } from "./logprivsys.js";
import { socket, URL_SERVIDOR } from "./ambienteini.js";

// variaveis de uso
export const reprodutorAudio = document.getElementById("reprodutorAudio");
export let buffersAudios = {};
let totalPedacosPorTransmissao = {};
let estaSincronizando = false;
let estaTocando = false;
let souAnfitriao = false;
let ultimoSeekTime = 0;
let idTransmissaoAtual = null;
let logInseridoNaSalaJaMostrado = false;
let intervaloMonitoramento = null;
let tentativasMonitoramento = 0;
let ignorarSeekAte = 0;

// ------------------------------------------------------------------
window.conectarComoOuvinte = conectarComoOuvinte;
window.sairDaTransmissao = sairDaTransmissao;

// ------------------------------------------------------------------

// --- Controle de Reprodução (Play/Pause) ---
function enviarControleReproducao(acao) {
  const dados = {
    action: acao,
    currentTime: reprodutorAudio.currentTime,
    id_transmissao: idTransmissaoAtual,
    originador: socket.id
  };
  logger.log("📤 Enviando controle de reprodução:", dados);
  socket.emit("controle_player", dados);
}

// --- Sincronização de Posição (Seek) ---
function enviarSincronizacaoPosicao(tempo) {
  const dados = {
    action: "seek",
    currentTime: tempo,
    id_transmissao: idTransmissaoAtual,
    originador: socket.id
  };
  logger.log("📤 Enviando sincronização de posição:", dados);
  socket.emit("controle_player", dados);
}

// --- Listeners do Reprodutor de Áudio ---
reprodutorAudio.addEventListener("play", () => {
  enviarControleReproducao("play");
});

reprodutorAudio.addEventListener("pause", () => {
  enviarControleReproducao("pause");
});

reprodutorAudio.addEventListener("seeked", () => {
  const agora = Date.now();

  // Ignora seeks causados por sincronização externa
  if (agora < ignorarSeekAte) {
    logger.log("⏱️ Seek ignorado (sincronização externa)");
    return;
  }

  // Debounce: requer intervalo mínimo de 500ms
  if (agora - ultimoSeekTime < 500) {
    logger.log("⚠️ Seek ignorado (debounce)");
    return;
  }

  ultimoSeekTime = agora;

  // Envia sincronização de posição se não estiver em processo de outra sincronização
  if (!estaSincronizando) {
    enviarSincronizacaoPosicao(reprodutorAudio.currentTime);
  }
});

// --- Execução de Comandos Recebidos ---
function executarComandoSincronizado(dados) {
  estaSincronizando = true;
  try {
    // Ajusta posição sempre
    reprodutorAudio.currentTime = dados.currentTime;
    // Executa play/pause conforme ação
    if (dados.action === "play") {
      reprodutorAudio.play().catch(err => logger.warn("⚠️ Erro ao executar play:", err));
    } else if (dados.action === "pause") {
      reprodutorAudio.pause();
    }
    logger.log(`🎮 Comando remoto executado: ${dados.action} @ ${dados.currentTime}s`);
  } catch (error) {
    logger.error("❌ Erro ao executar comando remoto:", error);
  }
  estaSincronizando = false;
}

// --- Handler de eventos do socket ---
socket.on("player_control", function(dados) {
  // Ignora comandos originados neste cliente
  if (dados.originador === socket.id) return;

  if (!validarComando(dados)) return;
  executarComandoSincronizado(dados);
});


function validarComando(dados) {
  const COMANDOS_VALIDOS = ["play", "pause", "seek"];
  return (
   dados &&
   COMANDOS_VALIDOS.includes(dados.action) &&
   typeof dados.currentTime === "number" &&
   dados.id_transmissao === idTransmissaoAtual
  );
}
 
// ------------------------------------------------------------------
// Envio de arquivo de áudio
window.enviarAudio = async function () {
 const entrada = document.getElementById("arquivoAudio");
 const arquivo = entrada.files[0];

 window.alternarMenu();

 if (!arquivo) {
  logger.warn("⚠️ Nenhum arquivo selecionado.");
  return;
 }

 document.getElementById("status").innerText = "Preparando envio...";

 const tamanhoPedaco = 1024 * 512;
 const totalpedacos = Math.ceil(arquivo.size / tamanhoPedaco);
 logger.log(`⬆️✅ Total de pedaços a enviar: ${totalpedacos}`);

 socket.emit("audio_metadata", {
  id_transmissao: idTransmissaoAtual,
  type: arquivo.type,
  totalChunks: totalpedacos,
 });

 while (!idTransmissaoAtual) {
  logger.log("⏳ Aguardando backend criar a SALA da transmissão...");
  await new Promise((res) => setTimeout(res, 100)); // Aguarda até o ID estar disponível
 }

 socket.emit("cliente_pronto", { id_transmissao: idTransmissaoAtual });
 document.getElementById(
  "status"
 ).innerText = `🔄 Aguardando áudio da transmissão ${idTransmissaoAtual}...`;

 // ✅ 1. Abre o grupo UMA VEZ (antes do loop)
 logger.groupCollapsed(`📦 Enviando ${totalpedacos} pedaços`);

 for (let i = 0; i < totalpedacos; i++) {
  const inicio = i * tamanhoPedaco;
  const fim = Math.min(inicio + tamanhoPedaco, arquivo.size);
  const pedaco = arquivo.slice(inicio, fim);

  // Verifica se o ID da transmissão é válido antes de enviar
  if (!idTransmissaoAtual) {
   logger.error("❌ ID de transmissão não definido, abortando envio de pedaços.");
   logger.groupEnd(); // Fecha o grupo se houver erro
   return;
  }

  await new Promise((resolve) => {
   const leitor = new FileReader();
   leitor.onload = function (e) {
    socket.emit("audio_chunk", {
     id_transmissao: idTransmissaoAtual,
     chunkId: i,
     data: e.target.result,
    });
    // ✅ 2. Log de cada pedaço DENTRO do grupo
    logger.log(`➡️ Pedaço ${i + 1}/${totalpedacos} | ${fim - inicio} bytes`);
    resolve();
   };
   leitor.readAsArrayBuffer(pedaco);
  });
 }

 // ✅ 3. Fecha o grupo DEPOIS do loop
 logger.groupEnd();

 entrada.value = "";
 logger.log("✅ Envio de áudio finalizado");
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
 logger.log(`🎧 Conectando à transmissão ${idTransmissaoAtual}...`);
 socket.emit("cliente_pronto", { id_transmissao: idTransmissaoAtual });

 atualizarNavbar(idTransmissaoAtual);
 input.value = "";
}

// Sai da transmissão
function sairDaTransmissao() {
 if (!idTransmissaoAtual) return;

 logger.log("🚪 Saindo da transmissão...");
 socket.emit("sair_transmissao", { id_transmissao: idTransmissaoAtual });

 reprodutorAudio.pause();
 reprodutorAudio.src = "";
 reprodutorAudio.load();

 document.getElementById("status").innerText = "🔇 Nenhuma transmissão ativa";

 idTransmissaoAtual = null;
 souAnfitriao = false;
 atualizarNavbar(null);
}
// ------------------------------------------------------------------
// Eventos do socket

socket.on("transmissao_iniciada", (dados) => {
  idTransmissaoAtual = dados.id_transmissao;

  if (!logInseridoNaSalaJaMostrado) {
    logger.log("📡 Inserido na SALA:", idTransmissaoAtual);
    logInseridoNaSalaJaMostrado = true;
  }

  atualizarNavbar(idTransmissaoAtual);

  if (!intervaloMonitoramento) {
    tentativasMonitoramento = 0;

    intervaloMonitoramento = setInterval(() => {
      tentativasMonitoramento++;

      if (!totalPedacosPorTransmissao || Object.keys(totalPedacosPorTransmissao).length === 0) {
        logger.warn("⚠️ totalPedacosPorTransmissao está vazio. Nenhuma transmissão com metadados recebidos ainda?");
      } else if (!totalPedacosPorTransmissao[idTransmissaoAtual]) {
        logger.warn(`⚠️ Nenhuma entrada encontrada em totalPedacosPorTransmissao para o ID atual (${idTransmissaoAtual}). Metadados ainda não chegaram?`);
      } else {
        logger.log("🔄 totalPedacosPorTransmissao:", totalPedacosPorTransmissao);
      }

      if (tentativasMonitoramento >= 5) {
        clearInterval(intervaloMonitoramento);
        intervaloMonitoramento = null;
        logger.log("🛑 Monitoramento encerrado após 5 tentativas.");
      }

    }, 5000);
  }
});

socket.on("audio_metadata", function (dados) {

  logger.log("⬇️✅ Metadados recebidos:", dados);

  const id = dados.id_transmissao;
  const totalPedacos = dados.total_pedacos; // total_pedacos enviado do backend

    
  // ⚠️ Isso é crucial!
  idTransmissaoAtual = id;

  // Armazenar o total_pedacos para esse id de transmissão
  totalPedacosPorTransmissao[id] = totalPedacos;

  // 💡 LOG do estado atual antes de resetar/definir buffer
  logger.log(`📊 [ANTES] Estado inicial do buffer ${id}:`, buffersAudios[id]);

  // Inicializa o buffer para a transmissão
  if (!buffersAudios[id]) {
    buffersAudios[id] = {
      pedacos: new Array(totalPedacos).fill(null), // Preenche com 'null' inicialmente
      recebidos: 0,
      total: totalPedacos, // Definindo o número total de pedaços
    };
  }

  // 💡 LOG após criação/inicialização
  logger.log(`📊 [DEPOIS] Buffer criado/inicializado para ${id}:`, buffersAudios[id]);

  // Atualiza o status de recebimento
  document.getElementById("status").innerText = `📥 Recebendo pedaço 0 de ${totalPedacos}`;
});

socket.on("audio_processed", function (dados) {
  const id = dados.id_transmissao;
  const id_pedaco = dados.id_pedaco;
  const dadosPedaco = dados.dados;

  // Verifica se o ID da transmissão é válido
  if (!id || id !== idTransmissaoAtual) {
    logger.error(`❌ Transmissão com ID ${id} não encontrada ou inválida!`);
    return;
  }

  // Verifica se o total_pedacos foi armazenado
  let totalPedacos = totalPedacosPorTransmissao[id];
  if (totalPedacos === undefined || totalPedacos <= 0) {
    logger.error("❌ total_pedacos não definido ou inválido.");
    return;
  }

  // Cria um grupo colapsado para os pedaços recebidos (se for o primeiro pedaço)
  if (id_pedaco === 0) {
    logger.groupCollapsed(`📥 Recebendo ${totalPedacos} pedaços (Transmissão ${id})`);
  }

  // Se for o primeiro pedaço, reinicia o buffer
  if (id_pedaco === 0 && buffersAudios[id]) {
    logger.warn(`🔁 Reinicializando buffer da transmissão ${id} - novo envio detectado.`);

    // Reinicializa os dados antes de um novo recebimento de dados
    buffersAudios[id].pedacos = new Array(totalPedacos).fill(null);
    buffersAudios[id].recebidos = 0;
    buffersAudios[id].total = totalPedacos;

    logger.warn(`🧼 Buffer da transmissão ${id} resetado com sucesso.`);
  }

  // Inicializa o buffer se não existir
  if (!buffersAudios[id]) {
    buffersAudios[id] = {
      pedacos: new Array(totalPedacos).fill(null),
      recebidos: 0,
      total: totalPedacos,
    };
  }

  const buffer = buffersAudios[id];

  // Evita armazenar pedaços duplicados
  if (buffer.pedacos[id_pedaco] !== null) {
    logger.warn(`♻️ Pedaço ${id_pedaco} duplicado, substituindo...`);
  } else {
    buffer.recebidos++;
  }

  buffer.pedacos[id_pedaco] = dadosPedaco;

  // Log do pedaço recebido (dentro do grupo)
  logger.log(`✅ Pedaço ${id_pedaco + 1}/${buffer.total} (${dadosPedaco.byteLength} bytes)`);

  // Atualiza o status de progresso dinamicamente
  document.getElementById(
    "status"
  ).innerText = `📥 Recebendo pedaço ${buffer.recebidos} de ${buffer.total}`;

  // Se todos os pedaços foram recebidos, monta o áudio e fecha o grupo
  if (buffer.recebidos === buffer.total) {
    logger.log("📦 Todos os pedaços recebidos, montando áudio...");
    logger.groupEnd();

    // Verifica se algum pedaço está faltando
    if (buffer.pedacos.includes(null)) {
      logger.error("❌ Alguns pedaços estão faltando!");
      return;
    }

    // Monta o áudio a partir dos pedaços
    const blobAudio = new Blob(buffer.pedacos, { type: "audio/*" });
    const urlAudio = URL.createObjectURL(blobAudio);

    logger.log("🎵🟢 Áudio montado com sucesso, Tentando reproduzir...");

    // Configura o reprodutor de áudio
    reprodutorAudio.src = urlAudio;
    reprodutorAudio.onloadedmetadata = () => {
      document.getElementById("status").innerText = "🎵 Áudio pronto!";
      reprodutorAudio.play().catch((err) => {
        logger.warn("🔴 Falha na reprodução automática:", err);
        document.getElementById("status").innerText = "Clique para reproduzir!";
      });
    };

    // ✅ Agora resetamos tudo após a reprodução
    setTimeout(() => {
      if (buffersAudios[id]) {
        logger.warn(`🧹 [ANTES] Resetando buffer da transmissão ${id}:`, { ...buffersAudios[id] });
    
        // Reseta completamente o buffer e o total de pedaços
        buffersAudios[id].pedacos = [];
        buffersAudios[id].recebidos = 0;
        buffersAudios[id].total = 0
    
        logger.warn(`🧼 [DEPOIS] Buffer da transmissão ${id} foi resetado:`, { ...buffersAudios[id] });
      } else {
        logger.warn(`⚠️ Nenhum buffer encontrado para resetar na transmissão ${id}`);
      }
    }, 1000);
  }
});

socket.on("iniciar_reproducao", function (dados) {
 if (dados.id_transmissao === idTransmissaoAtual) {
  estaTocando = true;
  reprodutorAudio.currentTime = 0;
  tentarReproducao();
  document.getElementById("status").innerText = "Reproduzindo sincronizado!";
 }
});




socket.on("connect", () => {
 console.log("✅ Conectado ao servidor:", URL_SERVIDOR);
});

socket.on("connect_error", (erro) => {
 logger.error("❌ Erro de conexão:", erro.message);
});

socket.on("disconnect", (motivo) => {
 logger.warn("⚠️ Desconectado do servidor:", motivo);
});
