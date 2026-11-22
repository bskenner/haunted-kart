import { useLayoutEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Batch immutable opaque parts by material; animated parents still move normally. */
export function StaticScenery({ children }: { children: ReactNode }) {
  const source = useRef<THREE.Group>(null), batch = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (!source.current || !batch.current) return;
    source.current.updateWorldMatrix(true, true);
    const inverse = source.current.matrixWorld.clone().invert();
    const bins = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[]; originals: THREE.Mesh[] }>();
    source.current.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat.transparent || !mesh.visible) return;
      const key = [mat.type, mat.color?.getHex(), mat.emissive?.getHex(), mat.emissiveIntensity,
        mat.roughness, mat.metalness, mat.side, mat.toneMapped, mat.fog].join(':');
      let bin = bins.get(key);
      if (!bin) { bin = { material: mat, geometries: [], originals: [] }; bins.set(key, bin); }
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld));
      // All built-in primitives share these attributes.
      for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
      bin.geometries.push(geometry); bin.originals.push(mesh);
    });
    const merged: THREE.Mesh[] = [];
    const originals: THREE.Mesh[] = [];
    for (const bin of bins.values()) {
      const geometry = mergeGeometries(bin.geometries, false);
      bin.geometries.forEach(g => g.dispose());
      if (!geometry) { console.warn('Não foi possível agrupar parte do cenário.'); continue; }
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, bin.material);
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      batch.current.add(mesh); merged.push(mesh);
      bin.originals.forEach(m => { m.visible = false; originals.push(m); });
    }
    return () => {
      originals.forEach(m => { m.visible = true; });
      merged.forEach(m => { m.removeFromParent(); m.geometry.dispose(); });
    };
  }, []);
  return <group><group ref={source}>{children}</group><group ref={batch} /></group>;
}
