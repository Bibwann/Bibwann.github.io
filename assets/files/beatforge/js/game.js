// =============================================
//  BEATFORGE — Game Engine v2
// =============================================

const LANE_COLORS = ['#ff2d7b', '#00f0ff', '#39ff14', '#ff8c00'];
const LANE_KEYS = ['d', 'f', 'j', 'k'];

// Timing windows (seconds)
const TIMING = {
    perfect: 0.045,
    great: 0.090,
    good: 0.135,
    miss: 0.180
};

// Score values
const SCORE_VALUES = { perfect: 300, great: 200, good: 100, miss: 0 };

// Health changes
const HEALTH_DELTA = { perfect: 3, great: 2, good: 0, miss: -12 };

// Combo milestones
const MILESTONES = new Set([25, 50, 100, 150, 200, 300, 500]);

class Game {
    constructor() {
        this.state = 'idle'; // idle | countdown | playing | paused | ended
        this.level = null;
        this.levelIndex = -1;

        // Note tracking
        this.allNotes = [];
        this.activeNotes = [];
        this.nextNoteIdx = 0;

        // Scoring
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.health = 100;
        this.judgments = { perfect: 0, great: 0, good: 0, miss: 0 };
        this.fullCombo = true;

        // Timing
        this.songStartTime = 0;
        this.scrollTime = 2.0;
        this.offset = 0; // calibration offset in seconds

        // Beat tracking
        this.lastBeat = -1;

        // DOM refs
        this.gameArea = null;
        this.hitLine = null;
        this.lanes = [null, null, null, null];
        this.receptors = [null, null, null, null];
        this.scoreEl = null;
        this.comboEl = null;
        this.comboDisplay = null;
        this.healthEl = null;
        this.accuracyEl = null;
        this.judgmentEl = null;
        this.progressEl = null;
        this.songNameEl = null;
        this.multEl = null;
        this.milestoneEl = null;
        this.particleSystem = null;

        // Key state
        this.keysDown = {};

        // Animation
        this.rafId = null;
        this.lastTime = 0;
        this.judgmentTimer = null;
        this.milestoneTimer = null;

        // Settings
        this.effectsEnabled = true;
    }

    init() {
        this.gameArea = document.getElementById('game-area');
        this.hitLine = document.getElementById('hit-line');
        for (let i = 0; i < 4; i++) {
            this.lanes[i] = document.querySelector(`.lane[data-lane="${i}"]`);
            this.receptors[i] = document.getElementById(`receptor-${i}`);
        }
        this.scoreEl = document.getElementById('score-value');
        this.comboEl = document.getElementById('combo-value');
        this.comboDisplay = document.getElementById('combo-display');
        this.healthEl = document.getElementById('health-fill');
        this.accuracyEl = document.getElementById('accuracy-value');
        this.judgmentEl = document.getElementById('judgment-display');
        this.progressEl = document.getElementById('progress-fill');
        this.songNameEl = document.getElementById('hud-song-name');
        this.multEl = document.getElementById('multiplier-value');
        this.milestoneEl = document.getElementById('milestone-display');

        // Particle system
        const canvas = document.getElementById('particle-canvas');
        this.particleSystem = new ParticleSystem(canvas);

        const resizeCanvas = () => {
            canvas.width = canvas.offsetWidth || window.innerWidth;
            canvas.height = canvas.offsetHeight || window.innerHeight;
        };
        window.addEventListener('resize', resizeCanvas);
        this._resizeCanvas = resizeCanvas;

        // Input
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
    }

