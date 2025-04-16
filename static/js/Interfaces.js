// Imports do Sistema de Áudio
import { reprodutorAudio } from "./varsdeuso.js";
 
// ---------------------------------------------------------------------------

// Botão do menu mobile
document.getElementById("mobile-menu").addEventListener("click", function () {
 this.classList.toggle("active");
 document.querySelector(".navbar-menu").classList.toggle("active");
});

// Menu de upload em estilo cassete
window.alternarMenu = function () {
 let menu = document.getElementById("uploadMenu");
 menu.classList.toggle("menu-aberto");
};
// ---------------------------------------------------------------------------

// Tenta reproduzir o áudio (interface)
export async function tentarReproducao() {
 try {
  await reprodutorAudio.play();
 } catch (e) {
  console.log("Reprodução bloqueada, aguardando interação.");
  document.getElementById("status").innerText = "Toque para iniciar a reprodução";
  document.body.addEventListener(
   "click",
   () => {
    reprodutorAudio.play();
   },
   { once: true }
  );
 }
}

// Envia comandos de controle (play/pause) quando o usuário interage

// ---------------------------------------------------------------------------
