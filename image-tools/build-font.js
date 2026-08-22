const fs = require('fs');
const path = require('path');
const subsetFont = require('subset-font');

const CONFIG = {
    // The upstream variable font rather than Google's already-subset woff2: hb-subset
    // wants an SFNT, and this way the licence and the source agree.
    //
    // Pinned to a commit, not to main. google/fonts ships rebuilds continuously, and a
    // rebuild can change vertical metrics — which is what --series-card-body in
    // style.css is a measured constant against. Nothing here would notice: the woff2
    // has no regenerate-and-diff gate, so the first symptom would be the layout-shift
    // assertion tripping at some viewport, months later, for no visible reason.
    // 5fcfd99 is "Rebuild with babelfont 3.1.2", 2025-01-09.
    SOURCE_URL: 'https://raw.githubusercontent.com/google/fonts/5fcfd99f2fa4422991d29f4adae3f2f4b774f058/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf',
    CHARSET: path.join('image-tools', 'font-charset.txt'),
    OUTPUT: path.join('fonts', 'cormorant-garamond-subset.woff2'),
    // style.css renders this face at 500, and at 400 for .series-card-title, which
    // inherits body's 300 and lands on the axis minimum. Both ends are needed; the rest
    // of Cormorant's 300-700 range is weight no rule asks for.
    AXES: { wght: { min: 400, max: 500 } },
    // Cormorant carries a large set of ligatures, alternates and figure styles that
    // are only reachable through GSUB. Keeping the glyphs they can substitute in costs
    // 23KB of the 36KB — nearly three times the outlines actually drawn — and no rule
    // in style.css turns any of those features on. This is the difference between a
    // subset that is worth self-hosting and one that is the same size as Google's.
    NO_LAYOUT_CLOSURE: true
};

/** The characters the subset must cover, read from the hand-maintained charset file. */
function readCharset(file) {
    const text = fs.readFileSync(file, 'utf8');
    const chars = new Set();
    for (const line of text.split('\n')) {
        if (line.startsWith('#')) continue;
        for (const char of line) chars.add(char);
    }
    return [...chars].join('');
}

async function main() {
    const charset = readCharset(CONFIG.CHARSET);
    console.log(`⏳ Fetching ${CONFIG.SOURCE_URL}`);
    const response = await fetch(CONFIG.SOURCE_URL);
    if (!response.ok) throw new Error(`Font download failed: ${response.status} ${response.statusText}`);
    const source = Buffer.from(await response.arrayBuffer());

    const subset = await subsetFont(source, charset, {
        targetFormat: 'woff2',
        variationAxes: CONFIG.AXES,
        noLayoutClosure: CONFIG.NO_LAYOUT_CLOSURE
    });

    fs.mkdirSync(path.dirname(CONFIG.OUTPUT), { recursive: true });
    fs.writeFileSync(CONFIG.OUTPUT, subset);

    const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;
    console.log(`✅ ${CONFIG.OUTPUT} — ${charset.length} characters, ${kb(source.length)} → ${kb(subset.length)}`);
}

main().catch((error) => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
});
