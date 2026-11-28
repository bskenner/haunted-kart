import test from 'node:test';
import assert from 'node:assert/strict';
import { KEY_MAP } from '../src/game/controls.ts';
import { BOOST_PADS, bumpRacers, DIFFICULTIES, parseDifficulty, updateDraft } from '../src/game/arcade.ts';
import { GEAR_COUNT, nextGear, gearRpm, engineTone } from '../src/game/engineSound.ts';
import { MOTOR_CLASSES } from '../src/game/motors.ts';
import { CHARACTERS, ITEMS, TRACK_LENGTH, START_STRAIGHT_LENGTH, WALL_EDGE, ROAD_EDGE, CHECKPOINTS, driftTier, createRace, updateRace, useItem, trackPoint, kartPosition, placeRacer, projectOnTrack, authorizeProgress, type Racer, type Input } from '../src/game/engine.ts';

const gas: Input = { accelerate: true, brake: false, left: false, right: false, drift: false, item: false };
const coast: Input = { ...gas, accelerate: false };
function ready(id = 0) {
  const race = createRace(id);
  race.countdown = 0;
  // Isolate intentional item tests from random AI attacks.
  race.aiTimers.fill(10000);
  return race;
}
function run(race: ReturnType<typeof ready>, seconds: number, input = gas, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) updateRace(race, dt, input);
}

function sit(racer: Racer, progress = racer.progress, lane = racer.lane) {
  placeRacer(racer, progress, lane);
}
function followTrack(race: ReturnType<typeof ready>): Input {
  const p = race.racers[0];
  const target = kartPosition(p.progress + 14, 0);
  let err = Math.atan2(target.x - p.x, target.z - p.z) - p.heading;
  err = Math.atan2(Math.sin(err), Math.cos(err));
  return { accelerate: true, brake: false, left: err > 0.05, right: err < -0.05, drift: false, item: false };
}
function runFollow(race: ReturnType<typeof ready>, seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) updateRace(race, dt, followTrack(race));
}
function cameraScreenX(kart: Racer, cam: Racer) {
  const fx = Math.sin(cam.heading), fz = Math.cos(cam.heading);
  const eye = { x: cam.x - fx * 8.5, y: cam.y + 4.2, z: cam.z - fz * 8.5 };
  const target = { x: cam.x + fx * 6, y: cam.y + 1.2, z: cam.z + fz * 6 };
  const zx = eye.x - target.x, zy = eye.y - target.y, zz = eye.z - target.z;
  const zlen = Math.hypot(zx, zy, zz) || 1;
  const z = { x: zx / zlen, y: zy / zlen, z: zz / zlen };
  let xx = z.z, xy = 0, xz = -z.x;
  const xlen = Math.hypot(xx, xy, xz) || 1;
  xx /= xlen; xy /= xlen; xz /= xlen;
  return (kart.x - eye.x) * xx + (kart.y - eye.y) * xy + (kart.z - eye.z) * xz;
}


test('every character can finish a genuine three-lap race with all six unique racers', () => {
  for (const c of CHARACTERS) {
    const race = createRace(c.id);
    assert.equal(new Set(race.racers.map(r => r.id)).size, 6);
    runFollow(race, 180);
    assert.ok(race.finished, `${c.name} race did not end`);
    assert.equal(race.racers[0].progress, TRACK_LENGTH * 3);
    assert.equal(race.results.length, 6);
    assert.deepEqual(race.results.map(r => r.position), [1, 2, 3, 4, 5, 6]);
    assert.ok(race.results.every(r => Number.isFinite(r.time) && r.time > 0));
  }
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
  for (const frac of [0.34, 0.50, 0.68, 0.84, 0.93]) {
    const before = trackPoint(frac - 0.01), after = trackPoint(frac + 0.01);
    assert.ok(Math.abs(angleDelta(before.angle, after.angle)) > 0.08, `section at ${frac} should curve`);
  }
});

