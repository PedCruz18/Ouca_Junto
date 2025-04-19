// Imports do Sistema de Áudio
import { reprodutorAudio } from "./SistemaAudio.js";
import { logger } from "./logprivsys.js";
 
// ---------------------------------------------------------------------------
// Botão do menu mobile
document.getElementById("mobile-menu").addEventListener("click", function () {
 this.classList.toggle("active");
 document.querySelector(".navbar-menu").classList.toggle("active");
});

window.alternarMenu = function () {
    const menu = document.getElementById("uploadMenu");
    const toggleButton = document.querySelector(".toggle-menu");
    const tituloPrincipal = document.querySelector(".titulo-principal");

    // Verifica se o menu está aberto
    if (menu.classList.contains("menu-aberto")) {
        // Fecha o menu
        menu.style.transition = "max-height 0.5s ease, opacity 0.5s ease";
        menu.style.maxHeight = "0";
        menu.style.opacity = "0";

        // Reacende o botão com animação suave
        setTimeout(() => {
            toggleButton.style.transition = "opacity 0.5s ease, visibility 0.5s ease";
            toggleButton.style.opacity = "1";
            toggleButton.style.visibility = "visible";
        }, 500); // Espera o menu fechar antes de reacender o botão

        // Move o título de volta para a posição original
        tituloPrincipal.style.transition = "transform 0.5s ease";
        tituloPrincipal.style.transform = "translateY(0)";

        // Altera o texto do título com animação
        alterarTextoComAnimacao(tituloPrincipal, "O que vamos ouvir?");
    } else {
        // Abre o menu
        menu.style.transition = "max-height 0.5s ease, opacity 0.5s ease";
        menu.style.maxHeight = `${menu.scrollHeight}px`; // Define o max-height com base no conteúdo
        menu.style.opacity = "1";

        // Oculta o botão com animação de desvanecimento
        toggleButton.style.transition = "opacity 0.5s ease, visibility 0.5s ease";
        toggleButton.style.opacity = "0";
        setTimeout(() => {
            toggleButton.style.visibility = "hidden";
        }, 500); // Tempo da animação de desvanecimento

        // Move o título para baixo
        tituloPrincipal.style.transition = "transform 0.5s ease";
        tituloPrincipal.style.transform = "translateY(40px)";

        // Altera o texto do título com animação
        alterarTextoComAnimacao(tituloPrincipal, "Escolha um arquivo.");
    }

    // Alterna a classe do menu para controle de estado
    menu.classList.toggle("menu-aberto");
};


export function mostrarMenu() {
    const menu = document.getElementById("uploadMenu");
    const toggleButton = document.querySelector(".toggle-menu");
    const tituloPrincipal = document.querySelector(".titulo-principal");
    const visualizer = document.querySelector(".visualizer");

    // Torna o menu visível
    menu.style.transition = "opacity 0.5s ease, visibility 0.5s ease";
    menu.style.opacity = "1";

    // Adiciona fade ao mudar o fundo do visualizer
    visualizer.style.transition = "background 0.5s ease";
    visualizer.style.background = "transparent";

    // Torna os textos dos botões visíveis e inicia a animação
    toggleButton.style.transition = "opacity 0.5s ease, visibility 0.5s ease";
    toggleButton.style.opacity = "1";
    toggleButton.style.visibility = "visible";

    // Torna o título principal visível
    tituloPrincipal.style.transition = "opacity 0.5s ease";
    tituloPrincipal.style.opacity = "1";
}

export function ocultarMenu() {
    const menu = document.getElementById("uploadMenu");
    const toggleButton = document.querySelector(".toggle-menu");
    const tituloPrincipal = document.querySelector(".titulo-principal");
    const visualizer = document.querySelector(".visualizer");

    // Torna o menu invisível
    menu.style.transition = "opacity 0.5s ease, visibility 0.5s ease";
    menu.style.opacity = "0";

    // Adiciona fade ao mudar o fundo do visualizer
    visualizer.style.transition = "background 0.5s ease";
    visualizer.style.background = "rgba(0, 0, 0, 0.8)";

    // Torna os textos dos botões invisíveis
    toggleButton.style.transition = "opacity 0.5s ease";
    toggleButton.style.opacity = "0";

    // Torna o título principal invisível
    tituloPrincipal.style.transition = "opacity 0.5s ease";
    tituloPrincipal.style.opacity = "0";
}

function alterarTextoComAnimacao(elemento, novoTexto) {
    // Define a transição para opacidade
    elemento.style.transition = "opacity 0.5s ease";

    // Torna o texto invisível antes de alterar
    elemento.style.opacity = "0";

    // Aguarda a animação de desvanecimento antes de alterar o texto
    setTimeout(() => {
        elemento.textContent = novoTexto; // Altera o texto
        elemento.style.opacity = "1"; // Reexibe o texto com animação
    }, 500); // Tempo da animação de desvanecimento
}
// ---------------------------------------------------------------------------

// Tenta reproduzir o áudio (interface)
export async function tentarReproducao() {
 try {
    await reprodutorAudio.play();
 } catch (e) {
    logger.log("Reprodução bloqueada, aguardando interação.");
    document.body.addEventListener(
     "click",
     async () => {
        try {
         await reprodutorAudio.play();
        } catch (error) {
         logger.error("Erro ao tentar reproduzir o áudio:", error);
        }
     },
     { once: true }
    );
 }
}

// Função para atualizar o rótulo de status com animação ao sofrer alterações
export function atualizarStatusComAnimacao(novoTexto) {
    const status = document.getElementById("status");

    // Atualiza o texto do rótulo
    status.innerText = novoTexto;

    // Adiciona a classe de animação
    status.classList.add("animar");

    // Remove a classe de animação após a conclusão (1s)
    setTimeout(() => {
        status.classList.remove("animar");
    }, 1000); // Duração da animação
}
// ---------------------------------------------------------------------------


// Função para Subir o rótulo de status instantaneamente
export function subirStatus() {
    const status = document.getElementById("status");

    status.style.opacity = "1";   // visível
    status.style.bottom = "110px"; // Posição final
}


// Função para descer o rótulo de status com tempo maior de animação
export function descerStatus() {
    const status = document.getElementById("status");

    // Define a transição para um tempo maior
    status.style.transition = "all 2s ease";

    status.style.bottom = "-1px"; // Posição final
    status.style.opacity = "0";   // Invisível
}

// Anima o rótulo de status ao carregar a página
document.addEventListener("DOMContentLoaded", () => {
    const status = document.getElementById("status");

    // Adiciona a classe de animação inicial
    status.classList.add("inicial");

    // Remove a classe após a animação inicial (1s)
    setTimeout(() => {
        status.classList.remove("inicial");

        // Após 2 segundos, chama a função descerStatus
        setTimeout(() => {
            descerStatus();
        }, 2000);
    }, 1000); // Duração da animação inicial
});
