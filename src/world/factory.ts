import * as THREE from 'three';

// Fábricas de meshes de personagens. Placeholders geométricos — a ideia é
// trocar por modelos .glb (GLTFLoader) quando houver arte. O terreno e os
// objetos de cenário ficam em TerrainMesh.ts e Props.ts.

/** Personagem placeholder: corpo + cabeça + indicador de "frente". */
export function createCharacter(bodyColor: number, headColor: number): THREE.Group {
  const g = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.62, 1.5, 14),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7 }),
  );
  body.position.y = 0.95;
  body.castShadow = true;
  g.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 18, 12),
    new THREE.MeshStandardMaterial({ color: headColor, roughness: 0.6 }),
  );
  head.position.y = 2.0;
  head.castShadow = true;
  g.add(head);

  // Pequeno "bico" em +Z para enxergar a direção que a entidade encara.
  const front = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.22, 0.6),
    new THREE.MeshStandardMaterial({ color: 0xf2e2b0, roughness: 0.5 }),
  );
  front.position.set(0, 1.1, 0.55);
  front.castShadow = true;
  g.add(front);

  return g;
}

/** Anel verde que pisca no ponto clicado (feedback de movimento). */
export function createTargetMarker(): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.6, 28),
    new THREE.MeshBasicMaterial({
      color: 0x6cff8a,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  return ring;
}
