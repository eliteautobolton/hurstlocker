const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const ui = {
  round: document.getElementById('round'),
  baseHp: document.getElementById('baseHp'),
  money: document.getElementById('money'),
  kills: document.getElementById('kills'),
  defenders: document.getElementById('defenders'),
  playerGun: document.getElementById('playerGun'),
  defenderGun: document.getElementById('defenderGun'),
  status: document.getElementById('status'),
  startRoundBtn: document.getElementById('startRoundBtn'),
  hireBtn: document.getElementById('hireBtn'),
  playerUziBtn: document.getElementById('playerUziBtn'),
  defenderUziBtn: document.getElementById('defenderUziBtn'),
  repairBtn: document.getElementById('repairBtn'),
  saveBtn: document.getElementById('saveBtn'),
  loadBtn: document.getElementById('loadBtn'),
  cheatInput: document.getElementById('cheatInput'),
  cheatBtn: document.getElementById('cheatBtn'),
  overlay: document.getElementById('overlay'),
  overlayTitle: document.getElementById('overlayTitle'),
  overlayText: document.getElementById('overlayText'),
  restartBtn: document.getElementById('restartBtn'),
  installBanner: document.getElementById('installBanner'),
  installBtn: document.getElementById('installBtn'),
  dismissInstallBtn: document.getElementById('dismissInstallBtn'),
  orientationOverlay: document.getElementById('orientationOverlay')
};

const guns = {
  pistol: { name: 'Pistol', damage: 20, cooldown: 330, defenderCooldown: 1250 },
  uzi: { name: 'Uzi', damage: 16, cooldown: 105, defenderCooldown: 520 }
};

const SAVE_KEY = 'hurstlocker-save-v1';

const state = {
  baseMaxHp: 1000000,
  baseHp: 1000000,
  money: 0,
  round: 1,
  totalKills: 0,
  defenders: 0,
  playerGun: 'pistol',
  defenderGun: 'pistol',
  enemies: [],
  bullets: [],
  roundActive: false,
  enemiesToSpawn: 0,
  spawnTimer: 0,
  lastPlayerShot: 0,
  defenderShotTimers: [],
  defenderTargets: [],
  playerHoldingFire: false,
  pointerDownTime: 0,
  pointerX: 0,
  pointerY: 0,
  pointerTarget: null,
  gameOver: false,
  cheats: { uzi: false },
  status: 'Hold to auto-fire or tap to shoot. Survive round 1.'
};

function money(n) { return '$' + Math.floor(n).toLocaleString(); }
function hp(n) { return Math.max(0, Math.floor(n)).toLocaleString(); }
function rand(min, max) { return Math.random() * (max - min) + min; }

function resizeCanvas() {
  const wrap = document.getElementById('gameWrap');
  const height = Math.max(320, window.innerHeight - 112);
  wrap.style.height = `${height}px`;
  wrap.style.maxHeight = `${height}px`;
  canvas.width = 1200;
  canvas.height = 620;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
}