    // ── Start Level ───────────────────────────────
    startLevel(levelIndex) {
        this.levelIndex = levelIndex;
        this.level = LEVELS[levelIndex];

        // Reset state
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.health = 100;
        this.judgments = { perfect: 0, great: 0, good: 0, miss: 0 };
        this.fullCombo = true;
        this.nextNoteIdx = 0;
        this.activeNotes = [];
        this.keysDown = {};
        this.lastBeat = -1;

        // Deep copy notes
        this.allNotes = this.level.notes.map(n => ({
            t: n.t,
            l: n.l,
            judged: false,
            el: null,
            spawned: false
        }));

        // Update scroll time from settings
        const speedSetting = parseInt(document.getElementById('note-speed').value) || 5;
        this.scrollTime = 3.5 - (speedSetting * 0.25);

        // Update offset from settings
        const offsetMs = parseInt(document.getElementById('note-offset')?.value || 0);
        this.offset = offsetMs / 1000;

        // Clear game area notes
        this.clearNotes();

        // Update HUD
        this.songNameEl.textContent = this.level.name;
        this.updateHUD();
        if (this.multEl) { this.multEl.textContent = '×1'; this.multEl.className = 'multiplier-value'; }
        if (this.milestoneEl) this.milestoneEl.innerHTML = '';

        // Resize particle canvas
        if (this._resizeCanvas) setTimeout(() => this._resizeCanvas(), 50);

        // Apply level colors
        const gameBg = document.getElementById('game-bg');
        gameBg.style.background = `radial-gradient(ellipse at 50% 100%, ${this.level.colors.accent}15 0%, transparent 60%)`;

        // Countdown then start
        this.doCountdown();
    }

