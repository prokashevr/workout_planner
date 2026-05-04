'use strict';

const STORAGE_KEY = 'workouts_planner_v1';

const EQUIPMENT_FLAGS = [
    { key: 'mat',       label: 'Yoga mat' },
    { key: 'jumpRope',  label: 'Jump rope' },
    { key: 'wall',      label: 'Wall' },
    { key: 'pullUpBar', label: 'Pull-up bar' },
    { key: 'benchBox',  label: 'Bench / box' },
];

const FOCUS_LABELS = {
    lower: 'Lower',
    upper: 'Upper',
    abs: 'Abs',
    fullBodyPower: 'Power',
    conditioningCardio: 'Cardio',
};

const ALLOWED = {
    dumbbellCount: [0, 1, 2],
    kettlebellCount: [0, 1, 2],
    totalMinutes: [12, 18, 24, 30, 36],
    blockMinutes: [4, 6, 8, 10, 12],
    workSeconds: [30, 35, 40, 45, 50],
    restSeconds: [10, 15, 20, 25, 30],
};

let state = {
    view: 'setup',
    equipment: {
        dumbbellCount: 0,
        kettlebellCount: 0,
        mat: false,
        jumpRope: false,
        wall: false,
        pullUpBar: false,
        benchBox: false,
    },
    settings: {
        totalMinutes: 24,
        blockMinutes: 8,
        workSeconds: 40,
        restSeconds: 20,
    },
    plan: null,
    savedAt: null,
};

// ---------- Persistence ----------

function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            state = { ...state, ...parsed };
            state.equipment = { ...state.equipment, ...(parsed.equipment || {}) };
            state.settings = { ...state.settings, ...(parsed.settings || {}) };
        }
    } catch (_) {}
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
}

// ---------- DOM helpers ----------

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return Array.from(document.querySelectorAll(sel)); }

function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ---------- Equipment filter ----------

function isExerciseAvailable(exercise, equipment) {
    return exercise.requiredEquipment.every(req => {
        if (req === 'weight')  return equipment.dumbbellCount >= 1 || equipment.kettlebellCount >= 1;
        if (req === 'weight2') return equipment.dumbbellCount >= 2 || equipment.kettlebellCount >= 2;
        return Boolean(equipment[req]);
    });
}

// ---------- Validation ----------

function validateSettings(settings) {
    const { totalMinutes, blockMinutes, workSeconds, restSeconds } = settings;
    const sum = workSeconds + restSeconds;
    if (sum !== 60) {
        return { ok: false, error: `Work and rest must sum to 60 seconds (currently ${sum}).` };
    }
    if (blockMinutes % 2 !== 0) {
        return { ok: false, error: 'Block duration must be even (alternates two exercises).' };
    }
    if (totalMinutes % blockMinutes !== 0) {
        return { ok: false, error: 'Total duration must divide evenly by block duration.' };
    }
    for (const k of ['totalMinutes', 'blockMinutes', 'workSeconds', 'restSeconds']) {
        if (!ALLOWED[k].includes(settings[k])) {
            return { ok: false, error: `Invalid ${k}: ${settings[k]}.` };
        }
    }
    return { ok: true };
}

function cycleAllowed(name, delta) {
    const allowed = ALLOWED[name];
    if (!allowed) return null;
    const current = name in state.equipment ? state.equipment[name] : state.settings[name];
    const idx = allowed.indexOf(current);
    if (idx < 0) return allowed[0];
    const next = idx + delta;
    if (next < 0 || next >= allowed.length) return current;
    return allowed[next];
}

// ---------- Generator ----------

function buildAvailabilityError(pools) {
    const need = { lower: 2, upper: 2, abs: 1, bonus: 1 };
    const hints = {
        lower: 'Add a yoga mat, jump rope, or weights.',
        upper: 'Add a dumbbell, kettlebell, or pull-up bar.',
        abs: 'Abs pool is empty (this should not happen — Core ABS has no equipment requirement).',
        bonus: 'Add weights to unlock thrusters, man-makers; bodyweight gives burpees, superman, jumping jacks, high knees.',
    };
    const labels = {
        lower: 'lower-body',
        upper: 'upper-body',
        abs: 'abs',
        bonus: 'power/cardio',
    };
    for (const cat of ['lower', 'upper', 'abs', 'bonus']) {
        if (pools[cat].length < need[cat]) {
            return `Not enough ${labels[cat]} exercises (have ${pools[cat].length}, need ${need[cat]}). ${hints[cat]}`;
        }
    }
    return 'Not enough exercises in the pool — add equipment.';
}

function buildBlockPattern(blockCount, picks) {
    if (blockCount === 2) {
        return [
            ['lower:0', 'upper:0'],
            ['abs:0', 'bonus:0'],
        ];
    }
    if (blockCount === 3) {
        return [
            ['lower:0', 'upper:0'],
            ['lower:1', 'upper:1'],
            ['abs:0', 'bonus:0'],
        ];
    }
    // blockCount > 3: extend by repeating [lower, upper] cyclically, then [abs, bonus].
    const pattern = [];
    let lowerIdx = 0;
    let upperIdx = 0;
    const lowerPairs = blockCount - 1; // last block reserved for abs+bonus
    for (let i = 0; i < lowerPairs; i++) {
        if (lowerIdx >= picks.lower.length || upperIdx >= picks.upper.length) {
            return null;
        }
        pattern.push([`lower:${lowerIdx}`, `upper:${upperIdx}`]);
        lowerIdx++;
        upperIdx++;
    }
    pattern.push(['abs:0', 'bonus:0']);
    return pattern;
}

