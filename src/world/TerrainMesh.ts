import * as THREE from 'three';
import type { Terrain } from '../shared/Terrain';

// Constrói a malha 3D do terreno a partir do heightmap compartilhado.
// As cores são por vértice, escolhidas pela altura e pela inclinação
// (areia perto da água, grama no meio, rocha nas encostas e topos).
// É um visual estilizado sem precisar de texturas; dá pra evoluir depois
// para "splatmaps" com texturas reais.

export function createTerrainMesh(terrain: Terrain): THREE.Mesh {
  const segments = 200;
  const geo = new THREE.PlaneGeometry(terrain.size, terrain.size, segments, segments);
  geo.rotateX(-Math.PI / 2); // deita no plano XZ (Y vira a altura)

  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrain.heightAt(pos.getX(i), pos.getZ(i)));
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const normal = geo.attributes.normal as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);

  const cSand = new THREE.Color(0x6f6042);
  const cGrass = new THREE.Color(0x4a6a39);
  const cGrassDark = new THREE.Color(0x395229);
  const cRock = new THREE.Color(0x5c564f);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const steep = 1 - normal.getY(i); // 0 = plano, ~1 = íngreme

    if (y < -1.2) tmp.copy(cSand);
    else if (y < 3.5) tmp.copy(cGrass);
    else tmp.copy(cGrassDark);

    if (steep > 0.32) tmp.lerp(cRock, Math.min(1, (steep - 0.32) * 2.4));

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground'; // alvo do raycaster de clique-para-mover
  return mesh;
}
