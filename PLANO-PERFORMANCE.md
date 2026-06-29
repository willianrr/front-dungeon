# Plano de performance — dungeon (Three.js + Go)

Diagnóstico e plano de ataque para o congelamento/baixo FPS na batalha, baseado em
leitura do código atual e medição real dos assets. Backend/WebSocket já foram
descartados como gargalo nas rodadas anteriores; o problema restante é **render/GPU**.

---

## ✅ Status da execução (29/06/2026)

**Fase 1 (texturas) — feita** na parte que não depende de npm:

- `scripts/optimize-models.mjs` (novo, `npm run optimize:models`) reduz as texturas
  embutidas dos GLB: herói → 1024px, zumbi → 512px, mantendo PNG (zero mudança no
  loader em runtime).
- Reprocessados: `warrior.glb` 17,4 → 11,7 MB e os 5 `zombie/*.glb` 7,1 → 1,3 MB cada.
- **VRAM de textura: ~167 → 56 MB** (com duas janelas: ~334 → 112 MB). É o ganho que
  ataca direto o caso "duas janelas / GPU integrada".
- **GLTFLoader centralizado** em `src/world/gltf.ts`; os 5 call sites
  (`CharacterModel`, `ZombieModel`, `ModelRegistry`, `ChestModels`, `LootModels`)
  passaram a usar a instância compartilhada, com hook pronto para KTX2/meshopt.
- Verificado: `tsc --noEmit` ✓; GLBs revalidados e carregados no three.js com
  skinned mesh + clipes (ANDANDO/PARADO/ATACANDO; walking/dying) intactos.
- Backup dos GLB originais em `outputs/orig-backup/` (este projeto **não tem git**).

**Pendente desta fase — rodar no Windows (onde o npm funciona):**

- `npm run build` (o `vite build` não roda no sandbox: esbuild é win32) e
  `go test ./...` (o backend não foi tocado, então deve seguir verde).
- KTX2/Basis + meshopt: precisam do encoder via npm (`@gltf-transform/cli`) e reduzem
  a VRAM ainda mais. O hook já está pronto em `gltf.ts`.

**Maior ganho restante:** Fase 3 (reativar frustum culling + LOD de animação), que
ataca o custo de horda na batalha.

---

## 1. Diagnóstico (com evidências medidas)

Medições feitas direto nos `.glb` do projeto:

| Asset (em uso) | Tamanho | Vértices | Meshes / Materiais | Texturas | Maior textura |
|---|---|---|---|---|---|
| `warrior.glb` (herói **em uso**) | 17,4 MB | 15.658 | 8 / 9 | 15 PNG = 14,8 MB | 6,0 MB + 3,79 MB |
| `zombie/*Walking*.glb` (base do inimigo) | 7,1 MB | 12.860 | 1 / 1 | 1 PNG = 6,4 MB | 6,4 MB |
| `heroi.glb` (**não usado**) | 44,2 MB | 28.388 | 1 / 1 | 2 PNG = 42,4 MB | 21,18 MB ×2 |
| `Meshy_..._Frontier_Warrior.glb` (**não usado**) | 22,8 MB | 28.285 | 1 / 1 | 1 PNG = 21,2 MB | 21,18 MB |

A contagem de polígonos é baixa (não é o problema). O problema é **textura, número
de draw calls, falta de culling e sombras em malhas skinned** — tudo multiplicado por
**duas janelas abertas** dividindo a mesma GPU.

### Causas-raiz, em ordem de impacto

1. **Texturas gigantes.** O herói carrega 14,8 MB de PNG (uma de 6 MB + uma de 3,8 MB),
   quase certamente 2048²/4096². Em VRAM, descomprimida vira muito mais (um 4096² RGBA ≈
   64 MB; 2048² ≈ 16 MB). São 15 texturas em 9 materiais. O zumbi tem 6,4 MB. **Com duas
   janelas, tudo isso dobra** em banda de upload e VRAM — é o que mata GPU integrada.

2. **Draw calls / materiais.** O herói são 8 meshes / 9 materiais → ~9 draw calls; com
   passagem de sombra dobra; com o jogador remoto (2ª janela visível na sua cena) dobra de
   novo. Modelos do Meshy vêm fatiados por material.

3. **Sem frustum culling.** `frustumCulled = false` está em **todos** os skinned meshes
   (`CharacterModel.ts:133,204`, `ZombieModel.ts:38,102`, `WeaponGlow.ts:436,444`,
   `BladeFireParticles.ts:135`, etc.). Todo zumbi do nível é desenhado **e** projeta sombra
   todo frame, mesmo fora da tela. Numa horda isso explode o custo.

4. **Mixers de animação atualizam todos os zumbis, todo frame.** `updateZombieAnimations`
   (`Game.ts:1093`) percorre todas as views e chama `zombie.update(dt)` sem nenhum critério
   de distância/visibilidade. `ZombieInstance.update` só pula quando o estado é `idle`.

