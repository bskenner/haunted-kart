# Haunted Kart

Jogo de corrida no estilo Mario Kart, com tema de Halloween. Escolha um monstro, dê três voltas no Cemitério da Colina Torta e use poderes assombrados para chegar na frente.

## Jogar agora

- **Jogo publicado:** [https://nifty-gleeful-hertz.replit.app](https://nifty-gleeful-hertz.replit.app)
- **Projeto no Replit:** [https://replit.com/@bskenner86/NiftyGleefulHertz](https://replit.com/@bskenner86/NiftyGleefulHertz)

## Personagens

Cada monstro tem visual próprio e atributos diferentes de **Velocidade**, **Aceleração** e **Dirigibilidade**:

| Personagem   | Estilo                         | Destaque               |
| ------------ | ------------------------------ | ---------------------- |
| Fantasma     | Translúcido, branco-azulado    | Alta dirigibilidade    |
| Zumbi        | Verde, decaído                 | Alta aceleração        |
| Múmia        | Bege, enrolada em ataduras     | Equilibrada            |
| Frankenstein | Grandão, verde, com parafusos  | Maior velocidade       |
| Vampiro      | Capa vermelha e preta          | Velocidade e arrancada |
| Lobisomem    | Pelagem marrom e prateada      | Curvas e aceleração    |

Os outros cinco monstros correm contra você, controlados pelo jogo. Ao escolher um personagem, ele emite um som próprio (lamento, gemido, uivo e assim por diante).

## Como jogar

Corrida de **3 voltas**, com minimapa, aviso de contramão e redução de velocidade fora da pista. Nas curvas, derrape e solte para ganhar um miniturbo (faíscas **azuis** e, se segurar mais, **laranjas**).

### Largada especial

Na contagem 3-2-1-Vai, comece a acelerar logo depois de aparecer o **1** e segure até o **Vai!** para ganhar um impulso de largada. Acelerar cedo demais faz o motor engasgar.

### Teclado

| Tecla | Ação |
| ----- | ---- |
| W ou seta para cima | Acelerar |
| S ou seta para baixo | Frear |
| A / D ou setas laterais | Virar |
| Espaço | Derrapar: faíscas azuis → laranjas; solte para turbinar |
| E | Usar item |
| Esc ou P | Pausar |

### Toque (celular)

Há botões na tela para acelerar, frear, virar, derrapar e usar item.

## Itens

- **Enxame de morcegos** — reduz a velocidade dos corredores à frente
- **Bomba de abóbora** — projétil que pode fazer um oponente rodar
- **Impulso fantasma** — turbo temporário
- **Escudo de ossos** — proteção por alguns segundos
- **Poção escorregadia** — deixa uma poça atrás do kart

## Música e sons

Toda a trilha e os efeitos são originais, gerados no navegador (Web Audio API). Não há músicas com direitos autorais.

- Música de fundo no menu e uma faixa mais intensa na corrida
- Motor que muda com a velocidade, derrapagem, turbo, coleta e uso de itens, impactos, apitos da largada, volta concluída, jingle da última volta e fanfarra de chegada
- Som de assinatura ao selecionar cada monstro
- Controles de **Música** e **Efeitos sonoros**, além de silenciar, na tela inicial e na pausa
- As preferências são salvas no navegador
- O áudio só começa depois da primeira interação (clique, toque ou tecla), por regra dos navegadores

## Rodar localmente

É um jogo de frontend (React + Three.js + Vite). Não precisa de backend.

```bash
npm install
npm run dev
```

Abra o endereço que o Vite mostrar (em geral `http://localhost:5173`).

Outros comandos:

```bash
npm test        # testes da lógica da corrida
npm run build   # gerar a versão de produção
npm run preview # servir a versão gerada
```

## Observações

O jogo foi criado e está hospedado no Replit. Este repositório contém o código-fonte do jogo (interface em português do Brasil), pronto para rodar fora do monorepo do Replit. O toque e o desempenho em dispositivos móveis foram validados por emulação no Chromium; celulares físicos, Safari e Firefox ainda não foram testados à parte.
