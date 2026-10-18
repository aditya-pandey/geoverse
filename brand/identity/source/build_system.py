"""Builds the Bhoogol design system under ../system/project/ (tokens, brand book, components, assets).
Run from source/:  python3 build_system.py"""
import base64, json, os, re, shutil
import final_marks as F
from final_marks import (SPACE, SPACE2, SPACE3, CHALK, WHITE, BLUE, BLUE_DEEP, MINT, MARIGOLD, DANGER,
                         world, twin_inner, land, sparkle, kancha_inner, moon_inner, confetti_svg)
from geo import f, svg, circ
from marks import letters, R, CY, vane2, poly_rot_oval, night
import deva_round

ROOT = os.path.abspath("../system")
PRJ = f"{ROOT}/project"
DIST = os.path.abspath("../dist")
if os.path.isdir(PRJ):
    shutil.rmtree(PRJ)
os.makedirs(PRJ)


def write(rel, text):
    p = f"{PRJ}/{rel}"
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, "w").write(text)


# ═══════════════ tokens.json ═══════════════
def C(name, night_v, day_v=None, usage=""):
    return {"name": name, "value": night_v if day_v is None else {"night": night_v, "day": day_v}, "usage": usage}


colors = [
    C("ground", SPACE, CHALK, "Page background. Night: deep space; day: chalk."),
    C("surface", SPACE2, WHITE, "Cards, sheets, the search panel — one step up from ground."),
    C("surface-raised", SPACE3, "#ECE8DD", "Inputs, hovered rows, answer options, chips at rest."),
    C("line", "#353A78", "#DCD7CA", "Decorative hairlines and dividers (not for control borders)."),
    C("line-strong", "#6B70AE", "#8B8679", "Control borders, ledges under quiet controls — ≥3:1 on ground and surface in both themes."),
    C("ink", CHALK, SPACE, "Primary text and icons on ground, surface and surface-raised (≥12:1 night, ≥14:1 day)."),
    C("ink-muted", "#A9ACD3", "#56597E", "Secondary text, metadata, legends on ground, surface and surface-raised (≥5.4:1)."),
    C("ocean", BLUE, BLUE, "The brand blue: the sea on every world, the logo, the globe. Not for small white text."),
    C("action-blue", BLUE_DEEP, BLUE_DEEP, "Fill for blue buttons (secondary actions)."),
    C("on-action-blue", WHITE, WHITE, "Text and icons on action-blue (5.1:1)."),
    C("action-blue-ledge", "#1C45B8", "#1C45B8", "The 4px ledge under action-blue buttons."),
    C("link", "#7FA4FF", "#2456D6", "Links and blue text on ground and surface (≥5.7:1)."),
    C("marigold", MARIGOLD, MARIGOLD, "The one accent per view: primary buttons, selection, teacher's marks, the eastern land."),
    C("on-marigold", SPACE, SPACE, "Text and icons on marigold (9.7:1)."),
    C("marigold-ledge", "#C98100", "#C98100", "The 4px ledge under marigold buttons."),
    C("highlight-ink", MARIGOLD, "#9A5B00", "Marigold as text on ground and surface (night 8.7:1, day 5.0:1)."),
    C("mint", MINT, MINT, "Correct answers, the western land, 'countries' marbles."),
    C("on-mint", SPACE, SPACE, "Text and icons on mint (10:1)."),
    C("success-ink", MINT, "#0E7A52", "Success as text on ground and surface (≥4.9:1)."),
    C("danger", DANGER, DANGER, "Wrong answers and destructive actions; differs from mint by 3.2:1 in lightness."),
    C("on-danger", WHITE, WHITE, "Text and icons on danger (5.7:1)."),
    C("danger-ink", "#FF8A70", DANGER, "Errors as text on ground and surface (≥5.2:1)."),
    C("focus-ring", MARIGOLD, BLUE, "3px keyboard focus outline, 3px offset (night 9.7:1, day 4.1:1 on ground)."),
    C("scrim", "rgba(8, 9, 30, 0.62)", "rgba(18, 19, 58, 0.36)", "Behind sheets and dialogs."),
    C("space", SPACE, SPACE, "Fixed brand colour (logo ink on day, pattern ground). Same in both themes."),
    C("chalk", CHALK, CHALK, "Fixed brand colour (logo ink on night). Same in both themes."),
    C("map-ocean", BLUE, "#5B8CFF", "The sea on the 3D globe and 2D maps."),
    C("map-border", SPACE, "#FFFFFF", "Hairline borders between countries on the political map."),
    C("pol-1", "#F7D37E", None, "Political map fill 1 (sand)."),
    C("pol-2", "#9FE3C2", None, "Political map fill 2 (pale mint)."),
    C("pol-3", "#FFB49B", None, "Political map fill 3 (peach)."),
    C("pol-4", "#B5C4FF", None, "Political map fill 4 (periwinkle)."),
    C("pol-5", "#E4BDF4", None, "Political map fill 5 (lilac)."),
    C("pol-6", "#94D9E6", None, "Political map fill 6 (aqua). No two neighbours share a fill."),
    C("seq-1", "#E3F8EE", None, "Sequential choropleth, lowest class."),
    C("seq-2", "#A6EBCB", None, "Sequential choropleth, class 2."),
    C("seq-3", "#4FD3A0", None, "Sequential choropleth, class 3."),
    C("seq-4", "#1F9C93", None, "Sequential choropleth, class 4."),
    C("seq-5", "#1B5E8C", None, "Sequential choropleth, highest class."),
    C("div-neg-2", DANGER, None, "Diverging choropleth, far below the midpoint."),
    C("div-neg-1", "#FF9F80", None, "Diverging choropleth, below the midpoint."),
    C("div-mid", CHALK, None, "Diverging choropleth, the midpoint."),
    C("div-pos-1", "#8FB2FF", None, "Diverging choropleth, above the midpoint."),
    C("div-pos-2", BLUE_DEEP, None, "Diverging choropleth, far above the midpoint."),
]

