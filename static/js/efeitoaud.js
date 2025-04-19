export const audioContext = new (window.AudioContext || window.webkitAudioContext)();
export const audioElement = document.getElementById("reprodutorAudio");
export const canvas = document.getElementById("visualizer");
export const canvasContext = canvas.getContext("2d");

// Configurações do canvas
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Conecta o áudio ao contexto de análise
export const audioSource = audioContext.createMediaElementSource(audioElement);
export const analyser = audioContext.createAnalyser();
audioSource.connect(analyser);
analyser.connect(audioContext.destination);

// Configurações do analisador
analyser.fftSize = 256; // Define o tamanho da FFT (mais alto = mais barras)
export const bufferLength = analyser.frequencyBinCount;
export const dataArray = new Uint8Array(bufferLength);

let animacaoEmExecucao = false;

export function drawVisualizer() {
  animacaoEmExecucao = true; // Marca que a animação está em execução
  requestAnimationFrame(drawVisualizer);

  // Limpa o canvas
  canvasContext.clearRect(0, 0, canvas.width, canvas.height);

  // Obtém os dados de frequência
  analyser.getByteFrequencyData(dataArray);

  // Configurações das barras
  const barWidth = (canvas.width / bufferLength) * 1.25;
  let barHeight;
  let x = 0;

  // Desenha as barras
  for (let i = 0; i < bufferLength; i++) {
    barHeight = dataArray[i];
    const red = (barHeight + 100) % 255;
    const green = (barHeight * 2) % 255;
    const blue = 255 - barHeight;

    canvasContext.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    canvasContext.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

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

export function verificarEstadoAnimacao() {
    if (animacaoEmExecucao) {
      console.log("A animação está em execução.");
      // Chama a função desejada
      funcaoQuandoAnimacaoEstaOcorrendo();
    } else {
      console.log("A animação não está em execução.");
      // Chama outra função
      funcaoQuandoAnimacaoNaoEstaOcorrendo();
    }
  }
  
  // Funções de exemplo
  function funcaoQuandoAnimacaoEstaOcorrendo() {
    console.log("Executando ação enquanto a animação ocorre.");
  }
  
  function funcaoQuandoAnimacaoNaoEstaOcorrendo() {
    console.log("Executando ação quando a animação não está ocorrendo.");
  }
  
  // Para parar a animação
  export function pararAnimacao() {
    animacaoEmExecucao = false; // Marca que a animação parou
  }