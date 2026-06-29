# Modelos 3D (.glb)

Coloque aqui os modelos do jogo no formato **GLB** (glTF 2.0 binario).
O Vite serve esta pasta na raiz, entao um arquivo aqui fica acessivel via URL
`/models/<arquivo>` dentro do jogo.

## Seu personagem

Quando o boneco do Meshy ficar pronto, **exporte como GLB** (riggado, com as
animacoes) e salve aqui com este nome:

    heroi.glb

Assim ele fica disponivel em `/models/heroi.glb`.

### Como exportar no Meshy
- Formato: **GLB**
- Rig: **humanoide**
- Animacoes: no minimo **idle**, **andar (walk)** e **atacar (attack)**
- De preferencia low-poly (melhor performance no navegador)

## O herói já está ligado

O jogo carrega automaticamente `heroi.glb` e usa `AnimationMixer` para idle,
andar, correr, atacar, pular e morrer. O placeholder azul só aparece se esse
arquivo falhar ao carregar.

Ao substituir o arquivo, mantenha os nomes de clipe usados em
`src/world/CharacterModel.ts` ou atualize o mapa `CLIP_FOR` nesse arquivo.