tokens = {
    "name": "Bhoogol", "version": 1,
    "color": {"themes": [{"id": "night", "name": "Night"}, {"id": "day", "name": "Day"}], "tokens": colors},
    "type": {
        "fonts": [],
        "families": {
            "display": "\"Baloo 2\", \"Mukta\", system-ui, sans-serif",
            "text": "\"Mukta\", system-ui, -apple-system, \"Segoe UI\", sans-serif",
            "hand": "\"Kalam\", \"Comic Neue\", cursive",
            "mono": "\"JetBrains Mono\", ui-monospace, SFMono-Regular, Menlo, monospace",
        },
        "groups": [
            {"name": "Display", "family": "display", "styles": [
                {"name": "display-xl", "fontSize": "56px", "lineHeight": "56px", "fontWeight": 800, "letterSpacing": "-0.01em", "sample": "9 of 10", "usage": "Loading screen and share cards."},
                {"name": "display-l", "fontSize": "40px", "lineHeight": "44px", "fontWeight": 800, "sample": "Shabash! 5 in a row", "usage": "Section openers and quiz results."},
                {"name": "title", "fontSize": "28px", "lineHeight": "32px", "fontWeight": 700, "sample": "Bahrain · बहरीन", "usage": "Country names and sheet titles."},
                {"name": "heading", "fontSize": "20px", "lineHeight": "26px", "fontWeight": 700, "sample": "Which country is this?", "usage": "Card headings and quiz questions."}]},
            {"name": "Text", "family": "text", "styles": [
                {"name": "body-l", "fontSize": "18px", "lineHeight": "28px", "fontWeight": 400, "sample": "Bahrain is joined to Saudi Arabia by a 25 km causeway.", "usage": "Facts and stories."},
                {"name": "body", "fontSize": "16px", "lineHeight": "24px", "fontWeight": 400, "sample": "Tap a country to learn about it.", "usage": "Default UI text."},
                {"name": "label", "fontSize": "14px", "lineHeight": "20px", "fontWeight": 600, "sample": "Fly there", "usage": "Buttons, chips and tabs."},
                {"name": "caption", "fontSize": "12px", "lineHeight": "16px", "fontWeight": 500, "sample": "Population, 2024 estimate", "usage": "Legends and metadata."}]},
            {"name": "Hand", "family": "hand", "styles": [
                {"name": "note", "fontSize": "20px", "lineHeight": "24px", "fontWeight": 700, "sample": "you are here", "usage": "Two-to-five-word notes beside a teacher's mark."}]},
            {"name": "Data", "family": "mono", "styles": [
                {"name": "data", "fontSize": "14px", "lineHeight": "20px", "fontWeight": 500, "sample": "1,428,627,663", "usage": "Tabular numbers: populations, areas, scores."}]},
        ]},
    "spacing": {"tokens": [
        {"name": "space-1", "value": "4px", "usage": "Icon-to-label gap inside chips."},
        {"name": "space-2", "value": "8px", "usage": "Gaps inside controls; between chips."},
        {"name": "space-3", "value": "12px", "usage": "Gaps between answer options and list rows."},
        {"name": "space-4", "value": "16px", "usage": "Card padding on phones; side gutter."},
        {"name": "space-5", "value": "24px", "usage": "Card padding on desktop; gaps between groups."},
        {"name": "space-6", "value": "32px", "usage": "Between sections inside a sheet."},
        {"name": "space-7", "value": "48px", "usage": "Between page sections."},
        {"name": "space-8", "value": "64px", "usage": "Hero and splash breathing room."}]},
    "radius": {"tokens": [
        {"name": "radius-s", "value": "10px", "usage": "Small badges, keyboard hints, legend swatches."},
        {"name": "radius-m", "value": "16px", "usage": "Cards, answer options, inputs, toasts."},
        {"name": "radius-l", "value": "24px", "usage": "Sheets and dialogs (top corners on phone sheets)."},
        {"name": "radius-pill", "value": "999px", "usage": "Buttons, chips, the tab bar, the score bar."}]},
    "shadow": {"tokens": [
        {"name": "shadow-lift", "value": {"night": "0 12px 32px rgba(4, 5, 20, 0.55)", "day": "0 12px 32px rgba(18, 19, 58, 0.14)"}, "usage": "Floating sheets, the search panel, toasts."},
        {"name": "shadow-ledge", "value": {"night": "0 4px 0 #0A0B26", "day": "0 4px 0 #CFC9BA"}, "usage": "The toy-key ledge under quiet buttons and answer options."}]},
}
write("tokens.json", json.dumps(tokens, indent=2, ensure_ascii=False))


