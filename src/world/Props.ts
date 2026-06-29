import * as THREE from 'three';
import type { PropInstance, PropKind, WorldData } from '../shared/worldgen';
import { ModelRegistry, placeModels } from './ModelRegistry';

// Objetos de cenário. Por padrão são procedurais e desenhados com InstancedMesh
// (milhares de cópias num único draw call). Se um ModelRegistry trouxer um .glb
// para um tipo, usa o modelo real no lugar.

export function buildProps(scene: THREE.Object3D, world: WorldData, registry?: ModelRegistry): void {
  const byKind: Record<PropKind, PropInstance[]> = { tree: [], rock: [], ruin: [] };
  for (const p of world.props) byKind[p.kind].push(p);

  (Object.keys(byKind) as PropKind[]).forEach((kind) => {
    const list = byKind[kind];
    if (list.length === 0) return;

    const url = registry?.get(kind);
    if (url) {
      void placeModels(scene, url, list); // arte real (assíncrono)
    } else {
      placeProcedural(scene, kind, list); // formas geométricas
    }
  });

  buildDungeonEntrance(scene, world);
}

function placeProcedural(scene: THREE.Object3D, kind: PropKind, list: PropInstance[]): void {
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  if (kind === 'tree') {
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1.6, 6);
    trunkGeo.translate(0, 0.8, 0);
    const trunks = new THREE.InstancedMesh(
      trunkGeo,
      new THREE.MeshStandardMaterial({ color: 0x5a3d24, roughness: 1 }),
      list.length,
    );

    const foliageGeo = new THREE.ConeGeometry(1.1, 2.8, 8);
    foliageGeo.translate(0, 2.8, 0);
    const foliage = new THREE.InstancedMesh(
      foliageGeo,
      new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
      list.length,
    );

    trunks.castShadow = true;
    foliage.castShadow = true;

    list.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.rotationY, 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      foliage.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.28, 0.45, 0.26 + (i % 5) * 0.025);
      foliage.setColorAt(i, color);
    });
    flagUpdates(trunks);
    flagUpdates(foliage);
    scene.add(trunks, foliage);
    return;
  }

  if (kind === 'rock') {
    const rocks = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.8, 0),
      new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }),
      list.length,
    );
    rocks.castShadow = true;
    list.forEach((p, i) => {
      dummy.position.set(p.x, p.y + 0.2 * p.scale, p.z);
      dummy.rotation.set(p.rotationY, p.rotationY * 1.3, p.rotationY * 0.7);
      dummy.scale.set(p.scale, p.scale * 0.8, p.scale);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
      const g = 0.36 + (i % 4) * 0.03;
      color.setRGB(g, g, g * 0.97);
      rocks.setColorAt(i, color);
    });
    flagUpdates(rocks);
    scene.add(rocks);
    return;
  }

  // ruin: pilar de pedra quebrado
  const ruinGeo = new THREE.BoxGeometry(0.6, 2.6, 0.6);
  ruinGeo.translate(0, 1.3, 0);
  const ruins = new THREE.InstancedMesh(
    ruinGeo,
    new THREE.MeshStandardMaterial({ color: 0x8a8275, roughness: 1 }),
    list.length,
  );
  ruins.castShadow = true;
  list.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(Math.sin(i) * 0.12, p.rotationY, Math.cos(i) * 0.12);
    dummy.scale.set(p.scale, p.scale * (0.45 + (i % 3) * 0.28), p.scale);
    dummy.updateMatrix();
    ruins.setMatrixAt(i, dummy.matrix);
  });
  flagUpdates(ruins);
  scene.add(ruins);
}

function flagUpdates(mesh: THREE.InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

// Pórtico de pedra com portal escuro e tochas — marca a entrada de uma futura
// masmorra (o que torna esta "região mista": área externa + acesso a dungeons).
function buildDungeonEntrance(scene: THREE.Object3D, world: WorldData): void {
  const { x, z } = world.dungeon;
  const y = world.terrain.heightAt(x, z);

  const group = new THREE.Group();
  group.position.set(x, y, z);

  const stone = new THREE.MeshStandardMaterial({ color: 0x6d6b66, roughness: 1, flatShading: true });
  const pillarGeo = new THREE.BoxGeometry(0.9, 4, 0.9);

  const left = new THREE.Mesh(pillarGeo, stone);
  left.position.set(-2, 2, 0);
  left.castShadow = true;

  const right = left.clone();
  right.position.x = 2;

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.9, 1.1), stone);
  lintel.position.set(0, 4.4, 0);
  lintel.castShadow = true;

  const portal = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 3.9),
    new THREE.MeshBasicMaterial({ color: 0x05060a }),
  );
  portal.position.set(0, 2, 0.5);

  group.add(left, right, lintel, portal);

  for (const sx of [-2.2, 2.2]) {
    const torch = new THREE.PointLight(0xff7a33, 8, 14, 2);
    torch.position.set(sx, 3.2, 0.7);
    const flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffb060 }),
    );
    flame.position.copy(torch.position);
    group.add(torch, flame);
  }

  group.name = 'dungeon-entrance';
  scene.add(group);
}
