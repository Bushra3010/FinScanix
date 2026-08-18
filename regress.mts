import { readFileSync } from "node:fs";
import { extractFromPdf } from "@/lib/extraction/pdf";
const SPEC: [string,string,number,number][] = [
  ["Providing and laying M25 grade ready mix concrete in foundation including compaction and curing as per IS 456","cum",42.5,6850],
  ["Supply of TMT reinforcement bars Fe 500D conforming to IS 1786, 8 mm to 25 mm dia","kg",8600,74.5],
  ["Anti-termite treatment to foundation and plinth as per IS 6313 part 2","sqm",310,128]];
const CASES: Record<string,[string,string,number,number][]> = {
  "a-hsn-discount": SPEC, "b-qty-before-unit": SPEC, "c-no-serial-with-terms": SPEC,
  "quotation": [
    ["Supply and installation of LED recessed downlight 15W, 3000K, aluminium housing","nos",120,1450],
    ["Wiring for light point with 1.5 sqmm FR PVC insulated copper conductor cable in PVC conduit","point",85,780],
    ["Modular switch socket 6A with plate and box, ISI marked","nos",60,620],
    ["MCB distribution board 8 way double door, powder coated","nos",6,4200]],
  "route-check": [
    ["Ordinary Portland Cement 53 grade conforming to IS 12269, supp","bag",400,520],
    ["TMT reinforcement bars Fe 500D conforming to IS 1786, 12 mm di","kg",2500,78],
    ["12 mm cement plaster of mix 1:6 (1 cement : 6 fine sand) on ro","sqm",340,310],
    ["Vitrified floor tiles 600x600 mm, laid on 20 mm cement morta","sqm",180,1180]],
};
async function main() {
  let fail = 0, total = 0;
  for (const [name, expected] of Object.entries(CASES)) {
    const r = await extractFromPdf(new Uint8Array(readFileSync(`${process.argv[2]}/${name}.pdf`)));
    if (r.lines.length !== expected.length) { fail++; console.log(`${name}: ROWS ${r.lines.length}/${expected.length}`); }
    expected.forEach(([desc, unit, qty, rate], i) => {
      total++;
      const l = r.lines[i];
      if (!l) { fail++; console.log(`  ${name} ${i+1}: MISSING`); return; }
      const bad = [
        !l.description.startsWith(desc.slice(0, 40)) && "TEXT",
        l.unit !== unit && `unit=${l.unit}`,
        Math.abs(l.quantity-qty) > 0.01 && `qty=${l.quantity}`,
        Math.abs(l.rate-rate) > 0.01 && `rate=${l.rate}`].filter(Boolean);
      if (bad.length) { fail++; console.log(`  ${name} ${i+1}: ${bad.join(" ")}  got "${l.description.slice(0,56)}"`); }
    });
  }
  console.log(fail === 0 ? `\nSYNTHETIC SUITE: all ${total} rows still exact` : `\nSYNTHETIC SUITE: ${fail} regressions`);
}
main();
