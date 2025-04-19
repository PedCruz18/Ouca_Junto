// Imports das Interfaces
import { tentarReproducao, atualizarStatusComAnimacao, descerStatus, subirStatus } from "./Interfaces.js";
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
let ignorarEventosLocais = false;


// ------------------------------------------------------------------
window.conectarComoOuvinte = conectarComoOuvinte;
window.sairDaTransmissao = sairDaTransmissao;

// ------------------------------------------------------------------


reprodutorAudio.addEventListener("play", () => {
  if (ignorarEventosLocais) return;
  try {
    enviarControleReproducao("play");
    drawVisualizer();
  } catch (error) {
    logger.error("❌ Erro ao iniciar reprodução ou visualizador:", error);
  }
});

document.addEventListener("click", () => {
  if (audioContext.state === "suspended") {
    audioContext.resume().then(() => {
      reprodutorAudio.play().catch((err) => {
        logger.warn("🔴 Falha ao reproduzir após interação:", err);
      });
    });
  }
});

reprodutorAudio.addEventListener("pause", () => {
  if (ignorarEventosLocais) return;
  enviarControleReproducao("pause");
});

reprodutorAudio.addEventListener("seeked", () => {
  const agora = Date.now();

  if (ignorarEventosLocais) {
    logger.log("⏱️ Seek ignorado (evento local desativado)");
    return;
  }

  if (agora < ignorarSeekAte) {
    logger.log("⏱️ Seek ignorado (sincronização externa)");
    return;
  }

  if (agora - ultimoSeekTime < 500) {
    logger.log("⚠️ Seek ignorado (debounce)");
    return;
  }

  ultimoSeekTime = agora;

  if (!estaSincronizando) {
    enviarSincronizacaoPosicao(reprodutorAudio.currentTime);
  }
});

function executarComandoSincronizado(dados) {
  logger.log("🧭 Executando comando sincronizado recebido:", dados);

  estaSincronizando = true;
  ignorarEventosLocais = true;

  try {
    reprodutorAudio.currentTime = dados.currentTime;

    if (dados.action === "play") {
      reprodutorAudio.play().catch(err => logger.warn("⚠️ Erro ao executar play:", err));
    } else if (dados.action === "pause") {
      reprodutorAudio.pause();
    }

    logger.log(`🎮 Comando remoto executado: ${dados.action} @ ${dados.currentTime}s`);
  } catch (error) {
    logger.error("❌ Erro ao executar comando remoto:", error);
  }

  setTimeout(() => {
    ignorarEventosLocais = false;
    estaSincronizando = false;
  }, 300); // Pequeno delay para evitar reemissão
}

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
  await new Promise((res) => setTimeout(res, 100)); 
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

function atualizarNavbar(id) {
  const connectContainer = document.querySelector("#conectar-container");
  const salasContainer = document.querySelector("#salaInfo-container");
  const spanIdSala = document.querySelector("#idSala");

  if (id) {
      // Oculta o container de conexão
      connectContainer.style.display = "none";

      // Exibe o container de informações da sala
      salasContainer.style.display = "flex";
      spanIdSala.textContent = `Sala: ${id}`; // Atualiza o texto com o ID da sala
  } else {
      // Exibe o container de conexão
      connectContainer.style.display = "block";

      // Oculta o container de informações da sala
      salasContainer.style.display = "none";
  }
}

// ------------------------------------------------------------------

// Conecta como ouvinte

function conectarComoOuvinte() {
  const input = document.getElementById("idTransmissao");
  const id = input.value.trim();
  const mensagemErro = document.getElementById("mensagemErro"); // pega o elemento de erro

  // Se o ID estiver vazio, exibe a mensagem de erro na página e aplica a animação
  if (!id) {
    mensagemErro.textContent = "Por favor, insira um ID de SALA.";  // Mensagem de erro
    mensagemErro.style.display = "block";  // Exibe a mensagem

    // Aplica a animação de pulsação no campo de entrada
    input.classList.add("erro-pulsante");

    // Aplica a animação de pulsação no texto da mensagem de erro
    mensagemErro.classList.add("pulsar-texto");

    // Faz a mensagem de erro desaparecer após 3 segundos
    setTimeout(() => {
      mensagemErro.style.display = "none";
    }, 3000);  // 3000 milissegundos = 3 segundos

    // Remove a animação após 3 segundos (tempo total da animação)
    setTimeout(() => {
      input.classList.remove("erro-pulsante");
      mensagemErro.classList.remove("pulsar-texto");
    }, 3000);  // 3000 milissegundos = 3 segundos

    return;
  }

  // Caso contrário, limpa qualquer mensagem de erro anterior e remove a animação
  mensagemErro.style.display = "none";
  input.classList.remove("erro-pulsante");
  mensagemErro.classList.remove("pulsar-texto");

  idTransmissaoAtual = id;
  logger.log(`🎧 Conectando à transmissão ${idTransmissaoAtual}...`);
  socket.emit("cliente_pronto", { id_transmissao: idTransmissaoAtual });

  atualizarNavbar(idTransmissaoAtual);
  input.value = "";
}