test('no race movement before Vai; brake stops before intentional reverse', () => {
  const race = createRace(0);
  run(race, 2);
  assert.equal(race.time, 0);
  assert.ok(race.racers[0].progress === 0);
  run(race, 5);
  const speed = race.racers[0].speed;
  run(race, 1, { ...gas, brake: true });
  assert.ok(race.racers[0].speed < speed);
  run(race, 2, { ...gas, brake: true });
  assert.equal(race.racers[0].speed, 0);
});
test('walls keep kart inside fences and steering back always recovers', () => {
  for (const character of CHARACTERS) {
    const race = ready(character.id);
    run(race, 5);
    run(race, 4, { ...gas, left: true });
    assert.ok(Math.abs(race.racers[0].lane) <= WALL_EDGE, `${character.name} crossed a fence: ${race.racers[0].lane}`);
    run(race, 1.5, { ...gas, right: true });
    assert.ok(race.racers[0].lane < WALL_EDGE - 0.2);
    assert.ok(race.racers[0].speed > 8);
  }
});
test('releasing a charged turn drift grants a short boost', () => {
  const race = ready(); race.boxes = [];
  sit(race.racers[0], START_STRAIGHT_LENGTH * 0.45, 0);
  race.racers[0].speed = 20;
  run(race, 0.7, { ...gas, drift: true, left: true });
  assert.ok(race.racers[0].driftCharge > 0.45);
  sit(race.racers[0], race.racers[0].progress, 0);
  race.racers[0].speed = 20;
  updateRace(race, 1 / 60, gas);
  assert.ok(race.racers[0].boost > 0);
  assert.match(race.message, /Impulso/);
});
test('item boxes grant all five items, disappear on collection and respawn', () => {
  const random = Math.random;
  try {
    for (let i = 0; i < ITEMS.length; i++) {
      Math.random = () => (i + 0.1) / ITEMS.length;
      const race = ready();
      const box = race.boxes[0];
      sit(race.racers[0], box.t * TRACK_LENGTH - 2, box.lane);
      race.racers[0].speed = 16;
      race.racers[0].padCooldown = 10000;
      for (let n = 0; n < 20 && !race.racers[0].item; n++) updateRace(race, 1 / 60, coast);
      assert.equal(race.racers[0].item, ITEMS[i].id);
      assert.ok(box.cooldown > 0);
      run(race, 4.1, coast);
      assert.equal(box.cooldown, 0);
    }
  } finally { Math.random = random; }
});
test('bats slow only opponents ahead and bone shield blocks a hit', () => {
  const race = ready();
  sit(race.racers[0], 100, 0);
  sit(race.racers[1], 110, 0);
  sit(race.racers[2], 90, 0);
  sit(race.racers[3], 120, 0);
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
  race.boxes = [];
  race.racers[0].speed = 22 + CHARACTERS[0].speed * 0.95;
  race.racers[0].item = 'ghost'; useItem(race);
  assert.equal(race.racers[0].boost, 2.5);
  run(race, 2);
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
  sit(p, 100, 0); sit(target, 110, 0);
  p.item = 'pumpkin'; useItem(race);
  let hit = false;
  for (let i = 0; i < 120; i++) {
    updateRace(race, 1 / 60, coast);
    if (target.spin > 0) { hit = true; break; }
  }
  assert.ok(hit, 'pumpkin did not hit');
  target.spin = 0;
  target.recovery = 0; // This independent slime assertion is not a second hit during protection.
  sit(p, 200, 0); p.item = 'slime'; useItem(race);
  sit(target, 197, 0);
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
  assert.ok(race.racers.slice(1).every(r => Math.abs(r.lane) <= ROAD_EDGE && r.progress > 200));
});
test('slow frames preserve elapsed race time', () => {
  const race = ready();
  run(race, 2, gas, 0.2);
  assert.ok(race.time >= 1.9, `only ${race.time}s elapsed for 2s of frames`);
});
test('results contain actual finish times for the whole field', () => {
  const race = ready();
  sit(race.racers[0], TRACK_LENGTH * 3 - 0.1, 0);
  race.racers[0].speed = 28;
  updateRace(race, 1 / 60, gas);
  assert.equal(race.finished, false, 'results must wait for the remaining field');
  run(race, 180);
  assert.ok(race.racers.every(r => r.finishTime !== null));
  assert.ok(race.results.every(r => !r.estimated));
});