# ═══════════════ shared drawing data for bundle.js ═══════════════
L_, WM_W = letters(0)
letter_paths = "".join(d for n, d, x in L_ if n not in ("o1", "o2"))
world_pos = [(x + R, CY) for n, d, x in L_ if n in ("o1", "o2")]
DATA = {
    "wordmark": {"letters": letter_paths, "worlds": world_pos, "r": 54, "w": WM_W, "top": F.WM_TOP, "bottom": F.WM_BOTTOM},
    "land": {"west": land(0, 0, 60, -1), "east": land(0, 0, 60, 1)},
    "night": night(0, 0, 60),
    "vane": vane2(0, 0, 60),
    "shine": poly_rot_oval(-0.46 * 60, -0.46 * 60, 0.17 * 60, 0.09 * 60, -45),
    "deva": {"d": deva_round.bhugol(), "x0": F.DX0, "y0": F.DY0, "x1": F.DX1, "y1": F.DY1},
    "marks": {"circle": F.mark_circle(), "underline": F.mark_underline(), "arrow": F.mark_arrow(),
              "tick": F.mark_tick(), "sparkle": sparkle(128, 128, 110)},
    "icons": F.ICONS,
    "colors": {"space": SPACE, "chalk": CHALK, "ocean": BLUE, "mint": MINT, "marigold": MARIGOLD},
}
assert "</script" not in json.dumps(DATA) and "<!--" not in json.dumps(DATA)

