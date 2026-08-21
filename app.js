// AquaCraft Application Engine v1.1 - Photo Cards, Dynamic Compatibility & Canvas Hardscape

state = {
  tankVolumeLiters: 60,
  customDims: { l: 60, p: 30, h: 35 },
  selectedSubstrate: "amber_sand",
  selectedRock: "seiryu_stone",
  selectedFish: [], // Array di { fishId, count }
  selectedPlantIds: ["anubias_nana", "java_fern", "vallisneria"],
  activeFilter: 'all',
  searchQuery: ''
};

// Image assets cache for Canvas rendering
const fishImagesCache = {};
let canvas, ctx;
let swimmingFish = [];
let bubbles = [];

document.addEventListener('DOMContentLoaded', () => {
  preloadFishImages();
  initUI();
  initHardscapeSelectors();
  initCanvas();
  renderCatalog();
  renderPlantsList();
  updateAnalysis();
});

function preloadFishImages() {
  FISH_DATABASE.forEach(fish => {
    const img = new Image();
    img.src = fish.photo;
    fishImagesCache[fish.id] = img;
  });
}

function initUI() {
  // Mobile Tab Navigation (< 900px)
  document.querySelectorAll('.mobile-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.mobile-section').forEach(sec => sec.classList.remove('active'));
      
      e.target.classList.add('active');
      const targetSecId = e.target.dataset.tab;
      document.getElementById(targetSecId).classList.add('active');
      
      if (targetSecId === 'sec-aquarium') {
        setTimeout(resizeCanvas, 50);
      }
    });
  });

  // Tank preset selector
  const presetSelect = document.getElementById('tank-preset');
  const customDimsContainer = document.getElementById('custom-dims');
  
  presetSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'custom') {
      customDimsContainer.classList.remove('hidden');
      recalcCustomVolume();
    } else {
      customDimsContainer.classList.add('hidden');
      state.tankVolumeLiters = parseInt(val);
      document.getElementById('calculated-liters').innerText = `${state.tankVolumeLiters} L`;
      updateAnalysis();
    }
  });

  ['dim-l', 'dim-p', 'dim-h'].forEach(id => {
    document.getElementById(id).addEventListener('input', recalcCustomVolume);
  });

  // Search input
  document.getElementById('fish-search').addEventListener('input', (e) => {
    state.searchQuery = e.target.value.toLowerCase();
    renderCatalog();
  });

  // Color Filter Chips (Tutti, Verde, Giallo, Rosso)
  document.querySelectorAll('.filter-chips .chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-chips .chip').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      state.activeFilter = e.target.dataset.filter;
      renderCatalog();
    });
  });

  // Clear tank button
  document.getElementById('btn-clear-tank').addEventListener('click', () => {
    state.selectedFish = [];
    renderSelectedTags();
    updateAnalysis();
    syncCanvasFish();
  });

  // Snapshot photo modal handlers
  document.getElementById('btn-take-snapshot').addEventListener('click', generateAquariumSnapshot);
  document.getElementById('btn-global-snapshot').addEventListener('click', generateAquariumSnapshot);
  document.getElementById('btn-close-modal').addEventListener('click', () => {
    document.getElementById('snapshot-modal').classList.add('hidden');
  });
}

function initHardscapeSelectors() {
  const subSelect = document.getElementById('substrate-select');
  subSelect.innerHTML = SUBSTRATES.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  subSelect.addEventListener('change', (e) => {
    state.selectedSubstrate = e.target.value;
  });

  const rockSelect = document.getElementById('rock-select');
  rockSelect.innerHTML = ROCKS_HARDSCAPE.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  rockSelect.addEventListener('change', (e) => {
    state.selectedRock = e.target.value;
  });
}

function recalcCustomVolume() {
  const l = parseFloat(document.getElementById('dim-l').value) || 0;
  const p = parseFloat(document.getElementById('dim-p').value) || 0;
  const h = parseFloat(document.getElementById('dim-h').value) || 0;
  
  state.customDims = { l, p, h };
  const gross = (l * p * h) / 1000;
  const net = Math.round(gross * 0.88);
  state.tankVolumeLiters = net;

  document.getElementById('calculated-liters').innerText = `${net} L (Lordo ${Math.round(gross)} L)`;
  updateAnalysis();
}

