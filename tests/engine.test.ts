import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KEY_MAP } from '../src/game/controls.ts';
import { BOOST_PADS, bumpRacers, DIFFICULTIES, KART_COLLISION_RADIUS, loadDifficulty, saveDifficulty, updateDraft } from '../src/game/arcade.ts';
import { MOTOR_CLASSES } from '../src/game/motors.ts';
import { CHARACTERS, ITEMS, TRACK_LENGTH, START_STRAIGHT_LENGTH, CHECKPOINT_COUNT, WALL_EDGE, ROAD_EDGE, driftTier, createRace, updateRace, useItem, trackPoint, projectToTrack, type Input } from '../src/game/engine.ts';

const gas: Input = { accelerate: true, brake: false, left: false, right: false, drift: false, item: false };
const coast: Input = { ...gas, accelerate: false };
function ready(id = 0) {
  const race = createRace(id);
  race.countdown = 0;
  // Isolate intentional item tests from random AI attacks.
  race.aiTimers.fill(10000);
  return race;
}
function run(race: ReturnType<typeof ready>, seconds: number, input = gas, dt = 1 / 60, manualPlayer = true) {
  const steps = Math.ceil(seconds / dt - 1e-9);
  for (let i = 0; i < steps; i++) updateRace(race, dt, input, manualPlayer);
}
function setOnTrack(racer: ReturnType<typeof ready>['racers'][number], progress: number, lane = 0) {
  const raw = ((progress % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
  const p = trackPoint(raw / TRACK_LENGTH), ahead = trackPoint(raw / TRACK_LENGTH + 2 / TRACK_LENGTH);
  racer.progress = progress; racer.rawProgress = raw;
  racer.completedLaps = Math.max(0, Math.min(3, Math.floor(progress / TRACK_LENGTH)));
  racer.checkpointIndex = Math.min(CHECKPOINT_COUNT - 1, Math.floor(raw / TRACK_LENGTH * CHECKPOINT_COUNT));
  racer.lane = lane; racer.heading = p.angle; racer.trackAngle = p.angle;
  racer.trackPitch = -Math.atan2(ahead.y - p.y, 2); racer.y = p.y;
  racer.x = p.x + Math.cos(p.angle) * lane; racer.z = p.z - Math.sin(p.angle) * lane;
  racer.offroad = Math.abs(lane) > ROAD_EDGE;
}

test('every character can finish a genuine three-lap race with all six unique racers', () => {
  for (const c of CHARACTERS) {
    const race = createRace(c.id);
    assert.equal(new Set(race.racers.map(r => r.id)).size, 6);
    run(race, 180, gas, 1 / 60, false);
    assert.ok(race.finished, `${c.name} race did not end`);
    assert.equal(race.racers[0].progress, TRACK_LENGTH * 3);
    assert.equal(race.results.length, 6);
    assert.deepEqual(race.results.map(r => r.position), [1, 2, 3, 4, 5, 6]);
    assert.ok(race.results.every(r => Number.isFinite(r.time) && r.time > 0));
  }
});
test('no race movement before Vai; brake stops before intentional reverse', () => {
  const race = createRace(0);
  race.racers.slice(1).forEach(r => { r.finishTime = 1; });
  run(race, 2);
  assert.equal(race.time, 0);
  assert.ok(race.racers[0].progress === 0);
  run(race, 5);
  const speed = race.racers[0].speed;
  run(race, 1, { ...gas, brake: true });
  assert.ok(race.racers[0].speed < speed);
  run(race, 1.5, { ...gas, brake: true });
  assert.equal(race.racers[0].speed, 0);
});
test('walls keep kart inside fences and steering back always recovers', () => {
  for (const character of CHARACTERS) {
    const race = ready(character.id), p = race.racers[0], t = 0.22;
    race.racers.slice(1).forEach(r => { r.finishTime = 1; });
    setOnTrack(p, t * TRACK_LENGTH, WALL_EDGE - 0.01);
    p.speed = 18; p.heading = p.trackAngle + Math.PI / 2;
    const heading = p.heading;
    run(race, 0.2, gas);
    assert.ok(Math.abs(p.lane) <= WALL_EDGE + 0.01, `${character.name} crossed a fence: ${p.lane}`);
    assert.ok(Math.abs(p.lane) + KART_COLLISION_RADIUS <= 9 - 0.06 + 0.03, 'kart body must stay clear of the guard rail');
    assert.equal(p.heading, heading, 'wall contact must never rotate the player kart');
    assert.ok(p.speed > 8);
  }
});
test('swept wall contacts cannot tunnel through a rail at high speed', () => {
  const race = isolated(), player = race.racers[0];
  setOnTrack(player, 0.24 * TRACK_LENGTH, WALL_EDGE - 0.1);
  player.speed = 40;
  player.heading = player.trackAngle + Math.PI / 2;
  const heading = player.heading;
  run(race, 0.5, gas);
  assert.ok(Math.abs(player.lane) <= WALL_EDGE + 0.01);
  assert.ok(Math.abs(player.lane) + KART_COLLISION_RADIUS <= 9 - 0.06 + 0.03);
  assert.equal(player.heading, heading);
});
test('releasing a charged turn drift grants a short boost', () => {
  const race = ready();
  race.racers.slice(1).forEach(r => { r.finishTime = 1; });
  setOnTrack(race.racers[0], 0.275 * TRACK_LENGTH);
  race.racers[0].speed = 12;
  run(race, 0.7, { ...gas, drift: true, left: true });
  assert.ok(race.racers[0].driftCharge > 0.45);
  updateRace(race, 1 / 60, gas);
  assert.ok(race.racers[0].boost > 0);
  assert.match(race.message, /Impulso/);
});
test('item boxes grant all five items, disappear on collection and respawn', () => {
  const random = Math.random;
  try {
    const rows = [...new Set(ready().boxes.map(box => box.t))];
    assert.equal(rows.length, 4);
    for (const t of rows) {
      const a = trackPoint(t - 0.01), b = trackPoint(t + 0.01);
      assert.ok(Math.abs(Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle))) > 0.08,
        `item row at ${t} must be on the circuit curves`);
    }
    for (let i = 0; i < ITEMS.length; i++) {
      Math.random = () => (i + 0.1) / ITEMS.length;
      const race = ready();
      const box = race.boxes[0];
      setOnTrack(race.racers[0], box.t * TRACK_LENGTH - 1, box.lane);
      updateRace(race, 1 / 60, coast);
      assert.equal(race.racers[0].item, ITEMS[i].id);
      assert.ok(box.cooldown > 0);
      run(race, 4.1, coast);
      assert.equal(box.cooldown, 0);
    }
  } finally { Math.random = random; }
});
test('bats slow only opponents ahead and bone shield blocks a hit', () => {
  const race = ready();
  setOnTrack(race.racers[0], 100);
  race.racers[1].progress = 110;
  race.racers[2].progress = 90;
  race.racers[3].progress = 120;
  race.racers[3].shield = 6;
  race.racers[0].item = 'bats';
  useItem(race);
  assert.ok(race.racers[1].slow > 0);
  assert.equal(race.racers[2].slow, 0);
  assert.equal(race.racers[3].slow, 0);
  assert.equal(race.racers[3].shield, 0);
  assert.equal(race.racers[0].item, null);
});
test('ghost boosts and bone shield expire', () => {
  const race = ready();
  race.racers[0].speed = 22 + CHARACTERS[0].speed * 0.95;
  race.racers[0].item = 'ghost'; useItem(race);
  assert.equal(race.racers[0].boost, 2.5);
  run(race, 2, gas, 1 / 60, false);
  assert.ok(race.racers[0].speed > 22 + CHARACTERS[0].speed * 0.95);
  race.racers[0].item = 'bones'; useItem(race);
  assert.equal(race.racers[0].shield, 6);
  run(race, 6.1);
  assert.equal(race.racers[0].shield, 0);
});
test('pumpkin projectile hits an opponent ahead and slime spins a pursuer', () => {
  const race = ready();
  race.boxes = [];
  const p = race.racers[0], target = race.racers[1];
  setOnTrack(p, 100); target.progress = 110; target.lane = 0;
  p.item = 'pumpkin'; useItem(race);
  let hit = false;
  for (let i = 0; i < 120; i++) {
    updateRace(race, 1 / 60, coast);
    if (target.spin > 0) { hit = true; break; }
  }
  assert.ok(hit, 'pumpkin did not hit');
  target.spin = 0;
  target.recovery = 0; // This independent slime assertion is not a second hit during protection.
  setOnTrack(p, 200); p.item = 'slime'; useItem(race);
  target.progress = 197; target.lane = 0;
  updateRace(race, 1 / 60, coast);
  assert.ok(target.spin > 0);
});
test('AI stay on the road and sometimes use collected items', () => {
  const race = createRace(0); race.countdown = 0;
  race.racers[1].item = 'bones';
  race.aiTimers[1] = 0;
  updateRace(race, 1 / 60, gas);
  assert.ok(race.racers[1].shield > 0);
  run(race, 25);
  assert.ok(race.racers.slice(1).every(r => Math.abs(r.lane) <= 3.5 && r.progress > 200));
});
test('attract mode keeps the lead kart on the rail instead of driving manually', () => {
  const race = createRace(0); race.countdown = 0;
  run(race, 18, gas, 1 / 60, false);
  const lead = race.racers[0];
  assert.ok(lead.progress > 200);
  assert.ok(Math.abs(lead.lane) <= 3.8);
  assert.equal(lead.offroad, false);
  const pose = trackPoint(lead.progress / TRACK_LENGTH);
  const expectedX = pose.x + Math.cos(pose.angle) * lead.lane;
  const expectedZ = pose.z - Math.sin(pose.angle) * lead.lane;
  assert.ok(Math.hypot(lead.x - expectedX, lead.z - expectedZ) < 0.01, 'demo lead must be placed on its current rail pose');
});
test('AI takes the inside of a positive left-hand bend while staying on the rail', () => {
  const race = createRace(0); race.countdown = 0; race.boxes = [];
  race.racers[0].finishTime = 1;
  race.racers.slice(2).forEach(r => { r.finishTime = 1; });
  const ai = race.racers[1];
  ai.progress = 0.30 * TRACK_LENGTH; ai.lane = 0; ai.speed = 20;
  run(race, 0.5, gas, 1 / 60, false);
  assert.ok(ai.lane > 1.2, `AI should move to the inside of this left turn: lane=${ai.lane}`);
  assert.ok(Math.abs(ai.lane) <= 3.8);
});
test('slow frames preserve elapsed race time', () => {
  const race = ready();
  run(race, 2, gas, 0.2);
  assert.ok(race.time >= 1.9, `only ${race.time}s elapsed for 2s of frames`);
});
test('the circuit has one long start straight and curved remaining sections', () => {
  const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const start = trackPoint(0);
  assert.ok(Math.abs(start.angle) < 0.01, 'grid must face down the +Z start straight');
  for (const distance of [10, 35, 70, START_STRAIGHT_LENGTH - 10]) {
    assert.ok(Math.abs(angleDelta(start.angle, trackPoint(distance / TRACK_LENGTH).angle)) < 0.02);
  }
  assert.ok(Math.abs(angleDelta(start.angle, trackPoint((START_STRAIGHT_LENGTH + 15) / TRACK_LENGTH).angle)) > 0.1,
    'the first corner must begin immediately after the long straight');
  for (const t of [0.34, 0.50, 0.68, 0.84, 0.93]) {
    const before = trackPoint(t - 0.01), after = trackPoint(t + 0.01);
    assert.ok(Math.abs(angleDelta(before.angle, after.angle)) > 0.08, `section at ${t} should curve`);
  }
});
test('referenced projection advances locally through the tight south hook', () => {
  const reference = 0.86 * TRACK_LENGTH;
  const laterPoint = trackPoint(0.97);
  const projection = projectToTrack(laterPoint.x, laterPoint.z, reference);
  const localAdvance = (projection.progress - reference + TRACK_LENGTH) % TRACK_LENGTH;
  assert.ok(localAdvance <= 3.01, `projection jumped ${localAdvance.toFixed(2)}m from its reference`);

  let progress = 0.88 * TRACK_LENGTH;
  for (let distance = 1; distance <= 24; distance++) {
    const point = trackPoint((0.88 * TRACK_LENGTH + distance) / TRACK_LENGTH);
    const next = projectToTrack(point.x, point.z, progress);
    let step = (next.progress - progress + TRACK_LENGTH) % TRACK_LENGTH;
    assert.ok(step >= 0 && step <= 3.01, `local projection step ${distance} was ${step.toFixed(2)}m`);
    progress = next.progress;
  }
});
test('wall recovery on the south hook uses the same nearby projection', () => {
  const race = isolated(), player = race.racers[0];
  const before = 0.96 * TRACK_LENGTH;
  setOnTrack(player, before, WALL_EDGE + 0.3);
  player.speed = 0;
  updateRace(race, 1 / 60, coast);
  assert.ok(Math.abs(player.lane) <= WALL_EDGE + 0.01, `wall push left player at lane ${player.lane}`);
  assert.ok(Math.abs(player.progress - before) < 3.01, 'wall recovery must not jump to another hairpin segment');
  assert.ok(race.events.some(event => event.type === 'wall'));
});
test('results contain actual finish times for the whole field', () => {
  const race = ready();
  setOnTrack(race.racers[0], TRACK_LENGTH * 3 - 0.1);
  race.racers[0].speed = 28;
  updateRace(race, 1 / 60, gas, false);
  assert.equal(race.finished, false, 'results must wait for the remaining field');
  run(race, 180, gas, 1 / 60, false);
  assert.ok(race.racers.every(r => r.finishTime !== null));
  assert.ok(race.results.every(r => !r.estimated));
});