test('normal steering responds immediately and stops turning when released', () => {
  const race = ready(); race.boxes = []; race.racers[0].speed = 24;
  const cam = { ...race.racers[0] };
  const heading0 = race.racers[0].heading;
  run(race, 0.1, { ...gas, right: true });
  const rightX = cameraScreenX(race.racers[0], cam);
  assert.ok(rightX > 0.15, `right should move toward screen-right, got ${rightX}`);
  assert.ok(race.racers[0].heading < heading0);
  const after = race.racers[0].heading;
  run(race, 0.25);
  assert.equal(race.racers[0].heading, after);
});
test('orange drift turbo is longer and stronger than blue', () => {
  function drift(seconds: number) {
    const race = ready(); race.boxes = [];
    sit(race.racers[0], race.racers[0].progress, 0); race.racers[0].speed = 24;
    run(race, seconds, { ...gas, left: true, drift: true });
    const tier = driftTier(race.racers[0].driftCharge);
    // Snap back to the tarmac so the release bonus is judged on-road.
    sit(race.racers[0], race.racers[0].progress, 0);
    race.racers[0].speed = 24;
    updateRace(race, 1 / 60, gas);
    return { tier, duration: race.racers[0].boost, power: race.racers[0].boostPower };
  }
  const blue = drift(0.8), orange = drift(1.8);
  assert.equal(blue.tier, 1); assert.equal(orange.tier, 2);
  assert.ok(orange.duration > blue.duration);
  assert.ok(orange.power > blue.power);
});
test('offroad slows the kart and wall impact bounces without stopping it', () => {
  const race = ready(); race.boxes = [];
  const p = race.racers[0];
  sit(p, START_STRAIGHT_LENGTH * 0.45, 0);
  p.speed = 28;
  p.heading = p.heading + Math.PI / 2;
  updateRace(race, 1 / 60, gas);
  assert.ok(Math.abs(p.lane) <= WALL_EDGE + 0.001);
  assert.ok(p.speed > 15);
  for (let i = 0; i < 48 && !p.offroad; i++) updateRace(race, 1 / 60, gas);
  assert.ok(p.offroad, 'driving sideways must leave the asphalt');
  run(race, 0.35, gas);
  const offroadSpeed = p.speed;
  assert.ok(offroadSpeed < 28);
  // Steer back toward the track centerline.
  for (let i = 0; i < 180; i++) {
    const proj = projectOnTrack(p.x, p.z);
    const desired = proj.angle;
    let err = Math.atan2(Math.sin(desired - p.heading), Math.cos(desired - p.heading));
    updateRace(race, 1 / 60, { ...gas, left: err > 0.04, right: err < -0.04 });
  }
  assert.ok(Math.abs(p.lane) < ROAD_EDGE);
  assert.ok(!p.offroad);
  runFollow(race, 2);
  assert.ok(p.speed > offroadSpeed);
});
test('deliberate reverse warns about wrong way and acceleration recovers', () => {
  const race = ready(); race.boxes = [];
  sit(race.racers[0], START_STRAIGHT_LENGTH * 0.45, 0);
  run(race, 2, { ...coast, brake: true });
  assert.ok(race.racers[0].speed < -1);
  assert.ok(race.racers[0].wrongWay > 0.35);
  assert.ok(race.racers[0].progress < START_STRAIGHT_LENGTH * 0.45);
  run(race, 2, gas);
  assert.ok(race.racers[0].speed > 1);
  assert.equal(race.racers[0].wrongWay, 0);
});
test('rocket start rewards a timed press, early throttle misses the boost without stumbling, late throttle has no bonus', () => {
  const timed = createRace(0); timed.countdown = 0.7;
  run(timed, 0.72, gas);
  assert.ok(timed.racers[0].boost > 1);
  assert.ok(timed.events.some(e => e.type === 'launch'));
  const early = createRace(0);
  run(early, 3.1, gas);
  assert.equal(early.racers[0].stumble, 0);
  assert.equal(early.racers[0].boost, 0);
  assert.ok(early.racers[0].speed > 1, 'holding accelerate from the 3 must still launch on green');
  const late = createRace(0); late.countdown = 0.1;
  run(late, 0.12, gas);
  assert.equal(late.racers[0].boost, 0);
  assert.equal(late.racers[0].stumble, 0);
});
test('AI catch-up is light and never changes progress discontinuously', () => {
  const race = ready(); race.boxes = [];
  race.racers.forEach((r, i) => { sit(r, i === 5 ? -100 : 100, r.lane); r.speed = 26; });
  const prior = race.racers.map(r => r.progress);
  updateRace(race, 1 / 60, gas);
  race.racers.forEach((r, i) => assert.ok(r.progress - prior[i] >= 0 && r.progress - prior[i] < 0.7));
  run(race, 1);
  assert.ok(race.racers[5].speed < 35, 'catch-up must not exceed normal racing speeds');
});
test('race events announce laps, final lap, items, hits and finish only when they happen', () => {
  const race = ready(); race.boxes = [];
  const p = race.racers[0]; p.speed = 28;
  for (let lap = 1; lap <= 3; lap++) {
    sit(p, TRACK_LENGTH * lap - 0.1, 0);
    updateRace(race, 1 / 60, gas);
  }
  for (const type of ['lap', 'finalLap', 'finish']) assert.equal(race.events.filter(e => e.type === type).length, 1);
  assert.equal(p.progress, TRACK_LENGTH * 3);
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
test('left input moves the kart to the screen-left of the chase camera and yaws that way', () => {
  for (const startProgress of [0, TRACK_LENGTH * 0.4]) {
    const left = isolated(), rightRace = isolated();
    const cams: Racer[] = [];
    for (const race of [left, rightRace]) {
      const p = race.racers[0];
      sit(p, startProgress, 0); p.speed = 24; p.padCooldown = 10000;
      cams.push({ ...p });
    }
    run(left, 0.25, { ...gas, left: true });
    run(rightRace, 0.25, { ...gas, right: true });
    const leftX = cameraScreenX(left.racers[0], cams[0]);
    const rightX = cameraScreenX(rightRace.racers[0], cams[1]);
    assert.ok(leftX < -0.2, `left should be screen-left at progress ${startProgress}, got ${leftX}`);
    assert.ok(rightX > 0.2, `right should be screen-right at progress ${startProgress}, got ${rightX}`);
    assert.ok(left.racers[0].steering > 0.3, 'left yaw should be positive rotation.y (screen-left)');
    assert.ok(rightRace.racers[0].steering < -0.3, 'right yaw should be negative rotation.y');
    assert.ok(left.racers[0].heading > cams[0].heading);
    assert.ok(rightRace.racers[0].heading < cams[1].heading);
  }
});
test('ArrowUp accelerate starts immediately and holding from the countdown does not stumble', () => {
  assert.ok(KEY_MAP.find(a => a.name === 'accelerate')!.keys.includes('ArrowUp'));
  const held = createRace(0);
  run(held, 3.35, gas);
  assert.equal(held.countdown, 0);
  assert.equal(held.racers[0].stumble, 0);
  assert.equal(held.racers[0].boost, 0);
  assert.ok(held.racers[0].speed > 2, 'must already be moving after the green light');
  const fresh = ready();
  const v0 = fresh.racers[0].speed;
  updateRace(fresh, 1 / 60, gas);
  updateRace(fresh, 1 / 60, gas);
  assert.ok(fresh.racers[0].speed > v0);
});
test('drift hops once, locks direction, accepts countersteering and releases a turbo', () => {
  const race = isolated(), p = race.racers[0]; sit(p, p.progress, 0); p.speed = 24;
  updateRace(race, 1 / 60, { ...gas, left: true, drift: true });
  assert.ok(p.hop > 0); assert.equal(p.driftDirection, 1);
  run(race, 0.35, { ...gas, left: true, drift: true });
  assert.equal(p.hop, 0);
  const heading = p.heading;
  run(race, 0.12, { ...gas, right: true, drift: true });
  assert.equal(p.driftDirection, 1);
  assert.ok(p.heading > heading, 'locked left drift must keep turning left during countersteer');
  assert.ok(p.drifting); assert.ok(p.driftCharge > 0.4);
  run(race, 0.35, { ...gas, right: true, drift: true });
  updateRace(race, 1 / 60, gas);
  assert.equal(p.driftDirection, 0); assert.ok(p.boost > 0);
});
test('steering turn rate is scaled by speed and is weak when almost stopped', () => {
  const stopped = isolated(), slow = isolated(), fast = isolated();
  stopped.racers[0].speed = 0.4; slow.racers[0].speed = 5; fast.racers[0].speed = 35;
  const h0 = [stopped, slow, fast].map(r => r.racers[0].heading);
  for (const race of [stopped, slow, fast]) run(race, 0.2, { ...gas, right: true });
  const d = [stopped, slow, fast].map((r, i) => Math.abs(r.racers[0].heading - h0[i]));
  assert.ok(d[0] < d[1], `stopped ${d[0]} vs slow ${d[1]}`);
  assert.ok(d[1] < d[2] + 1e-6, `slow ${d[1]} vs fast ${d[2]}`);
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
  sit(p, 100, 0); sit(attacker, 90, 0);
  attacker.item = 'bats'; useItem(race, 1);
  const speed = p.speed; p.spin = 0;
  attacker.item = 'bats'; useItem(race, 1);
  assert.equal(p.speed, speed); assert.ok(p.recovery > 0);
  p.shield = 6; attacker.item = 'bats'; useItem(race, 1);
  assert.equal(p.shield, 6, 'protection must not consume a new shield');
  run(race, 3, gas); assert.equal(p.recovery, 0);
});
test('kart contacts separate racers gently without stopping or trapping them', () => {
  const race = ready(); const a = race.racers[0], b = race.racers[1];
  sit(a, 40, 0); sit(b, 40, 0.5); a.speed = 25; b.speed = 20;
  const before = Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(bumpRacers(race, TRACK_LENGTH));
  const after = Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(after > before);
  assert.ok(a.speed > 20 && b.speed > 20);
  const ax = a.x, az = a.z;
  bumpRacers(race, TRACK_LENGTH); assert.equal(a.x, ax); assert.equal(a.z, az);
});
test('slipstream charges only behind an opponent, grants one boost and respects cooldown', () => {
  const race = ready(); const a = race.racers[0], b = race.racers[1];
  race.racers.slice(2).forEach(r => { r.finishTime = 1; });
  sit(a, 100, 0); sit(b, 108, 0); a.speed = b.speed = 25;
  let triggered = false;
  for (let i = 0; i < 70; i++) if (updateDraft(a, [a, b], TRACK_LENGTH, 1 / 60)) triggered = true;
  assert.ok(triggered); assert.ok(a.draftCooldown > 0);
  a.draftCharge = 1.1; assert.equal(updateDraft(a, [a, b], TRACK_LENGTH, 1 / 60), false);
  a.lane = 3; updateDraft(a, [a, b], TRACK_LENGTH, 1 / 60); assert.equal(a.draftActive, false);
});
test('boost pads sit only on the start straight, clear of the grid and the first corner', () => {
  assert.ok(BOOST_PADS.length >= 2 && BOOST_PADS.length <= 3);
  const seen = new Set<number>();
  for (const pad of BOOST_PADS) {
    const progress = pad.t * TRACK_LENGTH;
    assert.ok(progress > 18, `pad at ${progress.toFixed(1)} is too close to the grid or finish line`);
    assert.ok(progress < START_STRAIGHT_LENGTH - 12, `pad at ${progress.toFixed(1)} is off the start straight`);
    assert.ok(Math.abs(pad.lane) < 4, 'pads must stay in the middle of the road');
    seen.add(Math.round(pad.t * 1000));
  }
  assert.equal(seen.size, BOOST_PADS.length, 'pads should be spaced along the straight');
});
test('boost pads trigger at speed on the painted lane, not adjacent lanes or reverse', () => {
  const pad = BOOST_PADS[0], race = isolated(), p = race.racers[0];
  sit(p, pad.t * TRACK_LENGTH - 1.9, pad.lane); p.speed = 26;
  updateRace(race, 1 / 60, gas);
  assert.ok(p.boost > 0); assert.ok(race.events.some(e => e.type === 'pad'));
  const missed = isolated(); sit(missed.racers[0], pad.t * TRACK_LENGTH - 1, 4);
  missed.racers[0].speed = 26; updateRace(missed, 1 / 60, gas);
  assert.equal(missed.racers[0].boost, 0);
});
test('opponent difficulty has only Normal and Berserk, and Berserk is harsher', () => {
  assert.deepEqual(Object.keys(DIFFICULTIES), ['normal', 'berserk']);
  assert.equal(DIFFICULTIES.normal.label, 'Normal');
  assert.equal(DIFFICULTIES.berserk.label, 'Berserk');
  assert.equal(DIFFICULTIES.normal.pace, 0.96);
  assert.ok(DIFFICULTIES.berserk.pace >= 1.025);
  assert.ok(DIFFICULTIES.berserk.pace > DIFFICULTIES.normal.pace);
  assert.ok(DIFFICULTIES.berserk.aggression < 0.72);
  assert.ok(DIFFICULTIES.berserk.aggression < DIFFICULTIES.normal.aggression);
  assert.ok(DIFFICULTIES.berserk.aheadSlack < DIFFICULTIES.normal.aheadSlack);
  assert.ok(DIFFICULTIES.berserk.racingLine > DIFFICULTIES.normal.racingLine);
  const mean: number[] = [];
  for (const difficulty of Object.keys(DIFFICULTIES) as (keyof typeof DIFFICULTIES)[]) {
    const race = createRace(0, difficulty); race.countdown = 0; race.boxes = [];
    runFollow(race, 8);
    mean.push(race.racers.slice(1).reduce((sum, r) => sum + r.progress, 0) / 5);
    runFollow(race, 100);
    assert.ok(race.finished); assert.equal(race.results.length, 6);
  }
  assert.ok(mean[0] < mean[1], JSON.stringify(mean));
});
test('saved difficulty migrates Fácil to Normal and Difícil to Berserk', () => {
  assert.equal(parseDifficulty(null), 'normal');
  assert.equal(parseDifficulty(''), 'normal');
  assert.equal(parseDifficulty('normal'), 'normal');
  assert.equal(parseDifficulty('easy'), 'normal');
  assert.equal(parseDifficulty('facil'), 'normal');
  assert.equal(parseDifficulty('Fácil'), 'normal');
  assert.equal(parseDifficulty('berserk'), 'berserk');
  assert.equal(parseDifficulty('hard'), 'berserk');
  assert.equal(parseDifficulty('dificil'), 'berserk');
  assert.equal(parseDifficulty('Difícil'), 'berserk');
  assert.equal(parseDifficulty('unknown'), 'normal');
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
    race.racers.forEach((r, i) => { sit(r, i * 40, r.lane); r.padCooldown = 10000; });
    runFollow(race, 0.7);
  }
  normal.racers.forEach((r, i) => assert.ok(turbo.racers[i].speed > r.speed * 1.15, CHARACTERS[r.id].name));
});
test('Turbo top speed is 22 percent higher and steering has stronger grip', () => {
  const speeds: number[] = [], lateral: number[] = [], residual: number[] = [];
  for (const motorClass of ['normal', 'turbo'] as const) {
    const race = createRace(0, 'normal', motorClass);
    race.countdown = 0; race.boxes = [];
    race.racers.slice(1).forEach(r => { r.finishTime = 1; });
    const p = race.racers[0]; p.padCooldown = 10000; sit(p, p.progress, 0);
    runFollow(race, 7);
    speeds.push(p.speed);
    const heading = p.heading;
    run(race, 0.2, { ...gas, right: true }); lateral.push(Math.abs(p.heading - heading));
    const steer = Math.abs(p.steering);
    run(race, 0.15, gas); residual.push(Math.abs(p.steering));
    void steer;
  }
  assert.ok(Math.abs(speeds[1] / speeds[0] - 1.22) < 0.001);
  assert.ok(lateral[1] > lateral[0]);
  assert.ok(residual[1] < residual[0]);
  assert.ok(MOTOR_CLASSES.turbo.camera > MOTOR_CLASSES.normal.camera);
});
test('both motor classes finish all three laps at every difficulty without stuck racers', () => {
  for (const motorClass of ['normal', 'turbo'] as const) for (const difficulty of ['normal', 'berserk'] as const) {
    const race = createRace(0, difficulty, motorClass);
    runFollow(race, 110);
    assert.ok(race.finished, `${motorClass}/${difficulty}`);
    assert.equal(race.results.length, 6);
    assert.ok(race.results.every(r => Number.isFinite(r.time) && !r.estimated));
    const times = race.results.map(r => r.time);
    assert.ok(Math.max(...times) - Math.min(...times) < 25, 'AI must stay within a reasonable finishing spread');
  }
});

test('with no steering input the player heading stays unchanged', () => {
  const race = isolated();
  const p = race.racers[0];
  sit(p, 0, 0); p.speed = 20; p.padCooldown = 10000;
  const heading = p.heading;
  const x0 = p.x, z0 = p.z;
  run(race, 0.5, gas);
  assert.equal(p.heading, heading);
  assert.ok(Math.hypot(p.x - x0, p.z - z0) > 5, 'the kart must still roll forward');
});
test('left input turns heading toward the screen-left', () => {
  const race = isolated();
  const p = race.racers[0];
  sit(p, 0, 0); p.speed = 20;
  const heading = p.heading;
  run(race, 0.3, { ...gas, left: true });
  assert.ok(p.heading > heading + 0.08);
  assert.ok(p.steering > 0.3);
});
test('on a curve with no steer input the kart does not follow the rail', () => {
  const race = isolated();
  const p = race.racers[0];
  let curved = 0;
  for (let t = 0; t < 1; t += 0.01) {
    const a = trackPoint(t), b = trackPoint(t + 0.03);
    if (Math.abs(Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle))) > 0.12) {
      curved = t * TRACK_LENGTH; break;
    }
  }
  assert.ok(curved > 0, 'need a curved section');
  sit(p, curved, 0); p.speed = 22; p.padCooldown = 10000;
  const heading = p.heading;
  const start = { x: p.x, z: p.z };
  run(race, 0.6, gas);
  assert.equal(p.heading, heading);
  const traveled = Math.hypot(p.x - start.x, p.z - start.z);
  const rail = kartPosition(curved + traveled, 0);
  const offRail = Math.hypot(p.x - rail.x, p.z - rail.z);
  assert.ok(offRail > 1.2, `should go straight instead of following the curve, offRail=${offRail}`);
});

