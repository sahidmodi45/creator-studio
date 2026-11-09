/**
 * Dresses a workspace in its client's own brand: colours and fonts from the brand
 * kit, used boldly across the team view and the client portal.
 *
 * Colours, in the order the team enters them:
 * - the lightest colour, when light enough, is the page background;
 * - the darkest colour, when dark enough, is the text and outlines;
 * - the rest, in order, are the main colour then the supporting colours.
 * The main colour fills the menu and the header. Home tiles take turns in the
 * brand colours. Text on every fill is black or white, whichever reads better,
 * and the main colour is darkened only as far as white text needs to stay readable.
 *
 * Fonts: the first is used for headings and text, the second (often a script)
 * for the client's name and accent words. No brand kit, no change.
 */

type Rgb = [number, number, number];

const parse = (hex: string): Rgb | null => {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
};

const toHex = (c: Rgb) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

const luminance = (c: Rgb) => {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** a moved toward b by t (0 = a, 1 = b). */
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb;

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

/** Darkens a colour just enough for white text on it to read. */
const forWhiteText = (c: Rgb) => {
  let out = c;
  for (let i = 0; i < 20 && contrast(out, WHITE) < 4.5; i += 1) out = mix(out, BLACK, 0.06);
  return out;
};

/** Font names are typed by the team, so only letters, digits and spaces get through. */
const fontName = (name: string) => name.replace(/[^a-z0-9 ]/gi, "").trim();

export function workspaceFontsHref(fonts: string[]): string | null {
  const names = fonts.map(fontName).filter(Boolean).slice(0, 2);
  if (!names.length) return null;
  const families = names.map((name, i) => `family=${name.replace(/ /g, "+")}${i === 0 ? ":wght@400;500;700;800" : ""}`);
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

export function workspaceThemeCss(colors: string[], fonts: string[] = []): string | null {
  const list = colors.map(parse).filter((c): c is Rgb => c !== null);
  const [headFont, scriptFont] = fonts.map(fontName).filter(Boolean);
  if (!list.length && !headFont) return null;

  const byLight = [...list].sort((a, b) => luminance(b) - luminance(a));
  const background = list.length && luminance(byLight[0]) > 0.8 ? byLight[0] : null;
  const inkColour = list.length && luminance(byLight[byLight.length - 1]) < 0.03 ? byLight[byLight.length - 1] : null;
  const brand = list.filter((c) => c !== background && c !== inkColour);

  const cream = background ?? parse("#fbf7ef")!;
  const ink = inkColour ?? parse("#16110f")!;
  const textOn = (c: Rgb) => (contrast(c, ink) >= contrast(c, WHITE) ? ink : WHITE);

  const vars: string[] = [];
  const rules: string[] = [];

  if (background) vars.push(`--cream:${toHex(background)}`, `--paper:${toHex(mix(background, WHITE, 0.6))}`);
  if (inkColour) vars.push(`--ink:${toHex(inkColour)}`);

  const main = brand[0];
  if (main) {
    const accent = forWhiteText(main);
    // Second colour for highlights on the main colour: the first that stands apart from it.
    const pop = brand.slice(1).find((c) => contrast(c, accent) >= 3) ?? cream;
    vars.push(
      `--beet:${toHex(accent)}`,
      `--beet-dark:${toHex(mix(accent, BLACK, 0.25))}`,
      `--blush:${toHex(mix(main, cream, 0.55))}`,
      `--blush-soft:${toHex(mix(main, cream, 0.86))}`,
      `--rule:${toHex(mix(ink, cream, 0.82))}`,
      `--rule-strong:${toHex(ink)}`,
    );

    const a = toHex(accent);
    const p = toHex(pop);
    const pText = toHex(textOn(pop));
    const i = toHex(ink);

    // Team view: the menu is filled with the main colour.
    rules.push(
      `.rail{background:${a};border-right:0;color:#fff}`,
      `.rail .brandmark,.rail .brandmark em{color:#fff}`,
      `.rail .brandmark em{color:${p}}`,
      `.rail-label{color:rgb(255 255 255 / 72%)}`,
      `.rail a.rail-link,.rail .muted,.rail .plain-link,.rail .btn-ghost{color:#fff}`,
      `.rail a.rail-link span,.rail a.rail-link small,.rail a.rail-link[aria-current="page"] .rail-text small{color:inherit}`,
      `.rail .rail-text small{opacity:.85}`,
      `.rail .nav-count{background:${p};color:${pText}}`,
      `.rail a.rail-link:hover{background:rgb(255 255 255 / 14%);color:#fff}`,
      `.rail a.rail-link[aria-current="page"]{background:${p};color:${pText};font-weight:700}`,
      `.rail .icon-btn,.rail button{color:#fff}`,
    );

    // Client portal: the header is filled with the main colour.
    rules.push(
      `.masthead{background:${a};border-bottom:0;color:#fff}`,
      `.masthead .brandmark{color:#fff}`,
      `.masthead .brandmark em{color:${p}}`,
      `.masthead .icon-btn,.masthead button,.masthead a{color:#fff}`,
      `.masthead-nav a{color:rgb(255 255 255 / 85%);font-weight:500}`,
      `.masthead-nav a:hover{color:#fff}`,
      `.masthead-nav a[aria-current="page"]{color:#fff;border-bottom:3px solid ${p}}`,
      `.nav-count{background:${p};color:${pText}}`,
    );

    // Home tiles: bold outlines, a hard shadow, and the brand colours in turn.
    const tones = [accent, ...brand.slice(1), mix(background ?? cream, WHITE, 0.6)];
    rules.push(
      `.boxes>.box{border:2px solid ${i};border-radius:18px;box-shadow:4px 4px 0 ${i}}`,
      `.boxes>.box:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 ${i};border-color:${i}}`,
      `.box-head{color:inherit}`,
    );
    tones.forEach((tone, n) => {
      const fill = n === 0 ? accent : tone;
      const text = toHex(textOn(fill));
      const sel = `.boxes>.box:nth-child(${tones.length}n+${n + 1})`;
      rules.push(
        `${sel}{background:${toHex(fill)};color:${text}}`,
        `${sel} .box-title,${sel} .box-head,${sel} .box-line,${sel} .box-count,${sel} .box-line.quiet{color:${text}}`,
      );
    });
    rules.push(`.boxes .box-line{opacity:.9}`, `.btn-primary,.btn{border-radius:999px}`, `.btn-primary{font-weight:600}`);
  }

  if (headFont) {
    vars.push(`--font-display:"${headFont}",system-ui,sans-serif`, `--font-body:"${headFont}",system-ui,sans-serif`);
    rules.push(
      `.display,.display-sm,.box-title,.brandmark,.section-title{font-weight:800;letter-spacing:-0.02em;font-style:normal}`,
      `.box-title{font-size:30px}`,
    );
  }
  if (scriptFont) {
    rules.push(
      `.display em,.display-sm em,.brandmark em{font-family:"${scriptFont}",cursive;font-weight:400;font-style:normal;letter-spacing:0}`,
      `.display em{font-size:1.1em}`,
    );
  }

  return `:root{${vars.join(";")}}${rules.join("")}`;
}
