// Shared setup for the custom-highlight repaint tests.
//
// Derived from the reduced test case for rdar://186478678 / webkit.org/b/323171:
// a MediaWiki VisualEditor source-mode page with the CodeMirror extension
// (?cmhighlight=1) registers a few hundred CSS Custom Highlight API ranges over
// the wikitext, and every full-viewport repaint then costs extra time in
// proportion to the number of REGISTERED ranges, whether or not those ranges are
// anywhere near the viewport.
//
// custom-highlight-repaint.html measures the repaint cost with the ranges
// registered; custom-highlight-repaint-no-highlights.html measures the same
// document with none. Both build the document through this file so the two
// numbers stay comparable.

const N_PARA = 2158; // Long source document, as in the reporter's page.
const N_HLPARA = 19; // Every range lives in the first 19 paragraphs.
const N_RANGES = 240; // Registered ranges. Repaint cost is linear in this.
const R_LEN = 4; // Characters per range. The cost does not depend on this.

const LINE = "The quick brown fox jumps over the lazy dog. ".repeat(8);

let paragraphs = [];

function buildDocument() {
    const doc = document.getElementById("doc");
    for (let i = 0; i < N_PARA; ++i) {
        const p = document.createElement("p");
        p.textContent = LINE;
        doc.appendChild(p);
        paragraphs.push(p);
    }
    doc.contentEditable = "true";
    doc.spellcheck = false;
}

// Registering must build FRESH Range objects every time. Re-adding a Highlight
// object that was previously in CSS.highlights leaves it unpainted, and an
// unpainted highlight costs nothing, which would quietly turn this into a
// measurement of the empty case.
function registerHighlights() {
    CSS.highlights.clear();
    const highlight = new Highlight();
    for (let i = 0; i < N_RANGES; ++i) {
        const text = paragraphs[i % N_HLPARA].firstChild;
        const start = 4 + Math.floor(i / N_HLPARA) * 14;
        const range = document.createRange();
        range.setStart(text, start);
        range.setEnd(text, start + R_LEN);
        highlight.add(range);
    }
    CSS.highlights.set("demo", highlight);
}

function cleanUp() {
    document.documentElement.style.removeProperty("margin-right");
    if (window.CSS && CSS.highlights)
        CSS.highlights.clear();
    document.getElementById("doc").textContent = "";
    paragraphs = [];
}

// Measure the cost of ONE rendering update.
//
// Dirty the whole viewport inside a requestAnimationFrame callback, then measure
// how long it takes for a MessageChannel task posted from that same callback to
// run, which is after style, layout and paint have completed. A plain
// frame-to-frame delta cannot be used here: it quantises to the vsync interval,
// and the regression this tracks is a few milliseconds inside a 16.7 ms budget.
let dirtyToggle = 0;
function measureOneRenderingUpdate(onMeasured) {
    const start = PerfTestRunner.now();
    document.documentElement.style.marginRight = (dirtyToggle ^= 1) ? "1px" : "2px";
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
        onMeasured(PerfTestRunner.now() - start);
    };
    channel.port2.postMessage(0);
}

// Drive prepareToMeasureValuesAsync() one rendering update per iteration.
function runRepaintTest() {
    measureOneRenderingUpdate((elapsed) => {
        if (PerfTestRunner.measureValueAsync(elapsed))
            requestAnimationFrame(runRepaintTest);
    });
}