// Sai da transmissão
function sairDaTransmissao() {
  if (!idTransmissaoAtual) return;

  // Limpa os logs antes de sair (se disponível)
  if (logger.clear) {
    logger.clear(); // limpa os logs do logger
  }

  logger.log("🚪 Saindo da transmissão...");
  socket.emit("sair_transmissao", { id_transmissao: idTransmissaoAtual });

  // Pausa e limpa o player
  reprodutorAudio.pause();
  reprodutorAudio.src = "";
  reprodutorAudio.load();

  // Remover todos os participantes e esconder a lista
  const listaParticipantes = document.getElementById("participantesLista");
  const divListaParticipantes = document.getElementById("listaParticipantes");
  
  listaParticipantes.innerHTML = ""; // Limpa a lista de participantes
  //listaParticipantes.style.display = "none";
  divListaParticipantes.style.display = "none";


  // 🔁 Reset geral de estados e buffers
  buffersAudios = {};
  totalPedacosPorTransmissao = {};
  estaSincronizando = false;
  estaTocando = false;
  souAnfitriao = false;
  ultimoSeekTime = 0;
  ignorarSeekAte = 0;
  ignorarEventosLocais = false;
  logInseridoNaSalaJaMostrado = false;

  if (intervaloMonitoramento) {
    clearInterval(intervaloMonitoramento);
    intervaloMonitoramento = null;
  }

  tentativasMonitoramento = 0;
  idTransmissaoAtual = null;

  atualizarNavbar(null);
}

const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const audioElement = document.getElementById("reprodutorAudio");
const canvas = document.getElementById("visualizer");
const canvasContext = canvas.getContext("2d");

// Configurações do canvas
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Conecta o áudio ao contexto de análise
const audioSource = audioContext.createMediaElementSource(audioElement);
const analyser = audioContext.createAnalyser();
audioSource.connect(analyser);
analyser.connect(audioContext.destination);

// Configurações do analisador
analyser.fftSize = 256; // Define o tamanho da FFT (mais alto = mais barras)
const bufferLength = analyser.frequencyBinCount;
const dataArray = new Uint8Array(bufferLength);

function drawVisualizer() {
  requestAnimationFrame(drawVisualizer);

  // Limpa o canvas
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);

  // Obtém os dados de frequência
  analyser.getByteFrequencyData(dataArray);

  // Configurações das barras
  const barWidth = (canvas.width / bufferLength) * 1.25; // Ajusta a largura das barras
  let barHeight;
  let x = 0;

  // Desenha as barras de baixo para cima (lado original)
  for (let i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i];

      const red = (barHeight + 100) % 255;
      const green = (barHeight * 2) % 255;
      const blue = 255 - barHeight;

      canvasContext.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      canvasContext.fillRect(x, canvas.height - barHeight, barWidth, barHeight); // Desenha de baixo para cima

      x += barWidth + 1;
  }

  // Redefine a posição inicial para o lado oposto
  x = canvas.width;

  // Desenha as barras de baixo para cima (espelhadas)
  for (let i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i];

      const red = (barHeight + 100) % 255;
      const green = (barHeight * 2) % 255;
      const blue = 255 - barHeight;

      canvasContext.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      canvasContext.fillRect(x - barWidth, canvas.height - barHeight, barWidth, barHeight); // Desenha de baixo para cima (espelhadas)

      x -= barWidth + 1;
  }

  // Redefine a posição inicial para desenhar de cima para baixo
  x = 0;

  // Desenha as barras de cima para baixo (lado original)
  for (let i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i];

      const red = (barHeight + 100) % 255;
      const green = (barHeight * 2) % 255;
      const blue = 255 - barHeight;

      canvasContext.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      canvasContext.fillRect(x, 0, barWidth, barHeight); // Desenha de cima para baixo

      x += barWidth + 1;
  }

  // Redefine a posição inicial para o lado oposto
  x = canvas.width;

  // Desenha as barras de cima para baixo (espelhadas)
  for (let i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i];

      const red = (barHeight + 100) % 255;
      const green = (barHeight * 2) % 255;
      const blue = 255 - barHeight;

      canvasContext.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      canvasContext.fillRect(x - barWidth, 0, barWidth, barHeight); // Desenha de cima para baixo (espelhadas)

      x -= barWidth + 1;
  }
}
// ------------------------------------------------------------------
// Eventos do socket

