import { readFileSync } from "node:fs";
import { getDocumentProxy } from "unpdf";
const INV = new RegExp("[\\u0000-\\u001F\\u007F-\\u009F\\uE000-\\uF8FF]", "g");
async function main() {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(process.argv[2])));
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const items: { s: string; x: number; y: number; h: number }[] = [];
    for (const it of content.items) {
      if (!("str" in it) || typeof it.str !== "string") continue;
      const t = it.str.replace(INV, " ").trim();
      if (!t) continue;
      const tr = (it as any).transform; if (!tr) continue;
      items.push({ s: t, x: tr[4], y: tr[5], h: (it as any).height ?? 0 });
    }
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let band: typeof items = []; let by = items[0]?.y ?? 0; const out: string[] = [];
    const flush = () => { if (!band.length) return; band.sort((a,b)=>a.x-b.x);
      out.push(`y=${band[0].y.toFixed(0).padStart(4)} x=${band[0].x.toFixed(0).padStart(3)} h=${Math.max(...band.map(b=>b.h)).toFixed(1).padStart(4)} | ` + band.map(i=>i.s).join(" ")); band=[]; };
    for (const it of items) { if (Math.abs(it.y - by) > 3) { flush(); by = it.y; } band.push(it); }
    flush();
    const from = Number(process.argv[3] ?? 0), to = Number(process.argv[4] ?? 30);
    console.log(`--- page ${p} ---`);
    console.log(out.slice(from, to).join("\n"));
  }
}
main();
