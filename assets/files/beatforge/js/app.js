// =============================================
//  BEATFORGE — App Controller v2
// =============================================

class App {
    constructor() {
        this.currentScreen = 'splash-screen';
        this.screens = {};
        this.settings = {
            musicVolume: 70,
            sfxVolume: 80,
            noteSpeed: 5,
            effects: true,
            offset: 0
        };
        this.highScores = {};
        this.bgAnimId = null;
    }

    // ── Initialization ────────────────────────────
    init() {
        const screenIds = [
            'splash-screen', 'main-menu', 'level-select',
            'settings-screen', 'howto-screen', 'game-screen',
            'results-screen', 'credits-screen'
        ];
        for (const id of screenIds) {
            this.screens[id] = document.getElementById(id);
        }

        this.loadSettings();
        this.loadHighScores();
        this.loadUnlocked();

        game.init();

        this.setupSplash();
        this.setupMenuButtons();
        this.setupSettings();
        this.setupLevelSelect();

        this.startBgAnimation();
        this.simulateLoading();
    }

    // ── Splash Screen ─────────────────────────────
    simulateLoading() {
        const fill = document.getElementById('loading-fill');
        const pressStart = document.getElementById('press-start');
        let progress = 0;

        const interval = setInterval(() => {
            progress += Math.random() * 15 + 5;
            if (progress >= 100) {
                progress = 100;
                clearInterval(interval);
                fill.style.width = '100%';
                setTimeout(() => pressStart.classList.add('visible'), 300);
            }
            fill.style.width = `${progress}%`;
        }, 150);
    }

    setupSplash() {
        const handler = (e) => {
            if (this.currentScreen !== 'splash-screen') return;
            if (!document.getElementById('press-start').classList.contains('visible')) return;

            audio.init();
            audio.resume();
            audio.setMusicVolume(this.settings.musicVolume / 100);
            audio.setSfxVolume(this.settings.sfxVolume / 100);
            audio.playMenuClick();

            this.showScreen('main-menu');
            document.removeEventListener('keydown', handler);
            document.removeEventListener('click', handler);
        };

        document.addEventListener('keydown', handler);
        document.addEventListener('click', handler);
    }

