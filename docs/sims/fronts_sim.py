"""
Monte Carlo simulation of four muster-flag designs for Border Empires.

Shared rules (agreed with the designer):
  * Every tile is still a separate battle (tile-by-tile spectacle stays).
  * Commit rule: odds = (kA / kD)^2 * o0, kA = commit / BASE, kD = defense factor
    (1.0 for an undefended settled tile). Committed attacker MP is ALWAYS lost.
  * Base cost of a settled tile BASE = 30; at 1x commit vs undefended tile p0 = 40%.
  * No global tick: battles run continuously; one flag launches a battle every
    CYCLE_S seconds (30s combat lock + ~2 tiles transit + tick ~= 40s, up to 3 in
    flight -> effective ~15s cadence).
  * Attacker commit policy (same for every design): aim for ~55% win chance given
    the current defense factor, i.e. the "match their defense" rule, capped by flag.

Designs:
  S1 Shield  - defender HOLD flag within radius auto-MATCHES the attacker's commit
               per battle (up to what it holds). kD = 1 + cD/BASE. Defender pays cD.
  S2 Garrison- defender flag MP is a standing garrison: kD = sqrt(1 + G/BASE).
               Not spent per battle; attrition: loses 60% of cA when a tile falls,
               25% of cA when an attack is repelled.
  S3 Duel    - opposing flags within range fight each other first by Lanchester
               square-law attrition (no tile battles while engaged); the survivor
               then pushes tiles normally with what is left.
  S4 Auction - both flags auto-commit a fixed FRACTION (10%) of their current
               amount per battle (attacker at least BASE). kD = 1 + cD/BASE.
Baseline S0  - today's model with the new commit rule, flags don't interact.
"""
import math, random, statistics as st

BASE = 30.0
P0 = 0.40
O0 = P0 / (1 - P0)
TARGET_P = 0.55
TARGET_ODDS = TARGET_P / (1 - TARGET_P)
CYCLE_S = 15.0
MAX_BATTLES = 5000


def p_win(kA, kD):
    odds = (kA / kD) ** 2 * O0
    return odds / (1 + odds)


def attacker_commit(flagA, kD):
    kA_needed = kD * math.sqrt(TARGET_ODDS / O0)
    c = max(BASE, kA_needed * BASE)
    return min(c, flagA)


def run(design, A, D, reinforce=None, rng=random):
    """Returns tiles, atk_spent, def_spent, battles, minutes."""
    flagA, flagD = float(A), float(D)
    tiles = battles = 0
    atk_spent = def_spent = 0.0
    t = 0.0
    reinforced = False

    if design == "S3" and flagD > 0:
        # Lanchester square law: survivor keeps sqrt(|A^2 - D^2|)
        # duration: roughly proportional to smaller force; assume 1 MP/s mutual burn scale
        if flagA > flagD:
            rem = math.sqrt(flagA ** 2 - flagD ** 2)
            atk_spent += flagA - rem
            def_spent += flagD
            t += flagD / 2.0  # seconds of clash
            flagA, flagD = rem, 0.0
        else:
            rem = math.sqrt(max(0.0, flagD ** 2 - flagA ** 2))
            atk_spent += flagA
            def_spent += flagD - rem
            t += flagA / 2.0
            flagA, flagD = 0.0, rem

    while flagA >= BASE and battles < MAX_BATTLES:
        if reinforce and not reinforced and battles >= reinforce[0]:
            flagD += reinforce[1]
            reinforced = True
            if design == "S3" and flagD > 0:
                if flagA > flagD:
                    rem = math.sqrt(flagA ** 2 - flagD ** 2)
                    atk_spent += flagA - rem; def_spent += flagD; flagA, flagD = rem, 0.0
                else:
                    rem = math.sqrt(max(0.0, flagD ** 2 - flagA ** 2))
                    atk_spent += flagA; def_spent += flagD - rem; flagA, flagD = 0.0, rem
                    break
        cD = 0.0
        if design in ("S0", "S3") or flagD <= 0:
            kD = 1.0
            cA = attacker_commit(flagA, kD)
        elif design == "S1":
            # defender will match; attacker knows kD = 1 + min(flagD, cA)/BASE.
            # best response: try commits and pick the one with best win-per-MP
            best = None
            for mult in (1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32):
                c = min(flagA, mult * BASE)
                cd = min(flagD, c)
                p = p_win(c / BASE, 1 + cd / BASE)
                score = p / c
                if best is None or score > best[0]:
                    best = (score, c, cd)
            _, cA, cD = best
            kD = 1 + cD / BASE
        elif design == "S2":
            kD = math.sqrt(1 + flagD / BASE)
            cA = attacker_commit(flagA, kD)
        elif design == "S4":
            cA = max(BASE, 0.10 * flagA)
            cA = min(cA, flagA)
            cD = min(flagD, 0.10 * flagD if flagD > BASE else flagD)
            kD = 1 + cD / BASE
        kA = cA / BASE
        p = p_win(kA, kD)
        won = rng.random() < p
        battles += 1
        t += CYCLE_S
        flagA -= cA; atk_spent += cA
        if design in ("S1", "S4"):
            flagD -= cD; def_spent += cD
        elif design == "S2" and flagD > 0:
            loss = min(flagD, (0.60 if won else 0.25) * cA)
            flagD -= loss; def_spent += loss
        if won:
            tiles += 1
    return tiles, atk_spent, def_spent, battles, t / 60.0


