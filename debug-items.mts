import { readFileSync } from "node:fs";
import { getDocumentProxy } from "unpdf";
async function main() {
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(process.argv[2])));
  console.log("numPages:", pdf.numPages);
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  console.log("items:", content.items.length);
  for (const it of content.items.slice(0, 6)) {
    console.log(JSON.stringify(it).slice(0, 260));
  }
}
main();
