import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { gateFor, requireUser } from "@/lib/auth/guard";
import { getInvoice } from "@/lib/db/queries";
import { FLAG_LABEL, VARIANCE_CONFIG } from "@/lib/variance";
import type { AnalysedInvoice } from "@/lib/types";

/**
 * Report export — FR-6.3.
 *
 * Both formats are generated from the analysed invoice, which means they carry
 * the same figures the screen shows, produced by the same engine. Excel is
 * gated on the tier; PDF is available on every plan.
 */

export const runtime = "nodejs";

const CURRENCY_LOCALES: Record<string, string> = {
  INR: "en-IN",
  SAR: "ar-SA",
  AED: "en-AE",
  KWD: "en-KW",
  BHD: "en-BH",
  OMR: "en-OM",
};

function money(n: number, currency = "INR") {
  const locale = CURRENCY_LOCALES[currency] ?? "en-IN";
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(n);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await requireUser();
  const gate = gateFor(user);

  if (!gate.allows("report.export")) {
    return NextResponse.json({ error: "Your role cannot export reports." }, { status: 403 });
  }

  const format = request.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";

  if (format === "xlsx" && !gate.entitled("export_excel")) {
    return NextResponse.json(
      { error: "Excel export is available from the Professional tier." },
      { status: 402 },
    );
  }

  const invoice = await getInvoice(user.organisation.id, id);
  if (!invoice) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const stamp = invoice.number.replace(/[^\w-]+/g, "-");

  if (format === "xlsx") {
    const buffer = await buildWorkbook(invoice, user.organisation.name);
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="finscanix-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const pdf = await buildPdf(invoice, user.organisation.name);
  return new NextResponse(pdf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="finscanix-${stamp}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

/* ------------------------------------------------------------------ */

async function buildWorkbook(invoice: AnalysedInvoice, orgName: string) {
  const currency = invoice.city.currency ?? "INR";
  const taxLabel = invoice.city.region === "gcc" ? "VAT" : "GST";
  const wb = new ExcelJS.Workbook();
  wb.creator = "FinScanix";
  wb.created = new Date();

  const summary = wb.addWorksheet("Summary");
  summary.columns = [{ width: 30 }, { width: 46 }];
  summary.addRows([
    ["FinScanix variance report", ""],
    ["Organisation", orgName],
    ["Document", invoice.number],
    ["Vendor", invoice.vendor],
    ["Project", invoice.project],
    ["City", `${invoice.city.name} (index ${invoice.city.indexFactor.toFixed(2)})`],
    ["Currency", currency],
    ["Tax type", taxLabel],
    ["Tax rate", `${invoice.taxPct}%`],
    ["Uploaded", new Date(invoice.uploadedAt).toLocaleString("en-IN")],
    ["", ""],
    ["Net billed value", `${currency} ${money(invoice.subtotal, currency)}`],
    ["Benchmark value", `${currency} ${money(invoice.summary.benchmarkTotal, currency)}`],
    ["Variance", `${invoice.summary.variancePct.toFixed(2)}%`],
    ["Recoverable", `${currency} ${money(invoice.summary.potentialSaving, currency)}`],
    ["", ""],
    ["Over-priced lines", invoice.summary.overCount],
    ["At par lines", invoice.summary.parCount],
    ["Under-priced lines", invoice.summary.underCount],
    ["Unmatched lines", invoice.summary.unmatchedCount],
    ["", ""],
    [
      "Method",
      `Benchmark = median market quote, location-adjusted; Schedule of Rates carried as a cross-check. Par band ±${VARIANCE_CONFIG.parBandPct}%.`,
    ],
  ]);
  summary.getRow(1).font = { bold: true, size: 14 };
  summary.getCell("B19").alignment = { wrapText: true };

  const items = wb.addWorksheet("Line items");
  items.columns = [
    { header: "#", key: "sr", width: 5 },
    { header: "Description", key: "desc", width: 60 },
    { header: "Unit", key: "unit", width: 8 },
    { header: "Qty", key: "qty", width: 12 },
    { header: "Billed rate", key: "rate", width: 14 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "SoR code", key: "code", width: 16 },
    { header: "SoR base", key: "base", width: 12 },
    { header: "Index", key: "index", width: 8 },
    { header: "Adjusted SoR", key: "adj", width: 14 },
    { header: "Market median", key: "median", width: 14 },
    { header: "Benchmark", key: "bench", width: 14 },
    { header: "Variance %", key: "pct", width: 12 },
    { header: `Variance ${currency}`, key: "var", width: 14 },
    { header: "Verdict", key: "flag", width: 14 },
    { header: "Corrected", key: "corrected", width: 11 },
  ];
  items.getRow(1).font = { bold: true };
  items.views = [{ state: "frozen", ySplit: 1 }];

  for (const line of invoice.lineItems) {
    const unmatched = line.variance.benchmarkBasis === "none";
    items.addRow({
      sr: line.srNo,
      desc: line.description,
      unit: line.unit,
      qty: line.quantity,
      rate: line.rate,
      amount: line.amount,
      code: line.sorMatch?.code ?? "",
      base: line.sorMatch?.baseRate ?? "",
      index: line.sorMatch?.indexFactor ?? "",
      adj: line.sorMatch?.adjustedRate ?? "",
      median: line.variance.marketMedian ?? "",
      bench: unmatched ? "" : line.variance.benchmarkRate,
      pct: unmatched ? "" : Number(line.variance.variancePct.toFixed(2)),
      var: unmatched ? "" : Number(line.variance.varianceAmount.toFixed(2)),
      flag: unmatched ? "Unmatched" : FLAG_LABEL[line.variance.flag],
      corrected: line.corrected ? "Yes" : "",
    });
  }

  // Evidence sheet: every quote that fed a benchmark, so the report can be
  // re-examined without the app.
  const evidence = wb.addWorksheet("Market evidence");
  evidence.columns = [
    { header: "Line", key: "sr", width: 6 },
    { header: "Description", key: "desc", width: 50 },
    { header: "Platform", key: "platform", width: 18 },
    { header: "Seller", key: "seller", width: 26 },
    { header: "Price", key: "price", width: 12 },
    { header: "Unit", key: "unit", width: 8 },
    { header: "Location", key: "location", width: 16 },
    { header: "Fetched", key: "fetched", width: 22 },
    { header: "Source", key: "url", width: 60 },
  ];
  evidence.getRow(1).font = { bold: true };

  for (const line of invoice.lineItems) {
    for (const quote of line.marketQuotes) {
      evidence.addRow({
        sr: line.srNo,
        desc: line.description,
        platform: quote.platform,
        seller: quote.seller,
        price: quote.price,
        unit: quote.unit,
        location: quote.location,
        fetched: new Date(quote.fetchedAt).toLocaleString("en-IN"),
        url: quote.url,
      });
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ------------------------------------------------------------------ */

function buildPdf(invoice: AnalysedInvoice, orgName: string): Promise<Buffer> {
  const currency = invoice.city.currency ?? "INR";
  const taxLabel = invoice.city.region === "gcc" ? "VAT" : "GST";

  return new Promise((resolve, reject) => {
    // The built-in Helvetica avoids shipping font files; currency symbols that
    // fall outside its encoding are replaced by the ISO code (e.g. "INR", "AED").
    const doc = new PDFDocument({ size: "A4", margin: 40, font: "Helvetica" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).font("Helvetica-Bold").text("Variance report");
    doc.moveDown(0.3);
    doc.fontSize(9).font("Helvetica").fillColor("#555");
    doc.text(`${orgName}  ·  generated ${new Date().toLocaleString("en-IN")}`);
    doc.moveDown(1);

    doc.fillColor("#000").fontSize(11).font("Helvetica-Bold").text(invoice.number);
    doc.font("Helvetica").fontSize(9.5).fillColor("#333");
    doc.text(`Vendor: ${invoice.vendor}`);
    doc.text(`Project: ${invoice.project}`);
    doc.text(`City: ${invoice.city.name} (cost index ${invoice.city.indexFactor.toFixed(2)})  ·  ${currency}  ·  ${taxLabel} ${invoice.taxPct}%`);
    doc.text(`Uploaded: ${new Date(invoice.uploadedAt).toLocaleString("en-IN")}`);
    doc.moveDown(0.8);

    doc.fillColor("#000").fontSize(10).font("Helvetica-Bold").text("Summary");
    doc.font("Helvetica").fontSize(9.5).fillColor("#333");
    doc.text(`Net billed value: ${currency} ${money(invoice.subtotal, currency)}`);
    doc.text(`Benchmark value: ${currency} ${money(invoice.summary.benchmarkTotal, currency)}`);
    doc.text(`Variance: ${invoice.summary.variancePct.toFixed(2)}%`);
    doc.text(`Recoverable: ${currency} ${money(invoice.summary.potentialSaving, currency)}`);
    doc.text(
      `Verdicts: ${invoice.summary.overCount} over-priced, ${invoice.summary.parCount} at par, ` +
        `${invoice.summary.underCount} under-priced, ${invoice.summary.unmatchedCount} unmatched`,
    );
    doc.moveDown(0.8);

    doc.fillColor("#000").fontSize(10).font("Helvetica-Bold").text("Line items");
    doc.moveDown(0.3);

    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    const header = () => {
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#000");
      const y = doc.y;
      doc.text("#", left, y, { width: 16 });
      doc.text("Description", left + 18, y, { width: 210 });
      doc.text("Qty", left + 232, y, { width: 46, align: "right" });
      doc.text("Billed", left + 282, y, { width: 58, align: "right" });
      doc.text("Benchmark", left + 344, y, { width: 62, align: "right" });
      doc.text("Var %", left + 410, y, { width: 40, align: "right" });
      doc.text("Verdict", left + 454, y, { width: width - 454, align: "right" });
      doc.moveDown(0.4);
      doc
        .moveTo(left, doc.y)
        .lineTo(left + width, doc.y)
        .strokeColor("#ccc")
        .lineWidth(0.5)
        .stroke();
      doc.moveDown(0.3);
    };

    header();

    for (const line of invoice.lineItems) {
      if (doc.y > doc.page.height - 90) {
        doc.addPage();
        header();
      }

      const unmatched = line.variance.benchmarkBasis === "none";
      const y = doc.y;
      doc.fontSize(8).font("Helvetica").fillColor("#000");
      doc.text(String(line.srNo), left, y, { width: 16 });
      doc.text(line.description, left + 18, y, { width: 210 });
      const rowBottom = doc.y;

      doc.text(`${line.quantity} ${line.unit}`, left + 232, y, { width: 46, align: "right" });
      doc.text(money(line.rate), left + 282, y, { width: 58, align: "right" });
      doc.text(unmatched ? "—" : money(line.variance.benchmarkRate), left + 344, y, {
        width: 62,
        align: "right",
      });
      doc.text(
        unmatched ? "—" : `${line.variance.variancePct.toFixed(1)}%`,
        left + 410,
        y,
        { width: 40, align: "right" },
      );
      doc.text(unmatched ? "Unmatched" : FLAG_LABEL[line.variance.flag], left + 454, y, {
        width: width - 454,
        align: "right",
      });

      doc.y = Math.max(rowBottom, y + 10);
      doc.moveDown(0.25);
    }

    doc.moveDown(1);
    doc.fontSize(7.5).fillColor("#666");
    doc.text(
      `Method: benchmark = the median live market quote, location-adjusted. A published Schedule of Rates ` +
        `lags the market it prices, so where one matches the line it is carried as a cross-check rather than ` +
        `as part of the figure, and a disagreement beyond ${VARIANCE_CONFIG.sourceDivergenceRatio}x lowers the reported confidence. ` +
        `Items within ±${VARIANCE_CONFIG.parBandPct}% of benchmark are reported at par. ` +
        `The engine is deterministic: the same inputs reproduce this report exactly. ` +
        `Advisory decision-support, not a legally binding valuation.`,
      { width },
    );

    doc.end();
  });
}
