let MAQLOCAL = "10.160.52.85"

// Verifica se o script está rodando em produção ou desenvolvimento
export let emProducao = !["localhost", MAQLOCAL].includes(window.location.hostname);
export let URL_SERVIDOR = emProducao
  ? "https://ouca-junto.onrender.com" // URL de produção
  : `http://${MAQLOCAL}:5000`; // URL local para desenvolvimento

// Configura o socket.io com opções de reconexão
export let socket = io(URL_SERVIDOR, {
  transports: ["websocket", "polling"],
  secure: emProducao,
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
});
