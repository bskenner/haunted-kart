import * as THREE from 'three';

const dark = '#1c1428';

function Eyes({ y, z, color = '#120b18', glow = false, spread = 0.13, size = 0.06 }: { y: number; z: number; color?: string; glow?: boolean; spread?: number; size?: number }) {
  return (
    <>
      {[-spread, spread].map(x => (
        <mesh key={x} position={[x, y, z]}>
          <sphereGeometry args={[size, 10, 8]} />
          {glow ? <meshBasicMaterial color={color} toneMapped={false} /> : <meshStandardMaterial color={color} roughness={0.3} />}
        </mesh>
      ))}
    </>
  );
}

function Ghost({ c }: { c: { color: string; accent: string } }) {
  return (
    <group>
      <mesh position={[0, 1.15, 0]}>
        <coneGeometry args={[0.55, 1.1, 18, 1, true]} />
        <meshStandardMaterial color={c.color} transparent opacity={0.62} emissive={c.accent} emissiveIntensity={0.35} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.42, 20, 16]} />
        <meshStandardMaterial color={c.color} transparent opacity={0.72} emissive={c.accent} emissiveIntensity={0.45} depthWrite={false} />
      </mesh>
      <Eyes y={1.66} z={0.36} size={0.08} />
      <mesh position={[0, 1.48, 0.39]}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshStandardMaterial color={dark} />
      </mesh>
      {[-0.45, 0.45].map(x => (
        <mesh key={x} position={[x, 1.25, 0.25]} rotation={[0.9, 0, x > 0 ? -0.5 : 0.5]}>
          <coneGeometry args={[0.1, 0.5, 8]} />
          <meshStandardMaterial color={c.color} transparent opacity={0.6} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Zombie({ c }: { c: { color: string; accent: string } }) {
  return (
    <group>
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[0.62, 0.6, 0.4]} />
        <meshStandardMaterial color={c.accent} roughness={0.9} />
      </mesh>
      <mesh position={[0.05, 1.62, 0.02]} rotation={[0, 0, 0.12]}>
        <boxGeometry args={[0.55, 0.55, 0.52]} />
        <meshStandardMaterial color={c.color} roughness={0.8} />
      </mesh>
      <Eyes y={1.68} z={0.28} color="#f4ff7a" glow spread={0.12} size={0.065} />
      <mesh position={[0.02, 1.45, 0.28]}>
        <boxGeometry args={[0.3, 0.06, 0.02]} />
        <meshStandardMaterial color={dark} />
      </mesh>
      {[-0.36, 0.36].map(x => (
        <mesh key={x} position={[x, 1.2, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
          <boxGeometry args={[0.15, 0.7, 0.15]} />
          <meshStandardMaterial color={c.color} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Mummy({ c }: { c: { color: string; accent: string } }) {
  const bands = [1.0, 1.15, 1.3, 1.5, 1.64, 1.78];
  return (
    <group>
      <mesh position={[0, 1.1, 0]}>
        <cylinderGeometry args={[0.3, 0.34, 0.6, 14]} />
        <meshStandardMaterial color={c.color} roughness={1} />
      </mesh>
      <mesh position={[0, 1.62, 0]}>
        <sphereGeometry args={[0.36, 18, 14]} />
        <meshStandardMaterial color={c.color} roughness={1} />
      </mesh>
      {bands.map((y, i) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2 + (i % 2 ? 0.18 : -0.14), 0, 0]}>
          <torusGeometry args={[y > 1.4 ? 0.34 : 0.33, 0.035, 6, 20]} />
          <meshStandardMaterial color={i % 2 ? c.accent : '#efe3c0'} roughness={1} />
        </mesh>
      ))}
      <mesh position={[0.12, 1.66, 0.32]}>
        <sphereGeometry args={[0.07, 10, 8]} />
        <meshBasicMaterial color="#ffb347" toneMapped={false} />
      </mesh>
      <mesh position={[-0.12, 1.66, 0.33]}>
        <boxGeometry args={[0.14, 0.03, 0.02]} />
        <meshStandardMaterial color={dark} />
      </mesh>
    </group>
  );
}

function Frank({ c }: { c: { color: string; accent: string } }) {
  return (
    <group>
      <mesh position={[0, 1.08, 0]}>
        <boxGeometry args={[0.85, 0.66, 0.5]} />
        <meshStandardMaterial color="#2c2538" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.72, 0]}>
        <boxGeometry args={[0.62, 0.7, 0.58]} />
        <meshStandardMaterial color={c.color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.1, 0]}>
        <boxGeometry args={[0.66, 0.12, 0.62]} />
        <meshStandardMaterial color="#141018" />
      </mesh>
      <mesh position={[0, 1.88, 0.3]}>
        <boxGeometry args={[0.5, 0.08, 0.04]} />
        <meshStandardMaterial color="#141018" />
      </mesh>
      <Eyes y={1.76} z={0.3} color="#fff5c2" spread={0.14} />
      <mesh position={[0, 1.5, 0.3]}>
        <boxGeometry args={[0.34, 0.04, 0.02]} />
        <meshStandardMaterial color={dark} />
      </mesh>
      {[-1, 1].map(s => (
        <group key={s}>
          <mesh position={[s * 0.4, 1.48, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.06, 0.06, 0.24, 10]} />
            <meshStandardMaterial color="#b9b6c8" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[s * 0.53, 1.48, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.1, 0.1, 0.06, 10]} />
            <meshStandardMaterial color={c.accent} metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Vampire({ c }: { c: { color: string; accent: string } }) {
  return (
    <group>
      <mesh position={[0, 1.05, 0]}>
        <boxGeometry args={[0.6, 0.6, 0.38]} />
        <meshStandardMaterial color={c.accent} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.05, -0.3]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[1.0, 1.1, 0.05]} />
        <meshStandardMaterial color={c.color} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.62, -0.12]} rotation={[-0.2, 0, 0]}>
        <coneGeometry args={[0.55, 0.6, 4, 1, true]} />
        <meshStandardMaterial color={c.color} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.62, 0]}>
        <sphereGeometry args={[0.34, 18, 14]} />
        <meshStandardMaterial color="#e9dfee" roughness={0.5} />
      </mesh>
      <mesh position={[0, 1.86, -0.04]} scale={[1, 0.5, 1]}>
        <sphereGeometry args={[0.36, 16, 10]} />
        <meshStandardMaterial color="#110c16" />
      </mesh>
      <Eyes y={1.66} z={0.3} color="#ff2a4d" glow spread={0.12} />
      {[-0.06, 0.06].map(x => (
        <mesh key={x} position={[x, 1.46, 0.28]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.025, 0.08, 6]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}

function Werewolf({ c }: { c: { color: string; accent: string } }) {
  return (
    <group>
      <mesh position={[0, 1.08, 0]}>
        <boxGeometry args={[0.74, 0.62, 0.46]} />
        <meshStandardMaterial color={c.color} roughness={1} />
      </mesh>
      <mesh position={[0, 1.62, 0]}>
        <sphereGeometry args={[0.38, 16, 12]} />
        <meshStandardMaterial color={c.color} roughness={1} />
      </mesh>
      <mesh position={[0, 1.54, 0.36]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 0.32, 10]} />
        <meshStandardMaterial color="#7a5844" roughness={1} />
      </mesh>
      <mesh position={[0, 1.58, 0.53]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#120b10" />
      </mesh>
      {[-0.2, 0.2].map(x => (
        <mesh key={x} position={[x, 2.0, -0.02]} rotation={[0, 0, x > 0 ? -0.25 : 0.25]}>
          <coneGeometry args={[0.11, 0.32, 4]} />
          <meshStandardMaterial color={c.accent} metalness={0.7} roughness={0.25} />
        </mesh>
      ))}
      <Eyes y={1.72} z={0.31} color="#ffd23f" glow spread={0.13} />
    </group>
  );
}

const MONSTERS = [Ghost, Zombie, Mummy, Frank, Vampire, Werewolf];

export function Kart({ index, color, accent }: { index: number; color: string; accent: string }) {
  const Monster = MONSTERS[((index % 6) + 6) % 6];
  return (
    <group>
      {/* chassis */}
      <mesh position={[0, 0.45, 0]}>
        <boxGeometry args={[1.5, 0.36, 2.3]} />
        <meshStandardMaterial color={accent} roughness={0.4} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.5, 1.25]} rotation={[0.35, 0, 0]}>
        <boxGeometry args={[1.2, 0.26, 0.6]} />
        <meshStandardMaterial color={color} roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.66, 0.3]}>
        <boxGeometry args={[1.56, 0.06, 0.5]} />
        <meshStandardMaterial color="#ff7a1a" emissive="#ff5a00" emissiveIntensity={0.4} />
      </mesh>
      {/* seat */}
      <mesh position={[0, 0.82, -0.35]}>
        <boxGeometry args={[0.8, 0.5, 0.18]} />
        <meshStandardMaterial color="#20162c" />
      </mesh>
      {/* spoiler */}
      <mesh position={[0, 1.05, -1.15]}>
        <boxGeometry args={[1.6, 0.06, 0.35]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {[-0.6, 0.6].map(x => (
        <mesh key={x} position={[x, 0.82, -1.1]}>
          <boxGeometry args={[0.06, 0.4, 0.06]} />
          <meshStandardMaterial color="#20162c" />
        </mesh>
      ))}
      {/* exhausts */}
      {[-0.35, 0.35].map(x => (
        <mesh key={x} position={[x, 0.5, -1.25]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.1, 0.3, 8]} />
          <meshStandardMaterial color="#8c88a0" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      {/* wheels */}
      {[[-0.85, 0.8], [0.85, 0.8], [-0.88, -0.8], [0.88, -0.8]].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, 0.34, z]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[z < 0 ? 0.38 : 0.32, z < 0 ? 0.38 : 0.32, 0.32, 14]} />
            <meshStandardMaterial color="#120d18" roughness={0.9} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]} position={[x > 0 ? 0.17 : -0.17, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.02, 10]} />
            <meshStandardMaterial color="#ff7a1a" emissive="#ff5a00" emissiveIntensity={0.3} />
          </mesh>
        </group>
      ))}
      <group position={[0, -0.25, -0.1]}>
        <Monster c={{ color, accent }} />
      </group>
    </group>
  );
}
