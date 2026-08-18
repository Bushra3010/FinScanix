import { readFileSync } from "node:fs";
import { getDocumentProxy } from "unpdf";

async function main() {
  const bytes = new Uint8Array(readFileSync(process.argv[2]));
  const pdf = await getDocumentProxy(bytes);
  for (let p = 1; p <= Math.min(pdf.numPages, 1); p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items: { s: string; x: number; y: number }[] = [];
    for (const it of content.items) {
      if (!("str" in it) || typeof it.str !== "string") continue;
      const t = it.str.trim(); if (!t) continue;
      const tr = (it as { transform?: number[] }).transform; if (!tr) continue;
      items.push({ s: t, x: tr[4], y: tr[5] });
    }
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let band: typeof items = []; let by = items[0]?.y ?? 0;
    const out: string[] = [];
    const flush = () => { if (!band.length) return; band.sort((a,b)=>a.x-b.x);
      out.push(`y=${band[0].y.toFixed(0).padStart(4)} x=${band[0].x.toFixed(0).padStart(4)} | ` + band.map(i=>i.s).join(" ")); band = []; };
    for (const it of items) { if (Math.abs(it.y - by) > 3) { flush(); by = it.y; } band.push(it); }
    flush();
    console.log(out.slice(0, Number(process.argv[3] ?? 45)).join("\n"));
  }
}
main();
