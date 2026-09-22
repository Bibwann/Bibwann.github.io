# -*- coding: utf-8 -*-
"""
Generates the project thumbnails for the portfolio.

Every thumbnail shares the SAME skeleton (deep-space ground, faint grid, accent
halo, horizon arc, corner brackets) so the projects grid reads as one system.
Only the accent colour and the central line-art motif change from one project
to the next. That is the whole point: harmony first, identity second.
"""
import math
import os
import random

OUT = os.path.join("assets", "img", "thumbs")
W, H = 640, 400
CX, CY = 320, 190


def stars(seed, n=42):
    """Deterministic starfield — same project always gets the same sky."""
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        x = rnd.uniform(6, W - 6)
        y = rnd.uniform(6, H - 40)
        r = rnd.choice([0.7, 0.9, 1.1, 1.4])
        o = rnd.uniform(0.18, 0.62)
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="#fff" opacity="{o:.2f}"/>')
    return "".join(out)


def skeleton(accent, motif, seed, label):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="{label}">
<defs>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#101026"/><stop offset="1" stop-color="#06060f"/>
</linearGradient>
<radialGradient id="halo" cx="50%" cy="44%" r="62%">
<stop offset="0" stop-color="{accent}" stop-opacity=".26"/>
<stop offset="1" stop-color="{accent}" stop-opacity="0"/>
</radialGradient>
<pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
<path d="M32 0H0V32" fill="none" stroke="#ffffff" stroke-opacity=".05" stroke-width="1"/>
</pattern>
<filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
<feGaussianBlur stdDeviation="7" result="b"/>
<feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
</defs>
<rect width="{W}" height="{H}" fill="url(#sky)"/>
<rect width="{W}" height="{H}" fill="url(#grid)"/>
{stars(seed)}
<rect width="{W}" height="{H}" fill="url(#halo)"/>
<path d="M-40 366 Q320 296 680 366" fill="none" stroke="{accent}" stroke-opacity=".34" stroke-width="1.5"/>
<path d="M-40 384 Q320 320 680 384" fill="none" stroke="{accent}" stroke-opacity=".16" stroke-width="1"/>
<g filter="url(#glow)" opacity=".95">
{motif}
</g>
<g stroke="{accent}" stroke-opacity=".5" stroke-width="2" fill="none" stroke-linecap="square">
<path d="M18 40V18h22"/><path d="M{W-40} 18h22v22"/>
<path d="M{W-18} {H-40}v22h-22"/><path d="M40 {H-18}H18v-22"/>
</g>
</svg>'''


def L(accent, body, width=2.6):
    """Line-art group in the accent colour."""
    return (f'<g fill="none" stroke="{accent}" stroke-width="{width}" '
            f'stroke-linecap="round" stroke-linejoin="round">{body}</g>')


def F(accent, body, opacity="1"):
    return f'<g fill="{accent}" opacity="{opacity}">{body}</g>'


# ── motifs ────────────────────────────────────────────────────────────────────

def m_aegis(a):
    """A mind: concentric rings, orbiting agents, a core."""
    p = []
    for r, o in ((110, .30), (82, .48), (54, .70)):
        p.append(f'<circle cx="{CX}" cy="{CY}" r="{r}" stroke-opacity="{o}"/>')
    body = "".join(p)
    nodes = []
    for i in range(7):
        ang = -math.pi / 2 + i * 2 * math.pi / 7
        x, y = CX + 110 * math.cos(ang), CY + 110 * math.sin(ang)
        body += f'<line x1="{CX}" y1="{CY}" x2="{x:.1f}" y2="{y:.1f}" stroke-opacity=".28"/>'
        nodes.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7"/>')
    return L(a, body) + F(a, "".join(nodes)) + F(a, f'<circle cx="{CX}" cy="{CY}" r="17"/>')


def m_undergears(a):
    """Interlocking gears over a descending shaft."""
    def gear(cx, cy, r, teeth, inner):
        d = []
        for i in range(teeth):
            ang = i * 2 * math.pi / teeth
            x1, y1 = cx + r * math.cos(ang), cy + r * math.sin(ang)
            x2, y2 = cx + (r + 13) * math.cos(ang), cy + (r + 13) * math.sin(ang)
            d.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}"/>')
        d.append(f'<circle cx="{cx}" cy="{cy}" r="{r}"/>')
        d.append(f'<circle cx="{cx}" cy="{cy}" r="{inner}" stroke-opacity=".55"/>')
        return "".join(d)
    shaft = ('<path d="M232 86v228" stroke-opacity=".22"/>'
             '<path d="M408 86v228" stroke-opacity=".22"/>')
    return L(a, shaft + gear(258, 152, 48, 10, 18) + gear(384, 232, 62, 12, 24))


def m_beatforge(a):
    """Waveform bars struck on an anvil line."""
    hs = [34, 62, 96, 58, 122, 74, 142, 88, 110, 48, 78, 36]
    bars = []
    x = 152
    for h in hs:
        bars.append(f'<rect x="{x}" y="{262 - h}" width="14" height="{h}" rx="6"/>')
        x += 28
    spark = ('<path d="M320 62l12 34 34 12-34 12-12 34-12-34-34-12 34-12z" stroke-opacity=".7"/>')
    return F(a, "".join(bars), ".92") + L(a, '<path d="M140 276h360"/>' + spark)


def m_solar(a):
    """A hand skeleton steering an orbit."""
    orbit = ('<ellipse cx="404" cy="168" rx="126" ry="46" stroke-opacity=".45" '
             'transform="rotate(-18 404 168)"/>'
             '<circle cx="404" cy="168" r="26"/>'
             '<circle cx="516" cy="140" r="9" stroke-opacity=".8"/>')
    hand = ('<path d="M150 292V196a13 13 0 0126 0v52"/>'
            '<path d="M176 240v-74a13 13 0 0126 0v70"/>'
            '<path d="M202 236v-64a13 13 0 0126 0v66"/>'
            '<path d="M228 240v-46a13 13 0 0126 0v58"/>'
            '<path d="M150 254l-22 22a16 16 0 000 24l34 34h66a30 30 0 0026-30"/>')
    return L(a, orbit + hand)


def m_tinyml(a):
    """A microcontroller reading a gesture trace."""
    chip = '<rect x="240" y="196" width="112" height="88" rx="10"/>' \
           '<rect x="268" y="224" width="56" height="32" rx="5" stroke-opacity=".55"/>'
    pins = "".join(
        f'<line x1="{x}" y1="284" x2="{x}" y2="306" stroke-opacity=".6"/>'
        f'<line x1="{x}" y1="174" x2="{x}" y2="196" stroke-opacity=".6"/>'
        for x in range(258, 350, 18))
    trace = ('<path d="M112 128C140 84 168 84 196 128S252 172 280 128'
             'S336 76 364 124S420 170 448 122S504 82 528 116" stroke-opacity=".85"/>')
    return L(a, chip + pins + trace)


def m_erp(a):
    """Three stacked slabs and the migration arrow that lifts them."""
    slabs = "".join(
        f'<path d="M{CX - 118} {y}l118-46 118 46-118 46z" stroke-opacity="{o}"/>'
        for y, o in ((288, ".45"), (226, ".7"), (164, "1")))
    arrow = '<path d="M462 268V132" stroke-opacity=".8"/><path d="M444 152l18-22 18 22" stroke-opacity=".8"/>'
    return L(a, slabs + arrow)


def m_valorant(a):
    """A crosshair locked on a tactical grid."""
    cross = ('<circle cx="320" cy="196" r="74" stroke-opacity=".5"/>'
             '<circle cx="320" cy="196" r="30"/>'
             '<path d="M320 86v52M320 254v52M170 196h52M418 196h52"/>')
    ticks = "".join(f'<path d="M{x} 300v16" stroke-opacity=".3"/>' for x in range(140, 520, 38))
    return L(a, cross + ticks) + F(a, '<circle cx="320" cy="196" r="6"/>')


def m_whiskers(a):
    """A cat silhouette guarding a blade."""
    cat = ('<path d="M226 300v-74a58 58 0 01116 0v74"/>'
           '<path d="M226 240l-16-58 44 24"/><path d="M342 240l16-58-44 24"/>'
           '<path d="M256 262h16M296 262h16"/><path d="M270 288q14 12 28 0"/>')
    blade = ('<path d="M396 306l96-152" stroke-opacity=".85"/>'
             '<path d="M376 300l34 22" stroke-opacity=".7"/>'
             '<path d="M470 128l30 12-12 30" stroke-opacity=".7"/>')
    return L(a, cat + blade)


def m_potify(a):
    """A playlist and a play head."""
    rows = "".join(
        f'<rect x="150" y="{y}" width="{w}" height="12" rx="6"/>'
        for y, w in ((142, 210), (176, 168), (210, 196), (244, 150), (278, 182)))
    play = '<circle cx="470" cy="210" r="56" stroke-opacity=".85"/>' \
           '<path d="M452 184l44 26-44 26z" stroke-opacity=".95"/>'
    return F(a, rows, ".85") + L(a, play)


def m_mongo(a):
    """Containers around a database cylinder."""
    db = ('<ellipse cx="320" cy="140" rx="62" ry="22"/>'
          '<path d="M258 140v104q0 22 62 22t62-22V140"/>'
          '<path d="M258 190q0 22 62 22t62-22" stroke-opacity=".5"/>')
    boxes = "".join(
        f'<rect x="{x}" y="288" width="58" height="42" rx="7" stroke-opacity=".6"/>'
        for x in (150, 226, 356, 432))
    return L(a, db + boxes)


def m_kanban(a):
    """Three kanban columns."""
    cols = []
    for i, x in enumerate((150, 262, 374)):
        cols.append(f'<rect x="{x}" y="118" width="116" height="192" rx="10" stroke-opacity=".5"/>')
    cards = []
    for x, ys in ((150, (140, 188)), (262, (140, 188, 236)), (374, (140,))):
        for y in ys:
            cards.append(f'<rect x="{x + 14}" y="{y}" width="88" height="34" rx="6"/>')
    return L(a, "".join(cols)) + F(a, "".join(cards), ".8")


def m_pendu(a):
    """The gallows and the pipeline that deploys it."""
    g = ('<path d="M168 310h132M212 310V110h94M306 110v42"/>'
         '<circle cx="306" cy="172" r="20"/>'
         '<path d="M306 192v52M306 210l-26 22M306 210l26 22M306 244l-22 34M306 244l22 34"/>')
    pipe = "".join(f'<circle cx="{x}" cy="150" r="11" stroke-opacity=".7"/>' for x in (398, 452, 506))
    pipe += '<path d="M409 150h32M463 150h32" stroke-opacity=".45"/>'
    return L(a, g + pipe)


def m_idle(a):
    """An exponential curve seeding cells."""
    curve = '<path d="M140 300q120 4 176-56t184-124" stroke-opacity=".9"/>'
    cells = "".join(
        f'<circle cx="{x}" cy="{y}" r="{r}" stroke-opacity=".7"/>'
        for x, y, r in ((186, 292, 9), (258, 274, 13), (330, 232, 18), (410, 172, 24), (486, 128, 30)))
    return L(a, curve + cells)


def m_pvz(a):
    """A grid map and the thing that walks it."""
    grid = "".join(f'<path d="M{x} 120v186" stroke-opacity=".22"/>' for x in range(160, 501, 48))
    grid += "".join(f'<path d="M160 {y}h340" stroke-opacity=".22"/>' for y in range(120, 307, 46))
    walker = ('<circle cx="256" cy="190" r="16"/><path d="M256 206v40M240 218h32M248 246l-10 28M264 246l10 28"/>')
    target = '<rect x="400" y="212" width="46" height="46" rx="6" stroke-opacity=".9"/>'
    return L(a, grid + walker + target)


def m_pong(a):
    """Two paddles and the ball's trail."""
    paddles = '<rect x="146" y="148" width="16" height="96" rx="8"/><rect x="478" y="196" width="16" height="96" rx="8"/>'
    net = "".join(f'<path d="M320 {y}v22" stroke-opacity=".35"/>' for y in range(112, 301, 38))
    trail = '<path d="M170 196l150 60 150-14" stroke-opacity=".5" stroke-dasharray="6 10"/>'
    return F(a, paddles, ".9") + L(a, net + trail) + F(a, '<circle cx="470" cy="242" r="11"/>')


def m_rollaball(a):
    """A ball rolling a platform."""
    plat = '<path d="M140 300h360" /><path d="M186 300l40-40h230l-40 40" stroke-opacity=".45"/>'
    ball = '<circle cx="290" cy="228" r="34"/><path d="M262 214q28 20 56 0" stroke-opacity=".5"/>'
    pickups = "".join(f'<rect x="{x}" y="196" width="18" height="18" rx="4" stroke-opacity=".75" transform="rotate(45 {x+9} 205)"/>' for x in (388, 432))
    return L(a, plat + ball + pickups)


def m_steamdb(a):
    """Stacked database cylinders."""
    out = []
    for i, y in enumerate((130, 200, 270)):
        o = (".55", ".75", "1")[i]
        out.append(f'<ellipse cx="320" cy="{y}" rx="84" ry="26" stroke-opacity="{o}"/>')
        out.append(f'<path d="M236 {y}v44q0 26 84 26t84-26v-44" stroke-opacity="{o}"/>')
    return L(a, "".join(out))


def m_cerber(a):
    """A shield stopping inbound data streams, with a keyhole and three watch-points."""
    shield = (f'<path d="M{CX-92} {CY-98} L{CX+92} {CY-98} L{CX+92} {CY-22} '
              f'Q{CX+92} {CY+68} {CX} {CY+116} '
              f'Q{CX-92} {CY+68} {CX-92} {CY-22} Z"/>')
    inner = (f'<path d="M{CX-68} {CY-76} L{CX+68} {CY-76} L{CX+68} {CY-20} '
             f'Q{CX+68} {CY+48} {CX} {CY+86} '
             f'Q{CX-68} {CY+48} {CX-68} {CY-20} Z" stroke-opacity=".34"/>')
    keyhole = f'<circle cx="{CX}" cy="{CY-16}" r="17"/><path d="M{CX-10} {CY} L{CX-15} {CY+40} L{CX+15} {CY+40} L{CX+10} {CY} Z"/>'
    # Pas de "tetes" : avec la serrure juste en dessous, trois points formaient un visage.
    heads = ""
    links = ""
    # Flux entrants, interceptes au bord du bouclier.
    flux = []
    for y in (CY - 62, CY - 6, CY + 50):
        flux.append(f'<path d="M40 {y} H{CX-120}" stroke-opacity=".45" stroke-dasharray="14 10"/>')
        flux.append(f'<path d="M{W-40} {y} H{CX+120}" stroke-opacity=".45" stroke-dasharray="14 10"/>')
        for sx in (CX - 112, CX + 112):
            d = 9
            flux.append(f'<path d="M{sx-d} {y-d} l{2*d} {2*d} M{sx-d} {y+d} l{2*d} {-2*d}" stroke-opacity=".8"/>')
    return (L(a, shield + inner + "".join(flux) + links, 2.6)
            + L(a, keyhole, 2.2)
            + F(a, heads))


PROJECTS = [
    ("aegis",       "#8b5cf6", m_aegis,      "Aegis — IA souveraine"),
    ("undergears",  "#3dff85", m_undergears, "UnderGears — Sous les Rouages"),
    ("cerber",      "#ef4444", m_cerber,     "Cerber — bouclier de vie privee"),
    ("beatforge",   "#ec4899", m_beatforge,  "BeatForge"),
    ("solar",       "#06b6d4", m_solar,      "Systeme solaire en hand tracking"),
    ("tinyml",      "#f59e0b", m_tinyml,     "Reconnaissance de gestes TinyML"),
    ("erp",         "#3b82f6", m_erp,        "Migration ERP Valiance"),
    ("valorant",    "#ff4655", m_valorant,   "Valorant Tactical Protocol"),
    ("whiskers",    "#fb923c", m_whiskers,   "Whiskers Rebellion II"),
    ("potify",      "#1db954", m_potify,     "Potify"),
    ("mongo",       "#10b981", m_mongo,      "MongoDB Docker"),
    ("kanban",      "#6366f1", m_kanban,     "Gestionnaire de taches Python MVC"),
    ("pendu",       "#22d3ee", m_pendu,      "Jeu du pendu Docker CI/CD"),
    ("idle",        "#84cc16", m_idle,       "Evolution Idle"),
    ("pvz",         "#65a30d", m_pvz,        "Player vs Zombie"),
    ("pong",        "#e2e8f0", m_pong,       "Pong Python"),
    ("rollaball",   "#38bdf8", m_rollaball,  "Roll a Ball Unity"),
    ("steamdb",     "#94a3b8", m_steamdb,    "BDD Steam Docker"),
]

os.makedirs(OUT, exist_ok=True)
for i, (name, accent, motif, label) in enumerate(PROJECTS):
    svg = skeleton(accent, motif(accent), seed=i * 977 + 13, label=label)
    with open(os.path.join(OUT, name + ".svg"), "w", encoding="utf-8") as f:
        f.write(svg)
    print(f"{name}.svg  {accent}  {len(svg)} bytes")

print(f"\n{len(PROJECTS)} thumbnails -> {OUT}")
