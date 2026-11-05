#!/usr/bin/env python3
"""Génère themes.css : palettes de thèmes connus, ramenées au contrat de tokens my-claw.

Les valeurs de base viennent des fichiers source de chaque projet (voir la recherche).
Ce que ce script ajoute, parce qu'un thème d'éditeur ne les fournit pas :
  - les paliers de surface (surface-2, surface-3), dérivés par mélange vers l'encre ;
  - un `faint` remonté à 4.5:1, parce qu'ici le faible est de l'horodatage, donc du texte ;
  - un `muted` écarté du `faint` d'au moins 1.3:1, sinon la hiérarchie disparaît ;
  - les fonds dérivés (bulle user, code, diff) et la paire accent/encre posée dessus.
"""

def hx(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def tohex(t):
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(c))) for c in t)

def lum(h):
    r, g, b = (c / 255 for c in hx(h))
    f = lambda u: u / 12.92 if u <= 0.03928 else ((u + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)

def mix(a, b, t):
    pa, pb = hx(a), hx(b)
    return tohex([pa[i] + (pb[i] - pa[i]) * t for i in range(3)])

def push(fg, bg, target, step=0.02):
    """Éloigne fg de bg jusqu'à atteindre `target` de contraste."""
    away = '#000000' if lum(bg) > 0.5 else '#ffffff'
    cur = fg
    for _ in range(120):
        if ratio(cur, bg) >= target:
            return cur
        cur = mix(cur, away, step)
    return cur

def pull(fg, bg, target, step=0.02):
    """Rapproche fg de bg jusqu'à descendre sous `target` (garde la hiérarchie)."""
    cur = fg
    for _ in range(120):
        if ratio(cur, bg) <= target:
            return cur
        cur = mix(cur, bg, step)
    return cur

# nom, libellé, sombre|clair, bg, surface, line, ink, muted, faint, accent, ok, warn, danger
THEMES = [
    ('sable', 'Sable', 'light', dict(
        bg='#f6f4f1', surface='#fdfbf8', line='#e1dcd4', ink='#191714',
        muted='#56504a', faint='#665f57', accent='#8a3a2e',
        ok='#2f6b47', warn='#8a5a10', danger='#a51f4b', live='#8a3a2e')),
    ('sable', 'Sable', 'dark', dict(
        bg='#14120f', surface='#1b1815', line='#2a261f', ink='#eae5dd',
        muted='#a0988c', faint='#8b8377', accent='#e08a72',
        ok='#6cc08d', warn='#d8a94f', danger='#ef6a86', live='#e08a72')),

    ('lin', 'Lin', 'light', dict(
        bg='#f5f4ef', surface='#fcfbf7', line='#dfddd3', ink='#191a15',
        muted='#53544a', faint='#64655a', accent='#5c6b32',
        ok='#2f6b47', warn='#8a5a10', danger='#a82f28', live='#5c6b32')),
    ('lin', 'Lin', 'dark', dict(
        bg='#12130f', surface='#191a16', line='#282a22', ink='#e8e9e1',
        muted='#a8a39a', faint='#948f86', accent='#a8bd6e',
        ok='#6cc08d', warn='#d8a94f', danger='#f08379', live='#a8bd6e')),

    ('charbon', 'Charbon', 'light', dict(
        bg='#f6f5f3', surface='#ffffff', line='#e0ded8', ink='#181614',
        muted='#544f49', faint='#645f58', accent='#242220',
        ok='#2f6b47', warn='#8a5a10', danger='#a82f28', live='#b4762a')),
    ('charbon', 'Charbon', 'dark', dict(
        bg='#131210', surface='#1a1917', line='#282622', ink='#e9e6e1',
        muted='#a8a39a', faint='#948f86', accent='#e8e4dd',
        ok='#6cc08d', warn='#d8a94f', danger='#f08379', live='#e0a45c')),

    ('catppuccin', 'Catppuccin', 'light', dict(
        bg='#eff1f5', surface='#ffffff', line='#bcc0cc', ink='#4c4f69',
        muted='#6c6f85', faint='#8c8fa1', accent='#8839ef',
        ok='#40a02b', warn='#df8e1d', danger='#d20f39', live='#8839ef')),
    ('catppuccin', 'Catppuccin', 'dark', dict(
        bg='#1e1e2e', surface='#262637', line='#45475a', ink='#cdd6f4',
        muted='#a6adc8', faint='#7f849c', accent='#cba6f7',
        ok='#a6e3a1', warn='#f9e2af', danger='#f38ba8', live='#cba6f7')),

    ('gruvbox', 'Gruvbox', 'light', dict(
        bg='#fbf1c7', surface='#f7edc3', line='#d5c4a1', ink='#3c3836',
        muted='#7c6f64', faint='#a89984', accent='#076678',
        ok='#79740e', warn='#b57614', danger='#9d0006', live='#076678')),
    ('gruvbox', 'Gruvbox', 'dark', dict(
        bg='#282828', surface='#32302f', line='#504945', ink='#ebdbb2',
        muted='#a89984', faint='#7c6f64', accent='#fe8019',
        ok='#b8bb26', warn='#fabd2f', danger='#fb4934', live='#fe8019')),

    ('rose-pine', 'Rosé Pine', 'light', dict(
        bg='#faf4ed', surface='#fffaf3', line='#f2e9e1', ink='#464261',
        muted='#797593', faint='#9893a5', accent='#907aa9',
        ok='#6d8f89', warn='#ea9d34', danger='#b4637a', live='#907aa9')),
    ('rose-pine', 'Rosé Pine', 'dark', dict(
        bg='#191724', surface='#1f1d2e', line='#26233a', ink='#e0def4',
        muted='#908caa', faint='#6e6a86', accent='#c4a7e7',
        ok='#95b1ac', warn='#f6c177', danger='#eb6f92', live='#c4a7e7')),

    ('everforest', 'Everforest', 'light', dict(
        bg='#fdf6e3', surface='#f8f2dd', line='#efebd4', ink='#5c6a72',
        muted='#829181', faint='#a6b0a0', accent='#3a94c5',
        ok='#8da101', warn='#dfa000', danger='#f85552', live='#3a94c5')),
    ('everforest', 'Everforest', 'dark', dict(
        bg='#2d353b', surface='#343f44', line='#3d484d', ink='#d3c6aa',
        muted='#859289', faint='#7a8478', accent='#7fbbb3',
        ok='#a7c080', warn='#dbbc7f', danger='#e67e80', live='#7fbbb3')),

    ('kanagawa', 'Kanagawa', 'light', dict(
        bg='#f2ecbc', surface='#f7f1c8', line='#d5cea3', ink='#545464',
        muted='#716e61', faint='#8a8980', accent='#4d699b',
        ok='#6f894e', warn='#de9800', danger='#c84053', live='#4d699b')),
    ('kanagawa', 'Kanagawa', 'dark', dict(
        bg='#1F1F28', surface='#2A2A37', line='#363646', ink='#DCD7BA',
        muted='#C8C093', faint='#727169', accent='#7E9CD8',
        ok='#98BB6C', warn='#E6C384', danger='#E46876', live='#7E9CD8')),

    ('tokyo-night', 'Tokyo Night', 'light', dict(
        bg='#e1e2e7', surface='#eef0f5', line='#c4c8da', ink='#3760bf',
        muted='#6172b0', faint='#848cb5', accent='#2e7de9',
        ok='#587539', warn='#8c6c3e', danger='#f52a65', live='#2e7de9')),
    ('tokyo-night', 'Tokyo Night', 'dark', dict(
        bg='#1a1b26', surface='#1f2335', line='#292e42', ink='#c0caf5',
        muted='#a9b1d6', faint='#565f89', accent='#7aa2f7',
        ok='#9ece6a', warn='#e0af68', danger='#f7768e', live='#7aa2f7')),

    ('flexoki', 'Flexoki', 'light', dict(
        bg='#fffcf0', surface='#f7f4e8', line='#dad8ce', ink='#100f0f',
        muted='#6f6e69', faint='#b7b5ac', accent='#24837b',
        ok='#66800b', warn='#ad8301', danger='#af3029', live='#24837b')),
    ('flexoki', 'Flexoki', 'dark', dict(
        bg='#100f0f', surface='#1c1b1a', line='#343331', ink='#cecdc3',
        muted='#878580', faint='#575653', accent='#3aa99f',
        ok='#879a39', warn='#d0a215', danger='#d14d41', live='#3aa99f')),
]

def build(t):
    bg, ink = t['bg'], t['ink']
    dark = lum(bg) < 0.22
    toward = '#ffffff' if dark else '#000000'

    # Les paliers partent de la SURFACE, pas du fond. Dérivés du fond, ils
    # retombaient à 4 unités de la surface et les trois élévations ne se
    # lisaient plus : une carte d'outil avait l'air posée à plat.
    surface_2 = mix(t['surface'], toward, 0.055 if dark else 0.035)
    surface_3 = mix(surface_2, toward, 0.055 if dark else 0.035)

    muted = push(t['muted'], bg, 4.6)
    faint = push(t['faint'], bg, 4.5)
    # hiérarchie : faint doit rester visiblement plus faible que muted
    if ratio(faint, bg) > ratio(muted, bg) - 1.2:
        faint = pull(faint, bg, ratio(muted, bg) - 1.3)
    faint = push(faint, bg, 4.5)

    accent = push(t['accent'], bg, 4.5)
    accent_ink = '#ffffff' if ratio('#ffffff', accent) >= 3.4 else '#100f0f'
    accent_ink = push(accent_ink, accent, 4.5)
    accent_soft = mix(t['surface'], accent, 0.09 if not dark else 0.13)

    ok = push(t['ok'], bg, 4.5)
    warn = push(t['warn'], bg, 4.5)
    danger = push(t['danger'], bg, 4.5)
    live = push(t['live'], bg, 4.5)

    code_bg = mix(bg, toward, 0.045) if not dark else mix(bg, '#000000', 0.45)
    code_ink = push(ink, code_bg, 7.0)

    # En sombre, mélanger le fond avec l'accent donne de la boue : le sable
    # #14120f + l'oxblood donnaient un brun #35251f, qui se lit comme une
    # salissure et non comme une surface. Une bulle se distingue par une
    # élévation neutre, la couleur reste à l'accent posé dessus.
    msg_bg = mix(t['surface'], accent, 0.11) if not dark else mix(surface_2, '#ffffff', 0.045)
    msg_ink = push(ink, msg_bg, 9.0)

    add_bg = mix(bg, ok, 0.13)
    del_bg = mix(bg, danger, 0.13)
    hunk_bg = mix(bg, accent, 0.07)

    return dict(**{'bg': bg, 'surface': t['surface'], 'surface-2': surface_2, 'surface-3': surface_3,
                   'line': t['line'], 'ink': ink, 'muted': muted, 'faint': faint,
                   'accent': accent, 'accent-ink': accent_ink, 'accent-soft': accent_soft,
                   'ok': ok, 'warn': warn, 'danger': danger, 'live': live,
                   'code-bg': code_bg, 'code-ink': code_ink,
                   'msg-user-bg': msg_bg, 'msg-user-ink': msg_ink,
                   'diff-add': ok, 'diff-del': danger, 'diff-add-bg': add_bg,
                   'diff-del-bg': del_bg, 'diff-hunk-bg': hunk_bg,
                   'focus': accent,
                   'overlay': 'rgba(0,0,0,0.62)' if dark else 'rgba(25,22,20,0.38)'})

def amoled(t):
    """Le sombre AMOLED : fond à #000, donc les pixels de la dalle s'éteignent.

    Trois choses ne survivent pas au passage au noir absolu :
      - la surface, qui disparaît si elle reste sombre : elle remonte à #0a0a0a,
        assez pour qu'une carte d'outil se détache, assez peu pour ne pas
        rallumer une grande zone ;
      - l'encre, qui brûle : du blanc pur sur du noir pur produit un halo
        (halation) et un défilement qui bave. On la plafonne à ~14:1 ;
      - le fond du code, qui doit rester SOUS la surface, sinon les blocs de
        code flottent au-dessus des cartes.
    """
    ink = t['ink']
    # plafonner l'encre : on la rapproche du noir jusqu'à ~14:1, jamais en dessous de 4.5
    cur = ink
    for _ in range(80):
        if ratio(cur, '#000000') <= 14.0:
            break
        cur = mix(cur, '#000000', 0.02)
    ink = push(cur, '#000000', 7.0)

    out = dict(t)
    out.update({
        'bg': '#000000',
        'surface': '#0d0d0d',
        'surface-2': '#171717',
        'surface-3': '#212121',
        'line': '#2e2e2e',
        'ink': ink,
        'code-bg': '#070707',
        'msg-user-bg': '#161616',
        'overlay': 'rgba(0,0,0,0.78)',
    })
    out['code-ink'] = push(out['code-ink'], out['code-bg'], 7.0)
    out['msg-user-ink'] = push(ink, out['msg-user-bg'], 10.0)

    # Les fonds teintés doivent repartir du noir : hérités du sombre, ils
    # gardaient la teinte du fond de ce thème et faisaient des bandes brunes
    # sur un fond qui n'a plus aucune couleur.
    # 12 % et pas 16 : delave a 16, Flexoki tombait a 4.43 entre le rouge et son
    # propre fond de diff. Le fond doit rester un aplat lisible, pas une teinte.
    out['diff-add-bg'] = mix('#000000', out['ok'], 0.13)
    out['diff-del-bg'] = mix('#000000', out['danger'], 0.13)
    out['diff-hunk-bg'] = mix('#000000', out['accent'], 0.09)
    out['accent-soft'] = mix('#000000', out['accent'], 0.16)
    out['surface-2'] = '#171717'
    out['surface-3'] = '#212121'
    return out


def css_block(selector, tokens, indent='  '):
    lines = [f'{indent}--{k}: {v};' for k, v in tokens.items()]
    return selector + ' {\n' + '\n'.join(lines) + '\n}\n'

out = ['''/* ============================================================
   my-claw — thèmes
   Chaque thème remplit le même contrat de tokens, en clair et en sombre.
   Valeurs de base : les palettes publiées par chaque projet.
   Valeurs dérivées (paliers de surface, faint remonté à 4.5:1, fonds de
   bulle, de code et de diff) : calculées par tools/themes.py, jamais à l'œil.
   Sélection : [data-theme="sable"] sur <html>.
   ============================================================ */
''']
out.append('''@font-face {
  font-family: 'Inter';
  src: url('../fonts/inter-400.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-display: swap;
}
@font-face {
  font-family: 'JB Mono';
  src: url('../fonts/jbmono-400.woff2') format('woff2');
  font-weight: 400 500;
  font-display: swap;
}

:root {
  --f-small: 11px;
  --f-meta: 12.5px;
  --f-body: 13.5px;
  --f-read: 15px;
  --f-title: 16.5px;
  --f-screen: 21px;

  --r-sm: 6px;
  --r-md: 9px;
  --r-lg: 12px;
  --rail: 56px;
  --side-w: 296px;
  --content-max: 1160px;
  --gutter: 0px;
  --mgutter: 12px;

  --sans: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --mono: 'JB Mono', ui-monospace, 'SFMono-Regular', monospace;
}
''')

# regrouper par thème
by_theme = {}
for slug, label, mode, toks in THEMES:
    by_theme.setdefault((slug, label), {})[mode] = build(toks)

for (slug, label), modes in by_theme.items():
    light, dark = modes['light'], modes['dark']
    out.append(f'/* ---------- {label} ---------- */')
    out.append(css_block(f'[data-theme="{slug}"],\n[data-theme="{slug}"][data-mode="light"]', light))
    out.append(css_block(f'[data-theme="{slug}"][data-mode="dark"]', dark))
    out.append(css_block(f'[data-theme="{slug}"][data-mode="amoled"]', amoled(dark)))

# défaut : Sable
open_default = by_theme[('sable', 'Sable')]
out.append('/* ---------- défaut : Sable, avant que le JS pose un attribut ---------- */')
out.append(':root {' + ''.join(f'\n  --{k}: {v};' for k, v in open_default['light'].items()) + '\n}')
out.append(css_block(':root[data-mode="dark"]', open_default['dark']))

open('v3/themes.css', 'w', encoding='utf-8').write('\n'.join(out))

# --- rapport
print(f'{"thème":12} {"mode":6} {"ink/bg":>7} {"muted":>7} {"faint":>6} {"acc":>6} {"ok":>6} {"warn":>6} {"dgr":>6} {"bulle":>6}')
bad = []
for (slug, label), modes in by_theme.items():
    for mode, t in modes.items():
        rows = [('ink', t['ink'], t['bg'], 4.5), ('muted', t['muted'], t['bg'], 4.5),
                ('faint', t['faint'], t['bg'], 4.5), ('acc', t['accent'], t['bg'], 4.5),
                ('ok', t['ok'], t['bg'], 4.5), ('warn', t['warn'], t['bg'], 4.5),
                ('dgr', t['danger'], t['bg'], 4.5), ('bulle', t['msg-user-ink'], t['msg-user-bg'], 4.5),
                ('surAcc', t['accent-ink'], t['accent'], 4.5), ('code', t['code-ink'], t['code-bg'], 4.5)]
        vals = [ratio(f, b) for _, f, b, _ in rows]
        flags = [n for (n, _, _, need), r in zip(rows, vals) if r < need]
        if flags:
            bad.append((label, mode, flags))
        print(f'{label:12} {mode:6} ' + ' '.join(f'{v:6.1f}' for v in vals) + ('  << ' + ','.join(flags) if flags else ''))
print()
print('échecs :', bad if bad else 'aucun')
