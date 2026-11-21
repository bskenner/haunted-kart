# Haunted Kart

Jogo de corrida no estilo Mario Kart, com tema de Halloween. Escolha um monstro, dê três voltas no Cemitério da Colina Torta e use poderes assombrados para chegar na frente.

## Jogar agora

- **Jogo publicado:** [https://nifty-gleeful-hertz.replit.app](https://nifty-gleeful-hertz.replit.app)
- **Projeto no Replit:** [https://replit.com/@bskenner86/NiftyGleefulHertz](https://replit.com/@bskenner86/NiftyGleefulHertz)

## Personagens

Cada monstro tem visual próprio e atributos diferentes de **Velocidade**, **Aceleração** e **Dirigibilidade**:

| Personagem   | Estilo                         | Destaque              |
| ------------ | ------------------------------ | --------------------- |
| Fantasma     | Translúcido, branco-azulado    | Alta dirigibilidade   |
| Zumbi        | Verde, decaído                 | Alta aceleração       |
| Múmia        | Bege, enrolada em ataduras     | Equilibrada           |
| Frankenstein | Grandão, verde, com parafusos  | Maior velocidade      |
| Vampiro      | Capa vermelha e preta          | Velocidade e arrancada |
| Lobisomem    | Pelagem marrom e prateada      | Curvas e aceleração   |

Os outros cinco monstros correm contra você, controlados pelo jogo.

## Como jogar

Corrida de **3 voltas**. Na pista há caixas de itens. Derrape nas curvas e solte para ganhar um impulso.

### Teclado

| Tecla | Ação |
| ----- | ---- |
| W ou seta para cima | Acelerar |
| S ou seta para baixo | Frear |
| A / D ou setas laterais | Virar |
| Espaço | Derrapar (segure na curva e solte para o turbo) |
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

O jogo foi criado e está hospedado no Replit. Este repositório contém o código-fonte do jogo (interface em português do Brasil), pronto para rodar fora do monorepo do Replit. O toque foi validado por emulação no Chromium; Safari e Firefox ainda não foram testados à parte.