// Evaluate candidate fish against selected fish & tank specs
function getFishCompatibilityStatus(fish) {
  // Check tank volume
  if (state.tankVolumeLiters < fish.minVolume) {
    return 'red'; // Tank too small
  }

  if (state.selectedFish.length === 0) {
    return 'green';
  }

  const selectedMetas = state.selectedFish.map(item => ({
    ...FISH_DATABASE.find(f => f.id === item.fishId),
    count: item.count
  }));

  // Check pH / Temp overlap
  const phMin = Math.max(fish.phMin, ...selectedMetas.map(f => f.phMin));
  const phMax = Math.min(fish.phMax, ...selectedMetas.map(f => f.phMax));
  if (phMin > phMax) return 'red';

  const tempMin = Math.max(fish.tempMin, ...selectedMetas.map(f => f.tempMin));
  const tempMax = Math.min(fish.tempMax, ...selectedMetas.map(f => f.tempMax));
  if (tempMin > tempMax) return 'red';

  // Check Predator conflict
  const isPredator = fish.predatorOfSmallFish;
  const hasSmallFish = selectedMetas.some(s => s.maxSizeCm < 4.0 || s.id === 'red_cherry_shrimp');
  if (isPredator && hasSmallFish) return 'red';

  const hasPredator = selectedMetas.some(p => p.predatorOfSmallFish);
  const isSmall = fish.maxSizeCm < 4.0 || fish.id === 'red_cherry_shrimp';
  if (hasPredator && isSmall) return 'red';

  // Check Betta vs Guppy aggression
  const hasBetta = selectedMetas.some(m => m.id === 'betta_splendens') || fish.id === 'betta_splendens';
  const hasGuppy = selectedMetas.some(m => m.id === 'guppy') || fish.id === 'guppy';
  if (hasBetta && hasGuppy) return 'yellow';

  // Check Shrimp safety
  if (fish.id === 'red_cherry_shrimp' && selectedMetas.some(m => !m.shrimpSafe)) return 'yellow';

  return 'green';
}