socket.on("transmissao_iniciada", (dados) => {
  const mensagemErro = document.getElementById("mensagemErro");

  // Exibe mensagem de sucesso ao entrar na sala
  mensagemErro.textContent = "Sala encontrada, entrando...";
  mensagemErro.style.display = "block";
  mensagemErro.classList.add("mensagem-sucesso");

  atualizarNavbar(idTransmissaoAtual);

  // Remove a mensagem após 3 segundos
  setTimeout(() => {
    mensagemErro.style.display = "none";
    mensagemErro.classList.remove("mensagem-sucesso");
  }, 3000);

  idTransmissaoAtual = dados.id_transmissao;

  if (!logInseridoNaSalaJaMostrado) {
    logger.log("📡 Inserido na SALA:", idTransmissaoAtual);
    logInseridoNaSalaJaMostrado = true;
  }

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
  const statusElement = document.getElementById("status");

  const computedStyle = window.getComputedStyle(statusElement);
  if (computedStyle.bottom === "-1px") {
    logger.log("⬆️ Subindo status...");
      subirStatus();
  }

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
  atualizarStatusComAnimacao(`📥 Recebendo pedaço 0 de ${totalPedacos}`);

  // Remove a animação após um tempo para permitir reaplicação futura
  setTimeout(() => {
    statusElement.classList.remove("animacao-status");
  }, 3000); // Tempo da animação em milissegundos

  // Aguarda todos os pedaços serem recebidos antes de descer o status
  const verificarRecebimento = setInterval(() => {
    const buffer = buffersAudios[id];
    if (buffer && buffer.recebidos === buffer.total) {
      clearInterval(verificarRecebimento); // Para o intervalo quando todos os pedaços forem recebidos
      setTimeout(() => {
        descerStatus(); // Executa a animação de Descer o status após 3 segundos
        console.log("Descer status executado após todos os pedaços serem recebidos e 3 segundos.");
      }, 3000); // Aguarda 3 segundos antes de descer o status
    }
  }, 1000); // Verifica a cada 1 segundo
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
      atualizarStatusComAnimacao("🎵 Áudio pronto!");
      reprodutorAudio.play().catch((err) => {
      logger.warn("🔴 Falha na reprodução automática:", err);
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
 }
});

socket.on("player_control", function(dados) {
  // Ignora comandos originados neste cliente
  if (dados.originador === socket.id) return;

  if (!validarComando(dados)) return;
  executarComandoSincronizado(dados);
});

socket.on("erro_transmissao", (dados) => {
  const mensagemErro = document.getElementById("mensagemErro");

  // Sai da transmissão ativa, se houver
  sairDaTransmissao();

  // Exibe a mensagem de erro e aplica a animação
  if (dados.mensagem) {
    mensagemErro.textContent = dados.mensagem;
    mensagemErro.style.display = "block";
    mensagemErro.classList.add("pulsar-texto");

    setTimeout(() => {
      mensagemErro.style.display = "none";
    }, 3000);

    setTimeout(() => {
      mensagemErro.classList.remove("pulsar-texto");
    }, 3000);
  }
});

socket.on("atualizar_participantes", (data) => {
  const lista = data.participantes;
  const listaContainer = document.getElementById("participantesLista");
  const listaWrapper = document.getElementById("listaParticipantes");

  listaContainer.innerHTML = "";

  if (lista.length > 0) {
    listaWrapper.style.display = "block";
  } else {
    listaWrapper.style.display = "none";
  }

  lista.forEach((id) => {
    const li = document.createElement("li");
    li.textContent = id;
    listaContainer.appendChild(li);
  });
});

socket.on("connect", () => {
 console.log("✅ Conectado ao servidor:", URL_SERVIDOR);
});

socket.on("connect_error", (erro) => {
 logger.error("❌ Erro de conexão:", erro.message);
});

