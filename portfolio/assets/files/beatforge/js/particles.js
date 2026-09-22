// =============================================
//  BEATFORGE — Particle Effects System
// =============================================

class ParticleSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.particles = [];
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = this.canvas.offsetWidth || window.innerWidth;
        this.canvas.height = this.canvas.offsetHeight || window.innerHeight;
    }

    /**
     * Emit particles at a position
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {string} color - CSS color
     * @param {number} count - Number of particles
     * @param {object} opts - Options: spread, speed, gravity, size, decay
     */
    emit(x, y, color, count = 12, opts = {}) {
        const {
            spread = 180,
            speed = 1,
            gravity = 200,
            size = 5,
            decay = 0.025
        } = opts;

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const vel = (Math.random() * 0.7 + 0.3) * spread * speed;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * vel,
                vy: Math.sin(angle) * vel - 80 * speed,
                size: Math.random() * size + 2,
                color,
                life: 1,
                decay: Math.random() * decay + decay * 0.5,
                gravity
            });
        }
    }

    /**
     * Emit a burst in a specific direction (upward)
     */
    emitBurst(x, y, color, count = 8) {
        for (let i = 0; i < count; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
            const vel = Math.random() * 200 + 100;
            this.particles.push({
                x: x + (Math.random() - 0.5) * 30,
                y,
                vx: Math.cos(angle) * vel,
                vy: Math.sin(angle) * vel,
                size: Math.random() * 4 + 1,
                color,
                life: 1,
                decay: Math.random() * 0.02 + 0.015,
                gravity: 150
            });
        }
    }

    /**
     * Emit sparks (small, fast, short-lived)
     */
    emitSparks(x, y, color, count = 6) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const vel = Math.random() * 300 + 150;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * vel,
                vy: Math.sin(angle) * vel,
                size: Math.random() * 2 + 0.5,
                color,
                life: 1,
                decay: Math.random() * 0.05 + 0.04,
                gravity: 0
            });
        }
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += p.gravity * dt;
            p.life -= p.decay;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    render() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (const p of this.particles) {
            const alpha = Math.max(0, p.life);
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = p.color;

            // Glow effect
            this.ctx.shadowBlur = 8;
            this.ctx.shadowColor = p.color;

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.globalAlpha = 1;
        this.ctx.shadowBlur = 0;
    }

    clear() {
        this.particles = [];
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    get count() {
        return this.particles.length;
    }
}
