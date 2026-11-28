import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const out = new URL('../playtest-output/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const chromiumPath = process.env.CHROMIUM_PATH
  || (existsSync('/repl/tools/bin/chromium') ? '/repl/tools/bin/chromium' : undefined);
const browser = await chromium.launch({
  executablePath: chromiumPath,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
});
const failures = [];
const evidence = [];
async function shot(page, name) {
  await page.screenshot({ path: `${out}${name}.png` });
  evidence.push(name);
}
async function assertMenuFits(page, viewport, surfaceSelector, panelSelector = surfaceSelector) {
  await page.setViewportSize(viewport);
  const fit = await page.locator(surfaceSelector).evaluate((surface, panelSelector) => {
    const panel = surface.querySelector(panelSelector) ?? surface;
    const controls = [...surface.querySelectorAll('button:not([disabled]), select:not([disabled]), input:not([disabled])')]
      .filter(el => el.getClientRects().length > 0);
    return {
      height: window.innerHeight,
      pageHeight: document.documentElement.scrollHeight,
      surfaceHeight: surface.clientHeight,
      surfaceScroll: surface.scrollHeight,
      panelHeight: panel.clientHeight,
      panelScroll: panel.scrollHeight,
      controlsInView: controls.every(el => {
        const r = el.getBoundingClientRect();
        return r.top >= -1 && r.bottom <= window.innerHeight + 1;
      }),
    };
  }, panelSelector);
  expect(fit.pageHeight).toBeLessThanOrEqual(fit.height + 1);
  expect(fit.surfaceScroll).toBeLessThanOrEqual(fit.surfaceHeight + 2);
  expect(fit.panelScroll).toBeLessThanOrEqual(fit.panelHeight + 2);
  expect(fit.controlsInView).toBe(true);
  return fit;
}
async function check(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); }
  catch (e) { failures.push({ name, error: String(e) }); console.error(`FAIL ${name}: ${e}`); }
}
const errors = [];
const context = await browser.newContext({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
const page = await context.newPage();
page.on('pageerror', e => errors.push(String(e)));
const diagnostics = p => p.evaluate(async () => (await import('/src/game/audio.ts')).audio.diagnostics());
if (!process.argv.includes('--mobile-only')) {
await page.goto(process.env.PLAYTEST_URL || 'http://localhost:80/', { waitUntil: 'networkidle' });
await check('Title fits all requested desktop and landscape viewports with keyboard focus', async () => {
  await expect(page.getByTestId('button-play')).toBeFocused();
  await assertMenuFits(page, { width: 1366, height: 768 }, '[data-menu-surface="title"]');
  await assertMenuFits(page, { width: 1280, height: 720 }, '[data-menu-surface="title"]');
  await assertMenuFits(page, { width: 1920, height: 1080 }, '[data-menu-surface="title"]');
  await assertMenuFits(page, { width: 844, height: 390 }, '[data-menu-surface="title"]');
  await page.getByTestId('button-play').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('button-instructions')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('button-close-help')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('button-close-help')).toHaveCount(0);
  await page.setViewportSize({ width: 800, height: 600 });
});
await check('Autoplay protection, audible original music, separate sliders and persistence', async () => {
  expect((await diagnostics(page)).started).toBe(false);
  const music = page.getByTestId('volume-music'), effects = page.getByTestId('volume-effects');
  await music.focus(); await music.press('Home');
  for (let i = 0; i < 30; i++) await music.press('ArrowRight');
  await effects.focus(); await effects.press('Home');
  for (let i = 0; i < 60; i++) await effects.press('ArrowRight');
  await expect(music).toHaveValue('30'); await expect(effects).toHaveValue('60');
  await expect.poll(async () => (await diagnostics(page)).musicNotes, { timeout: 10000 }).toBeGreaterThan(2);
  await expect.poll(async () => (await diagnostics(page)).rms, { timeout: 10000 }).toBeGreaterThan(0.0001);
  expect((await diagnostics(page)).scene).toBe('menu');
  await page.getByTestId('audio-mute').click();
  expect((await diagnostics(page)).settings.muted).toBe(true);
  await page.waitForTimeout(800);
  expect((await diagnostics(page)).rms).toBeLessThan(0.001);
  await page.getByTestId('audio-mute').click();
  await shot(page, 'menu-audio');
  await page.reload({ waitUntil: 'networkidle' });
  expect((await diagnostics(page)).started).toBe(false);
  await expect(music).toHaveValue('30'); await expect(effects).toHaveValue('60');
});
await check('Title and all six character selections', async () => {
  await expect(page.getByTestId('button-play')).toBeVisible();
  await expect(page).toHaveTitle('Haunted Kart');
  await page.getByTestId('button-play').click();
  await assertMenuFits(page, { width: 844, height: 390 }, '[data-menu-surface="select"]', '.select-panel');
  await page.getByTestId('button-character-0').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('text-character-name')).toHaveText('Zumbi');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('text-character-name')).toHaveText('Fantasma');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('button-play')).toBeVisible();
  await page.getByTestId('button-play').click();
  await page.getByTestId('select-difficulty').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('select-difficulty')).toHaveValue('berserk');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('select-difficulty')).toHaveValue('normal');
  for (const [id, name] of ['Fantasma', 'Zumbi', 'Múmia', 'Frankenstein', 'Vampiro', 'Lobisomem'].entries()) {
    await page.getByTestId(`button-character-${id}`).click();
    await expect(page.getByTestId('text-character-name')).toHaveText(name);
    await expect(page.getByText('Velocidade', { exact: true })).toBeVisible();
    await expect(page.getByText('Aceleração', { exact: true })).toBeVisible();
    await expect(page.getByText('Dirigibilidade', { exact: true })).toBeVisible();
    await shot(page, `character-${id}`);
  }
  expect((await diagnostics(page)).signatures.every(n => n >= 1)).toBe(true);
  await page.getByTestId('button-character-0').click();
});
await check('All difficulty options apply to a race and the last choice survives reload', async () => {
  for (const [value, label] of [['normal', 'Normal'], ['berserk', 'Berserk']]) {
    await page.getByTestId('select-difficulty').selectOption(value);
    await page.getByTestId('button-race').click();
    await expect(page.getByTestId('race-hud')).toHaveAttribute('data-difficulty', label);
    await page.keyboard.press('Escape');
    await page.getByTestId('button-quit').click();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('select-difficulty')).toHaveValue(value);
    await page.getByTestId('button-play').click();
  }
  await page.getByTestId('select-difficulty').selectOption('normal');
  await page.getByTestId('button-help').click();
  await expect(page.getByText('Usar o poder após a roleta', { exact: true })).toBeVisible();
  await expect(page.getByText('Shift (ou Z/X)', { exact: true })).toBeVisible();
  await assertMenuFits(page, { width: 844, height: 390 }, '[data-menu-surface="help"]', '.help-panel');
  await page.getByTestId('button-close-help').click();
  // Reloading deliberately reset the audio context; select all monsters again
  // only to collect signature evidence for this new page lifetime.
  for (let i = 0; i < 6; i++) await page.getByTestId(`button-character-${i}`).click();
  await page.getByTestId('button-character-0').click();
});
await check('Complete keyboard race and six-row results', async () => {
  // Control random item selection, not kart progress or race time. Every item
  // must still be collected from a real box and activated with a real Space key.
  await page.evaluate(() => { window.__originalRandom = Math.random; Math.random = () => 0.02; });
  await page.getByTestId('button-race').click();
  await page.waitForFunction(() => {
    const cd = Number(document.querySelector('[data-testid="race-hud"]')?.getAttribute('data-countdown') ?? 3);
    return cd <= 1.05 && cd >= 0.3;
  }, undefined, { timeout: 20000 });
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await diagnostics(page)).eventCounts.launch ?? 0, { timeout: 15000 }).toBeGreaterThan(0);
  console.log('PASS Rocket start with Arrow Up');
  await expect.poll(async () => Number(await page.getByTestId('text-speed').innerText()), { timeout: 45000 }).toBeGreaterThan(30);
  await expect.poll(async () => (await diagnostics(page)).engineGear, { timeout: 15000 }).toBeGreaterThanOrEqual(3);
  const engineNodeCount = (await diagnostics(page)).engineNodes;
  expect(engineNodeCount).toBe(10);
  const topGear = (await diagnostics(page)).engineGear;
  expect((await diagnostics(page)).scene).toBe('race');
  await expect(page.getByTestId('minimap').locator('circle')).toHaveCount(6);
  const hud = page.getByTestId('race-hud');
  const angleDelta = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const directionStart = Number(await hud.getAttribute('data-heading'));
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(300); await page.keyboard.up('ArrowLeft');
  const directionLeft = Number(await hud.getAttribute('data-heading'));
  expect(angleDelta(directionLeft, directionStart)).toBeGreaterThan(0);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight');
  expect(angleDelta(Number(await hud.getAttribute('data-heading')), directionLeft)).toBeLessThan(0);
  console.log('PASS Chromium notebook keyboard: left yaw is screen-left, right yaw is screen-right');
  await shot(page, 'race-keyboard');
  await page.evaluate(() => {
    window.__preventedKeys = [];
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) window.__preventedKeys.push({ code: e.code, prevented: e.defaultPrevented });
    });
  });
  await page.keyboard.press('Space');
  await expect(hud).toHaveAttribute('data-drift-direction', '0');
  const driftHeading = Number(await hud.getAttribute('data-heading'));
  await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ShiftLeft');
  await expect.poll(async () => Number(await hud.getAttribute('data-drift')), { timeout: 20000 }).toBeGreaterThan(0.5);
  await page.keyboard.up('ArrowLeft'); await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await expect(hud).toHaveAttribute('data-drift-direction', '1');
  await page.keyboard.up('ArrowRight'); await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => Number(await hud.getAttribute('data-drift')), { timeout: 20000 }).toBeGreaterThan(1.6);
  await expect(hud).toHaveAttribute('data-drift-tier', '2');
  expect(angleDelta(Number(await hud.getAttribute('data-heading')), driftHeading)).toBeGreaterThan(0);
  await page.keyboard.up('ShiftLeft'); await page.keyboard.up('ArrowLeft');
  await expect(hud).toHaveAttribute('data-boost', 'true', { timeout: 10000 });
  await expect.poll(async () => Number(await page.locator('canvas').getAttribute('data-camera-fov')), { timeout: 10000 }).toBeGreaterThan(61);
  console.log('PASS Shift drift, locked arc, orange turbo, release boost and widened camera');
  for (const key of ['ShiftRight', 'KeyZ', 'KeyX']) {
    await page.keyboard.down('ArrowRight'); await page.keyboard.down(key);
    await expect.poll(async () => Number(await hud.getAttribute('data-drift')), { timeout: 10000, intervals: [50] }).toBeGreaterThan(0.1);
    await page.keyboard.up(key); await page.keyboard.up('ArrowRight');
    await expect(hud).toHaveAttribute('data-drift-direction', '0');
  }
  for (const key of ['ArrowRight', 'KeyA', 'KeyD']) {
    await page.keyboard.down(key); await page.waitForTimeout(450); await page.keyboard.up(key);
  }
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('KeyW');
  await page.keyboard.down('KeyS'); await page.waitForTimeout(600); await page.keyboard.up('KeyS');
  await expect.poll(async () => (await diagnostics(page)).engineGear, { timeout: 5000 }).toBeLessThan(topGear);
  let heldSteer = '';
  const steerManually = async () => {
    const state = await hud.evaluate(el => ({
      heading: Number(el.getAttribute('data-heading')),
      tangent: Number(el.getAttribute('data-track-angle')),
      lane: Number(el.getAttribute('data-lane')),
    }));
    const error = Math.atan2(
      Math.sin(state.tangent - state.heading - state.lane * 0.08),
      Math.cos(state.tangent - state.heading - state.lane * 0.08),
    );
    const next = error > 0.04 ? 'ArrowLeft' : error < -0.04 ? 'ArrowRight' : '';
    if (next !== heldSteer) {
      if (heldSteer) await page.keyboard.up(heldSteer);
      if (next) await page.keyboard.down(next);
      heldSteer = next;
    }
    return state.lane;
  };
  await page.keyboard.down('ArrowUp');
  for (let i = 0; i < 150 && Math.abs(Number(await hud.getAttribute('data-lane'))) > 0.7; i++) {
    await steerManually();
    await page.waitForTimeout(100);
  }
  if (heldSteer) { await page.keyboard.up(heldSteer); heldSteer = ''; }
  await page.keyboard.up('KeyW'); await page.keyboard.down('ArrowUp');
  let usedItems = 0;
  let rouletteSeen = false;
  const used = new Set();
  const laps = new Set();
  let lastLap = '';
  const start = Date.now();
  while (!(await page.getByTestId('button-race-again').isVisible()) && Date.now() - start < 360000) {
    const lap = await page.getByTestId('text-lap').innerText().catch(() => '');
    laps.add(lap);
    if (lap && lap !== lastLap) {
      console.log('Lap', lap, 'timer', await page.getByTestId('text-timer').innerText());
      lastLap = lap; await shot(page, `race-lap-${lap[0]}`);
    }
    const item = await hud.getAttribute('data-item').catch(() => '');
    rouletteSeen ||= await hud.getAttribute('data-roulette').catch(() => '') === 'true';
    if (item && await hud.getAttribute('data-item-ready') === 'true') {
      await page.keyboard.press('Space');
      await expect(hud).toHaveAttribute('data-item', '');
      usedItems++; used.add(item);
      console.log('Used item', item);
      const next = ['bats', 'pumpkin', 'ghost', 'bones', 'slime'].findIndex(i => !used.has(i));
      await page.evaluate(index => { Math.random = () => (Math.max(0, index) + 0.1) / 5; }, next);
    }
    await steerManually();
    await page.waitForTimeout(100);
  }
  if (heldSteer) await page.keyboard.up(heldSteer);
  await page.keyboard.up('ArrowUp');
  await expect(page.getByTestId('button-race-again')).toBeVisible();
  await expect(page.locator('[data-testid^="row-result-"]')).toHaveCount(6);
  await expect(page.getByText('Tempo estimado')).toHaveCount(0);
  await assertMenuFits(page, { width: 844, height: 390 }, '[data-menu-surface="results"]', '.results-panel');
  await page.setViewportSize({ width: 800, height: 600 });
  const sound = await diagnostics(page);
  for (const name of ['pickup', 'lap', 'finalLap', 'finish', 'boost', 'launch', 'hop', 'pad']) expect(sound.eventCounts[name]).toBeGreaterThan(0);
  expect(sound.signatures.every(n => n >= 1)).toBe(true);
  expect(sound.engineAudible).toBe(false);
  expect(sound.engineNodes).toBe(engineNodeCount);
  console.log('Audio and render evidence', JSON.stringify({ ...sound,
    render: await page.locator('canvas').evaluate(c => ({ ...c.dataset })) }));
  console.log('Race evidence', JSON.stringify({ laps: [...laps], usedItems, used: [...used], elapsed: Date.now() - start }));
  expect([...used].sort()).toEqual(['bats', 'pumpkin', 'ghost', 'bones', 'slime'].sort());
  expect(rouletteSeen).toBe(true);
  expect(await page.evaluate(() => window.__preventedKeys.every(k => k.prevented))).toBe(true);
  await shot(page, 'results');
  await page.getByTestId('button-race-again').click();
  await expect(page.getByTestId('text-lap')).toHaveText('1/3');
  expect((await diagnostics(page)).engineNodes).toBe(engineNodeCount);
  expect((await diagnostics(page)).engineAudible).toBe(false);
  // Focus loss must pause and release held keys, not leave a kart steering forever.
  await page.keyboard.down('ArrowUp');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByTestId('button-resume')).toBeVisible();
  await assertMenuFits(page, { width: 844, height: 390 }, '[data-menu-surface="pause"]', '.pause-panel');
  expect((await diagnostics(page)).engineAudible).toBe(false);
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(200); // Allow the 100 ms HUD snapshot to catch the frozen simulation.
  const pausedTime = await page.getByTestId('text-timer').innerText();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('text-timer')).toHaveText(pausedTime);
  await page.getByTestId('button-resume').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('button-restart')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByTestId('button-resume')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByTestId('button-pause').click();
  await expect(page.getByTestId('volume-music')).toHaveValue('30');
  await expect(page.getByTestId('volume-effects')).toHaveValue('60');
  await page.getByTestId('button-quit').click();
  await page.getByTestId('button-play').click();
  await expect(page.getByTestId('text-character-name')).toBeVisible();
  await page.evaluate(() => { Math.random = window.__originalRandom; });
});
}