    // ── Background Animation ──────────────────────
    startBgAnimation() {
        const canvas = document.getElementById('bg-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const particles = [];
        const particleCount = 70;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();
        window.addEventListener('resize', resize);

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5 - 0.3,
                size: Math.random() * 2.5 + 0.5,
                alpha: Math.random() * 0.5 + 0.1,
                color: ['#00f0ff', '#ff2d7b', '#39ff14', '#ff8c00', '#a855f7'][Math.floor(Math.random() * 5)]
            });
        }

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (const p of particles) {
                p.x += p.vx;
                p.y += p.vy;

                if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
                if (p.x < -10) p.x = canvas.width + 10;
                if (p.x > canvas.width + 10) p.x = -10;

                ctx.globalAlpha = p.alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.globalAlpha = 0.05;
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 0.5;
            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const dx = particles[i].x - particles[j].x;
                    const dy = particles[i].y - particles[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 120) {
                        ctx.globalAlpha = 0.05 * (1 - dist / 120);
                        ctx.beginPath();
                        ctx.moveTo(particles[i].x, particles[i].y);
                        ctx.lineTo(particles[j].x, particles[j].y);
                        ctx.stroke();
                    }
                }
            }

            ctx.globalAlpha = 1;
            this.bgAnimId = requestAnimationFrame(animate);
        };

        animate();
    }

    // ── Screen Management ─────────────────────────
    showScreen(screenId) {
        for (const id in this.screens) {
            this.screens[id].classList.remove('active');
        }
        this.screens[screenId].classList.add('active');
        this.currentScreen = screenId;

        if (screenId === 'level-select') {
            this.populateLevelGrid();
        }
    }

    // ── Menu Buttons ──────────────────────────────
    setupMenuButtons() {
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            audio.resume();

            switch (action) {
                case 'play':
                    audio.playMenuClick();
                    this.showScreen('level-select');
                    break;
                case 'settings':
                    audio.playMenuClick();
                    this.showScreen('settings-screen');
                    break;
                case 'howto':
                    audio.playMenuClick();
                    this.showScreen('howto-screen');
                    break;
                case 'credits':
                    audio.playMenuClick();
                    this.showScreen('credits-screen');
                    break;
                case 'menu':
                    audio.playMenuClick();
                    game.stop();
                    this.showScreen('main-menu');
                    break;
                case 'resume':
                    audio.playMenuClick();
                    game.resume();
                    break;
                case 'restart':
                    audio.playMenuClick();
                    game.stop();
                    game.startLevel(game.levelIndex);
                    break;
                case 'quit':
                    audio.playMenuClick();
                    game.stop();
                    this.showScreen('level-select');
                    break;
                case 'retry':
                    audio.playMenuClick();
                    this.showScreen('game-screen');
                    setTimeout(() => game.startLevel(game.levelIndex), 300);
                    break;
                case 'levels':
                    audio.playMenuClick();
                    this.showScreen('level-select');
                    break;
            }
        });

        document.addEventListener('mouseenter', (e) => {
            if (e.target.closest('.menu-btn') || e.target.closest('.level-card:not(.locked)')) {
                if (audio.initialized) audio.playMenuHover();
            }
        }, true);
    }

    // ── Level Select ──────────────────────────────
    setupLevelSelect() { /* handled in populateLevelGrid */ }

    populateLevelGrid() {
        const grid = document.getElementById('level-grid');
        grid.innerHTML = '';

        for (const level of LEVELS) {
            const card = document.createElement('div');
            card.className = `level-card${level.unlocked ? '' : ' locked'}`;

            // Per-level accent color
            card.style.setProperty('--card-accent', level.colors.accent);

            const diffDots = Array.from({ length: 5 }, (_, i) =>
                `<div class="diff-dot${i < level.difficulty ? ' active' : ''}"></div>`
            ).join('');

            const best = this.highScores[level.id];
            const bestHtml = best
                ? `<div class="level-best">
                       <span>Best: ${best.score.toLocaleString()}</span>
                       <span class="best-rank">${best.rank}</span>
                   </div>`
                : `<div class="level-best"><span>Not played</span></div>`;

            const durationStr = `${Math.floor(level.duration / 60)}:${String(Math.floor(level.duration % 60)).padStart(2, '0')}`;

            card.innerHTML = `
                ${!level.unlocked ? '<div class="lock-icon">🔒</div>' : ''}
                <div class="level-card-header">
                    <span class="level-number">TRACK ${level.id + 1}</span>
                    <div class="level-difficulty">${diffDots}</div>
                </div>
                <div class="level-name">${level.name}</div>
                <div class="level-artist">${level.artist}</div>
                <div class="level-meta">
                    <span>♫ ${level.bpm} BPM</span>
                    <span>⏱ ${durationStr}</span>
                    <span>♪ ${level.notes.length} notes</span>
                </div>
                ${bestHtml}
            `;

            if (level.unlocked) {
                card.addEventListener('click', () => {
                    audio.playMenuClick();
                    this.showScreen('game-screen');
                    setTimeout(() => game.startLevel(level.id), 400);
                });
            }

            grid.appendChild(card);
        }
    }

    // ── Settings ──────────────────────────────────
    setupSettings() {
        const musicVol = document.getElementById('music-volume');
        const sfxVol = document.getElementById('sfx-volume');
        const noteSpeed = document.getElementById('note-speed');
        const offsetEl = document.getElementById('note-offset');
        const musicValEl = document.getElementById('music-value');
        const sfxValEl = document.getElementById('sfx-value');
        const speedValEl = document.getElementById('speed-value');
        const offsetValEl = document.getElementById('offset-value');

        // Apply saved settings
        musicVol.value = this.settings.musicVolume;
        sfxVol.value = this.settings.sfxVolume;
        noteSpeed.value = this.settings.noteSpeed;
        if (offsetEl) offsetEl.value = this.settings.offset;
        musicValEl.textContent = `${this.settings.musicVolume}%`;
        sfxValEl.textContent = `${this.settings.sfxVolume}%`;
        speedValEl.textContent = this.settings.noteSpeed;
        if (offsetValEl) offsetValEl.textContent = `${this.settings.offset}ms`;

        // Listeners
        musicVol.addEventListener('input', () => {
            const v = parseInt(musicVol.value);
            this.settings.musicVolume = v;
            musicValEl.textContent = `${v}%`;
            audio.setMusicVolume(v / 100);
            this.saveSettings();
        });

        sfxVol.addEventListener('input', () => {
            const v = parseInt(sfxVol.value);
            this.settings.sfxVolume = v;
            sfxValEl.textContent = `${v}%`;
            audio.setSfxVolume(v / 100);
            this.saveSettings();
        });

        noteSpeed.addEventListener('input', () => {
            const v = parseInt(noteSpeed.value);
            this.settings.noteSpeed = v;
            speedValEl.textContent = v;
            this.saveSettings();
        });

        if (offsetEl) {
            offsetEl.addEventListener('input', () => {
                const v = parseInt(offsetEl.value);
                this.settings.offset = v;
                if (offsetValEl) offsetValEl.textContent = `${v}ms`;
                game.offset = v / 1000;
                this.saveSettings();
            });
        }

        // Effects toggle
        document.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const group = btn.parentElement;
                group.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.settings.effects = btn.dataset.value === 'on';
                game.effectsEnabled = this.settings.effects;
                this.saveSettings();
                audio.playMenuClick();
            });
        });

        if (audio.initialized) {
            audio.setMusicVolume(this.settings.musicVolume / 100);
            audio.setSfxVolume(this.settings.sfxVolume / 100);
        }
    }

    // ── Results Screen ────────────────────────────
    showResults(results) {
        this.showScreen('results-screen');

        const titleEl = document.getElementById('results-title');
        const rankEl = document.getElementById('results-rank');
        const songEl = document.getElementById('results-song');

        titleEl.textContent = results.completed ? 'STAGE CLEAR!' : 'STAGE FAILED';
        titleEl.className = `results-title${results.completed ? '' : ' failed'}`;

        rankEl.textContent = results.rank;
        rankEl.className = `results-rank rank-${results.rank}`;

        songEl.textContent = results.levelName;

        document.getElementById('result-score').textContent = results.score.toLocaleString();
        document.getElementById('result-combo').textContent = results.maxCombo;
        document.getElementById('result-accuracy').textContent = `${results.accuracy}%`;
        document.getElementById('result-perfect').textContent = results.judgments.perfect;
        document.getElementById('result-great').textContent = results.judgments.great;
        document.getElementById('result-good').textContent = results.judgments.good;
        document.getElementById('result-miss').textContent = results.judgments.miss;

        // Badges
        const badgesEl = document.getElementById('result-badges');
        if (badgesEl) {
            badgesEl.innerHTML = '';

            let isNewBest = false;
            if (results.completed) {
                const existing = this.highScores[results.levelIndex];
                isNewBest = !existing || results.score > existing.score;
            }

            if (results.fullCombo) {
                const b = document.createElement('span');
                b.className = 'badge badge-fullcombo';
                b.textContent = 'FULL COMBO';
                badgesEl.appendChild(b);
            }
            if (isNewBest) {
                const b = document.createElement('span');
                b.className = 'badge badge-newbest';
                b.textContent = 'NEW BEST!';
                badgesEl.appendChild(b);
            }
        }

        // Animate stat rows
        const statsEl = document.querySelector('.results-stats');
        if (statsEl) {
            statsEl.classList.remove('animate');
            void statsEl.offsetWidth;
            statsEl.classList.add('animate');
        }

        // Save high score
        if (results.completed) {
            const existing = this.highScores[results.levelIndex];
            if (!existing || results.score > existing.score) {
                this.highScores[results.levelIndex] = {
                    score: results.score,
                    rank: results.rank,
                    accuracy: results.accuracy,
                    maxCombo: results.maxCombo
                };
                this.saveHighScores();
            }
        }

        this.saveUnlocked();
    }

    // ── Persistence ───────────────────────────────
    saveSettings() {
        try { localStorage.setItem('beatforge_settings', JSON.stringify(this.settings)); } catch (e) {}
    }

    loadSettings() {
        try {
            const data = localStorage.getItem('beatforge_settings');
            if (data) Object.assign(this.settings, JSON.parse(data));
        } catch (e) {}
    }

    saveHighScores() {
        try { localStorage.setItem('beatforge_highscores', JSON.stringify(this.highScores)); } catch (e) {}
    }

    loadHighScores() {
        try {
            const data = localStorage.getItem('beatforge_highscores');
            if (data) this.highScores = JSON.parse(data);
        } catch (e) {}
    }

    saveUnlocked() {
        try {
            const ids = LEVELS.filter(l => l.unlocked).map(l => l.id);
            localStorage.setItem('beatforge_unlocked', JSON.stringify(ids));
        } catch (e) {}
    }

    loadUnlocked() {
        try {
            const data = localStorage.getItem('beatforge_unlocked');
            if (data) {
                const ids = JSON.parse(data);
                for (const id of ids) {
                    if (LEVELS[id]) LEVELS[id].unlocked = true;
                }
            }
        } catch (e) {}
        LEVELS[0].unlocked = true;
    }
}

// ── Bootstrap ─────────────────────────────────
const app = new App();
document.addEventListener('DOMContentLoaded', () => { app.init(); });