components = ["Button", "Chip", "AnswerOption", "CountryCard", "ScoreBar", "TeacherMark", "Toast", "SearchField",
              "MapLegend", "TabBar", "LogoShowcase", "Applications"]

bundle_js = ("/* @ds-bundle: " + json.dumps({"format": 4, "namespace": "Bhoogol",
                                             "components": [{"name": c} for c in components]}) + " */\n" + r"""
(function () {
  "use strict";
  var D = __DATA__;
  var NS = "http://www.w3.org/2000/svg";
  function svgOpen(vb, w, h, extra) {
    return '<svg xmlns="' + NS + '" viewBox="' + vb + '" width="' + w + '" height="' + h + '" ' + (extra || '') + ' aria-hidden="true" focusable="false">';
  }
  function worldInner(side, cx, cy, r, o) {
    o = o || {};
    var k = r / 60, t = 'translate(' + cx + ' ' + cy + ') scale(' + k + ')';
    var landD = side === 'west' ? D.land.west : D.land.east;
    if (o.mono) {
      return '<g transform="' + t + '"><path fill="' + o.mono + '" fill-rule="evenodd" d="M-60 0A60 60 0 1 1 60 0A60 60 0 1 1 -60 0Z' + landD + '"/></g>';
    }
    var s = '<g transform="' + t + '"><circle r="60" fill="' + D.colors.ocean + '"/><path fill="' + (side === 'west' ? D.colors.mint : D.colors.marigold) + '" d="' + landD + '"/>';
    if (o.shade) s += '<path fill="' + D.colors.space + '" fill-opacity="0.32" d="' + D.night + '"/>';
    return s + '</g>';
  }
  var api = {
    data: D,
    /** One little world. side: 'east' (Afro-Eurasia, marigold) | 'west' (the Americas, mint). */
    world: function (side, o) { o = o || {}; var z = o.size || 24;
      return svgOpen('-62 -62 124 124', z, z) + worldInner(side || 'east', 0, 0, 60, o) + '</svg>'; },
    /** The two worlds side by side (the symbol). */
    twin: function (o) { o = o || {}; var z = o.size || 48;
      return svgOpen('0 0 256 256', z, z) + worldInner('west', 61, 128, 56, o) + worldInner('east', 195, 128, 56, o) + '</svg>'; },
    /** The bhoogol wordmark. ink: letter colour (default currentColor); mono: knock the land out in ink. */
    wordmark: function (o) { o = o || {}; var w = D.wordmark, h = o.height || 40, ink = o.ink || 'currentColor';
      var vbH = w.bottom - w.top, vb = '0 ' + w.top + ' ' + w.w + ' ' + vbH, width = Math.round(h * w.w / vbH);
      var s = svgOpen(vb, width, h, 'role="img"') + '<path fill="' + ink + '" d="' + w.letters + '"/>';
      s += worldInner('west', w.worlds[0][0], w.worlds[0][1], w.r, o.mono ? { mono: ink } : {});
      s += worldInner('east', w.worlds[1][0], w.worlds[1][1], w.r, o.mono ? { mono: ink } : {});
      return s + '</svg>'; },
    /** भूगोल, drawn to match the wordmark. */
    devanagari: function (o) { o = o || {}; var d = D.deva, h = o.height || 40, ink = o.ink || 'currentColor';
      var vbW = d.x1 - d.x0, vbH = d.y1 - d.y0;
      return svgOpen(d.x0 + ' ' + d.y0 + ' ' + vbW + ' ' + vbH, Math.round(h * vbW / vbH), h, 'role="img"') + '<path fill="' + ink + '" d="' + d.d + '"/></svg>'; },
    /** A teacher's mark: 'circle' | 'underline' | 'arrow' | 'tick' | 'sparkle'. */
    mark: function (kind, o) { o = o || {}; var z = o.size || 64;
      return svgOpen('0 0 256 256', z, z, 'class="bh-mark-svg" preserveAspectRatio="' + (o.stretch ? 'none' : 'xMidYMid meet') + '"') +
        '<path fill="' + (o.color || D.colors.marigold) + '" d="' + D.marks[kind || 'circle'] + '"/></svg>'; },
    /** A kancha (marble): 'blue' | 'mint' | 'marigold'. */
    kancha: function (tone, o) { o = o || {}; var z = o.size || 24;
      var body = { blue: D.colors.ocean, mint: D.colors.mint, marigold: D.colors.marigold }[tone || 'blue'];
      var vane = tone === 'blue' || !tone ? D.colors.marigold : D.colors.ocean;
      return svgOpen('-62 -62 124 124', z, z) + '<circle r="60" fill="' + body + '"/><path fill="' + vane + '" d="' + D.vane + '"/>' +
        '<path fill="' + D.colors.space + '" fill-opacity="0.22" d="' + D.night + '"/><path fill="#FFFFFF" fill-opacity="0.9" d="' + D.shine + '"/></svg>'; },
    /** A 24px line icon in currentColor. */
    icon: function (name, o) { o = o || {}; var z = o.size || 24;
      return svgOpen('0 0 24 24', z, z, 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bh-icon"') + (D.icons[name] || '') + '</svg>'; },
    /** Fill data-bh-* placeholders: data-bh-icon, data-bh-world, data-bh-twin, data-bh-logo, data-bh-mark, data-bh-kancha (+ data-bh-size). */
    hydrate: function (root) {
      root = root || document;
      var each = function (sel, fn) { var n = root.querySelectorAll(sel); for (var i = 0; i < n.length; i++) fn(n[i]); };
      var size = function (el, d) { var v = parseFloat(el.getAttribute('data-bh-size')); return isNaN(v) ? d : v; };
      each('[data-bh-icon]', function (el) { el.innerHTML = api.icon(el.getAttribute('data-bh-icon'), { size: size(el, 24) }); });
      each('[data-bh-world]', function (el) { el.innerHTML = api.world(el.getAttribute('data-bh-world'), { size: size(el, 24), shade: el.hasAttribute('data-bh-shade') }); });
      each('[data-bh-twin]', function (el) { el.innerHTML = api.twin({ size: size(el, 48) }); });
      each('[data-bh-kancha]', function (el) { el.innerHTML = api.kancha(el.getAttribute('data-bh-kancha'), { size: size(el, 24) }); });
      each('[data-bh-logo]', function (el) { var k = el.getAttribute('data-bh-logo'), h = size(el, 40), mono = el.hasAttribute('data-bh-mono');
        el.innerHTML = k === 'devanagari' ? api.devanagari({ height: h }) : api.wordmark({ height: h, mono: mono }); });
      each('[data-bh-mark]', function (el) { el.innerHTML = api.mark(el.getAttribute('data-bh-mark'), { size: size(el, 64), stretch: el.hasAttribute('data-bh-stretch') }); });
    }
  };
  window.Bhoogol = api;
})();
""").replace("__DATA__", json.dumps(DATA, separators=(",", ":")))
write("components/bundle.js", bundle_js)

