import test from 'node:test';
import assert from 'node:assert/strict';
import { KEY_MAP } from '../src/game/controls.ts';
import { BOOST_PADS, bumpRacers, DIFFICULTIES, updateDraft } from '../src/game/arcade.ts';
import { MOTOR_CLASSES } from '../src/game/motors.ts';
import { CHARACTERS, ITEMS, TRACK_LENGTH, WALL_EDGE, ROAD_EDGE, driftTier, createRace, updateRace, useItem, trackPoint, type Input } from '../src/game/engine.ts';

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

test('every character can finish a genuine three-lap race with all six unique racers', () => {
  for (const c of CHARACTERS) {
    const race = createRace(c.id);
    assert.equal(new Set(race.racers.map(r => r.id)).size, 6);
    run(race, 180);
    assert.ok(race.finished, `${c.name} race did not end`);
    assert.equal(race.racers[0].progress, TRACK_LENGTH * 3);
    assert.equal(race.results.length, 6);
    assert.deepEqual(race.results.map(r => r.position), [1, 2, 3, 4, 5, 6]);
    assert.ok(race.results.every(r => Number.isFinite(r.time) && r.time > 0));
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
  run(race, 0.1, { ...gas, brake: true });
  assert.equal(race.racers[0].speed, 0);
});
test('walls keep kart inside fences and steering back always recovers', () => {
  for (const character of CHARACTERS) {
    const race = ready(character.id);
    run(race, 5);
    run(race, 4, { ...gas, left: true });
    assert.ok(race.racers[0].lane >= -WALL_EDGE, `${character.name} crossed a fence: ${race.racers[0].lane}`);
    run(race, 1.5, { ...gas, right: true });
    assert.ok(race.racers[0].lane > -4);
    assert.ok(race.racers[0].speed > 8);
  }
});
test('releasing a charged turn drift grants a short boost', () => {
  const race = ready();
  race.racers[0].speed = 20;
  // Find a curved piece of the circuit.
  for (let t = 0; t < 1; t += 0.01) {
    const a = trackPoint(t), b = trackPoint(t + 0.014);
    if (Math.abs(Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle))) > 0.1) {
      race.racers[0].progress = t * TRACK_LENGTH; break;
    }
  }
  run(race, 0.7, { ...gas, drift: true, left: true });
  assert.ok(race.racers[0].driftCharge > 0.45);
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
      race.racers[0].progress = box.t * TRACK_LENGTH - 1;
      race.racers[0].lane = box.lane;
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
  race.racers[0].progress = 100;
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
  p.progress = 100; p.lane = 0; target.progress = 110; target.lane = 0;
  p.item = 'pumpkin'; useItem(race);
  let hit = false;
  for (let i = 0; i < 120; i++) {
    updateRace(race, 1 / 60, coast);
    if (target.spin > 0) { hit = true; break; }
  }
  assert.ok(hit, 'pumpkin did not hit');
  target.spin = 0;
  target.recovery = 0; // This independent slime assertion is not a second hit during protection.
  p.progress = 200; p.lane = 0; p.item = 'slime'; useItem(race);
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
test('slow frames preserve elapsed race time', () => {
  const race = ready();
  run(race, 2, gas, 0.2);
  assert.ok(race.time >= 1.9, `only ${race.time}s elapsed for 2s of frames`);
});
test('results contain actual finish times for the whole field', () => {
  const race = ready();
  race.racers[0].progress = TRACK_LENGTH * 3 - 0.1;
  race.racers[0].speed = 28;
  updateRace(race, 1 / 60, gas);
  assert.equal(race.finished, false, 'results must wait for the remaining field');
  run(race, 180);
  assert.ok(race.racers.every(r => r.finishTime !== null));
  assert.ok(race.results.every(r => !r.estimated));
});

test('normal steering responds immediately and stops sliding when released', () => {
  const race = ready(); race.boxes = []; race.racers[0].speed = 24;
  const start = race.racers[0].lane;
  run(race, 0.1, { ...gas, right: true });
  assert.ok(race.racers[0].lane > start);
  assert.ok(race.racers[0].lateralSpeed > 3);
  run(race, 0.25);
  assert.ok(Math.abs(race.racers[0].lateralSpeed) < 0.1);
});
test('orange drift turbo is longer and stronger than blue', () => {
  function drift(seconds: number) {
    const race = ready(); race.boxes = [];
    race.racers[0].lane = 0; race.racers[0].speed = 24;
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
  const race = ready(); race.boxes = [];
  const p = race.racers[0]; p.speed = 28; p.lane = WALL_EDGE - 0.01; p.lateralSpeed = 6;
  updateRace(race, 1 / 60, { ...gas, right: true });
  assert.ok(p.lateralSpeed < 0);
  assert.ok(p.speed > 15);
  assert.ok(p.offroad);
  run(race, 1, { ...gas, right: true });
  const offroadSpeed = p.speed;
  assert.ok(offroadSpeed < 20);
  run(race, 1.5, { ...gas, left: true });
  assert.ok(Math.abs(p.lane) < ROAD_EDGE);
  assert.ok(!p.offroad);
  run(race, 2);
  assert.ok(p.speed > offroadSpeed);
});
test('deliberate reverse warns about wrong way and acceleration recovers', () => {
  const race = ready(); race.boxes = [];
  run(race, 2, { ...coast, brake: true });
  assert.ok(race.racers[0].speed < -1);
  assert.ok(race.racers[0].wrongWay > 0.35);
  assert.ok(race.racers[0].progress < 0);
  run(race, 2, gas);
  assert.ok(race.racers[0].speed > 1);
  assert.equal(race.racers[0].wrongWay, 0);
});
test('rocket start rewards a timed press, early throttle stumbles, late throttle has no bonus', () => {
  const timed = createRace(0); timed.countdown = 0.7;
  run(timed, 0.72, gas);
  assert.ok(timed.racers[0].boost > 1);
  assert.ok(timed.events.some(e => e.type === 'launch'));
  const early = createRace(0);
  run(early, 3.1, gas);
  assert.ok(early.racers[0].stumble > 0);
  assert.equal(early.racers[0].boost, 0);
  const late = createRace(0); late.countdown = 0.1;
  run(late, 0.12, gas);
  assert.equal(late.racers[0].boost, 0);
  assert.equal(late.racers[0].stumble, 0);
});
test('AI catch-up is light and never changes progress discontinuously', () => {
  const race = ready(); race.boxes = [];
  race.racers.forEach((r, i) => { r.progress = i === 5 ? -100 : 100; r.speed = 26; });
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
    p.progress = TRACK_LENGTH * lap - 0.1;
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
test('drift hops once, locks direction, accepts countersteering and releases a turbo', () => {
  const race = isolated(), p = race.racers[0]; p.speed = 24; p.lane = 1;
  updateRace(race, 1 / 60, { ...gas, left: true, drift: true });
  assert.ok(p.hop > 0); assert.equal(p.driftDirection, -1);
  run(race, 0.35, { ...gas, left: true, drift: true });
  assert.equal(p.hop, 0);
  const before = p.lane;
  run(race, 0.4, { ...gas, right: true, drift: true });
  assert.equal(p.driftDirection, -1); assert.ok(p.lane < before);
  assert.ok(p.drifting); assert.ok(p.driftCharge > 0.7);
  updateRace(race, 1 / 60, gas);
  assert.equal(p.driftDirection, 0); assert.ok(p.boost > 0);
});
test('low-speed steering is snappier and high-speed steering is more stable', () => {
  const low = isolated(), high = isolated();
  low.racers[0].speed = 5; high.racers[0].speed = 35;
  run(low, 0.2, { ...gas, right: true }); run(high, 0.2, { ...gas, right: true });
  assert.ok(low.racers[0].lateralSpeed > high.racers[0].lateralSpeed);
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
test('kart contacts separate racers gently without stopping or trapping them', () => {
  const race = ready(); const a = race.racers[0], b = race.racers[1];
  a.progress = b.progress = 40; a.lane = 0; b.lane = 0.5; a.speed = 25; b.speed = 20;
  assert.ok(bumpRacers(race, TRACK_LENGTH));
  assert.ok(Math.abs(a.lane - b.lane) >= 1.8);
  assert.ok(a.speed > 20 && b.speed > 20);
  const lane = a.lane;
  bumpRacers(race, TRACK_LENGTH); assert.equal(a.lane, lane);
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
  const pad = BOOST_PADS[0], race = isolated(), p = race.racers[0];
  p.progress = pad.t * TRACK_LENGTH - 1.9; p.lane = pad.lane; p.speed = 26;
  updateRace(race, 1 / 60, gas);
  assert.ok(p.boost > 0); assert.ok(race.events.some(e => e.type === 'pad'));
  const missed = isolated(); missed.racers[0].progress = pad.t * TRACK_LENGTH - 1;
  missed.racers[0].lane = 4; missed.racers[0].speed = 26; updateRace(missed, 1 / 60, gas);
  assert.equal(missed.racers[0].boost, 0);
});
test('difficulty changes real AI pace while preserving three-lap finishes', () => {
  const mean: number[] = [];
  for (const difficulty of Object.keys(DIFFICULTIES) as (keyof typeof DIFFICULTIES)[]) {
    const race = createRace(0, difficulty); race.countdown = 0; race.boxes = [];
    run(race, 8);
    mean.push(race.racers.slice(1).reduce((sum, r) => sum + r.progress, 0) / 5);
    run(race, 100);
    assert.ok(race.finished); assert.equal(race.results.length, 6);
  }
  assert.ok(mean[0] < mean[1] && mean[1] < mean[2], JSON.stringify(mean));
});
test('Space action neither starts a drift nor triggers a rocket launch', () => {
  const race = createRace(0);
  run(race, 3.1, { ...coast, item: true });
  assert.equal(race.racers[0].hop, 0); assert.equal(race.racers[0].drifting, false);
  assert.ok(!race.events.some(e => e.type === 'launch'));
});

test('motor defaults to Normal and remains independent of AI difficulty', () => {
  assert.equal(createRace(0).motorClass, 'normal');
  const race = createRace(0, 'hard', 'turbo');
  assert.equal(race.difficulty, 'hard'); assert.equal(race.motorClass, 'turbo');
});
test('Turbo raises acceleration for every racer, not only the human', () => {
  const normal = createRace(0), turbo = createRace(0, 'normal', 'turbo');
  for (const race of [normal, turbo]) {
    race.countdown = 0; race.boxes = []; race.aiTimers.fill(10000);
    race.racers.forEach((r, i) => { r.progress = i * 40; r.padCooldown = 10000; });
    run(race, 0.7);
  }
  normal.racers.forEach((r, i) => assert.ok(turbo.racers[i].speed > r.speed * 1.15, CHARACTERS[r.id].name));
});
test('Turbo top speed is 22 percent higher and steering has stronger grip', () => {
  const speeds: number[] = [], lateral: number[] = [], residual: number[] = [];
  for (const motorClass of ['normal', 'turbo'] as const) {
    const race = createRace(0, 'normal', motorClass);
    race.countdown = 0; race.boxes = [];
    race.racers.slice(1).forEach(r => { r.finishTime = 1; });
    const p = race.racers[0]; p.padCooldown = 10000; p.lane = 0;
    run(race, 7);
    speeds.push(p.speed);
    run(race, 0.2, { ...gas, right: true }); lateral.push(p.lateralSpeed);
    run(race, 0.15, gas); residual.push(p.lateralSpeed);
  }
  assert.ok(Math.abs(speeds[1] / speeds[0] - 1.22) < 0.001);
  assert.ok(lateral[1] > lateral[0]);
  assert.ok(residual[1] < residual[0]);
  assert.ok(MOTOR_CLASSES.turbo.camera > MOTOR_CLASSES.normal.camera);
});
test('both motor classes finish all three laps at every difficulty without stuck racers', () => {
  for (const motorClass of ['normal', 'turbo'] as const) for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const race = createRace(0, difficulty, motorClass);
    run(race, 110);
    assert.ok(race.finished, `${motorClass}/${difficulty}`);
    assert.equal(race.results.length, 6);
    assert.ok(race.results.every(r => Number.isFinite(r.time) && !r.estimated));
    const times = race.results.map(r => r.time);
    assert.ok(Math.max(...times) - Math.min(...times) < 25, 'AI must stay within a reasonable finishing spread');
  }
});
