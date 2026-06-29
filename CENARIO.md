# Cenário 3D — do plano ao mundo de Aranna

Como o chão plano virou um cenário de verdade, e como ajustá-lo/expandi-lo.

## O que mudou

O chão antigo (um plano) virou um **mundo procedural com relevo**, vegetação,
rochas, ruínas, água, céu e uma entrada de masmorra. Tudo é gerado a partir de
uma **seed** (determinístico): a mesma seed sempre produz o mesmo mundo, e o
cliente regenera o terreno visual a partir da seed enviada pelo servidor.

### Novos arquivos

| Arquivo | Papel |
| --- | --- |
| `src/shared/rng.ts` | PRNG determinístico + hash para o ruído. |
| `src/shared/Terrain.ts` | Relevo procedural. `heightAt(x, z)` é usado pelo render **e** pela lógica. |
| `src/shared/worldgen.ts` | Gera props (árvores/rochas/ruínas), obstáculos e a entrada da masmorra. |
| `src/world/TerrainMesh.ts` | Constrói a malha 3D do terreno, colorida por altura/inclinação. |
| `src/world/Props.ts` | Desenha os props com `InstancedMesh` + o pórtico da masmorra. |
| `src/world/ModelRegistry.ts` | Encaixe para modelos `.glb` reais (GLTFLoader). |

`World.ts` ganhou céu (`Sky`), névoa, água e um sol que segue o herói (sombras
nítidas perto da ação). A simulação do backend mantém as entidades **sobre o
relevo** e faz **colisão** com os obstáculos.

## Como funciona

O segredo é uma única fonte de verdade: `Terrain.heightAt(x, z)`. A malha 3D
amostra essa função em cada vértice para ganhar relevo, e a simulação amostra a
mesma função para colocar herói e inimigos na altura certa do chão. Visual e
lógica nunca discordam. Os obstáculos (`blockers`) são círculos com raio que a
simulação usa para empurrar as entidades para fora — colisão simples e barata.

## Ajustes rápidos (tuning)

Quase tudo é um número num lugar óbvio:

- **Trocar o mundo inteiro:** a seed fixa do servidor em `back/game/world.go`.
  Cada número gera um mapa diferente.
- **Relevo mais/menos acidentado:** `src/shared/Terrain.ts` → `amplitude`
  (altura dos morros, padrão 11) e `baseScale` (tamanho dos morros, padrão 0.03;
  menor = morros mais largos).
- **Densidade de vegetação:** `src/shared/worldgen.ts` → o limite `props.length < 270`
  e as probabilidades (`r < 0.62` árvore, etc.).
- **Nível da água:** `src/shared/worldgen.ts` → `waterLevel` (padrão −2.2).
- **Posição da masmorra:** `src/shared/worldgen.ts` → `dungeon = { x: 46, z: -34 }`.
- **Cores do terreno:** `src/world/TerrainMesh.ts` → `cSand`, `cGrass`, `cGrassDark`, `cRock`.
- **Hora do dia / céu:** `src/world/World.ts` → `setupSky()` (`elevation`, `azimuth`)
  e a névoa (`FogExp2`).

## Plugar modelos 3D reais (.glb)

Por padrão os props são formas geométricas. Para usar arte de verdade:

1. Baixe modelos gratuitos (low-poly combinam com o estilo):
   [Kenney](https://kenney.nl/assets), [Quaternius](https://quaternius.com),
   [Poly Pizza](https://poly.pizza).
2. Coloque os `.glb` em `public/models/` (crie a pasta).
3. Em `src/core/Game.ts`, descomente e ajuste:

   ```ts
   import { ModelRegistry } from '../world/ModelRegistry';

   const registry = new ModelRegistry();
   registry.register('tree', '/models/arvore.glb');
   registry.register('rock', '/models/pedra.glb');
   this.world = new World(canvas, worldData, registry);
   ```

O sistema carrega o modelo e o posiciona em cada ponto daquele tipo. Onde houver
modelo registrado, ele substitui o prop procedural; o resto continua procedural.
(Para muitas cópias, vale evoluir de `clone()` para `InstancedMesh` da geometria
do modelo — fica como otimização futura.)

## Próximos passos sugeridos

- **Texturas no terreno** (splatmap): misturar texturas de grama/terra/rocha por
  altura/inclinação no lugar das cores por vértice.
- **Personagens em .glb** com animação (`GLTFLoader` + `AnimationMixer`) para herói e zumbis.
- **Pathfinding A\*** para o herói contornar obstáculos ao receber uma ordem de movimento.
- **Interior da masmorra:** a primeira câmara escura é carregada ao clicar no pórtico; ampliar com salas e props próprios é o próximo passo.
- **Água animada:** usar o shader `Water` dos addons do Three.js.
