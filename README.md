# Haunted Kart

Jogo de corrida 3D para navegador, com seis monstros, três voltas no Cemitério da Colina Torta e interface em português.

A pista tem apenas uma reta longa de largada e chegada; o restante é cheio de curvas. As faixas de impulso ficam só nessa reta. Os gráficos são nítidos (sem pixelização de propósito).

## Controles da corrida

- **Seta para cima / W:** acelerar.
- **Seta para baixo / S:** frear; segure parado para dar ré.
- **Setas esquerda/direita / A e D:** virar manualmente.
- **Shift / Z / X:** pular e derrapar; solte para ativar o miniturbo.
- **Espaço:** usar o poder sorteado.
- **Esc / P:** pausar.

O kart do jogador não se alinha automaticamente às curvas: a direção muda somente com o volante e a derrapagem iniciada pelo jogador. O contato com trilhos e outros karts reduz o impulso e separa os corpos sem girar o kart por você.

## Controles dos menus

- **Setas:** mover o foco, escolher personagens e ajustar opções.
- **Enter / Espaço:** confirmar o botão ou a opção em foco.
- **Esc:** voltar ou fechar a tela atual.

Os menus cabem na tela, sem precisar rolar a página, nos tamanhos comuns de computador e no celular deitado.

## Opções

- **Dificuldade dos adversários:** Normal (padrão) ou Berserk (nível difícil, um pouco mais puxado que o antigo Difícil).
- **Velocidade do motor:** Normal ou Turbo, independente da dificuldade. Vale para todos os karts.

O áudio é criado por síntese no navegador e começa após a primeira interação. Os níveis de música e efeitos, incluindo o motor, seguem os controles de volume e o botão de silêncio.

## Desenvolvimento

```bash
npm install
npm test
npm run build
npm run dev
```
