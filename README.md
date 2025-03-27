# Ouça Junto 🎶 - Streaming de Áudio em Tempo Real

**Ouça Junto** é um projeto que traz a experiência única de **compartilhar e ouvir música em tempo real** com amigos, familiares ou qualquer pessoa ao redor do mundo. Porque, no final das contas, **a música é ainda mais especial quando compartilhada**. 💖🎧

## Tecnologias Utilizadas 🛠️

- **Flask**: Framework web para criar a API e gerenciar as rotas do servidor.
- **Python**: Linguagem de programação para o backend.
- **Socket.IO**: Tecnologia para comunicação em tempo real entre o servidor e os clientes.
- **HTML**: Linguagem de marcação para a estruturação da interface de usuário.
- **CSS**: Para estilização e design da interface.
- **JavaScript**: Responsável por interatividade no frontend e integração com o Socket.IO para comunicação em tempo real.

## Funcionalidades ✨

- **Transmissão de Áudio em Tempo Real**: O servidor envia o áudio para os clientes de forma síncrona. 🔊
- **Player de Áudio**: Interface de usuário com controles para reprodução, pausa e ajuste de volume. 🎵
- **Conexão em Tempo Real**: O uso de Socket.IO garante que todos os usuários conectados compartilhem a mesma experiência musical ao mesmo tempo. 🌐

## "Ouvir música junto faz a diferença" ❤️

A música tem o poder de conectar as pessoas de maneiras especiais. Quando compartilhamos uma canção, seja ela uma lembrança ou uma nova descoberta, criamos momentos inesquecíveis. **Ouça Junto** é uma forma de levar esse sentimento de união, mesmo à distância, e compartilhar a magia da música com quem importa. 🎤🌍

## Como Funciona 🚀

O funcionamento do **Ouça Junto** é simples e envolvente. Quando você acessa o site, ele permite que **várias pessoas se conectem simultaneamente** para ouvir um áudio local de forma sincronizada. Aqui está o processo:

1. **Conexão de Usuários**: Quando você entra no site, você e seus amigos se conectam ao servidor via Socket.IO.
2. **Envio do Áudio**: O proprietário do áudio seleciona o arquivo de música desejado (ou transmite via URL) e o áudio é carregado.
3. **Sincronização Automática**: Todos os usuários conectados começam a ouvir o áudio ao mesmo tempo. O fluxo de áudio é enviado para todos os navegadores de maneira sincronizada.
4. **Controle de Reproduções**: O controle de play/pause e o tempo da música são mantidos em sincronia entre os participantes. Isso significa que se alguém pausar ou mudar o áudio, todos os outros ouvem a mesma coisa exatamente no mesmo momento.

O uso de **Socket.IO** assegura que os eventos de reprodução sejam emitidos de forma em tempo real para todos os usuários, permitindo uma experiência sem interrupções e perfeitamente sincronizada. 🌟

## Instalação ⚙️

Para rodar o projeto localmente, siga as instruções abaixo:

### 1. Clone o Repositório

### 2. Mude o ip referente da maquina para executar o ambiente de produção