function resolveSlot(slot, picks) {
    const [cat, idxStr] = slot.split(':');
    const idx = Number(idxStr);
    if (cat === 'abs')   return picks.abs;
    if (cat === 'bonus') return picks.bonus;
    return picks[cat][idx];
}

function makeBlock(index, picks, slots, settings) {
    const exA = resolveSlot(slots[0], picks);
    const exB = resolveSlot(slots[1], picks);
    const minutes = [];
    for (let i = 0; i < settings.blockMinutes; i++) {
        const useA = (i % 2) === 0;
        minutes.push({
            minute: i + 1,
            exercise: useA ? exA : exB,
            slot: useA ? 'A' : 'B',
            workSeconds: settings.workSeconds,
            restSeconds: settings.restSeconds,
        });
    }
    return {
        index,
        title: `Block ${index} · ${settings.blockMinutes} min`,
        durationMinutes: settings.blockMinutes,
        workSeconds: settings.workSeconds,
        restSeconds: settings.restSeconds,
        exercises: [exA, exB],
        minutes,
    };
}

function generatePlan(settings, equipment) {
    const available = EXERCISES.filter(ex => isExerciseAvailable(ex, equipment));
    const lower = shuffle(available.filter(ex => ex.focus === 'lower'));
    const upper = shuffle(available.filter(ex => ex.focus === 'upper'));
    const abs   = shuffle(available.filter(ex => ex.focus === 'abs'));
    const bonus = shuffle(available.filter(ex =>
        ex.focus === 'fullBodyPower' || ex.focus === 'conditioningCardio'));

    const blockCount = settings.totalMinutes / settings.blockMinutes;
    const lowerNeed = blockCount === 2 ? 1 : Math.max(2, blockCount - 1);
    const upperNeed = lowerNeed;

    const pools = { lower, upper, abs, bonus };
    if (lower.length < lowerNeed || upper.length < upperNeed ||
        abs.length < 1 || bonus.length < 1) {
        return { ok: false, error: buildAvailabilityError(pools) };
    }

    const picks = {
        lower: lower.slice(0, lowerNeed),
        upper: upper.slice(0, upperNeed),
        abs: abs[0],
        bonus: bonus[0],
    };

    const pattern = buildBlockPattern(blockCount, picks);
    if (!pattern) {
        return { ok: false, error: 'Need more exercises in the pool — drop block count or add equipment.' };
    }

    const blocks = pattern.map((slots, i) => makeBlock(i + 1, picks, slots, settings));
    return {
        ok: true,
        plan: {
            id: Date.now(),
            totalMinutes: settings.totalMinutes,
            blockMinutes: settings.blockMinutes,
            workSeconds: settings.workSeconds,
            restSeconds: settings.restSeconds,
            blocks,
        },
    };
}

// ---------- Setup view ----------

function renderEquipmentPills() {
    const list = $('#equipmentList');
    list.innerHTML = EQUIPMENT_FLAGS.map(({ key, label }) => {
        const on = state.equipment[key] ? ' is-on' : '';
        return `<button type="button" class="pill${on}" data-equipment="${escapeHtml(key)}">${escapeHtml(label)}</button>`;
    }).join('');
}

function renderSetup() {
    $('#dumbbellCount').value = state.equipment.dumbbellCount;
    $('#kettlebellCount').value = state.equipment.kettlebellCount;
    $('#totalMinutes').value = state.settings.totalMinutes;
    $('#blockMinutes').value = state.settings.blockMinutes;
    $('#workSeconds').value = state.settings.workSeconds;
    $('#restSeconds').value = state.settings.restSeconds;

    $$('#equipmentList .pill').forEach(p => {
        const on = !!state.equipment[p.dataset.equipment];
        p.classList.toggle('is-on', on);
    });

    updateAdvancedSummary();
    updateStepperLimits();
    runValidation();
}

function updateAdvancedSummary() {
    const s = state.settings;
    setText(
        $('#advancedSummary'),
        `Advanced options · ${s.totalMinutes} min · ${s.blockMinutes} min blocks · ${s.workSeconds}/${s.restSeconds}`,
    );
}

function setStepperBtnDisabled(name, disableMinus, disablePlus) {
    const root = document.querySelector(`[data-stepper="${name}"]`);
    if (!root) return;
    root.querySelector('[data-step="-1"]').disabled = disableMinus;
    root.querySelector('[data-step="1"]').disabled = disablePlus;
}

function steppedLimits(name) {
    const allowed = ALLOWED[name];
    const current = name in state.equipment ? state.equipment[name] : state.settings[name];
    const idx = allowed.indexOf(current);
    return {
        atMin: idx <= 0,
        atMax: idx >= allowed.length - 1,
    };
}