test('normal steering responds immediately and stops sliding when released', () => {
  const race = ready(); race.boxes = []; race.racers.slice(1).forEach(r => { r.finishTime = 1; });
  race.racers[0].speed = 24;
  const start = race.racers[0].heading;
  run(race, 0.1, { ...gas, left: true });
  assert.ok(race.racers[0].heading > start);
  assert.ok(race.racers[0].steering > 0);
  const turned = race.racers[0].heading;
  run(race, 0.25);
  assert.equal(race.racers[0].heading, turned);
});
test('player heading stays fixed without steering on a curved section of track', () => {
  const race = ready(); race.boxes = [];
  race.racers.slice(1).forEach(r => { r.finishTime = 1; });
  const player = race.racers[0];
  setOnTrack(player, 0.42 * TRACK_LENGTH);
  player.speed = 20;
  const heading = player.heading;
  run(race, 0.45, { ...gas, left: false, right: false, drift: false });
  assert.equal(player.heading, heading, 'the curve tangent must never auto-align the player');
});
test('orange drift turbo is longer and stronger than blue', () => {
  function drift(seconds: number) {
    const race = ready(); race.boxes = [];
    race.racers.slice(1).forEach(r => { r.finishTime = 1; });
    setOnTrack(race.racers[0], 0.275 * TRACK_LENGTH);
    race.racers[0].speed = 12;
    run(race, seconds, { ...gas, left: true, drift: true });
    const tier = driftTier(race.racers[0].driftCharge);
    updateRace(race, 1 / 60, gas);
    return { tier, duration: race.racers[0].boost, power: race.racers[0].boostPower };
  }
  const blue = drift(0.8), orange = drift(1.8);
  assert.equal(blue.tier, 1); assert.equal(orange.tier, 2);
  assert.ok(orange.duration > blue.duration);
  assert.ok(orange.power > blue.power);
});
test('offroad slows the kart and wall impact bounces without stopping it', () => {
  const race = ready(); race.boxes = []; race.racers.slice(1).forEach(r => { r.finishTime = 1; });
  const p = race.racers[0], t = 0.22;
  setOnTrack(p, t * TRACK_LENGTH, WALL_EDGE - 0.01);
  p.speed = 28; p.heading = p.trackAngle + Math.PI / 2;
  updateRace(race, 1 / 60, gas);
  assert.ok(p.speed > 15);
  assert.ok(p.offroad);
  run(race, 0.2, gas);
  const offroadSpeed = p.speed;
  assert.ok(offroadSpeed < 28);
  p.heading = p.trackAngle - Math.PI / 2;
  run(race, 0.25, gas);
  assert.ok(!p.offroad);
  p.heading = p.trackAngle;
  const recoveredSpeed = p.speed;
  run(race, 0.1);
  assert.ok(p.speed > recoveredSpeed && p.speed > offroadSpeed);
});
test('deliberate reverse warns about wrong way and acceleration recovers', () => {
  const race = ready(); race.boxes = [];
  setOnTrack(race.racers[0], 60);
  run(race, 2, { ...coast, brake: true });
  assert.ok(race.racers[0].speed < -1);
  assert.ok(race.racers[0].wrongWay > 0.35);
  run(race, 2, gas);
  assert.ok(race.racers[0].speed > 1);
  assert.equal(race.racers[0].wrongWay, 0);
});
test('rocket start rewards only a timed press; early and late throttle still accelerate', () => {
  const timed = createRace(0); timed.countdown = 0.7;
  run(timed, 0.72, gas);
  assert.ok(timed.racers[0].boost > 1);
  assert.ok(timed.events.some(e => e.type === 'launch'));
  const early = createRace(0);
  run(early, 3.35, gas);
  assert.equal(early.racers[0].stumble, 0);
  assert.equal(early.racers[0].boost, 0);
  assert.ok(early.racers[0].speed > 2, `early throttle should accelerate on green, speed=${early.racers[0].speed}`);
  assert.ok(!early.events.some(e => e.type === 'stumble'));
  const late = createRace(0); late.countdown = 0.1;
  run(late, 0.25, gas);
  assert.equal(late.racers[0].boost, 0);
  assert.equal(late.racers[0].stumble, 0);
  assert.ok(late.racers[0].speed > 0, 'late throttle should accelerate immediately after green');
});
test('AI catch-up is light and never changes progress discontinuously', () => {
  const race = ready(); race.boxes = [];
  race.racers.forEach((r, i) => { r.progress = i === 5 ? -100 : 100; r.speed = 26; });
  const prior = race.racers.map(r => r.progress);
  updateRace(race, 1 / 60, gas, false);
  race.racers.forEach((r, i) => assert.ok(r.progress - prior[i] >= 0 && r.progress - prior[i] < 0.7));
  run(race, 1, gas, 1 / 60, false);
  assert.ok(race.racers[5].speed < 35, 'catch-up must not exceed normal racing speeds');
});
test('race events announce laps, final lap, items, hits and finish only when they happen', () => {
  const race = ready(); race.boxes = [];
  const p = race.racers[0]; p.speed = 28;
  for (let lap = 1; lap <= 3; lap++) {
    p.progress = TRACK_LENGTH * lap - 0.1;
    updateRace(race, 1 / 60, gas, false);
  }
  for (const type of ['lap', 'finalLap', 'finish']) assert.equal(race.events.filter(e => e.type === type).length, 1);
  assert.equal(p.progress, TRACK_LENGTH * 3);
});
test('lap announcements do not repeat when crossing the start line again', () => {
  const race = ready(), player = race.racers[0];
  player.progress = TRACK_LENGTH - 0.1;
  player.speed = 28;
  updateRace(race, 1 / 60, gas, false);
  assert.equal(race.events.filter(event => event.type === 'lap').length, 1);

  player.progress = TRACK_LENGTH - 0.1;
  player.speed = 0; // Simulate reversing back across the line.
  updateRace(race, 1 / 60, gas, false);
  player.progress = TRACK_LENGTH - 0.1;
  player.speed = 28;
  updateRace(race, 1 / 60, gas, false);
  assert.equal(race.events.filter(event => event.type === 'lap').length, 1);

  player.progress = TRACK_LENGTH * 2 - 0.1;
  updateRace(race, 1 / 60, gas, false);
  assert.equal(race.events.filter(event => event.type === 'finalLap').length, 1);
});
test('a fresh race for character selection clears results and race leftovers', () => {
  const finished = createRace(0, 'berserk', 'turbo');
  finished.finished = true; finished.announcedLap = 2;
  finished.racers[0].item = 'ghost'; finished.racers[0].boost = 2;
  finished.racers[0].finishTime = 92;
  finished.hazards.push({ t: 0.5, lane: 0, life: 3, owner: 1 });
  finished.projectiles.push({ t: 0.6, lane: 0, life: 2, owner: 1 });
  finished.results.push({ id: 0, position: 1, estimated: false, time: 92 });

  const fresh = createRace(3, finished.difficulty, finished.motorClass);
  assert.equal(fresh.finished, false);
  assert.equal(fresh.announcedLap, 0);
  assert.equal(fresh.hazards.length, 0);
  assert.equal(fresh.projectiles.length, 0);
  assert.equal(fresh.results.length, 0);
  assert.equal(fresh.racers[0].item, null);
  assert.equal(fresh.racers[0].boost, 0);
  assert.equal(fresh.racers[0].finishTime, null);
  assert.equal(fresh.difficulty, 'berserk');
  assert.equal(fresh.motorClass, 'turbo');
});