# ═══════════════ bundle.css ═══════════════
write("components/bundle.css", open("bundle.css").read())

# ═══════════════ index.d.ts ═══════════════
write("components/index.d.ts", open("index.d.ts").read())

# ═══════════════ components: README + preview ═══════════════
for comp in components:
    src = f"previews/{comp}"
    write(f"components/{comp}/README.md", open(f"{src}.md").read())
    write(f"components/{comp}/preview.html", open(f"{src}.html").read())
write("components/Cover/preview.html", open("previews/Cover.html").read())


# ═══════════════ images for the book (data: URIs) ═══════════════
def uri(svg_text):
    return "data:image/svg+xml;base64," + base64.b64encode(svg_text.encode()).decode()


def body_of(path):
    s = open(path).read(); i = s.index(">", s.index("<svg")) + 1
    vb = [float(v) for v in re.search(r'viewBox="([^"]+)"', s).group(1).split()]
    return s[i:s.rindex("</svg>")], vb[2], vb[3]


_n = [0]
def place(path, x, y, w, h):
    _n[0] += 1
    b, vw, vh = body_of(path)
    b = b.replace('id="', f'id="p{_n[0]}').replace('aria-labelledby="', f'aria-labelledby="p{_n[0]}')
    k = min(w / vw, h / vh)
    ox, oy = x + (w - vw * k) / 2, y + (h - vh * k) / 2
    return f'<g transform="translate({f(ox)} {f(oy)}) scale({k:.4f})">{b}</g>'