function getCanvasPoint(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * (canvas.width / rect.width),
    y: (ev.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function getEnemyAtPoint(x, y) {
  return state.enemies.find(e => Math.hypot(e.x - x, e.y - y) < 50) || null;
}

function shootPlayerBullet(x, y, ignoreCooldown = false) {
  const target = getEnemyAtPoint(x, y);
  if (target) {
    shootEnemy(target, 'player', ignoreCooldown);
  }
  state.bullets.push({ x: 100, y: 310, tx: x, ty: y, life: 0.12 });
}

function firePlayerShot(x, y, burst = false) {
  if (state.gameOver) return;
  const gun = guns[state.playerGun];
  if (state.playerGun === 'uzi' && burst) {
    for (let i = 0; i < 3; i++) {
      shootPlayerBullet(x, y, true);
    }
    state.lastPlayerShot = performance.now();
    return;
  }
  const now = performance.now();
  if (now - state.lastPlayerShot < gun.cooldown) return;
  state.lastPlayerShot = now;
  shootPlayerBullet(x, y);
}

function saveGame() {
  try {
    const payload = {
      version: 1,
      baseHp: state.baseHp,
      money: state.money,
      round: state.round,
      totalKills: state.totalKills,
      defenders: state.defenders,
      playerGun: state.playerGun,
      defenderGun: state.defenderGun,
      cheats: state.cheats,
      gameOver: state.gameOver
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    state.status = 'Progress saved to this browser.';
  } catch (error) {
    state.status = 'Could not save progress.';
  }
  refreshUI();
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      state.status = 'No saved game found.';
      refreshUI();
      return;
    }

    const data = JSON.parse(raw);
    if (!data || data.version !== 1) {
      state.status = 'Saved game is from an older format.';
      refreshUI();
      return;
    }

    state.baseHp = Math.max(0, Math.min(state.baseMaxHp, data.baseHp ?? state.baseMaxHp));
    state.money = Math.max(0, data.money ?? 0);
    state.round = Math.max(1, data.round ?? 1);
    state.totalKills = Math.max(0, data.totalKills ?? 0);
    state.defenders = Math.max(0, data.defenders ?? 0);
    state.playerGun = data.playerGun === 'uzi' ? 'uzi' : 'pistol';
    state.defenderGun = data.defenderGun === 'uzi' ? 'uzi' : 'pistol';
    state.cheats = { uzi: Boolean(data.cheats?.uzi) };
    if (state.cheats.uzi) state.playerGun = 'uzi';
    state.enemies = [];
    state.bullets = [];
    state.roundActive = false;
    state.enemiesToSpawn = 0;
    state.spawnTimer = 0;
    state.lastPlayerShot = 0;
    state.defenderShotTimers = Array.from({ length: state.defenders }, () => 0);
    state.defenderTargets = Array.from({ length: state.defenders }, () => null);
    state.pointerTarget = null;
    state.gameOver = Boolean(data.gameOver);
    state.status = data.gameOver ? 'Loaded your last game over state.' : 'Progress loaded from this browser.';

    if (state.gameOver) {
      showOverlay('Hurst Locker Has Fallen', `You reached round ${state.round} with ${state.totalKills} kills.`);
    } else {
      hideOverlay();
    }
  } catch (error) {
    state.status = 'Could not load saved progress.';
  }
  refreshUI();
}

function showOverlay(title, text) {
  ui.overlay.classList.remove('hidden');
  ui.overlayTitle.textContent = title;
  ui.overlayText.textContent = text;
}

function hideOverlay() {
  ui.overlay.classList.add('hidden');
}

function startRound() {
  if (state.roundActive || state.gameOver) return;
  const count = 10 + Math.floor(state.round * 5.5);
  state.enemiesToSpawn = count;
  state.spawnTimer = 0;
  state.roundActive = true;
  state.status = `Round ${state.round} started. ${count} enemies inbound. Kev says this is probably fine.`;
}

function spawnEnemy() {
  const hp = 20 + state.round * 8 + Math.floor(state.round ** 1.35);
  const speed = 28 + state.round * 1.8;
  state.enemies.push({
    x: canvas.width + 30,
    y: rand(170, 525),
    hp,
    maxHp: hp,
    speed,
    radius: 18,
    damage: 120 + state.round * 25,
    alive: true
  });
}

function shootEnemy(enemy, source, ignoreCooldown = false, defenderIndex = 0) {
  const now = performance.now();
  const usedGun = source === 'player' ? guns[state.playerGun] : guns[state.defenderGun];
  if (source === 'player' && !ignoreCooldown && now - state.lastPlayerShot < usedGun.cooldown) return false;
  if (source === 'player') state.lastPlayerShot = now;

  const startX = source === 'player' ? 100 : 135;
  const startY = source === 'player' ? 310 : 160 + (defenderIndex % 7) * 38;

  state.bullets.push({ x: startX, y: startY, tx: enemy.x, ty: enemy.y, life: 0.12 });
  enemy.hp -= usedGun.damage;
  if (enemy.hp <= 0 && enemy.alive) {
    enemy.alive = false;
    state.totalKills++;
    state.money += source === 'player' ? 10 : 1;
    state.status = source === 'player' ? '+$10. Nice shot.' : '+$1. Defender did something useful.';
  }
  return true;
}

function defenderThink(dt) {
  if (state.defenders <= 0 || state.enemies.length === 0) return;

  while (state.defenderShotTimers.length < state.defenders) {
    state.defenderShotTimers.push(0);
    state.defenderTargets.push(null);
  }

  const aliveEnemies = state.enemies.filter(e => e.alive);
  if (aliveEnemies.length === 0) return;

  state.defenderShotTimers.forEach((timer, index) => {
    const cooldown = guns[state.defenderGun].defenderCooldown / Math.max(1, Math.sqrt(state.defenders));
    const nextTimer = timer + dt * 1000;
    state.defenderShotTimers[index] = nextTimer;
    if (nextTimer < cooldown) return;

    let target = state.defenderTargets[index];
    if (!target || !target.alive) {
      target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
      state.defenderTargets[index] = target;
    }

    if (target) {
      state.defenderShotTimers[index] = 0;
      shootEnemy(target, 'defender', false, index);
    }
  });
}

function update(dt) {
  if (state.gameOver) return;

  if (state.roundActive) {
    state.spawnTimer -= dt;
    if (state.enemiesToSpawn > 0 && state.spawnTimer <= 0) {
      spawnEnemy();
      state.enemiesToSpawn--;
      state.spawnTimer = Math.max(0.18, 0.9 - state.round * 0.025);
    }
  }

  for (const e of state.enemies) {
    e.x -= e.speed * dt;
    if (e.x < 110 && e.alive) {
      e.alive = false;
      state.baseHp -= e.damage;
      state.status = `Enemy hit the base for ${Math.floor(e.damage)} damage. Someone blame Dave.`;
      if (state.baseHp <= 0) endGame();
    }
  }

  state.enemies = state.enemies.filter(e => e.alive);
  state.bullets.forEach(b => b.life -= dt);
  state.bullets = state.bullets.filter(b => b.life > 0);

  if (state.playerHoldingFire) {
    const now = performance.now();
    const cooldown = guns[state.playerGun].cooldown;
    if (now - state.lastPlayerShot >= cooldown) {
      firePlayerShot(state.pointerX, state.pointerY);
    }
  }

  defenderThink(dt);

  if (state.roundActive && state.enemiesToSpawn <= 0 && state.enemies.length === 0) {
    state.roundActive = false;
    state.round++;
    state.money += 20;
    state.status = `Round cleared. +$20 survival bonus. Tea break approved.`;
  }

  refreshUI();
}

function drawStickman(x, y, scale = 1, facing = -1) {
  ctx.lineWidth = 4 * scale;
  ctx.strokeStyle = '#f2f2f2';
  ctx.beginPath();
  ctx.arc(x, y - 24 * scale, 10 * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 14 * scale); ctx.lineTo(x, y + 20 * scale);
  ctx.moveTo(x, y); ctx.lineTo(x + facing * 24 * scale, y - 5 * scale);
  ctx.moveTo(x, y + 20 * scale); ctx.lineTo(x - 12 * scale, y + 48 * scale);
  ctx.moveTo(x, y + 20 * scale); ctx.lineTo(x + 12 * scale, y + 48 * scale);
  ctx.stroke();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 6 * scale;
  ctx.beginPath();
  ctx.moveTo(x + facing * 22 * scale, y - 5 * scale);
  ctx.lineTo(x + facing * 45 * scale, y - 7 * scale);
  ctx.stroke();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#2c392d';
  ctx.fillRect(0, 540, canvas.width, 80);
  ctx.fillStyle = '#1d1d1d';
  ctx.fillRect(0, 0, canvas.width, 540);

  // base
  ctx.fillStyle = '#565656';
  ctx.fillRect(20, 185, 115, 355);
  ctx.fillStyle = '#777';
  ctx.fillRect(45, 220, 50, 45);
  ctx.fillRect(45, 300, 50, 45);
  ctx.fillRect(45, 380, 50, 45);
  ctx.fillStyle = '#b6b6b6';
  ctx.fillText('HURST', 45, 165);
  ctx.fillText('LOCKER', 38, 180);

  // player
  drawStickman(105, 505, 0.9, 1);

  // defenders in base
  for (let i = 0; i < state.defenders; i++) {
    const row = i % 7;
    drawStickman(80, 245 + row * 40, 0.45, 1);
  }

  // enemies
  for (const e of state.enemies) {
    drawStickman(e.x, e.y, 0.75, -1);
    ctx.fillStyle = '#111';
    ctx.fillRect(e.x - 25, e.y - 55, 50, 6);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(e.x - 25, e.y - 55, 50 * (e.hp / e.maxHp), 6);
  }

  // bullets
  ctx.strokeStyle = '#f5f5f5';
  ctx.lineWidth = 3;
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.tx, b.ty);
    ctx.stroke();
  }

  requestAnimationFrame(draw);
}

