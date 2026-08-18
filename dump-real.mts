import { readFileSync } from "node:fs";
import { extractFromPdf } from "@/lib/extraction/pdf";
async function main() {
  for (const f of process.argv.slice(2)) {
    const r = await extractFromPdf(new Uint8Array(readFileSync(f)));
    console.log(`\n######## ${f.split("/").pop()} — ${r.lines.length} rows | vendor=${r.vendor} | doc=${r.documentNumber} | tax=${r.taxPct}%`);
    r.lines.forEach(l => console.log(`  ${l.srNo}. [${l.unit}] qty=${l.quantity} rate=${l.rate} net=${l.amount} conf=${l.confidence.rate}\n     "${l.description.slice(0,72)}"`));
  }
}
main();