    doCountdown() {
        this.state = 'countdown';
        const overlay = document.getElementById('countdown-overlay');
        const numberEl = document.getElementById('countdown-number');
        overlay.classList.add('visible');

        let count = 3;
        numberEl.textContent = count;
        audio.playCountdown();

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                numberEl.textContent = count;
                audio.playCountdown();
            } else if (count === 0) {
                numberEl.textContent = 'GO!';
                numberEl.style.color = 'var(--green)';
                audio.playCountdownGo();
            } else {
                clearInterval(interval);
                overlay.classList.remove('visible');
                numberEl.style.color = '';
                this.beginPlaying();
            }
        }, 800);
    }

    beginPlaying() {
        this.state = 'playing';
        this.songStartTime = audio.currentTime + 0.1;

        // Schedule music
        audio.scheduleLevel(this.level, this.songStartTime);

        // Start game loop
        this.lastTime = performance.now();
        this.gameLoop();
    }

    // ── Game Loop ─────────────────────────────────
    gameLoop() {
        if (this.state !== 'playing') return;

        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        const currentTime = audio.currentTime - this.songStartTime;

        this.spawnNotes(currentTime);
        this.updateNotes(currentTime);
        this.checkMissedNotes(currentTime);
        this.updateProgress(currentTime);
        this.checkBeatPulse(currentTime);

        // Particles
        if (this.effectsEnabled) {
            this.particleSystem.update(dt);
            this.particleSystem.render();
        }

        // Check if song is over
        if (currentTime >= this.level.duration + 1) {
            this.endSong(true);
            return;
        }

        // Check health
        if (this.health <= 0) {
            this.endSong(false);
            return;
        }

        this.rafId = requestAnimationFrame(() => this.gameLoop());
    }

    // ── Beat Pulse ────────────────────────────────
    checkBeatPulse(currentTime) {
        if (!this.hitLine) return;
        const beat = 60 / this.level.bpm;
        const currentBeat = Math.floor(currentTime / beat);
        if (currentBeat !== this.lastBeat && currentTime >= 0) {
            this.lastBeat = currentBeat;
            this.hitLine.classList.remove('beat-pulse');
            void this.hitLine.offsetWidth; // force reflow
            this.hitLine.classList.add('beat-pulse');
            setTimeout(() => this.hitLine && this.hitLine.classList.remove('beat-pulse'), 200);
        }
    }

    // ── Note Spawning ─────────────────────────────
    spawnNotes(currentTime) {
        while (this.nextNoteIdx < this.allNotes.length) {
            const note = this.allNotes[this.nextNoteIdx];
            const timeLeft = note.t - currentTime;
            if (timeLeft > this.scrollTime + 0.1) break;
            this.spawnNoteElement(note);
            this.nextNoteIdx++;
        }
    }

    spawnNoteElement(note) {
        const el = document.createElement('div');
        el.className = `note lane-${note.l}`;
        note.el = el;
        note.spawned = true;
        this.lanes[note.l].appendChild(el);
        this.activeNotes.push(note);
    }

    // ── Note Movement ─────────────────────────────
    updateNotes(currentTime) {
        const gameAreaHeight = this.gameArea.offsetHeight;
        const hitLineY = gameAreaHeight - 122;

        for (const note of this.activeNotes) {
            if (note.judged) continue;

            const timeUntilHit = note.t - currentTime;
            const progress = 1 - (timeUntilHit / this.scrollTime);
            const y = progress * hitLineY;

            if (note.el) {
                note.el.style.top = `${y}px`;

                // Approaching glow effect
                if (timeUntilHit < 0.28 && timeUntilHit > -0.1) {
                    note.el.classList.add('approaching');
                } else {
                    note.el.classList.remove('approaching');
                }
            }
        }
    }

    checkMissedNotes(currentTime) {
        const effectiveTime = currentTime + this.offset;
        for (const note of this.activeNotes) {
            if (note.judged) continue;
            const diff = effectiveTime - note.t;
            if (diff > TIMING.miss) {
                this.judgeNote(note, 'miss');
            }
        }
    }

    updateProgress(currentTime) {
        const pct = Math.min(100, Math.max(0, (currentTime / this.level.duration) * 100));
        this.progressEl.style.width = `${pct}%`;
    }

    // ── Note Removal ──────────────────────────────
    removeNote(note, animate = true) {
        if (note.el && note.el.parentNode) {
            if (animate) {
                setTimeout(() => {
                    if (note.el && note.el.parentNode) note.el.parentNode.removeChild(note.el);
                }, 400);
            } else {
                note.el.parentNode.removeChild(note.el);
            }
        }
        const idx = this.activeNotes.indexOf(note);
        if (idx !== -1) this.activeNotes.splice(idx, 1);
    }

    clearNotes() {
        for (const note of this.activeNotes) {
            if (note.el && note.el.parentNode) note.el.parentNode.removeChild(note.el);
        }
        this.activeNotes = [];
        document.querySelectorAll('.note').forEach(el => el.remove());
    }

    // ── Input Handling ────────────────────────────
    onKeyDown(e) {
        const key = e.key.toLowerCase();

        if (key === 'escape') {
            if (this.state === 'playing') this.pause();
            else if (this.state === 'paused') this.resume();
            return;
        }

        if (this.state !== 'playing') return;
        if (this.keysDown[key]) return;
        this.keysDown[key] = true;

        const laneIndex = LANE_KEYS.indexOf(key);
        if (laneIndex === -1) return;

        this.receptors[laneIndex].classList.add('active');
        this.lanes[laneIndex].classList.add('active');

        this.tryHitNote(laneIndex);
    }

    onKeyUp(e) {
        const key = e.key.toLowerCase();
        this.keysDown[key] = false;
        const laneIndex = LANE_KEYS.indexOf(key);
        if (laneIndex === -1) return;
        this.receptors[laneIndex].classList.remove('active');
        this.lanes[laneIndex].classList.remove('active');
    }

    tryHitNote(laneIndex) {
        const currentTime = audio.currentTime - this.songStartTime + this.offset;

        let closest = null;
        let closestDiff = Infinity;

        for (const note of this.activeNotes) {
            if (note.l !== laneIndex || note.judged) continue;
            const diff = Math.abs(note.t - currentTime);
            if (diff < closestDiff) {
                closestDiff = diff;
                closest = note;
            }
        }

        if (!closest || closestDiff > TIMING.miss) return;

        let judgment;
        if (closestDiff <= TIMING.perfect) judgment = 'perfect';
        else if (closestDiff <= TIMING.great) judgment = 'great';
        else if (closestDiff <= TIMING.good) judgment = 'good';
        else judgment = 'miss';

        this.judgeNote(closest, judgment);
    }

    // ── Judgment ──────────────────────────────────
    judgeNote(note, judgment) {
        note.judged = true;
        this.judgments[judgment]++;

        // Score with multiplier
        const multiplier = Math.min(Math.floor(this.combo / 10) + 1, 8);
        this.score += SCORE_VALUES[judgment] * multiplier;

        // Combo
        if (judgment === 'miss') {
            this.combo = 0;
            this.fullCombo = false;
        } else {
            this.combo++;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;

            // Milestone check
            if (MILESTONES.has(this.combo)) {
                this.showMilestone(`${this.combo} COMBO!`);
                if (audio.initialized) audio.playMilestone();
            }
        }

        // Health
        this.health = Math.max(0, Math.min(100, this.health + HEALTH_DELTA[judgment]));

        // Visual effects
        this.showJudgment(judgment);
        this.animateNote(note, judgment);
        this.updateHUD();

        // Audio feedback
        audio.playHitSound(judgment);

        // Particles
        if (this.effectsEnabled && judgment !== 'miss') {
            const noteRect = note.el ? note.el.getBoundingClientRect() : null;
            const gameRect = this.gameArea.getBoundingClientRect();
            if (noteRect) {
                const x = noteRect.left + noteRect.width / 2 - gameRect.left;
                const y = noteRect.top + noteRect.height / 2 - gameRect.top;
                const color = LANE_COLORS[note.l];
                const count = judgment === 'perfect' ? 22 : judgment === 'great' ? 14 : 7;
                this.particleSystem.emit(x, y, color, count);
                if (judgment === 'perfect') {
                    this.particleSystem.emitSparks(x, y, '#fff', 10);
                }
            }
        }

        // Screen shake on high combo
        if (this.effectsEnabled && this.combo > 0 && this.combo % 25 === 0) {
            this.gameArea.classList.add('screen-shake');
            setTimeout(() => this.gameArea.classList.remove('screen-shake'), 150);
        }

        // Remove note
        this.removeNote(note, true);
    }

    animateNote(note, judgment) {
        if (!note.el) return;
        if (judgment === 'miss') {
            note.el.classList.add('miss-anim');
        } else {
            note.el.classList.add('hit-anim');
        }
    }

    showJudgment(judgment) {
        if (this.judgmentTimer) clearTimeout(this.judgmentTimer);
        this.judgmentEl.innerHTML = '';

        const el = document.createElement('div');
        el.className = `judgment-text ${judgment}`;
        el.textContent = judgment.toUpperCase();
        this.judgmentEl.appendChild(el);

        this.judgmentTimer = setTimeout(() => {
            this.judgmentEl.innerHTML = '';
        }, 550);
    }

    showMilestone(text) {
        if (!this.milestoneEl) return;
        if (this.milestoneTimer) clearTimeout(this.milestoneTimer);
        this.milestoneEl.innerHTML = '';
        const span = document.createElement('span');
        span.className = 'milestone-text';
        span.textContent = text;
        this.milestoneEl.appendChild(span);
        this.milestoneTimer = setTimeout(() => {
            if (this.milestoneEl && this.milestoneEl.contains(span)) {
                this.milestoneEl.removeChild(span);
            }
        }, 1700);
    }

    // ── HUD Update ────────────────────────────────
    updateHUD() {
        // Score
        this.scoreEl.textContent = this.score.toLocaleString();

        // Multiplier
        const multiplier = Math.min(Math.floor(this.combo / 10) + 1, 8);
        if (this.multEl) {
            this.multEl.textContent = `×${multiplier}`;
            if (multiplier >= 8) {
                this.multEl.className = 'multiplier-value max';
            } else if (multiplier >= 6) {
                this.multEl.className = 'multiplier-value lv6';
            } else if (multiplier >= 4) {
                this.multEl.className = 'multiplier-value lv4';
            } else if (multiplier >= 2) {
                this.multEl.className = 'multiplier-value lv2';
            } else {
                this.multEl.className = 'multiplier-value';
            }
        }

        // Combo
        this.comboEl.textContent = this.combo;
        if (this.combo >= 5) {
            this.comboDisplay.classList.add('visible');
            this.comboEl.classList.remove('combo-pop');
            void this.comboEl.offsetWidth;
            this.comboEl.classList.add('combo-pop');
            setTimeout(() => this.comboEl.classList.remove('combo-pop'), 150);
        } else {
            this.comboDisplay.classList.remove('visible');
        }

        if (this.combo >= 30) {
            this.comboDisplay.classList.add('fire');
        } else {
            this.comboDisplay.classList.remove('fire');
        }

        // Health
        this.healthEl.style.width = `${this.health}%`;
        if (this.health < 30) {
            this.healthEl.style.background = 'var(--miss-color)';
            this.healthEl.classList.add('danger');
        } else if (this.health < 60) {
            this.healthEl.style.background = 'linear-gradient(90deg, var(--orange), var(--perfect-color))';
            this.healthEl.classList.remove('danger');
        } else {
            this.healthEl.style.background = 'linear-gradient(90deg, var(--pink), var(--green))';
            this.healthEl.classList.remove('danger');
        }

        // Accuracy
        const total = this.judgments.perfect + this.judgments.great + this.judgments.good + this.judgments.miss;
        if (total > 0) {
            const acc = ((this.judgments.perfect * 100 + this.judgments.great * 80 + this.judgments.good * 50) / (total * 100)) * 100;
            this.accuracyEl.textContent = `${acc.toFixed(1)}%`;
        }
    }

    // ── Pause / Resume ────────────────────────────
    pause() {
        if (this.state !== 'playing') return;
        this.state = 'paused';
        cancelAnimationFrame(this.rafId);
        document.getElementById('pause-overlay').classList.add('visible');
    }

    resume() {
        if (this.state !== 'paused') return;
        this.state = 'playing';
        document.getElementById('pause-overlay').classList.remove('visible');
        this.lastTime = performance.now();
        this.gameLoop();
    }

    restart() {
        this.stop();
        this.startLevel(this.levelIndex);
    }

    stop() {
        this.state = 'idle';
        cancelAnimationFrame(this.rafId);
        audio.stopMusic();
        this.clearNotes();
        this.particleSystem.clear();
        document.getElementById('pause-overlay').classList.remove('visible');
        document.getElementById('countdown-overlay').classList.remove('visible');
        this.comboDisplay.classList.remove('visible', 'fire');
        if (this.milestoneEl) this.milestoneEl.innerHTML = '';
    }

    // ── End Song ──────────────────────────────────
    endSong(completed) {
        this.state = 'ended';
        cancelAnimationFrame(this.rafId);
        audio.stopMusic();

        const total = this.judgments.perfect + this.judgments.great + this.judgments.good + this.judgments.miss;
        const accuracy = total > 0
            ? ((this.judgments.perfect * 100 + this.judgments.great * 80 + this.judgments.good * 50) / (total * 100)) * 100
            : 0;

        const rank = this.calculateRank(accuracy, completed, this.judgments);

        const results = {
            completed,
            score: this.score,
            maxCombo: this.maxCombo,
            accuracy: accuracy.toFixed(1),
            rank,
            fullCombo: this.fullCombo && completed,
            judgments: { ...this.judgments },
            levelIndex: this.levelIndex,
            levelName: this.level.name
        };

        if (completed && this.levelIndex < LEVELS.length - 1) {
            LEVELS[this.levelIndex + 1].unlocked = true;
        }

        this.clearNotes();
        this.particleSystem.clear();
        this.comboDisplay.classList.remove('visible', 'fire');
        if (this.milestoneEl) this.milestoneEl.innerHTML = '';

        if (typeof app !== 'undefined') {
            app.showResults(results);
        }
    }

    calculateRank(accuracy, completed, judgments) {
        if (!completed) return 'F';
        if (judgments.miss === 0 && judgments.good === 0 && judgments.great === 0) return 'SS';
        if (accuracy >= 95) return 'S';
        if (accuracy >= 88) return 'A';
        if (accuracy >= 78) return 'B';
        if (accuracy >= 65) return 'C';
        return 'D';
    }
}

// Global game instance
const game = new Game();