5. **Sombras em malhas skinned.** `PCFSoftShadowMap`, mapa 2048, `castShadow=true` em tudo
   → a cena inteira (incluindo todos os personagens animados) é renderizada uma segunda vez
   na passagem de sombra. Só no preset `high`.

6. **Carga desperdiçada (contribui para o stall inicial).** `ZombieLibrary.load`
   (`ZombieModel.ts:90`) baixa e decodifica **4 GLBs de ~7 MB** (walk/run/attack/dead),
   cada um um skinned mesh completo com textura de 6,4 MB, só para aproveitar **1 clipe** de
   cada. 3 das 4 malhas/texturas (~19 MB) são decodificadas e jogadas fora. Além disso,
   `heroi.glb` (44 MB) e o Frontier (22 MB) estão em `public/` sem uso e são copiados para
   `dist/` (incham o deploy).

7. **Sem compressão de geometria** (nenhum Draco/meshopt — confirmado: zero referências em
   `src/`). Afeta download/primeiro-load, não o FPS contínuo. Prioridade menor que textura.

### Por que "congela e depois aparece quase morto"

O início da batalha junta tudo de uma vez: vários `attachZombie` (clona esqueleto + monta
mixer), efeitos de combate com luzes (variantes de shader compilando, apesar do warmup) e
tudo isso fica visível + animado + projetando sombra ao mesmo tempo. O pico único de ~3 s
é compilação de shader / upload de textura / clone de esqueleto; os ~15 FPS sustentados são
o custo contínuo de muitos skinned meshes não-cullados, com sombra e textura pesada, **vezes
duas janelas**.

---

## 2. Plano por fases (ordenado por retorno)

### Fase 0 — Medir e confirmar (rápido, fazer primeiro)
- Rodar a **mesma batalha com 1 janela** e depois com 2. Se com 1 janela ficar suave, está
  confirmado que é contenção de GPU/VRAM → a Fase 1 (texturas) é a cura principal.
- Promover o log de frame lento (`Game.ts:529`) a um **overlay ao vivo** com `renderer.info`:
  `render.calls`, `render.triangles`, `memory.textures`, `programs.length`. Se `programs`
  cresce durante a luta, ainda há shader compilando que o warmup não cobriu.

### Fase 1 — Texturas (maior ROI, sem refazer arte) ⭐
Esta é a correção central para o cenário "2 janelas / GPU integrada".

- Criar um passo de otimização com **gltf-transform** sobre `warrior.glb` e o zumbi:
  - **Redimensionar** texturas para um teto (ex.: herói 1024², zumbi 512²): `resize`.
  - **Converter para KTX2/Basis** (ETC1S; UASTC só na base color se precisar de nitidez):
    `etc1s`/`uastc`. Reduz VRAM ~6–8× e é nativo de GPU.
  - De passagem: `dedup`, `prune`.
- Ligar o **KTX2Loader** (e, na Fase 2, Draco/Meshopt) no `GLTFLoader`. Hoje há **5
  instâncias cruas** de `new GLTFLoader()` (`CharacterModel.ts:26`, `ZombieModel.ts:19`,
  `ModelRegistry.ts:31`, `ChestModels.ts:10`, `LootModels.ts:11`) sem nenhum decoder.
  **Centralizar a criação do loader** num único módulo (ex.: `src/world/gltf.ts`) que já
  configura KTX2 + Meshopt, e importar de todos. Copiar o transcoder basis + decoder draco
  para `public/`.
- Resultado esperado: herói 14,8 MB → ~1–2 MB; zumbi 6,4 MB → <1 MB. O custo dominante no
  modo duas-janelas cai junto.

### Fase 2 — Draw calls e geometria
- `gltf-transform join` + `dedup` + `palette` no herói para fundir os 8 meshes/9 materiais
  que compartilham material → menos draw calls (modelos Meshy normalmente fundem para 1–2).
- `weld` + compressão **meshopt** (ou Draco) → download menor e decode mais rápido (ajuda o
  stall de load, não o FPS contínuo).
- **Reexportar o zumbi como UM único GLB** com as 4 animações no mesmo skinned mesh + 1
  textura, e parar de baixar 4 arquivos. Corta ~21 MB de carga e o churn de decode. (Dá pra
  fundir as animações com gltf-transform a partir dos 4 arquivos, ou reexportar da fonte.)

### Fase 3 — Culling e LOD de animação (ganho real no FPS contínuo da luta)
- Parar de forçar `frustumCulled = false`. A razão de ele estar desligado é que o skinned
  mesh "some" porque a bounding box do bind-pose está errada. **Correção certa:** depois de
  carregar, definir um `geometry.boundingSphere`/`boundingBox` generoso (ou expandir barato
  por frame) para o culling funcionar — então **reativar o frustum culling** em
  zumbis/heróis/armas/efeitos. Inimigo fora da tela deixa de renderizar e de gerar sombra.
