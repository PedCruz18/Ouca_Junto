// Imports de SistemaAudio
import { isSyncing, audioPlayer, currentStreamId, isPlaying, socket } from "./SistemaAudio.js";

// ---------------------------------------------------------------------------

// Menu mobile toggle
document.getElementById('mobile-menu').addEventListener('click', function() {
    this.classList.toggle('active');
    document.querySelector('.navbar-menu').classList.toggle('active');
});

// Menu cassete
window.toggleMenu = function () {
    let menu = document.getElementById("uploadMenu");
    menu.classList.toggle("menu-aberto");
};

// ---------------------------------------------------------------------------

// tenta reproduzir o audio (interface)
export async function tentarReproducao() {
    try {
        await audioPlayer.play();
    } catch (e) {
        console.log("Reprodução bloqueada, aguardando interação.");
        document.getElementById('status').innerText = "Toque para iniciar a reprodução";
        document.body.addEventListener('click', () => {
            audioPlayer.play();
        }, { once: true });
    }
}

// Envia comandos de controle (play/pause) quando o usuário interage
export function sendControl(action) {
    if (isSyncing || !currentStreamId || !isPlaying) return;
    
    socket.emit('player_control', {
        action: action,
        currentTime: audioPlayer.currentTime,
        id_transmissao: currentStreamId
    });
    
    console.log(`Enviando ${action} @ ${audioPlayer.currentTime}s`);
}

// ---------------------------------------------------------------------------