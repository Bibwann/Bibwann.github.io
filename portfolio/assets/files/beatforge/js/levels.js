// =============================================
//  BEATFORGE — Level Definitions
// =============================================

// ── Note Frequencies ──────────────────────────
const NOTE = {
    C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.00, A2: 110.00, Bb2: 116.54, B2: 123.47,
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, Bb3: 233.08, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, Bb4: 466.16, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.26
};

// ── Pattern Parser ────────────────────────────
// Converts pattern strings to note arrays.
// Each character = 1 sixteenth-note position
// '0'-'3' = single note in lane, '-' = rest
// 'a'=lanes 0+1, 'b'=2+3, 'c'=0+2, 'd'=1+3, 'e'=0+3, 'f'=1+2, '*'=all 4
function parsePatterns(bpm, patternsArray) {
    const notes = [];
    const sixteenth = 60 / bpm / 4;
    let globalPos = 0; // sixteenth-note counter

    for (const pattern of patternsArray) {
        for (let i = 0; i < pattern.length; i++) {
            const ch = pattern[i];
            const t = parseFloat(((globalPos + i) * sixteenth).toFixed(4));

            if (ch >= '0' && ch <= '3') {
                notes.push({ t, l: parseInt(ch) });
            } else {
                const map = {
                    'a': [0, 1], 'b': [2, 3], 'c': [0, 2],
                    'd': [1, 3], 'e': [0, 3], 'f': [1, 2], '*': [0, 1, 2, 3]
                };
                if (map[ch]) {
                    for (const lane of map[ch]) {
                        notes.push({ t, l: lane });
                    }
                }
            }
        }
        globalPos += pattern.length;
    }

    return notes;
}

// ── Drum Pattern Builder ──────────────────────
// Each step object: { k: kick, s: snare, h: hihat, oh: open hihat, c: clap }
// Pattern length = 16 steps = 1 measure of 16th notes
function drumPattern(str) {
    // Format: "K...S...K...S..." where K=kick, S=snare, H=hihat, O=open hat, C=clap, .=nothing
    // Multiple characters per position separated by multiple lines
    const steps = [];
    for (let i = 0; i < 16; i++) steps.push({});
    
    for (let i = 0; i < str.length && i < 16; i++) {
        const ch = str[i].toUpperCase();
        if (ch === 'K') steps[i].k = 1;
        if (ch === 'S') steps[i].s = 1;
        if (ch === 'H') steps[i].h = 1;
        if (ch === 'O') steps[i].oh = 1;
        if (ch === 'C') steps[i].c = 1;
    }
    return steps;
}

function combineDrums(...patterns) {
    const result = [];
    const len = patterns[0].length;
    for (let i = 0; i < len; i++) {
        const step = {};
        for (const p of patterns) {
            if (p[i]) Object.assign(step, p[i]);
        }
        result.push(step);
    }
    return result;
}

// ── Level Definitions ─────────────────────────