def tile(x, y, w, h, fill, r=24):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}"/>'


def label(x, y, text, fill, size=15, weight=600, family="Mukta, 'Helvetica Neue', Arial, sans-serif"):
    return f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" fill="{fill}">{text}</text>'


IMG = {}
conf = open(f"{DIST}/worlds/pattern-confetti.svg").read()
cb, _, _ = body_of(f"{DIST}/worlds/pattern-confetti.svg")
cb = cb.replace(f'<rect width="512" height="512" fill="{SPACE}"/>', "")
hero = tile(0, 0, 1200, 420, SPACE, 28)
for i, (x, y) in enumerate(((700, -70), (860, 170))):
    hero += f'<g transform="translate({x} {y}) scale(0.62)" opacity="0.9">{cb.replace("id=", f"data-c{i}=")}</g>'
hero += place(f"{DIST}/logo/bhoogol-wordmark-night.svg", 80, 130, 620, 170)
hero = f'<clipPath id="hc"><rect width="1200" height="420" rx="28"/></clipPath><g clip-path="url(#hc)">{hero}</g>'
IMG["hero"] = svg(hero, 1200, 420, "Bhoogol")

pat = tile(0, 0, 1200, 300, SPACE, 28)
for i in range(4):
    pat += f'<g transform="translate({i*300} 0) scale(0.586)">{cb.replace("id=", f"data-q{i}=")}</g>'
pat = f'<clipPath id="qc"><rect width="1200" height="300" rx="28"/></clipPath><g clip-path="url(#qc)">{pat}</g>'
IMG["pattern"] = svg(pat, 1200, 300, "World confetti pattern")

IMG["logo-night"] = svg(tile(0, 0, 1200, 360, SPACE, 28) + place(f"{DIST}/logo/bhoogol-wordmark-night.svg", 120, 60, 960, 240), 1200, 360, "Bhoogol wordmark on night")

ls = tile(0, 0, 1200, 760, "#E9E6DE", 28)
ls += tile(24, 24, 560, 200, CHALK) + place(f"{DIST}/logo/bhoogol-wordmark-day.svg", 54, 44, 500, 160)
ls += tile(616, 24, 560, 200, "#FFFFFF") + place(f"{DIST}/logo/bhoogol-wordmark-black.svg", 646, 44, 500, 160)
ls += tile(24, 248, 360, 230, CHALK) + place(f"{DIST}/logo/bhoogol-devanagari-day.svg", 54, 268, 300, 190)
ls += tile(408, 248, 768, 230, SPACE) + place(f"{DIST}/logo/bhoogol-bilingual-night.svg", 438, 258, 708, 210)
x = 24
for p, bg in (("bhoogol-symbol.svg", CHALK), ("bhoogol-symbol-white.svg", SPACE), ("bhoogol-world.svg", CHALK), ("bhoogol-app-icon.svg", None)):
    if bg:
        ls += tile(x, 502, 270, 234, bg)
    ls += place(f"{DIST}/logo/{p}", x + 30, 517, 210, 204)
    x += 294
IMG["logo-set"] = svg(ls, 1200, 760, "Logo versions")