await context.close();
if (!process.argv.includes('--desktop-only')) {
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
const mobile = await mobileContext.newPage();
mobile.on('pageerror', e => errors.push(String(e)));
await check('Touch controls on a phone viewport', async () => {
  await mobile.goto('http://localhost:80/', { waitUntil: 'networkidle' });
  await mobile.getByTestId('button-play').tap();
  await mobile.getByTestId('button-character-5').tap();
  await expect(mobile.getByTestId('text-character-name')).toHaveText('Lobisomem');
  await shot(mobile, 'mobile-selection');
  await mobile.getByTestId('button-race').tap();
  for (const key of ['accelerate', 'brake', 'left', 'right', 'drift', 'item']) {
    await expect(mobile.getByTestId(`touch-${key}`)).toBeVisible();
  }
  // CDP emits real multi-touch events; each point stays held until touchEnd.
  const cdp = await mobileContext.newCDPSession(mobile);
  const center = async key => {
    const b = await mobile.getByTestId(`touch-${key}`).boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  const gas = await center('accelerate');
  const left = await center('left');
  const right = await center('right');
  const drift = await center('drift');
  const brake = await center('brake');
  const touch = points => cdp.send('Input.dispatchTouchEvent', { type: points.length ? 'touchStart' : 'touchEnd', touchPoints: points.map((p, id) => ({ ...p, id, radiusX: 4, radiusY: 4 })) });
  await touch([gas]);
  await expect.poll(async () => Number(await mobile.getByTestId('text-speed').innerText()), { timeout: 45000 }).toBeGreaterThan(25);
  const mhud = mobile.getByTestId('race-hud');
  const lane = Number(await mhud.getAttribute('data-lane'));
  await touch([gas, left, drift]);
  await expect.poll(async () => Number(await mhud.getAttribute('data-drift')), { timeout: 20000 }).toBeGreaterThan(0.7);
  expect(Number(await mhud.getAttribute('data-lane'))).toBeGreaterThan(lane);
  await touch([]);
  await expect(mhud).toHaveAttribute('data-boost', 'true', { timeout: 10000 });
  const leftLane = Number(await mhud.getAttribute('data-lane'));
  await touch([gas, right]); await mobile.waitForTimeout(1200); await touch([]);
  expect(Number(await mhud.getAttribute('data-lane'))).toBeLessThan(leftLane);
  await shot(mobile, 'mobile-race');
  await expect(mobile.getByTestId('text-speed')).toBeInViewport({ ratio: 1 });
  await touch([gas]);
  await expect(mhud).toHaveAttribute('data-item-ready', 'true', { timeout: 25000 });
  await touch([]);
  await mobile.getByTestId('touch-item').tap();
  await expect(mhud).toHaveAttribute('data-item', '');
  console.log('PASS Dedicated touch power button responds to a short tap');
  const before = Number(await mobile.getByTestId('text-speed').innerText());
  await touch([brake]); await mobile.waitForTimeout(1800); await touch([]);
  const after = Number(await mobile.getByTestId('text-speed').innerText());
  expect(after).toBeLessThan(before);
  console.log('Touch brake', { before, after });
  if (process.argv.includes('--handling')) {
    await touch([brake]);
    await expect(mobile.getByTestId('warning-wrong-way')).toBeVisible({ timeout: 20000 });
    await shot(mobile, 'mobile-wrong-way');
    await touch([]); await touch([gas]);
    await expect(mobile.getByTestId('warning-wrong-way')).toBeHidden({ timeout: 20000 });
    await expect.poll(async () => Number(await mobile.getByTestId('text-speed').innerText()), { timeout: 20000 }).toBeGreaterThan(40);
    await touch([gas, right]);
    await expect(mhud).toHaveAttribute('data-offroad', 'true', { timeout: 20000 });
    await expect.poll(async () => (await diagnostics(mobile)).eventCounts.wall ?? 0, { timeout: 20000 }).toBeGreaterThan(0);
    expect(Math.abs(Number(await mhud.getAttribute('data-lane')))).toBeLessThanOrEqual(6.15);
    expect(Number(await mobile.getByTestId('text-speed').innerText())).toBeGreaterThan(0);
    await shot(mobile, 'mobile-offroad');
    await touch([]); await touch([gas, left]);
    await expect.poll(async () => Math.abs(Number(await mhud.getAttribute('data-lane'))), { timeout: 20000 }).toBeLessThan(2);
    await touch([]); await touch([gas]);
    await expect(mhud).toHaveAttribute('data-offroad', 'false');
    await expect.poll(async () => Number(await mobile.getByTestId('text-speed').innerText()), { timeout: 20000 }).toBeGreaterThan(65);
    await touch([]);
    console.log('PASS Touch reverse, wrong-way warning, wall bounce and offroad recovery');
  }
  await mobile.getByTestId('button-help').tap();
  await mobile.waitForTimeout(200);
  const helpTime = await mobile.getByTestId('text-timer').innerText();
  await mobile.waitForTimeout(1200);
  await expect(mobile.getByTestId('text-timer')).toHaveText(helpTime);
  await mobile.getByTestId('button-close-help').tap();
  await mobile.getByTestId('button-pause').tap();
  if (process.argv.includes('--handling')) {
    await mobile.getByTestId('volume-music').focus();
    await mobile.getByTestId('volume-music').press('Home');
    await mobile.getByTestId('volume-effects').focus();
    await mobile.getByTestId('volume-effects').press('End');
    await expect(mobile.getByTestId('volume-music')).toHaveValue('0');
    await expect(mobile.getByTestId('volume-effects')).toHaveValue('100');
    const sound = await diagnostics(mobile);
    expect(sound.settings.music).toBe(0); expect(sound.settings.effects).toBe(1);
    await shot(mobile, 'mobile-pause-audio');
    console.log('PASS Independent volume changes in pause');
  }
  await mobile.getByTestId('button-quit').tap();
  await mobile.setViewportSize({ width: 844, height: 390 });
  await mobile.getByTestId('button-play').tap();
  await mobile.getByTestId('button-race').scrollIntoViewIfNeeded();
  await expect(mobile.getByTestId('button-race')).toBeInViewport();
  await shot(mobile, 'mobile-landscape-selection');
});
}
await check('No browser crashes', async () => expect(errors).toEqual([]));
await writeFile(`${out}${process.argv.includes('--mobile-only') ? 'report-mobile' : process.argv.includes('--desktop-only') ? 'report-desktop' : 'report'}.json`, JSON.stringify({ failures, errors, evidence }, null, 2));
await browser.close();
if (failures.length) process.exitCode = 1;
