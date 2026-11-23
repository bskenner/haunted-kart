# Haunted Kart

Jogo de corrida no estilo Mario Kart, com tema de Halloween. Escolha um monstro, dê três voltas no Cemitério da Colina Torta e use poderes assombrados para chegar na frente.

## Jogar agora

- **Jogo publicado (app antigo, feito pelo Agent):** [https://nifty-gleeful-hertz.replit.app](https://nifty-gleeful-hertz.replit.app)
- **Projeto antigo no Replit:** [https://replit.com/@bskenner86/NiftyGleefulHertz](https://replit.com/@bskenner86/NiftyGleefulHertz)
- **Código-fonte (fonte da verdade):** [https://github.com/bskenner/haunted-kart](https://github.com/bskenner/haunted-kart)

Para passar a hospedar este repositório no Replit (sem o Agent), siga a seção **Hospedar no Replit** abaixo.

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

Corrida de **3 voltas** no Cemitério da Colina Torta: uma única reta longa de largada/chegada para acelerar, e o restante do circuito em curvas (grampos, esses, varreduras e uma curva fechada de volta à reta). Há minimapa, aviso de contramão e redução de velocidade fora da pista. Nas curvas, dê um pulo e derrape; solte para ganhar um miniturbo (faíscas **azuis** e, se segurar mais, **laranjas**). Há também rampas de impulso, vácuo atrás de outro kart, batidas entre karts e uma roleta curta antes do item ficar pronto.

### Largada especial

Na contagem 3-2-1-Vai, comece a acelerar com a **seta para cima** logo depois de aparecer o **1** e segure até o **Vai!** para ganhar um impulso de largada. Se você segurar o acelerador desde o 3, o kart sai normalmente no verde — só não ganha o turbo extra.

### Dificuldade e velocidade do motor

Na tela inicial e na escolha do personagem você define duas opções independentes, lembradas no navegador:

- **Dificuldade** — Fácil, Normal ou Difícil: muda o ritmo e a agressividade dos adversários.
- **Velocidade do motor** — Normal (padrão) ou Turbo, no estilo 100cc/150cc. O Turbo aumenta a velocidade máxima em cerca de 22% e a aceleração em cerca de 25% para **todos** os karts (você e a IA), com um pouco mais de aderência e direção e uma câmera mais rápida, para continuar controlável. A classe escolhida aparece no HUD e na tela de resultados.

### Teclado

O mundo 3D mantém uma arte estilizada e colorida, com céu em degradê roxo de pôr do sol, mas agora em resolução nítida, com texturas suaves, iluminação mais moderna e modelos um pouco mais detalhados.

A direção do kart do jogador é **totalmente manual**: as setas esquerda/direita viram o heading no chão, e sem input o kart segue em linha reta (não alinha sozinho com a pista). A IA continua seguindo o traçado.

O esquema principal usa as setas e o espaço:

| Tecla | Ação |
| ----- | ---- |
| Seta para cima (ou W) | Acelerar na hora e enquanto estiver pressionada |
| Seta para baixo (ou S) | Frear e, se estiver parado, ré |
| Setas laterais (ou A / D) | Virar: esquerda vai para a esquerda da tela, direita para a direita (visão da câmera atrás do kart) |
| Espaço | Usar o poder, depois da roleta do item |
| Shift (esquerdo ou direito; ou Z / X) | Pular e derrapar: faíscas azuis → laranjas; solte para turbinar |
| Esc ou P | Pausar |

O WASD permanece como alternativa só para movimento. A tecla E também usa o item, como atalho extra.

### Toque (celular)

Há botões na tela para acelerar, frear, virar, usar o item e derrapar.

## Itens

- **Enxame de morcegos** — reduz a velocidade dos corredores à frente
- **Bomba de abóbora** — projétil que pode fazer um oponente rodar
- **Impulso fantasma** — turbo temporário
- **Escudo de ossos** — proteção por alguns segundos
- **Poção escorregadia** — deixa uma poça atrás do kart

Depois de um impacto, o kart fica invulnerável por um instante.

## Música e sons

Toda a trilha e os efeitos são originais, gerados no navegador (Web Audio API). Não há músicas com direitos autorais.

- Música de fundo no menu e uma faixa mais intensa na corrida
- Motor que muda com a velocidade, derrapagem, turbo, coleta e uso de itens, impactos, apitos da largada, volta concluída, jingle da última volta e fanfarra de chegada
- Som de assinatura ao selecionar cada monstro
- Controles de **Música** e **Efeitos sonoros**, além de silenciar, na tela inicial e na pausa
- As preferências de áudio, dificuldade e classe do motor são salvas no navegador
- O áudio só começa depois da primeira interação (clique, toque ou tecla), por regra dos navegadores

## Rodar localmente

É um jogo de frontend (React + Three.js + Vite). Não precisa de backend.

```bash
npm install
npm run dev
```

Abre o endereço que o Vite mostrar (em geral `http://localhost:5173`).

Outros comandos:

```bash
npm test        # testes da lógica da corrida
npm run build   # gerar a versão de produção
npm run preview # servir a versão gerada
```

## Hospedar no Replit

O Replit deve **apenas hospedar** o jogo. As mudanças de código entram por este repositório no GitHub, sem usar o Replit Agent (para não gastar créditos).

Este repositório já inclui `.replit` e `replit.nix` para um app Vite estático: o botão **Run** inicia `npm run dev` em `0.0.0.0:5173`, e a publicação estática gera `npm run build` e serve a pasta `dist`.

1. No app antigo [NiftyGleefulHertz](https://replit.com/@bskenner86/NiftyGleefulHertz), abra **Publishing** e use a opção de **shut down the deployment** (encerrar a publicação). Confirme. No plano Starter só cabe **1 app publicado**; isso libera a vaga. O endereço antigo sai do ar. (O projeto em si não é apagado.)
2. Importe este repositório **sem abrir o Agent**. Caminho rápido (repositório público): abra [https://replit.com/github.com/bskenner/haunted-kart](https://replit.com/github.com/bskenner/haunted-kart). Ou vá em [replit.com/import](https://replit.com/import), escolha **GitHub**, conecte a conta, selecione `bskenner/haunted-kart` e clique em **Import**. Se aparecer convite para o Agent ou Lite/Full build, ignore e continue só no editor.
3. Quando o workspace abrir, confira se o botão **Run** sobe o jogo. Não use o Agent para “ajustar” o projeto.
4. No canto superior direito, clique em **Publish**. Em **Adjust settings**, no menu **Deployment type**, escolha **Static**. Confira se o diretório público é `dist` e o comando de build é `npm run build` (já definidos no `.replit`). Publique como **Public**.

Atualizações futuras: o código é alterado neste repositório e enviado para `main`. No app importado, abra **Tools → Git** e use **Pull changes**. Depois clique em **Republish** (as alterações no editor não vão ao ar sozinhas). Não há republicação automática oficial a cada push.

## Jogar pelo GitHub Pages

Além do Replit, o jogo pode ser publicado de graça pelo GitHub Pages deste repositório (Actions no ramo `main`). Depois de ativar **Settings → Pages → Source: GitHub Actions**, o endereço fica:

- **https://bskenner.github.io/haunted-kart/**

## Observações

O jogo foi criado e está hospedado no Replit. Este repositório contém o código-fonte do jogo (interface em português do Brasil), pronto para rodar fora do monorepo do Replit. O toque e o desempenho em dispositivos móveis foram validados por emulação no Chromium; celulares físicos, Safari e Firefox ainda não foram testados à parte.