pal = tile(0, 0, 1200, 380, "#E9E6DE", 28)
blocks = [("Space", "#12133A", 0, 360, CHALK), ("Ocean", BLUE, 360, 300, WHITE), ("Mint", MINT, 660, 180, SPACE),
          ("Marigold", MARIGOLD, 840, 180, SPACE), ("Chalk", CHALK, 1020, 180, SPACE)]
for name, hexv, x, w, tc in blocks:
    pal += f'<rect x="{x}" y="0" width="{w}" height="380" fill="{hexv}"/>'
    pal += label(x + 24, 316, name, tc, 26, 700) + label(x + 24, 348, hexv, tc, 16, 500, "'JetBrains Mono', Menlo, monospace")
pal = f'<clipPath id="pc"><rect width="1200" height="380" rx="28"/></clipPath><g clip-path="url(#pc)">{pal}</g>'
IMG["palette"] = svg(pal, 1200, 380, "Palette")

mp = tile(0, 0, 1200, 300, "#E9E6DE", 28)
pols = ["#F7D37E", "#9FE3C2", "#FFB49B", "#B5C4FF", "#E4BDF4", "#94D9E6"]
mp += label(32, 48, "Political", SPACE, 18, 700)
for i, c in enumerate(pols):
    mp += f'<rect x="{32 + i*62}" y="64" width="54" height="54" rx="27" fill="{c}"/>'
mp += label(32, 170, "Sequential", SPACE, 18, 700)
for i, c in enumerate(["#E3F8EE", "#A6EBCB", "#4FD3A0", "#1F9C93", "#1B5E8C"]):
    mp += f'<rect x="{32 + i*74}" y="186" width="74" height="40" fill="{c}"/>'
mp += label(32, 250, "low", "#56597E", 14, 500) + label(360, 250, "high", "#56597E", 14, 500)
mp += label(460, 170, "Diverging", SPACE, 18, 700)
for i, c in enumerate([DANGER, "#FF9F80", CHALK, "#8FB2FF", BLUE_DEEP]):
    mp += f'<rect x="{460 + i*74}" y="186" width="74" height="40" fill="{c}" stroke="#DCD7CA"/>'
import sys as _s
_s.path.insert(0, os.path.abspath("../../archive/round-1/source"))
from patchwork import pieces as _pieces
mp += f'<g transform="translate(900 32) scale(0.92)">'
mp += f'<circle cx="128" cy="128" r="104" fill="{SPACE}"/>'
for i, d in enumerate(_pieces().values()):
    mp += f'<path d="{d}" fill="{pols[i]}"/>'
mp += f'<path d="{F.mark_circle()}" fill="{MARIGOLD}" transform="translate(118 40) scale(0.36)"/></g>'
IMG["maps"] = svg(mp, 1200, 300, "Map colours")

mk = tile(0, 0, 1200, 260, SPACE, 28)
for i, k in enumerate(("circle", "underline", "arrow", "tick", "sparkle")):
    mk += place(f"{DIST}/marks/marker-{k}.svg", 40 + i * 232, 30, 200, 200)
IMG["marks"] = svg(mk, 1200, 260, "Teacher's marks")

wd = tile(0, 0, 1200, 260, SPACE, 28)
for i, p in enumerate(("world-west", "world-east", "moon", "kancha-blue", "kancha-mint", "kancha-marigold")):
    wd += place(f"{DIST}/worlds/{p}.svg", 30 + i * 195, 40, 180, 180)
IMG["worlds"] = svg(wd, 1200, 260, "Little worlds and kanche")