test('projection at the south hook stays on the local fold when a reference progress is given', () => {
  const hookFrom = TRACK_LENGTH * 0.9;
  const hookTo = TRACK_LENGTH * 0.995;
  for (const lane of [-7.5, -6.6, -4, 0, 4, 6.6, 7.5]) {
    for (let progress = hookFrom; progress <= hookTo; progress += 1.5) {
      const pos = kartPosition(progress, lane);
      const proj = projectOnTrack(pos.x, pos.z, progress);
      const delta = Math.min(Math.abs(proj.progress - progress), TRACK_LENGTH - Math.abs(proj.progress - progress));
      assert.ok(delta < 2.5, `progress jumped ${delta.toFixed(2)} at ${progress.toFixed(1)} lane ${lane}`);
      assert.ok(Math.abs(proj.lane - lane) < 0.75, `lane ${proj.lane.toFixed(2)} wanted ${lane} at ${progress.toFixed(1)}`);
    }
  }
});

test('following the racing line through the south hook does not stall or snap progress', () => {
  const race = isolated();
  const p = race.racers[0];
  sit(p, TRACK_LENGTH * 0.82, 0);
  p.speed = 16;
  p.padCooldown = 10000;
  let stall = 0;
  let maxJump = 0;
  for (let i = 0; i < 60 * 10; i++) {
    const before = p.progress;
    const speed = p.speed;
    const heading = trackPoint(p.progress / TRACK_LENGTH).angle;
    let err = Math.atan2(Math.sin(heading - p.heading), Math.cos(heading - p.heading));
    err -= Math.max(-0.4, Math.min(0.4, p.lane * 0.15));
    const input: Input = {
      accelerate: speed < 16, brake: speed > 18, left: err > 0.04, right: err < -0.04, drift: false, item: false,
    };
    updateRace(race, 1 / 60, input);
    const t = (p.progress / TRACK_LENGTH) % 1;
    const d = p.progress - before;
    if (t > 0.86 && t < 0.995) {
      if (speed > 8 && d < 0.02) stall++;
      if (Math.abs(d) > maxJump) maxJump = Math.abs(d);
    }
    if (p.progress > TRACK_LENGTH + 8) break;
  }
  assert.equal(stall, 0, `progress stalled ${stall} frames in the hook`);
  assert.ok(maxJump < 0.9, `progress snapped by ${maxJump}`);
  assert.ok(p.progress > TRACK_LENGTH, 'should complete the hook and cross the line');
});

