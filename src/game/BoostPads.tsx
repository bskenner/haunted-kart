import { BOOST_PADS } from './arcade';
import { trackPoint } from './engine';
import { StaticScenery } from './StaticScenery';

export function BoostPads() {
  return <StaticScenery>{BOOST_PADS.map((pad, index) => {
    const p = trackPoint(pad.t), ahead = trackPoint(pad.t + 0.002);
    const pitch = -Math.atan2(ahead.y - p.y, Math.hypot(ahead.x - p.x, ahead.z - p.z));
    return <group key={index} position={[p.x + Math.cos(p.angle) * pad.lane, p.y + 0.08, p.z - Math.sin(p.angle) * pad.lane]} rotation={[pitch, p.angle, 0]} rotation-order="YXZ">
      <mesh><boxGeometry args={[2.5, 0.05, 4.2]} /><meshBasicMaterial color="#126c88" /></mesh>
      {[-1.15, 0, 1.15].flatMap(z => [-1, 1].map(side =>
        <mesh key={`${z}:${side}`} position={[side * 0.34, 0.05, z]} rotation={[0, -side * 0.65, 0]}>
          <boxGeometry args={[0.18, 0.04, 1.2]} /><meshBasicMaterial color="#8df9ff" toneMapped={false} />
        </mesh>))}
    </group>;
  })}</StaticScenery>;
}