SCENARIOS = [
    ("A. Undefended push (600 vs no flag)", 600, 0, None),
    ("B. Equal flags (600 vs 600, defender offline)", 600, 600, None),
    ("C. Defender outnumbered (600 vs 300)", 600, 300, None),
    ("D. Defender invests more (600 vs 900)", 600, 900, None),
    ("E. Late counter (600 vs 0, +600 after 5 battles)", 600, 0, (5, 600)),
    ("F. Whale (10,000 vs 1,500)", 10000, 1500, None),
]
DESIGNS = ["S0", "S1", "S2", "S3", "S4"]
NAMES = {"S0": "Baseline (today + commit rule)", "S1": "Shield (defender matches commit)",
         "S2": "Garrison (standing defense)", "S3": "Duel (flags fight first)", "S4": "Auction (both commit 10%)"}

N = 3000
random.seed(7)
results = {}
for d in DESIGNS:
    for name, A, D, rf in SCENARIOS:
        rows = [run(d, A, D, rf) for _ in range(N)]
        tiles = [r[0] for r in rows]
        results[(d, name)] = dict(
            tiles=st.mean(tiles), p10=sorted(tiles)[N // 10], p90=sorted(tiles)[9 * N // 10],
            atk=st.mean(r[1] for r in rows), dfn=st.mean(r[2] for r in rows),
            battles=st.mean(r[3] for r in rows), minutes=st.mean(r[4] for r in rows))

for name, *_ in SCENARIOS:
    print(f"\n## {name}")
    print(f"{'design':34s} {'tiles':>6s} {'p10-p90':>9s} {'atk MP':>8s} {'def MP':>8s} {'battles':>8s} {'min':>6s}")
    for d in DESIGNS:
        r = results[(d, name)]
        print(f"{NAMES[d]:34s} {r['tiles']:6.1f} {r['p10']:4d}-{r['p90']:<4d} {r['atk']:8.0f} {r['dfn']:8.0f} {r['battles']:8.1f} {r['minutes']:6.1f}")

# Proportionality sweep: attacker 600, defender 0..1200
print("\n## Proportionality: tiles won by a 600 MP attacker vs defender flag size")
sizes = [0, 150, 300, 450, 600, 900, 1200]
print(f"{'design':34s} " + " ".join(f"{s:>6d}" for s in sizes))
sweep = {}
for d in DESIGNS:
    vals = []
    for s in sizes:
        vals.append(st.mean(run(d, 600, s)[0] for _ in range(1500)))
    sweep[d] = vals
    print(f"{NAMES[d]:34s} " + " ".join(f"{v:6.1f}" for v in vals))