test('rail-following attract mode keeps the lead kart on the road', () => {
  const race = ready();
  for (let t = 0; t < 18; t += 1 / 60) updateRace(race, 1 / 60, gas, false);
  const p = race.racers[0];
  assert.ok(p.progress > 200, `demo lead barely moved (${p.progress})`);
  for (const racer of race.racers) {
    assert.ok(Math.abs(racer.lane) < ROAD_EDGE, `racer ${racer.id} left the road at lane ${racer.lane}`);
  }
});

test('reversing across the start line does not replay the lap announcement', () => {
  const race = isolated();
  const p = race.racers[0];
  sit(p, TRACK_LENGTH - 6, 0);
  p.speed = 18;
  p.padCooldown = 10000;
  for (let n = 0; n < 120 && p.progress <= TRACK_LENGTH + 3; n++) updateRace(race, 1 / 60, followTrack(race));
  assert.ok(p.progress > TRACK_LENGTH);
  assert.equal(race.events.filter(e => e.type === 'lap').length, 1);
  const brake: Input = { accelerate: false, brake: true, left: false, right: false, drift: false, item: false };
  let sawWrongWay = false;
  for (let n = 0; n < 8 * 60; n++) {
    updateRace(race, 1 / 60, brake);
    if (p.progress < TRACK_LENGTH && p.wrongWay > 0.35) sawWrongWay = true;
  }
  assert.ok(p.progress < TRACK_LENGTH, `should be able to reverse back over the line, progress=${p.progress}`);
  assert.ok(sawWrongWay, 'reversing over the line should trigger the wrong-way warning');
  sit(p, TRACK_LENGTH - 6, 0);
  p.speed = 18;
  p.wrongWay = 0;
  p.padCooldown = 10000;
  for (let n = 0; n < 120 && p.progress <= TRACK_LENGTH; n++) updateRace(race, 1 / 60, followTrack(race));
  assert.ok(p.progress > TRACK_LENGTH);
  assert.equal(race.events.filter(e => e.type === 'lap').length, 1, 'lap jingle must not fire again');
});