function refreshUI() {
  ui.round.textContent = state.round;
  ui.baseHp.textContent = hp(state.baseHp);
  ui.money.textContent = money(state.money);
  ui.kills.textContent = state.totalKills.toLocaleString();
  ui.defenders.textContent = state.defenders;
  ui.playerGun.textContent = guns[state.playerGun].name;
  ui.defenderGun.textContent = guns[state.defenderGun].name;
  ui.status.textContent = state.status;

  ui.startRoundBtn.disabled = state.roundActive || state.gameOver;
  ui.hireBtn.disabled = state.money < 100 || state.gameOver;
  ui.playerUziBtn.disabled = state.money < 500 || state.totalKills < 200 || state.playerGun === 'uzi' || state.gameOver;
  ui.defenderUziBtn.disabled = state.money < 750 || state.defenders < 1 || state.defenderGun === 'uzi' || state.gameOver;
  ui.repairBtn.disabled = state.money < 250 || state.baseHp >= state.baseMaxHp || state.gameOver;
}

function endGame() {
  state.gameOver = true;
  showOverlay('Hurst Locker Has Fallen', `You reached round ${state.round} with ${state.totalKills} kills. Kev says he had it under control.`);
}

function handlePointerMove(ev) {
  const point = getCanvasPoint(ev);
  state.pointerX = point.x;
  state.pointerY = point.y;
  state.pointerTarget = getEnemyAtPoint(point.x, point.y);
}