function isolated() {
  const race = ready(); race.boxes = [];
  race.racers.slice(1).forEach(r => { r.finishTime = 1; });
  return race;
}
test('new keyboard scheme separates movement, item and every drift alternate', () => {
  assert.deepEqual(KEY_MAP.find(a => a.name === 'item')!.keys, ['Space', 'KeyE']);
  assert.deepEqual(KEY_MAP.find(a => a.name === 'drift')!.keys, ['ShiftLeft', 'ShiftRight', 'KeyZ', 'KeyX']);
  for (const [name, key] of [['accelerate', 'ArrowUp'], ['brake', 'ArrowDown'], ['left', 'ArrowLeft'], ['right', 'ArrowRight']])
    assert.ok(KEY_MAP.find(a => a.name === name)!.keys.includes(key));
});
test('drift hops once, locks direction, accepts countersteering and releases a turbo', () => {
  const race = isolated(), p = race.racers[0]; p.speed = 9; setOnTrack(p, 0.23 * TRACK_LENGTH, -1);
  updateRace(race, 1 / 60, { ...gas, left: true, drift: true });
  assert.ok(p.hop > 0); assert.equal(p.driftDirection, 1);
  run(race, 0.35, { ...gas, left: true, drift: true });
  assert.equal(p.hop, 0);
  const before = p.heading;
  run(race, 0.4, { ...gas, right: true, drift: true });
  assert.equal(p.driftDirection, 1); assert.ok(p.heading > before);
  assert.ok(p.drifting); assert.ok(p.driftCharge > 0.65);
  updateRace(race, 1 / 60, gas);
  assert.equal(p.driftDirection, 0); assert.ok(p.boost > 0);
});
test('low-speed steering is snappier and high-speed steering is more stable', () => {
  const low = isolated(), high = isolated();
  low.racers[0].speed = 5; high.racers[0].speed = 35;
  updateRace(low, 0.2, { ...gas, left: true });
  updateRace(high, 0.2, { ...gas, left: true });
  assert.ok(low.racers[0].heading > low.racers[0].trackAngle);
  assert.ok(high.racers[0].heading > low.racers[0].heading);
});