test('a fresh race clears mid-race items, hazards, projectiles and timers', () => {
  const dirty = ready();
  dirty.countdown = 0;
  dirty.time = 42;
  dirty.racers[0].item = 'bats';
  dirty.racers[0].boost = 2;
  dirty.racers[0].speed = 20;
  dirty.hazards.push({ t: 0.4, lane: 0, life: 3, owner: 0 });
  dirty.projectiles.push({ t: 0.5, lane: 1, life: 2, owner: 0 });
  dirty.announcedLap = 2;
  dirty.finished = true;
  const race = createRace(3, 'berserk', 'turbo');
  assert.equal(race.countdown, 3);
  assert.equal(race.time, 0);
  assert.equal(race.finished, false);
  assert.equal(race.hazards.length, 0);
  assert.equal(race.projectiles.length, 0);
  assert.equal(race.announcedLap, 0);
  assert.equal(race.results.length, 0);
  assert.ok(race.racers.every(r => r.speed === 0 && r.boost === 0 && r.item === null && r.finishTime === null));
  assert.equal(race.difficulty, 'berserk');
  assert.equal(race.motorClass, 'turbo');
  assert.equal(race.racers[0].id, 3);
});

test('checkpoint gates ignore a two-sector shortcut past the current gate', () => {
  const race = isolated();
  const p = race.racers[0];
  const sector = TRACK_LENGTH / CHECKPOINTS;
  sit(p, sector * 3 + 1, 0);
  const skipped = kartPosition(sector * 5 + 1, 0);
  p.x = skipped.x;
  p.z = skipped.z;
  const proj = projectOnTrack(p.x, p.z, p.progress);
  authorizeProgress(p, proj.progress);
  assert.ok(p.progress < sector * 4 + 1, `shortcut advanced progress to ${p.progress}, sector ${sector}`);
});

test('the engine uses four gears and upshifts with a pitch drop', () => {
  assert.equal(GEAR_COUNT, 4);
  assert.equal(nextGear(0, 1), 1);
  assert.equal(nextGear(7, 1), 1);
  assert.equal(nextGear(10, 1), 2);
  assert.equal(nextGear(18, 2), 3);
  assert.equal(nextGear(26, 3), 4);
  // Hysteresis: just below the upshift point a higher gear still holds.
  assert.equal(nextGear(8, 2), 2);
  assert.equal(nextGear(6, 2), 1);
  const before = engineTone(16.5, 2);
  const after = engineTone(16.5, 3);
  assert.ok(after.pitch < before.pitch * 0.85, 'an upshift should drop the pitch');
  assert.ok(gearRpm(4, 1) < gearRpm(8, 1), 'rpm rises inside a gear');
  assert.ok(engineTone(20, 3, true).volume > engineTone(20, 3, false).volume);
  assert.ok(engineTone(20, 3, true).cutoff > engineTone(20, 3, false).cutoff);
  assert.ok(engineTone(5, 1).cutoff < engineTone(14, 2).cutoff);
  assert.ok(engineTone(14, 2).cutoff < engineTone(28, 4).cutoff);
});