function handlePointerDown(ev) {
  if (state.gameOver) return;
  ev.preventDefault();
  const point = getCanvasPoint(ev);
  state.pointerX = point.x;
  state.pointerY = point.y;
  state.pointerDownTime = performance.now();
  state.playerHoldingFire = true;
  firePlayerShot(point.x, point.y);
}

function handlePointerUp(ev) {
  if (state.gameOver) return;
  const point = getCanvasPoint(ev);
  state.pointerX = point.x;
  state.pointerY = point.y;
  const heldLongEnough = performance.now() - state.pointerDownTime > 180;
  if (!heldLongEnough) {
    firePlayerShot(point.x, point.y, state.playerGun === 'uzi');
  }
  state.playerHoldingFire = false;
}

function applyCheatCode() {
  const code = ui.cheatInput.value.trim().toLowerCase();
  if (code === 'uzi') {
    state.cheats.uzi = true;
    state.playerGun = 'uzi';
    state.status = 'Cheat activated: Uzi unlocked.';
  } else {
    state.status = 'Cheat code not recognised.';
  }
  ui.cheatInput.value = '';
  refreshUI();
}

canvas.addEventListener('pointermove', handlePointerMove);
canvas.addEventListener('pointerdown', handlePointerDown);
canvas.addEventListener('pointerup', handlePointerUp);
canvas.addEventListener('pointerleave', handlePointerUp);
canvas.addEventListener('pointercancel', handlePointerUp);

ui.startRoundBtn.addEventListener('click', startRound);
ui.saveBtn.addEventListener('click', saveGame);
ui.loadBtn.addEventListener('click', loadGame);
ui.cheatBtn.addEventListener('click', applyCheatCode);
ui.cheatInput.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    applyCheatCode();
  }
});
window.addEventListener('beforeunload', saveGame);
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', resizeCanvas);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
ui.hireBtn.addEventListener('click', () => {
  if (state.money >= 100) {
    state.money -= 100;
    state.defenders++;
    state.defenderShotTimers.push(0);
    state.defenderTargets.push(null);
    state.status = `Defender hired. Welcome aboard, Dave ${state.defenders}. Try not to lick the ammo.`;
    refreshUI();
  }
});
ui.playerUziBtn.addEventListener('click', () => {
  if (state.money >= 500 && state.totalKills >= 200 && state.playerGun !== 'uzi') {
    state.money -= 500;
    state.playerGun = 'uzi';
    state.status = 'Uzi unlocked. Accuracy sold separately.';
    refreshUI();
  }
});
ui.defenderUziBtn.addEventListener('click', () => {
  if (state.money >= 750 && state.defenders > 0 && state.defenderGun !== 'uzi') {
    state.money -= 750;
    state.defenderGun = 'uzi';
    state.status = 'Defenders upgraded to Uzis. Health and safety said absolutely not.';
    refreshUI();
  }
});
ui.repairBtn.addEventListener('click', () => {
  if (state.money >= 250 && state.baseHp < state.baseMaxHp) {
    state.money -= 250;
    state.baseHp = Math.min(state.baseMaxHp, state.baseHp + 10000);
    state.status = 'Base repaired. Mostly duct tape.';
    refreshUI();
  }
});
ui.restartBtn.addEventListener('click', () => location.reload());

let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  deferredPrompt = ev;
  if (window.matchMedia('(max-width: 900px)').matches) {
    ui.installBanner.classList.remove('hidden');
  }
});

ui.installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) {
    ui.installBanner.classList.add('hidden');
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  ui.installBanner.classList.add('hidden');
});

ui.dismissInstallBtn.addEventListener('click', () => {
  ui.installBanner.classList.add('hidden');
});

function updateOrientationOverlay() {
  if (window.matchMedia('(max-width: 900px)').matches && window.matchMedia('(orientation: portrait)').matches) {
    ui.orientationOverlay.classList.remove('hidden');
  } else {
    ui.orientationOverlay.classList.add('hidden');
  }
}

window.addEventListener('resize', updateOrientationOverlay);
window.addEventListener('orientationchange', updateOrientationOverlay);

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  requestAnimationFrame(loop);
}
const hasSave = (() => {
  try {
    return Boolean(localStorage.getItem(SAVE_KEY));
  } catch {
    return false;
  }
})();

if (hasSave) {
  loadGame();
} else {
  refreshUI();
}

resizeCanvas();
updateOrientationOverlay();
requestAnimationFrame(loop);
requestAnimationFrame(draw);