test('left and right steering map to screen-left and screen-right on the chase camera', () => {
  for (const t of [0, 0.31]) {
    const p = trackPoint(t);
    const forward = new THREE.Vector3(Math.sin(p.angle), 0, Math.cos(p.angle));
    const center = new THREE.Vector3(p.x, p.y, p.z);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.copy(center).addScaledVector(forward, -8).y += 4;
    const target = center.clone().addScaledVector(forward, 6); target.y += 1;
    camera.lookAt(target); camera.updateMatrixWorld(true);
    const lanePoint = lane => new THREE.Vector3(
      p.x + Math.cos(p.angle) * lane,
      p.y,
      p.z - Math.sin(p.angle) * lane,
    );
    const screenX = lane => camera.worldToLocal(lanePoint(lane)).x;
    assert.ok(screenX(1) < screenX(0), `positive lane must be screen-left at track t=${t}`);
    assert.ok(screenX(-1) > screenX(0), `negative lane must be screen-right at track t=${t}`);
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const yawDelta = new THREE.Vector3(Math.sin(p.angle + 0.18), 0, Math.cos(p.angle + 0.18)).sub(forward);
    assert.ok(yawDelta.dot(cameraRight) < 0, 'positive steering yaw should turn toward screen-left');
  }
  for (const t of [0, 0.31]) {
    const left = isolated(), p = left.racers[0];
    setOnTrack(p, t * TRACK_LENGTH); p.speed = 18;
    const start = new THREE.Vector3(p.x, p.y, p.z), initialHeading = p.heading;
    const forward = new THREE.Vector3(Math.sin(initialHeading), 0, Math.cos(initialHeading));
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.copy(start).addScaledVector(forward, -8); camera.position.y += 4;
    const target = start.clone().addScaledVector(forward, 6); target.y += 1;
    camera.lookAt(target); camera.updateMatrixWorld(true);
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    updateRace(left, 0.16, { ...gas, left: true });
    const leftDelta = new THREE.Vector3(p.x, p.y, p.z).sub(start).dot(cameraRight);
    assert.ok(leftDelta < 0, `left must move screen-left at t=${t}, delta=${leftDelta}`);
    assert.ok(p.heading > initialHeading, `left yaw must be positive at t=${t}`);

    const right = isolated(), q = right.racers[0];
    setOnTrack(q, t * TRACK_LENGTH); q.speed = 18;
    const rightStart = new THREE.Vector3(q.x, q.y, q.z), rightHeading = q.heading;
    const rightForward = new THREE.Vector3(Math.sin(rightHeading), 0, Math.cos(rightHeading));
    const rightCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    rightCamera.position.copy(rightStart).addScaledVector(rightForward, -8); rightCamera.position.y += 4;
    const rightTarget = rightStart.clone().addScaledVector(rightForward, 6); rightTarget.y += 1;
    rightCamera.lookAt(rightTarget); rightCamera.updateMatrixWorld(true);
    const rightAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(rightCamera.quaternion);
    updateRace(right, 0.16, { ...gas, right: true });
    const rightDelta = new THREE.Vector3(q.x, q.y, q.z).sub(rightStart).dot(rightAxis);
    assert.ok(rightDelta > 0, `right must move screen-right at t=${t}, delta=${rightDelta}`);
    assert.ok(q.heading < rightHeading, `right yaw must be negative at t=${t}`);
  }
});
test('player heading stays fixed without steering for several frames', () => {
  const race = isolated(), p = race.racers[0];
  p.speed = 24;
  const heading = p.heading;
  run(race, 1.25, gas);
  assert.equal(p.heading, heading);
});
test('left input turns player heading toward screen-left', () => {
  const race = isolated(), p = race.racers[0];
  p.speed = 24;
  const heading = p.heading;
  run(race, 0.25, { ...gas, left: true });
  assert.ok(p.heading > heading);
});
test('accelerating without steering on a curve goes straight in world space', () => {
  const race = isolated(), p = race.racers[0];
  setOnTrack(p, 0.31 * TRACK_LENGTH);
  p.speed = 16;
  const heading = p.heading, startX = p.x, startZ = p.z;
  run(race, 0.75, gas);
  const dx = p.x - startX, dz = p.z - startZ;
  const forwardX = Math.sin(heading), forwardZ = Math.cos(heading);
  assert.equal(p.heading, heading);
  assert.ok(Math.abs(dx * forwardZ - dz * forwardX) < 1e-8, 'travel must remain on the initial world heading');
});
test('checkpoint gates prevent cutting ahead and advance when crossed on the road', () => {
  const skipped = isolated(), p = skipped.racers[0], remote = trackPoint(0.4);
  p.x = remote.x; p.z = remote.z;
  updateRace(skipped, 1 / 60, coast);
  assert.equal(p.checkpointIndex, 0);
  assert.ok(p.progress <= TRACK_LENGTH / CHECKPOINT_COUNT + 0.01);

  const crossing = isolated(), q = crossing.racers[0];
  const beforeGate = TRACK_LENGTH / CHECKPOINT_COUNT - 0.8;
  setOnTrack(q, beforeGate);
  q.speed = 8;
  run(crossing, 0.2, gas);
  assert.equal(q.checkpointIndex, 1);
  assert.ok(q.progress >= TRACK_LENGTH / CHECKPOINT_COUNT);
});
test('a manually steered player can complete all three laps', () => {
  const race = createRace(0);
  race.aiTimers.fill(10000);
  for (let i = 0; i < 150 * 60 && !race.finished; i++) {
    const p = race.racers[0];
    const error = Math.atan2(Math.sin(p.trackAngle - p.heading - p.lane * 0.08),
      Math.cos(p.trackAngle - p.heading - p.lane * 0.08));
    updateRace(race, 1 / 60, {
      ...gas, left: error > 0.04, right: error < -0.04,
    });
  }
  assert.equal(race.racers[0].completedLaps, 3);
  assert.equal(race.racers[0].progress, TRACK_LENGTH * 3);
  assert.ok(race.racers[0].finishTime !== null);
  assert.ok(race.events.some(event => event.type === 'finalLap'), 'last-lap cue fires at the start of lap 3');
});
test('roulette blocks use until it settles, without spending the selected item', () => {
  const race = isolated(), p = race.racers[0];
  p.item = 'ghost'; p.roulette = 0.85;
  useItem(race); assert.equal(p.item, 'ghost'); assert.equal(p.boost, 0);
  run(race, 0.9, coast); useItem(race);
  assert.equal(p.item, null); assert.ok(p.boost > 0);
});
test('hit recovery prevents chained attacks and expires', () => {
  const race = ready(); race.boxes = [];
  const p = race.racers[0], attacker = race.racers[1];
  p.progress = 100; attacker.progress = 90;
  attacker.item = 'bats'; useItem(race, 1);
  const speed = p.speed; p.spin = 0;
  attacker.item = 'bats'; useItem(race, 1);
  assert.equal(p.speed, speed); assert.ok(p.recovery > 0);
  p.shield = 6; attacker.item = 'bats'; useItem(race, 1);
  assert.equal(p.shield, 6, 'protection must not consume a new shield');
  run(race, 3, gas); assert.equal(p.recovery, 0);
});
test('world-space kart contacts separate full bodies with a small bump impulse', () => {
  const race = ready(); const a = race.racers[0], b = race.racers[1];
  setOnTrack(a, 40, 0); setOnTrack(b, 40, 0.5);
  a.speed = 25; b.speed = 20;
  const result = bumpRacers(race, TRACK_LENGTH);
  assert.ok(result.impact);
  assert.ok(result.touched.includes(a) && result.touched.includes(b));
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= KART_COLLISION_RADIUS * 2);
  assert.ok(a.speed > 20 && b.speed > 20);
  const position = [a.x, a.z, b.x, b.z];
  assert.equal(bumpRacers(race, TRACK_LENGTH).impact, false);
  assert.deepEqual([a.x, a.z, b.x, b.z], position, 'separated karts should not be pushed repeatedly');
});
test('AI-to-AI contacts use the same world-space body separation', () => {
  const race = ready(), a = race.racers[1], b = race.racers[2];
  race.racers.slice(3).forEach(r => { r.finishTime = 1; });
  setOnTrack(a, 90, 0); setOnTrack(b, 90, 0);
  a.speed = b.speed = 20;
  const result = bumpRacers(race, TRACK_LENGTH, true);
  assert.ok(result.impact);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= KART_COLLISION_RADIUS * 2);
  assert.ok(a.bumpCooldown > 0 && b.bumpCooldown > 0);
});
test('player and AI bumps separate their world positions and keep the hit', () => {
  const race = ready(), player = race.racers[0], ai = race.racers[1];
  race.aiTimers.fill(10000);
  race.racers.slice(2).forEach(r => { r.finishTime = 1; });
  setOnTrack(player, 0, 0); setOnTrack(ai, 0, 0);
  player.speed = ai.speed = 20;
  const aiLane = ai.lane;
  const heading = player.heading;
  updateRace(race, 1 / 60, gas);
  assert.ok(Math.hypot(player.x - ai.x, player.z - ai.z) >= KART_COLLISION_RADIUS * 2 - 0.03);
  assert.notEqual(ai.lane, aiLane);
  assert.ok(player.bumpCooldown > 0);
  assert.equal(player.heading, heading, 'a kart-to-kart bump must not steer the manual player');
});
test('AI are placed from the local track reference after a bump on the south hook', () => {
  const race = ready(), player = race.racers[0], ai = race.racers[1];
  race.aiTimers.fill(10000); race.boxes = [];
  setOnTrack(player, 0.94 * TRACK_LENGTH, 0);
  setOnTrack(ai, 0.94 * TRACK_LENGTH, 0);
  player.speed = ai.speed = 20;
  const before = ai.progress;
  updateRace(race, 1 / 60, gas);
  assert.ok(Math.abs(ai.progress - before) < 3, `AI progress jumped from ${before} to ${ai.progress}`);
  const pose = trackPoint(ai.progress / TRACK_LENGTH);
  const expectedX = pose.x + Math.cos(pose.angle) * ai.lane;
  const expectedZ = pose.z - Math.sin(pose.angle) * ai.lane;
  assert.ok(Math.hypot(ai.x - expectedX, ai.z - expectedZ) < 0.01);
});
test('slipstream charges only behind an opponent, grants one boost and respects cooldown', () => {
  const race = ready(); const a = race.racers[0], b = race.racers[1];
  race.racers.slice(2).forEach(r => { r.finishTime = 1; });
  a.progress = 100; b.progress = 108; a.lane = b.lane = 0; a.speed = b.speed = 25;
  let triggered = false;
  for (let i = 0; i < 70; i++) if (updateDraft(a, [a, b], TRACK_LENGTH, 1 / 60)) triggered = true;
  assert.ok(triggered); assert.ok(a.draftCooldown > 0);
  a.draftCharge = 1.1; assert.equal(updateDraft(a, [a, b], TRACK_LENGTH, 1 / 60), false);
  a.lane = 3; updateDraft(a, [a, b], TRACK_LENGTH, 1 / 60); assert.equal(a.draftActive, false);
});
test('boost pads trigger at speed on the painted lane, not adjacent lanes or reverse', () => {
  assert.equal(BOOST_PADS.length, 2);
  for (const pad of BOOST_PADS) {
    const distanceFromLine = pad.t * TRACK_LENGTH;
    assert.ok(distanceFromLine > 10, 'pads must be clear of the start/finish line');
    assert.ok(distanceFromLine < START_STRAIGHT_LENGTH - 10, 'pads must end before the first corner');
    const before = trackPoint(pad.t - 0.01), after = trackPoint(pad.t + 0.01);
    const turn = Math.atan2(Math.sin(after.angle - before.angle), Math.cos(after.angle - before.angle));
    assert.ok(Math.abs(turn) < 0.02, `boost pad at ${pad.t} must sit on the start straight`);
  }
  const pad = BOOST_PADS[0], race = isolated(), p = race.racers[0];
  const countdownRace = isolated(), waiting = countdownRace.racers[0];
  countdownRace.countdown = 3;
  setOnTrack(waiting, pad.t * TRACK_LENGTH - 1.9, pad.lane);
  waiting.speed = 26;
  updateRace(countdownRace, { accelerate: true, brake: false, steering: 0, drift: false, useItem: false }, 1 / 60);
  assert.equal(waiting.boost, 0, 'a straight pad must not activate during countdown');
  setOnTrack(p, pad.t * TRACK_LENGTH - 1.9, pad.lane); p.speed = 26;
  updateRace(race, 1 / 60, gas);
  assert.ok(p.boost > 0); assert.ok(race.events.some(e => e.type === 'pad'));
  const missed = isolated(); setOnTrack(missed.racers[0], pad.t * TRACK_LENGTH - 1, 4);
  missed.racers[0].speed = 26; updateRace(missed, 1 / 60, gas);
  assert.equal(missed.racers[0].boost, 0);
});
test('difficulty changes real AI pace while preserving three-lap finishes', () => {
  const mean: number[] = [];
  for (const difficulty of Object.keys(DIFFICULTIES) as (keyof typeof DIFFICULTIES)[]) {
    const race = createRace(0, difficulty); race.countdown = 0; race.boxes = [];
    run(race, 8, gas, 1 / 60, false);
    mean.push(race.racers.slice(1).reduce((sum, r) => sum + r.progress, 0) / 5);
    run(race, 100, gas, 1 / 60, false);
    assert.ok(race.finished); assert.equal(race.results.length, 6);
  }
  assert.ok(mean[0] < mean[1], JSON.stringify(mean));
  assert.ok(DIFFICULTIES.berserk.pace > 1.025);
  assert.ok(DIFFICULTIES.berserk.catchup > 0.05);
  assert.ok(DIFFICULTIES.berserk.aheadSlack < 0.035);
  assert.ok(DIFFICULTIES.berserk.aggression < 0.72);
  assert.ok(DIFFICULTIES.berserk.racingLine > 1);
});
test('difficulty storage migrates old labels and defaults unknown values to Normal', () => {
  const storage = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  try {
    assert.equal(loadDifficulty(), 'normal');
    for (const legacy of ['easy', 'Fácil', 'fácil', 'facil']) {
      storage.set('hk-difficulty', legacy);
      assert.equal(loadDifficulty(), 'normal', legacy);
    }
    for (const legacy of ['hard', 'Difícil', 'difícil', 'dificil']) {
      storage.set('hk-difficulty', legacy);
      assert.equal(loadDifficulty(), 'berserk', legacy);
    }
    storage.set('hk-difficulty', 'not-a-level');
    assert.equal(loadDifficulty(), 'normal');
    saveDifficulty('berserk');
    assert.equal(storage.get('hk-difficulty'), 'berserk');
    assert.equal(loadDifficulty(), 'berserk');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
test('Space action neither starts a drift nor triggers a rocket launch', () => {
  const race = createRace(0);
  run(race, 3.1, { ...coast, item: true });
  assert.equal(race.racers[0].hop, 0); assert.equal(race.racers[0].drifting, false);
  assert.ok(!race.events.some(e => e.type === 'launch'));
});

test('motor defaults to Normal and remains independent of AI difficulty', () => {
  assert.equal(createRace(0).motorClass, 'normal');
  const race = createRace(0, 'berserk', 'turbo');
  assert.equal(race.difficulty, 'berserk'); assert.equal(race.motorClass, 'turbo');
});
test('Turbo raises acceleration for every racer, not only the human', () => {
  const normal = createRace(0), turbo = createRace(0, 'normal', 'turbo');
  for (const race of [normal, turbo]) {
    race.countdown = 0; race.boxes = []; race.aiTimers.fill(10000);
    race.racers.forEach((r, i) => { r.progress = i * 40; r.padCooldown = 10000; });
    run(race, 0.7, gas, 1 / 60, false);
  }
  normal.racers.forEach((r, i) => assert.ok(turbo.racers[i].speed > r.speed * 1.15, CHARACTERS[r.id].name));
});
test('Turbo top speed is 22 percent higher and steering has stronger grip', () => {
  const speeds: number[] = [], turns: number[] = [];
  for (const motorClass of ['normal', 'turbo'] as const) {
    const race = createRace(0, 'normal', motorClass);
    race.countdown = 0;
    const p = race.racers[0]; p.speed = 24;
    speeds.push((22 + CHARACTERS[p.id].speed * 0.95) * MOTOR_CLASSES[motorClass].speed);
    const initialHeading = p.heading;
    updateRace(race, 0.2, { ...gas, left: true });
    turns.push(p.heading - initialHeading);
  }
  assert.ok(Math.abs(speeds[1] / speeds[0] - 1.22) < 0.001);
  assert.ok(turns[1] > turns[0]);
  assert.ok(MOTOR_CLASSES.turbo.camera > MOTOR_CLASSES.normal.camera);
});
test('both motor classes finish all three laps at every difficulty without stuck racers', () => {
  for (const motorClass of ['normal', 'turbo'] as const) for (const difficulty of ['normal', 'berserk'] as const) {
    const race = createRace(0, difficulty, motorClass);
    run(race, 110, gas, 1 / 60, false);
    assert.ok(race.finished, `${motorClass}/${difficulty}`);
    assert.equal(race.results.length, 6);
    assert.ok(race.results.every(r => Number.isFinite(r.time) && !r.estimated));
    const times = race.results.map(r => r.time);
    assert.ok(Math.max(...times) - Math.min(...times) < 25, 'AI must stay within a reasonable finishing spread');
  }
});