- **LOD de animação:** em `updateZombieAnimations` (`Game.ts:1093`), pular/afinar o
  `mixer.update` de zumbis longe da câmera ou fora da tela (ex.: atualizar distantes a
  10–15 Hz; congelar além de X metros / fora do frustum). Grande ganho quando há um pacote
  de zumbis mas só alguns na tela.

### Fase 4 — Sombras e luz
- Sombra de skinned mesh é cara. Escolher uma: zumbis **não** projetam sombra (só o herói);
  ou limitar os projetores aos N mais próximos; ou `renderer.shadowMap.autoUpdate = false`
  com update manual a cada 2–3 frames; ou mapa de sombra menor mesmo no `high`. Manter o que
  já está desligado em medium/low.
- Alternativa de baixo custo: **"blob shadow"** (um decal escuro embaixo de cada personagem)
  em vez de sombra real para inimigos — em câmera 3/4 fica ótimo e é quase de graça.

### Fase 5 — Limpeza e defaults
- Remover `heroi.glb` (44 MB) e `Meshy_..._Frontier_Warrior.glb` (22 MB) de `public/` (e de
  `dist/`). Encolhe muito o deploy, impacto zero no jogo. Atualizar `public/models/LEIA-ME.md`.
- (Opcional) Reduzir os ~100 ícones de item (0,2–0,6 MB cada) e `hud/menu.png` (1,1 MB) com o
  `optimize-assets.mjs` que já existe — só importa se forem usados como textura de GPU; se são
  `<img>` no DOM, é só custo de load/memória inicial.
- (Opcional) Escolher o tier inicial do AUTO por `navigator.deviceMemory`/`hardwareConcurrency`,
  e considerar começar mais baixo quando detectar o cenário de duas janelas.
- Manter o que já foi feito e funciona: coalescência de snapshot, bypass do composer sem
  bloom, menos logs.

### Fase 6 — Verificação
- Repetir a mesma batalha com 1 e 2 janelas; registrar FPS, `renderer.info.calls/triangles`
  e VRAM. Meta: ~60 travado com 1 janela; ≥30 com 2 janelas em pleno combate.
- `npm run build` + `go test ./...` verdes.
- A/B por fase, para saber o que cada mudança comprou.

---

## 3. Ordem recomendada e esforço

| Fase | Ganho esperado | Esforço | Risco |
|---|---|---|---|
| 0 — Medir | — (direciona o resto) | baixo | nenhum |
| 1 — Texturas KTX2 + loader central | **alto** | médio | baixo |
| 2 — Draw calls + zumbi 1 GLB | médio | médio | baixo |
| 3 — Culling + LOD de animação | **alto** (em horda) | médio | médio (cuidar do pop-out) |
| 4 — Sombras | médio | baixo | baixo |
| 5 — Limpeza/defaults | baixo (deploy) | baixo | nenhum |
| 6 — Verificar | — | baixo | nenhum |

Atalho de máximo retorno se quiser ir direto: **Fase 1 + Fase 3**. As duas juntas atacam o
custo de duas-janelas (VRAM/banda) e o custo de horda (culling/animação), que são exatamente
os dois fatores do seu sintoma.

## 4. Ferramentas
- `@gltf-transform/cli` (resize/etc1s/draco/meshopt/join/dedup/prune). Rodar via `npx` ou
  como devDependency, e adicionar um script `optimize:models` ao lado do `optimize:assets`.
- Decoders runtime em `public/`: basis transcoder (KTX2), draco decoder, meshopt decoder.
- `sharp` já é dependência (usado nos ícones), mas para textura dentro de GLB o gltf-transform
  é o caminho certo.

---

## ✅ Atualização — Fase 3 feita (29/06/2026)

Culling de inimigos + LOD de animação implementados em `src/core/Game.ts`:

- Inimigos fora do frustum da câmera (ou além de 95 un. do jogador) não são
  desenhados nem projetam sombra — culling por entidade. As malhas seguem com
  `frustumCulled=false`, então não há pop-out de skinned mesh quando visíveis.
- LOD de animação dos zumbis: < 24 un. anima todo frame; 24–50 un. ~15 Hz; além
  ~8 Hz; fora de tela, animação congelada. Constantes ajustáveis no topo do
  arquivo (`ENEMY_CULL_*` e `ENEMY_ANIM_*`).
- `heroi.glb` (44 MB) e o Frontier (22 MB), não usados, foram removidos de
  `public/` e `dist/` (backup em `outputs/orig-backup/`).
- Verificado com `tsc --noEmit` (verde).

> Nota técnica: durante a sessão a camada de edição truncou `Game.ts` e
> `package.json` no disco (falha do sandbox no meio de uma escrita grande). Os
> dois foram reconstruídos por um caminho confiável e revalidados com `tsc`.
> Vale abrir o `Game.ts` (deve terminar com o fechamento da classe `}`) e rodar
> `npm run build` no Windows para confirmação final.
