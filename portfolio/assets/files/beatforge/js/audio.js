// =============================================
//  BEATFORGE — Audio Engine (Web Audio API)
// =============================================

class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.initialized = false;
        this.noiseBuffer = null;
        this.scheduledNodes = [];
    }

    init() {
        if (this.initialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();

        // Master output
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.8;
        this.masterGain.connect(this.ctx.destination);

        // Music bus
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.5;
        this.musicGain.connect(this.masterGain);

        // SFX bus
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.7;
        this.sfxGain.connect(this.masterGain);

        // Reusable noise buffer
        this.noiseBuffer = this._createNoiseBuffer();
        this.initialized = true;
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    get currentTime() {
        return this.ctx ? this.ctx.currentTime : 0;
    }

    // ── Noise Buffer ──────────────────────────────
    _createNoiseBuffer() {
        const size = this.ctx.sampleRate * 2;
        const buf = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
        return buf;
    }

    // ── Drum Sounds ───────────────────────────────
    playKick(time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(30, time + 0.12);
        gain.gain.setValueAtTime(0.9, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.35);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + 0.35);
        this.scheduledNodes.push(osc);
    }

    playSnare(time) {
        // Noise burst
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const nGain = this.ctx.createGain();
        const nFilter = this.ctx.createBiquadFilter();
        nFilter.type = 'bandpass';
        nFilter.frequency.value = 3500;
        nFilter.Q.value = 0.8;
        nGain.gain.setValueAtTime(0.6, time);
        nGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        noise.connect(nFilter);
        nFilter.connect(nGain);
        nGain.connect(this.musicGain);
        noise.start(time);
        noise.stop(time + 0.15);

        // Tone body
        const osc = this.ctx.createOscillator();
        const oGain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, time);
        osc.frequency.exponentialRampToValueAtTime(80, time + 0.06);
        oGain.gain.setValueAtTime(0.5, time);
        oGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
        osc.connect(oGain);
        oGain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + 0.1);
        this.scheduledNodes.push(noise, osc);
    }

    playHihat(time, open = false) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 8000;
        const dur = open ? 0.2 : 0.05;
        gain.gain.setValueAtTime(0.25, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        noise.start(time);
        noise.stop(time + dur + 0.01);
        this.scheduledNodes.push(noise);
    }

    playClap(time) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 2500;
        filter.Q.value = 0.8;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.7, time + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        noise.start(time);
        noise.stop(time + 0.16);
        this.scheduledNodes.push(noise);
    }

    // ── Melodic Sounds ────────────────────────────
    playBass(freq, time, duration) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, time);
        filter.Q.value = 4;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.35, time + 0.015);
        gain.gain.setValueAtTime(0.35, time + duration * 0.8);
        gain.gain.linearRampToValueAtTime(0, time + duration);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        osc.start(time);
        osc.stop(time + duration + 0.01);
        this.scheduledNodes.push(osc);
    }

    playLead(freq, time, duration) {
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, time);
        osc2.frequency.setValueAtTime(freq * 1.006, time);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2500, time);
        filter.frequency.exponentialRampToValueAtTime(600, time + duration);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.15, time + 0.02);
        gain.gain.setValueAtTime(0.15, time + duration * 0.7);
        gain.gain.linearRampToValueAtTime(0, time + duration);
        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.musicGain);
        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + duration + 0.01);
        osc2.stop(time + duration + 0.01);
        this.scheduledNodes.push(osc1, osc2);
    }

    playPad(freqs, time, duration) {
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1200;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.08, time + 0.4);
        gain.gain.setValueAtTime(0.08, time + duration - 0.4);
        gain.gain.linearRampToValueAtTime(0, time + duration);
        filter.connect(gain);
        gain.connect(this.musicGain);

        for (const freq of freqs) {
            for (const detune of [1, 1.003, 0.997]) {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq * detune, time);
                osc.connect(filter);
                osc.start(time);
                osc.stop(time + duration + 0.01);
                this.scheduledNodes.push(osc);
            }
        }
    }

    // ── SFX ───────────────────────────────────────
    playHitSound(type) {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        switch (type) {
            case 'perfect':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, t);
                osc.frequency.exponentialRampToValueAtTime(1200, t + 0.08);
                gain.gain.setValueAtTime(0.25, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
                break;
            case 'great':
                osc.type = 'sine';
                osc.frequency.value = 660;
                gain.gain.setValueAtTime(0.2, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                break;
            case 'good':
                osc.type = 'sine';
                osc.frequency.value = 440;
                gain.gain.setValueAtTime(0.15, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                break;
            case 'miss':
                osc.type = 'square';
                osc.frequency.value = 120;
                gain.gain.setValueAtTime(0.1, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                break;
        }

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.3);
    }

    playMenuClick() {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, t);
        osc.frequency.exponentialRampToValueAtTime(1000, t + 0.04);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.1);
    }

    playMenuHover() {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 520;
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.05);
    }

    playCountdown() {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 600;
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.3);
    }

    playCountdownGo() {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 900;
        gain.gain.setValueAtTime(0.35, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(t);
        osc.stop(t + 0.45);
    }

    // ── Music Scheduling ──────────────────────────
    scheduleLevel(level, startTime) {
        this.stopMusic();

        const bpm = level.bpm;
        const duration = level.duration;
        const beat = 60 / bpm;
        const sixteenth = beat / 4;
        const music = level.music;

        // Schedule drums
        if (music.drums) {
            const pattern = music.drums;
            const len = pattern.length;
            let idx = 0;
            let t = startTime;
            while (t < startTime + duration) {
                const step = pattern[idx % len];
                if (step.k) this.playKick(t);
                if (step.s) this.playSnare(t);
                if (step.h) this.playHihat(t, false);
                if (step.oh) this.playHihat(t, true);
                if (step.c) this.playClap(t);
                t += sixteenth;
                idx++;
            }
        }

        // Schedule bass
        if (music.bass) {
            const pattern = music.bass;
            const len = pattern.length;
            let idx = 0;
            let t = startTime;
            while (t < startTime + duration) {
                const step = pattern[idx % len];
                if (step.n > 0) {
                    this.playBass(step.n, t, step.d * beat);
                }
                t += step.d * beat;
                idx++;
            }
        }

        // Schedule lead
        if (music.lead) {
            const pattern = music.lead;
            const len = pattern.length;
            let idx = 0;
            let t = startTime + beat * 8; // Lead enters after 8 beats
            while (t < startTime + duration) {
                const step = pattern[idx % len];
                if (step.n > 0) {
                    this.playLead(step.n, t, step.d * beat);
                }
                t += step.d * beat;
                idx++;
            }
        }

        // Schedule pads
        if (music.pads) {
            let t = startTime;
            while (t < startTime + duration) {
                for (const chord of music.pads) {
                    if (t >= startTime + duration) break;
                    this.playPad(chord.notes, t, chord.d * beat);
                    t += chord.d * beat;
                }
            }
        }
    }

    stopMusic() {
        for (const node of this.scheduledNodes) {
            try { node.stop(); } catch (e) { /* already stopped */ }
        }
        this.scheduledNodes = [];
    }

    playMilestone() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const notes = [523.25, 659.26, 783.99]; // C5, E5, G5
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, t + i * 0.06);
            gain.gain.linearRampToValueAtTime(0.22, t + i * 0.06 + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.22);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t + i * 0.06);
            osc.stop(t + i * 0.06 + 0.25);
        });
    }

    // ── Volume Controls ───────────────────────────
    setMasterVolume(v) {
        if (this.masterGain) this.masterGain.gain.value = v;
    }

    setMusicVolume(v) {
        if (this.musicGain) this.musicGain.gain.value = v;
    }

    setSfxVolume(v) {
        if (this.sfxGain) this.sfxGain.gain.value = v;
    }
}

// Global audio engine
const audio = new AudioEngine();