function renderCatalog() {
  const container = document.getElementById('fish-catalog');
  container.innerHTML = '';

  const filtered = FISH_DATABASE.filter(fish => {
    const matchesSearch = fish.name.toLowerCase().includes(state.searchQuery) ||
                          fish.scientificName.toLowerCase().includes(state.searchQuery);
    if (!matchesSearch) return false;

    const status = getFishCompatibilityStatus(fish);
    if (state.activeFilter === 'compat-green') return status === 'green';
    if (state.activeFilter === 'compat-yellow') return status === 'yellow';
    if (state.activeFilter === 'compat-red') return status === 'red';
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<p class="empty-msg" style="text-align:center; padding: 1rem;">Nessun pesce per il filtro selezionato.</p>`;
    return;
  }

  filtered.forEach(fish => {
    const status = getFishCompatibilityStatus(fish);
    
    let statusText = '🟢 Compatibile';
    let badgeClass = 'badge-green';
    if (status === 'yellow') { statusText = '🟡 Attenzione'; badgeClass = 'badge-yellow'; }
    if (status === 'red') { statusText = '🔴 Incompatibile'; badgeClass = 'badge-red'; }

    const card = document.createElement('div');
    card.className = `fish-card-item status-${status}`;
    card.innerHTML = `
      <div class="fish-item-left">
        <img class="fish-photo-avatar" src="${fish.photo}" alt="${fish.name}" onerror="this.src='${fish.photo}'">
        <div class="fish-info-text">
          <h4>${fish.name} <span class="status-badge-pill ${badgeClass}">${statusText}</span></h4>
          <p>${fish.scientificName} • Min ${fish.minVolume}L</p>
        </div>
      </div>
      <button class="btn-add-fish" title="Aggiungi pesce" data-id="${fish.id}">+</button>
    `;

    card.querySelector('.btn-add-fish').addEventListener('click', () => {
      addFishToTank(fish.id);
    });

    container.appendChild(card);
  });
}

function addFishToTank(fishId) {
  const existing = state.selectedFish.find(item => item.fishId === fishId);
  const fishMeta = FISH_DATABASE.find(f => f.id === fishId);

  if (existing) {
    existing.count += 1;
  } else {
    const initialCount = fishMeta.minGroup > 1 ? Math.min(fishMeta.minGroup, 6) : 1;
    state.selectedFish.push({ fishId, count: initialCount });
  }

  renderSelectedTags();
  updateAnalysis();
  renderCatalog(); // Re-render catalog color coding!
  syncCanvasFish();
}

function removeFishFromTank(fishId) {
  const existingIndex = state.selectedFish.findIndex(item => item.fishId === fishId);
  if (existingIndex !== -1) {
    if (state.selectedFish[existingIndex].count > 1) {
      state.selectedFish[existingIndex].count -= 1;
    } else {
      state.selectedFish.splice(existingIndex, 1);
    }
  }
  renderSelectedTags();
  updateAnalysis();
  renderCatalog();
  syncCanvasFish();
}

function renderSelectedTags() {
  const container = document.getElementById('selected-fish-list');
  container.innerHTML = '';

  if (state.selectedFish.length === 0) {
    container.innerHTML = `<p class="empty-msg">Nessun pesce selezionato. Clicca su + nel menù per inserire esemplari!</p>`;
    return;
  }

  state.selectedFish.forEach(item => {
    const fish = FISH_DATABASE.find(f => f.id === item.fishId);
    const tag = document.createElement('div');
    tag.className = 'fish-tag';
    tag.innerHTML = `
      <span>${fish.emoji} ${fish.name}</span>
      <span class="tag-count">${item.count}x</span>
      <button class="btn-remove-tag" data-id="${fish.id}">✕</button>
    `;

    tag.querySelector('.btn-remove-tag').addEventListener('click', () => {
      removeFishFromTank(fish.id);
    });

    container.appendChild(tag);
  });
}

function updateAnalysis() {
  const alertsContainer = document.getElementById('compatibility-alerts');
  alertsContainer.innerHTML = '';

  if (state.selectedFish.length === 0) {
    document.getElementById('compat-icon').innerText = '✅';
    document.getElementById('compat-summary-text').innerText = 'Vasca attualmente vuota. Seleziona i pesci desiderati per iniziare.';
    document.getElementById('val-ph').innerText = '6.5 - 7.5';
    document.getElementById('val-temp').innerText = '23°C - 26°C';
    document.getElementById('val-gh').innerText = '6 - 12 °dGH';
    document.getElementById('bioload-bar').style.width = '0%';
    document.getElementById('val-bioload').innerText = '0%';
    return;
  }

  const selectedMetas = state.selectedFish.map(item => ({
    ...FISH_DATABASE.find(f => f.id === item.fishId),
    count: item.count
  }));

  let phMin = Math.max(...selectedMetas.map(f => f.phMin));
  let phMax = Math.min(...selectedMetas.map(f => f.phMax));

  let tempMin = Math.max(...selectedMetas.map(f => f.tempMin));
  let tempMax = Math.min(...selectedMetas.map(f => f.tempMax));

  let ghMin = Math.max(...selectedMetas.map(f => f.ghMin));
  let ghMax = Math.min(...selectedMetas.map(f => f.ghMax));

  const alerts = [];

  if (phMin > phMax) {
    alerts.push({ type: 'danger', icon: '⚠️', text: `Incompatibilità pH: Nessun intervallo di pH comune tra le specie scelte.` });
    document.getElementById('val-ph').innerText = 'Incompatibile';
  } else {
    document.getElementById('val-ph').innerText = `${phMin.toFixed(1)} - ${phMax.toFixed(1)}`;
  }

  if (tempMin > tempMax) {
    alerts.push({ type: 'danger', icon: '🌡️', text: `Incompatibilità Temperatura: Le specie hanno esigenze termiche contrastanti.` });
    document.getElementById('val-temp').innerText = 'Incompatibile';
  } else {
    document.getElementById('val-temp').innerText = `${tempMin}°C - ${tempMax}°C`;
  }

  if (ghMin > ghMax) {
    alerts.push({ type: 'warning', icon: '💧', text: `Incompatibilità Durezza (GH): Esigenze di durezza acqua opposte.` });
    document.getElementById('val-gh').innerText = 'Incompatibile';
  } else {
    document.getElementById('val-gh').innerText = `${ghMin} - ${ghMax} °dGH`;
  }

  selectedMetas.forEach(f => {
    if (state.tankVolumeLiters < f.minVolume) {
      alerts.push({
        type: 'danger',
        icon: '📐',
        text: `Vasca troppo piccola per ${f.name}: richiede almeno ${f.minVolume}L (Attuale: ${state.tankVolumeLiters}L).`
      });
    }
  });

  let totalBioloadPts = 0;
  selectedMetas.forEach(f => { totalBioloadPts += (f.bioloadPts * f.count); });

  const maxCapacityPts = state.tankVolumeLiters * 0.9;
  const bioloadPercent = Math.min(Math.round((totalBioloadPts / maxCapacityPts) * 100), 150);

  const bioloadBar = document.getElementById('bioload-bar');
  bioloadBar.style.width = `${Math.min(bioloadPercent, 100)}%`;
  document.getElementById('val-bioload').innerText = `${bioloadPercent}%`;

  if (bioloadPercent > 100) {
    bioloadBar.style.background = 'var(--accent-rose)';
    alerts.push({ type: 'danger', icon: '💥', text: `Sovrappopolamento (${bioloadPercent}% Bioload). Aumentare il litraggio o ridurre il numero di pesci.` });
  }

  const hasDanger = alerts.some(a => a.type === 'danger');
  if (hasDanger) {
    document.getElementById('compat-icon').innerText = '❌';
    document.getElementById('compat-summary-text').innerText = 'Attenzione: Trovate incompatibilità o problemi di spazio.';
  } else {
    document.getElementById('compat-icon').innerText = '✅';
    document.getElementById('compat-summary-text').innerText = 'Configurazione bilanciata e compatibile!';
  }

  alerts.forEach(a => {
    const item = document.createElement('div');
    item.className = `alert-item alert-${a.type}`;
    item.innerHTML = `<span>${a.icon}</span> <span>${a.text}</span>`;
    alertsContainer.appendChild(item);
  });
}

function renderPlantsList() {
  const recContainer = document.getElementById('recommended-plants');
  const otherContainer = document.getElementById('other-plants');
  
  recContainer.innerHTML = '';
  otherContainer.innerHTML = '';

  PLANT_DATABASE.forEach(p => {
    const isChecked = state.selectedPlantIds.includes(p.id);
    const item = document.createElement('div');
    item.className = 'plant-item';
    item.innerHTML = `
      <div class="plant-left">
        <input type="checkbox" id="plant-${p.id}" ${isChecked ? 'checked' : ''}>
        <label for="plant-${p.id}" style="margin:0; cursor:pointer;">
          <div class="plant-info">
            <h5>${p.icon} ${p.name}</h5>
            <span>${p.type} • ${p.notes}</span>
          </div>
        </label>
      </div>
    `;

    item.querySelector('input').addEventListener('change', (e) => {
      if (e.target.checked) {
        if (!state.selectedPlantIds.includes(p.id)) state.selectedPlantIds.push(p.id);
      } else {
        state.selectedPlantIds = state.selectedPlantIds.filter(id => id !== p.id);
      }
    });

    if (p.recommended) {
      recContainer.appendChild(item);
    } else {
      otherContainer.appendChild(item);
    }
  });
}

// ----------------------------------------------------
// 2D Visual Canvas Engine with Proportional Fish Sizes & Photos
// ----------------------------------------------------
function initCanvas() {
  canvas = document.getElementById('aquarium-canvas');
  ctx = canvas.getContext('2d');
  
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  for (let i = 0; i < 20; i++) {
    bubbles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 3 + 1,
      speed: Math.random() * 0.8 + 0.3
    });
  }

  requestAnimationFrame(animateCanvas);
}

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
}

function syncCanvasFish() {
  swimmingFish = [];

  state.selectedFish.forEach(item => {
    const meta = FISH_DATABASE.find(f => f.id === item.fishId);
    
    for (let i = 0; i < item.count; i++) {
      let targetY;
      if (meta.swimmingZone === 'top') {
        targetY = Math.random() * (canvas.height * 0.3) + 40;
      } else if (meta.swimmingZone === 'bottom') {
        targetY = canvas.height - Math.random() * 30 - 35;
      } else {
        targetY = Math.random() * (canvas.height * 0.45) + (canvas.height * 0.25);
      }

      // Proportional visual scale based on adult size in cm
      // e.g. 2.5cm shrimp = 26px width, 15cm scalare = 110px width
      const drawWidth = Math.max(meta.maxSizeCm * 7.5, 24);
      const drawHeight = drawWidth * 0.6;

      swimmingFish.push({
        id: meta.id,
        name: meta.name,
        photoImg: fishImagesCache[meta.id],
        color: meta.color,
        width: drawWidth,
        height: drawHeight,
        x: Math.random() * (canvas.width - 120) + 60,
        y: targetY,
        vx: (Math.random() - 0.5) * 1.4,
        vy: (Math.random() - 0.5) * 0.3
      });
    }
  });
}

function animateCanvas() {
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 1. Water Background
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#0c2847');
  grad.addColorStop(0.7, '#07182e');
  grad.addColorStop(1, '#05101f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Dynamic Substrate Color (Amber, Black Quartz, Pebble, Soil)
  const subMeta = SUBSTRATES.find(s => s.id === state.selectedSubstrate) || SUBSTRATES[0];
  ctx.fillStyle = subMeta.color;
  ctx.beginPath();
  ctx.moveTo(0, canvas.height - 30);
  ctx.quadraticCurveTo(canvas.width / 2, canvas.height - 40, canvas.width, canvas.height - 25);
  ctx.lineTo(canvas.width, canvas.height);
  ctx.lineTo(0, canvas.height);
  ctx.fill();

  // 3. Draw Hardscape Rocks & Wood
  if (state.selectedRock !== 'none') {
    const rockMeta = ROCKS_HARDSCAPE.find(r => r.id === state.selectedRock);
    ctx.fillStyle = rockMeta ? rockMeta.color : '#718096';
    
    // Draw rock formations
    ctx.beginPath();
    ctx.moveTo(80, canvas.height - 30);
    ctx.lineTo(120, canvas.height - 110);
    ctx.lineTo(160, canvas.height - 30);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(canvas.width - 180, canvas.height - 30);
    ctx.lineTo(canvas.width - 130, canvas.height - 140);
    ctx.lineTo(canvas.width - 80, canvas.height - 30);
    ctx.fill();
  }

  // 4. Draw Selected Plants Silhouettes
  if (state.selectedPlantIds.length > 0) {
    ctx.fillStyle = '#0f382c';
    const plantPositions = [40, 190, canvas.width - 100, canvas.width - 220];
    plantPositions.forEach((px, idx) => {
      ctx.beginPath();
      ctx.moveTo(px, canvas.height - 30);
      ctx.quadraticCurveTo(px - 20, canvas.height - 100, px - 5, canvas.height - 150);
      ctx.quadraticCurveTo(px + 25, canvas.height - 90, px, canvas.height - 30);
      ctx.fill();
    });
  }

  // 5. Bubbles
  ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
  bubbles.forEach(b => {
    b.y -= b.speed;
    b.x += Math.sin(b.y * 0.05) * 0.3;
    if (b.y < 0) {
      b.y = canvas.height;
      b.x = Math.random() * canvas.width;
    }
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
    ctx.fill();
  });

  // 6. Draw Proportional Fish
  swimmingFish.forEach(f => {
    f.x += f.vx;
    f.y += f.vy;

    if (f.x < 30 || f.x > canvas.width - 30) f.vx *= -1;
    if (f.y < 30 || f.y > canvas.height - 40) f.vy *= -1;

    ctx.save();
    ctx.translate(f.x, f.y);
    if (f.vx < 0) ctx.scale(-1, 1);

    if (f.photoImg && f.photoImg.complete && f.photoImg.naturalWidth !== 0) {
      // Draw real fish photo cutout!
      ctx.drawImage(f.photoImg, -f.width / 2, -f.height / 2, f.width, f.height);
    } else {
      // Fallback stylized body
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, f.width / 2, f.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  });

  requestAnimationFrame(animateCanvas);
}

// Generate Real Snapshot Photo of the current Tank setup
function generateAquariumSnapshot() {
  if (!canvas) return;
  
  // Capture current canvas frame as image URL
  const snapshotDataUrl = canvas.toDataURL("image/png");
  
  const imgPreview = document.getElementById('snapshot-img-preview');
  imgPreview.src = snapshotDataUrl;

  const downloadLink = document.getElementById('btn-download-snapshot');
  downloadLink.href = snapshotDataUrl;

  document.getElementById('snapshot-modal').classList.remove('hidden');
}