function updateStepperLimits() {
    for (const name of Object.keys(ALLOWED)) {
        const { atMin, atMax } = steppedLimits(name);
        setStepperBtnDisabled(name, atMin, atMax);
    }
}

function runValidation() {
    const result = validateSettings(state.settings);
    const banner = $('#setupError');
    if (!result.ok) {
        banner.textContent = result.error;
        banner.hidden = false;
    } else {
        banner.hidden = true;
        banner.textContent = '';
    }
    $('#generateBtn').disabled = !result.ok;
    return result.ok;
}

function adjustStep(name, delta) {
    const next = cycleAllowed(name, delta);
    if (next == null) return;
    if (name in state.equipment) {
        state.equipment[name] = next;
    } else {
        state.settings[name] = next;
    }
    saveState();
    renderSetup();
}

function toggleEquipment(key) {
    state.equipment[key] = !state.equipment[key];
    saveState();
    renderSetup();
}

// ---------- Plan view ----------

function showSetup() {
    state.view = 'setup';
    saveState();
    renderView();
}

function showPlan() {
    state.view = 'plan';
    saveState();
    renderView();
}

function renderView() {
    $('#setupView').hidden = state.view !== 'setup';
    $('#planView').hidden = state.view !== 'plan';
    if (state.view === 'plan') renderPlan();
    if (state.view === 'setup') renderSetup();
}

function renderPlan() {
    const plan = state.plan;
    const list = $('#blockList');
    if (!plan) {
        list.innerHTML = '';
        setText($('#planSummary'), '');
        return;
    }
    setText(
        $('#planSummary'),
        `${plan.totalMinutes} min · ${plan.blocks.length} blocks · ${plan.workSeconds}/${plan.restSeconds}`,
    );
    list.innerHTML = plan.blocks.map(renderBlockCard).join('');
}

function renderBlockCard(block) {
    const [exA, exB] = block.exercises;
    const pairText = `${exA.name} + ${exB.name}`;
    const tags = [exA, exB]
        .map(ex => `<span class="tag tag-${escapeHtml(ex.focus)}">${escapeHtml(FOCUS_LABELS[ex.focus] || ex.focus)}</span>`)
        .join('');

    const reps = block.durationMinutes / 2;
    const cadence = `Alternate each minute · ${reps}× each · ${block.workSeconds}s work / ${block.restSeconds}s rest`;

    return `
        <li class="block-card">
            <div class="block-head">${escapeHtml(block.title)}</div>
            <p class="block-pair">${escapeHtml(pairText)}</p>
            <div class="block-tags">${tags}</div>
            <p class="block-cadence">${escapeHtml(cadence)}</p>
        </li>
    `;
}

function flashSaved() {
    const el = $('#savedFlash');
    el.hidden = false;
    clearTimeout(flashSaved._t);
    flashSaved._t = setTimeout(() => { el.hidden = true; }, 1400);
}

// ---------- Generate / regenerate ----------

function handleGenerate() {
    if (!runValidation()) return;
    const result = generatePlan(state.settings, state.equipment);
    if (!result.ok) {
        const banner = $('#setupError');
        banner.textContent = result.error;
        banner.hidden = false;
        return;
    }
    state.plan = result.plan;
    state.savedAt = null;
    saveState();
    showPlan();
}

function handleRegenerate() {
    const result = generatePlan(state.settings, state.equipment);
    if (!result.ok) {
        showSetup();
        const banner = $('#setupError');
        banner.textContent = result.error;
        banner.hidden = false;
        return;
    }
    state.plan = result.plan;
    state.savedAt = null;
    saveState();
    renderPlan();
}

function handleNewPlan() {
    state.plan = null;
    state.savedAt = null;
    saveState();
    showSetup();
}

function handleSavePlan() {
    state.savedAt = new Date().toISOString();
    saveState();
    flashSaved();
}

// ---------- Event wiring ----------

function bindEvents() {
    document.addEventListener('click', e => {
        const stepBtn = e.target.closest('.step-btn');
        if (stepBtn) {
            const root = stepBtn.closest('[data-stepper]');
            if (!root) return;
            const name = root.dataset.stepper;
            const delta = Number(stepBtn.dataset.step);
            adjustStep(name, delta);
            return;
        }

        const pill = e.target.closest('.pill[data-equipment]');
        if (pill) {
            toggleEquipment(pill.dataset.equipment);
            return;
        }
    });

    $('#setupForm').addEventListener('submit', e => {
        e.preventDefault();
        handleGenerate();
    });

    $('#editSetupBtn').addEventListener('click', showSetup);
    $('#regenerateBtn').addEventListener('click', handleRegenerate);
    $('#newPlanBtn').addEventListener('click', handleNewPlan);
    $('#savePlanBtn').addEventListener('click', handleSavePlan);
}

function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => {
            console.warn('SW registration failed:', err);
        });
    });
}

// ---------- Boot ----------

function boot() {
    loadState();
    renderEquipmentPills();
    bindEvents();
    renderView();
    registerSW();
}

boot();
