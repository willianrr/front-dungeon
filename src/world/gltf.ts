import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Carregador GLTF compartilhado por todo o cliente.
//
// Centralizar aqui evita várias instâncias soltas de GLTFLoader e dá um ponto
// único para ligar compressão quando os assets forem reexportados:
//   - KTX2Loader      -> texturas .ktx2/Basis (menos VRAM em repouso)
//   - MeshoptDecoder  -> geometria EXT_meshopt_compression (menos download)
//   - DRACOLoader     -> geometria Draco (menos download)
//
// Hoje os .glb usam PNG e geometria crua (texturas já reduzidas por
// scripts/optimize-models.mjs), então o loader básico resolve. Para habilitar
// KTX2 (ver PLANO-PERFORMANCE.md, Fase 1), copie o transcoder basis para
// public/basis/ e plugue o loader uma vez, passando o renderer:
//
//   import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
//   const ktx2 = new KTX2Loader().setTranscoderPath('/basis/');
//   export function initGltfCompression(renderer: THREE.WebGLRenderer): void {
//     ktx2.detectSupport(renderer);
//     gltfLoader.setKTX2Loader(ktx2);
//   }
//
export const gltfLoader = new GLTFLoader();