ic = tile(0, 0, 1200, 200, CHALK, 28)
for i, n in enumerate(F.ICONS):
    x, y = 40 + (i % 9) * 128, 30 + (i // 9) * 88
    ic += f'<g transform="translate({x} {y}) scale(2)" fill="none" stroke="{SPACE}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{F.ICONS[n]}</g>'
    ic += label(x - 4, y + 66, n, "#56597E", 12, 500, "'JetBrains Mono', Menlo, monospace")
IMG["icons"] = svg(ic, 1200, 200, "Icons")

ap = tile(0, 0, 1200, 360, "#E9E6DE", 28)
ap += place(f"{DIST}/logo/bhoogol-app-icon.svg", 40, 40, 280, 280)
x = 360
for s in (180, 96, 48, 32):
    ap += f'<g>{place(f"{DIST}/logo/bhoogol-app-icon.svg", x, 320 - s, s, s)}</g>'
    x += s + 28
x = 820
for s in (64, 32, 16):
    ap += place(f"{DIST}/logo/bhoogol-world.svg", x, 320 - s, s, s); x += s + 28
ap += label(820, 220, "favicon", "#56597E", 14, 500, "'JetBrains Mono', Menlo, monospace")
ap += label(360, 110, "app icon", "#56597E", 14, 500, "'JetBrains Mono', Menlo, monospace")
IMG["appicon"] = svg(ap, 1200, 360, "App icon and favicon")

ex = tile(0, 0, 1200, 300, SPACE, 28)
ex += f'<g transform="translate(40 40) scale(0.86)">{F.kancha_inner(128, 128, 100)}</g>'
ex += f'<g transform="translate(320 40) scale(0.86)">{twin_inner(128, 128, 56, 10)}</g>'
ex += f'<g transform="translate(600 40) scale(0.86)"><path fill="{MARIGOLD}" d="{F.mark_circle()}"/>{world(128, 128, 54, 1)}</g>'
for i, (t, x) in enumerate((("Kancha", 60), ("Two worlds  ✓", 340), ("Circle it", 620))):
    ex += label(x + 30, 284, t, CHALK, 18, 700)
ex += label(880, 120, "Kancha became the marbles", "#A9ACD3", 16, 500)
ex += label(880, 150, "you collect; Circle it became", "#A9ACD3", 16, 500)
ex += label(880, 180, "the teacher's marks.", "#A9ACD3", 16, 500)
IMG["explore"] = svg(ex, 1200, 300, "Logo exploration")

# ═══════════════ the book ═══════════════
def fill(md):
    def rep(m):
        k = m.group(1)
        return f"![{k}]({uri(IMG[k])})"
    return re.sub(r"\{\{img:([a-z-]+)\}\}", rep, md)


for name in sorted(os.listdir("book")):
    if name.endswith(".md"):
        write(name, fill(open(f"book/{name}").read()))

# ═══════════════ assets (files to upload) + group READMEs ═══════════════
groups = {
    "Logos": ["logo/bhoogol-wordmark-day.svg", "logo/bhoogol-wordmark-night.svg", "logo/bhoogol-wordmark-black.svg",
              "logo/bhoogol-wordmark-white.svg", "logo/bhoogol-devanagari-day.svg", "logo/bhoogol-devanagari-night.svg",
              "logo/bhoogol-bilingual-day.svg", "logo/bhoogol-bilingual-night.svg", "logo/bhoogol-symbol.svg",
              "logo/bhoogol-symbol-black.svg", "logo/bhoogol-symbol-white.svg", "logo/bhoogol-world.svg",
              "logo/bhoogol-app-icon.svg"],
    "Marks": [f"marks/marker-{k}.svg" for k in ("circle", "underline", "arrow", "tick", "sparkle")],
    "Worlds": ["worlds/world-west.svg", "worlds/world-east.svg", "worlds/moon.svg", "worlds/kancha-blue.svg",
               "worlds/kancha-mint.svg", "worlds/kancha-marigold.svg", "worlds/pattern-confetti.svg"],
    "Icons": [f"icons/{n}.svg" for n in F.ICONS],
}
for g, files in groups.items():
    for p in files:
        dst = f"{PRJ}/assets/{g}/{os.path.basename(p)}"
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy(f"{DIST}/{p}", dst)
    write(f"assets/{g}/README.md", open(f"assetdocs/{g}.md").read())
json.dump({g: [os.path.basename(p) for p in v] for g, v in groups.items()}, open(f"{ROOT}/asset-groups.json", "w"), indent=1)
print("built", PRJ)