const LEVELS = [

    // ─────────── LEVEL 1: FIRST STEPS ───────────
    {
        id: 0,
        name: "FIRST STEPS",
        artist: "SynthWave",
        difficulty: 1,
        bpm: 92,
        duration: 42,
        colors: { bg: '#0a0020', accent: '#a855f7' },
        music: {
            drums: combineDrums(
                drumPattern("K...K...K...K..."),
                drumPattern("....S.......S..."),
                drumPattern("H.H.H.H.H.H.H.H")
            ),
            bass: [
                { n: NOTE.C2, d: 2 }, { n: NOTE.C2, d: 1 }, { n: NOTE.G2, d: 1 },
                { n: NOTE.A2, d: 2 }, { n: NOTE.A2, d: 1 }, { n: NOTE.G2, d: 1 },
            ],
            pads: [
                { notes: [NOTE.C3, NOTE.E3, NOTE.G3], d: 4 },
                { notes: [NOTE.A3, NOTE.C4, NOTE.E4], d: 4 },
            ]
        },
        notes: parsePatterns(92, [
            // Intro: 2 measures (32 sixteenths) - silence
            "----------------", "----------------",
            // Warm up: simple quarter notes
            "1---------------", "--------2-------",
            "1-------2-------", "1-------2-------",
            // Building up
            "0---1---2---3---", "3---2---1---0---",
            "1---2---1---2---", "0---3---0---3---",
            // Main: slightly more
            "1---2---3---2---", "1---0---3---0---",
            "1---2---1---2---", "3---0---3---0---",
            "1---2---3---2---", "0---1---2---3---",
            // Ending
            "1-------2-------", "3-------0-------",
            "1---2---3---0---", "----------------",
        ])
    },

    // ─────────── LEVEL 2: NEON DREAMS ───────────
    {
        id: 1,
        name: "NEON DREAMS",
        artist: "CyberPulse",
        difficulty: 2,
        bpm: 110,
        duration: 48,
        colors: { bg: '#001020', accent: '#00f0ff' },
        music: {
            drums: combineDrums(
                drumPattern("K...K...K.K.K..."),
                drumPattern("....S.......S..."),
                drumPattern("H.H.H.H.H.H.H.H")
            ),
            bass: [
                { n: NOTE.E2, d: 1 }, { n: NOTE.E2, d: 1 }, { n: NOTE.G2, d: 1 }, { n: NOTE.A2, d: 1 },
                { n: NOTE.E2, d: 1 }, { n: NOTE.E2, d: 1 }, { n: NOTE.D2, d: 1 }, { n: NOTE.C2, d: 1 },
            ],
            lead: [
                { n: NOTE.E4, d: 0.5 }, { n: NOTE.G4, d: 0.5 }, { n: NOTE.A4, d: 1 },
                { n: NOTE.G4, d: 0.5 }, { n: NOTE.E4, d: 0.5 }, { n: NOTE.D4, d: 1 },
                { n: NOTE.E4, d: 0.5 }, { n: NOTE.G4, d: 0.5 }, { n: NOTE.A4, d: 0.5 }, { n: NOTE.B4, d: 0.5 },
                { n: NOTE.A4, d: 1 }, { n: NOTE.G4, d: 1 },
            ],
            pads: [
                { notes: [NOTE.E3, NOTE.G3, NOTE.B3], d: 4 },
                { notes: [NOTE.A3, NOTE.C4, NOTE.E4], d: 4 },
                { notes: [NOTE.D3, NOTE.F3, NOTE.A3], d: 4 },
                { notes: [NOTE.C3, NOTE.E3, NOTE.G3], d: 4 },
            ]
        },
        notes: parsePatterns(110, [
            // Intro
            "----------------", "----------------",
            // Warm up
            "1---2---1---2---", "0---3---0---3---",
            "1---2---3---2---", "0---1---2---3---",
            // Getting busier with 8th notes
            "1-2---3-2---1---", "0-3---0-3---2---",
            "1-2-1-2---------", "--------3-2-3-2-",
            // Main patterns
            "1-2-3-2---------", "--------0-3-0-3-",
            "1---2---3-2-0---", "3---2---1-0-3---",
            "0-1---2-3---2-1-", "3-2---1-0---1-2-",
            "1-2-3---0-3-2---", "0-1-2---3-2-1---",
            // Climax
            "1-2-1-2-3-2-3-2", "0-1-0-1-2-3-2-3",
            // Ending
            "1---2---3---0---", "--------1---2---",
            "1-------2-------", "----------------",
        ])
    },

    // ─────────── LEVEL 3: DIGITAL PULSE ───────────
    {
        id: 2,
        name: "DIGITAL PULSE",
        artist: "NeonGrid",
        difficulty: 3,
        bpm: 126,
        duration: 50,
        colors: { bg: '#0a1a00', accent: '#39ff14' },
        music: {
            drums: combineDrums(
                drumPattern("K...K...K...K..."),
                drumPattern("....C.......C..."),
                drumPattern("HHHHHHHHHHHHHHHH")
            ),
            bass: [
                { n: NOTE.A2, d: 0.5 }, { n: 0, d: 0.5 }, { n: NOTE.A2, d: 0.5 }, { n: NOTE.C3, d: 0.5 },
                { n: NOTE.G2, d: 0.5 }, { n: 0, d: 0.5 }, { n: NOTE.G2, d: 0.5 }, { n: NOTE.Bb2, d: 0.5 },
                { n: NOTE.F2, d: 0.5 }, { n: 0, d: 0.5 }, { n: NOTE.F2, d: 0.5 }, { n: NOTE.A2, d: 0.5 },
                { n: NOTE.G2, d: 1 }, { n: NOTE.G2, d: 0.5 }, { n: NOTE.A2, d: 0.5 },
            ],
            lead: [
                { n: NOTE.A4, d: 0.5 }, { n: NOTE.C5, d: 0.5 }, { n: NOTE.A4, d: 0.5 }, { n: NOTE.G4, d: 0.5 },
                { n: NOTE.F4, d: 1 }, { n: NOTE.G4, d: 1 },
                { n: NOTE.A4, d: 0.5 }, { n: NOTE.G4, d: 0.5 }, { n: NOTE.F4, d: 0.5 }, { n: NOTE.E4, d: 0.5 },
                { n: NOTE.D4, d: 1 }, { n: NOTE.E4, d: 1 },
            ]
        },
        notes: parsePatterns(126, [
            // Intro
            "----------------", "----------------",
            // Build
            "1-2-3-2-1-2-3-2", "0-3-0-3-1-2-1-2",
            "1---2-3-1---0-3-", "2---3-0-2---1-0-",
            // Doubles appear
            "a---b---a---b---", "1-2-1-2-3-0-3-0",
            "a-------b-------", "c-------d-------",
            // Intense patterns
            "1-2-3-2-0-3-0-3", "3-2-1-0-1-2-3-2",
            "a---1-2-b---3-0-", "1-2-a---3-0-b---",
            "0-1-2-3---------", "--------3-2-1-0-",
            "1-2-3-0-3-2-1-0", "0-1-2-3-3-2-1-0",
            // Climax
            "a-b-a-b-c-d-c-d", "1-2-3-0-a-b-a-b",
            "a-1-b-2-a-3-b-0", "c-d-c-d-a-b-a-b",
            // Cool down
            "1---2---3---0---", "1-------2-------",
            "----------------",
        ])
    },

    // ─────────── LEVEL 4: CYBER STORM ───────────
    {
        id: 3,
        name: "CYBER STORM",
        artist: "DataStream",
        difficulty: 4,
        bpm: 140,
        duration: 50,
        colors: { bg: '#1a0a00', accent: '#ff8c00' },
        music: {
            drums: combineDrums(
                drumPattern("K..K..K.K..K..K."),
                drumPattern("....S..C....S.C."),
                drumPattern("HHHHHHHHHHHHOHHH")
            ),
            bass: [
                { n: NOTE.D2, d: 0.5 }, { n: NOTE.D2, d: 0.25 }, { n: NOTE.D2, d: 0.25 },
                { n: NOTE.F2, d: 0.5 }, { n: NOTE.G2, d: 0.5 },
                { n: NOTE.A2, d: 0.5 }, { n: NOTE.A2, d: 0.25 }, { n: NOTE.G2, d: 0.25 },
                { n: NOTE.F2, d: 0.5 }, { n: NOTE.D2, d: 0.5 },
            ],
            lead: [
                { n: NOTE.D5, d: 0.25 }, { n: NOTE.E5, d: 0.25 }, { n: NOTE.D5, d: 0.5 },
                { n: NOTE.A4, d: 0.5 }, { n: NOTE.Bb4, d: 0.5 },
                { n: NOTE.A4, d: 0.25 }, { n: NOTE.G4, d: 0.25 }, { n: NOTE.A4, d: 0.5 },
                { n: NOTE.D4, d: 0.5 }, { n: NOTE.F4, d: 0.5 },
            ],
            pads: [
                { notes: [NOTE.D3, NOTE.F3, NOTE.A3], d: 4 },
                { notes: [NOTE.Bb2, NOTE.D3, NOTE.F3], d: 4 },
                { notes: [NOTE.C3, NOTE.E3, NOTE.G3], d: 4 },
                { notes: [NOTE.A2, NOTE.D3, NOTE.F3], d: 4 },
            ]
        },
        notes: parsePatterns(140, [
            // Intro
            "----------------", "----------------",
            // Fast warmup
            "1-2-3-0-1-2-3-0", "3-2-1-0-3-2-1-0",
            "a-b-a-b-c-d-c-d", "0-1-2-3-0-1-2-3",
            // 16th note runs
            "0123--------3210", "--------01233210",
            "01--23--01--23--", "32--10--32--10--",
            // Complex doubles
            "a-b-1-2-a-b-3-0", "c-d-0-3-c-d-1-2",
            "a-2-b-1-a-3-b-0", "e-f-e-f-a-b-a-b",
            // Intense
            "01231-2-32103-0-", "1-0-01232-3-3210",
            "a-b-c-d-a-b-c-d", "1-2-a-3-0-b-2-1",
            "0-1-23--3-2-10--", "01--2-3-32--1-0-",
            "a-b-a-b-a-b-a-b", "c-d-c-d-e-f-e-f",
            // Climax
            "0123012332103210", "a-b-c-d-01233210",
            // Outro
            "1---2---3---0---", "1-------2-------",
            "----------------",
        ])
    },

    // ─────────── LEVEL 5: FINAL OVERRIDE ────────
    {
        id: 4,
        name: "FINAL OVERRIDE",
        artist: "BeatForge",
        difficulty: 5,
        bpm: 155,
        duration: 55,
        colors: { bg: '#1a0015', accent: '#ff2d7b' },
        music: {
            drums: combineDrums(
                drumPattern("K.KK..K.K.KK.CK."),
                drumPattern("....S.C.....SC.."),
                drumPattern("HHHHHHHHOHHHHHHH")
            ),
            bass: [
                { n: NOTE.A2, d: 0.25 }, { n: NOTE.A2, d: 0.25 }, { n: NOTE.C3, d: 0.25 }, { n: NOTE.A2, d: 0.25 },
                { n: NOTE.G2, d: 0.25 }, { n: NOTE.G2, d: 0.25 }, { n: NOTE.Bb2, d: 0.25 }, { n: NOTE.G2, d: 0.25 },
                { n: NOTE.F2, d: 0.25 }, { n: NOTE.F2, d: 0.25 }, { n: NOTE.A2, d: 0.25 }, { n: NOTE.F2, d: 0.25 },
                { n: NOTE.G2, d: 0.5 }, { n: NOTE.A2, d: 0.25 }, { n: NOTE.Bb2, d: 0.25 },
            ],
            lead: [
                { n: NOTE.A4, d: 0.25 }, { n: NOTE.C5, d: 0.25 }, { n: NOTE.D5, d: 0.25 }, { n: NOTE.C5, d: 0.25 },
                { n: NOTE.A4, d: 0.25 }, { n: NOTE.G4, d: 0.25 }, { n: NOTE.A4, d: 0.5 },
                { n: NOTE.Bb4, d: 0.25 }, { n: NOTE.A4, d: 0.25 }, { n: NOTE.G4, d: 0.25 }, { n: NOTE.F4, d: 0.25 },
                { n: NOTE.G4, d: 0.5 }, { n: NOTE.A4, d: 0.5 },
            ],
            pads: [
                { notes: [NOTE.A3, NOTE.C4, NOTE.E4], d: 2 },
                { notes: [NOTE.G3, NOTE.Bb3, NOTE.D4], d: 2 },
                { notes: [NOTE.F3, NOTE.A3, NOTE.C4], d: 2 },
                { notes: [NOTE.G3, NOTE.Bb3, NOTE.D4], d: 2 },
            ]
        },
        notes: parsePatterns(155, [
            // Intro
            "----------------", "----------------",
            // Immediate intensity
            "0-1-2-3-0-1-2-3", "3-2-1-0-3-2-1-0",
            "01230123--------", "--------32103210",
            "a-b-c-d-a-b-c-d", "e-f-a-b-e-f-a-b",
            // 16th runs
            "0123321001233210", "3210012332100123",
            "0-1-23-0-1-23-0", "3-2-10-3-2-10-3",
            // Brutal doubles
            "a-b-a-b-a-b-a-b", "c-d-c-d-e-f-e-f",
            "ab--cd--ab--ef--", "a-c-b-d-a-e-b-f",
            // Maximum intensity
            "01232-3-10302-1-", "3-0-21013-2-0123",
            "a-b-0123a-b-3210", "c-d-01-23-cd-01-",
            "0123012301230123", "3210321032103210",
            // All lanes
            "*---*---*---*---", "0123*---3210*---",
            "a-b-*-a-b-*-a-b", "*---0-1-2-3-*---",
            // Finale
            "0-1-2-3-a-b-c-d", "01233210a-b-a-b-",
            "0123--------0123", "--------*-------",
            "----------------",
        ])
    }
];

// Assign unlocked status (level 0 always unlocked)
LEVELS.forEach((level, i) => {
    level.unlocked = (i === 0);
});
