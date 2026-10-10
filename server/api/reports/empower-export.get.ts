import ExcelJS from "exceljs";
import { CATEGORY_COLUMNS, computeEmpowerReport } from "~~/server/utils/empowerReport";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const month = typeof query.month === "string" && query.month
    ? query.month
    : new Date().toISOString().slice(0, 7);
  const pastorName = typeof query.pastorName === "string" ? query.pastorName : "";

  const report = await computeEmpowerReport(month, pastorName);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Statistical Report");

  const NAVY = "FF1E293B";
  const HEADER_FONT = { bold: true, color: { argb: "FFFFFFFF" } };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" },
  };

  ws.mergeCells("A1:C2");
  ws.getCell("A1").value = "EMPOWER GLOBAL";
  ws.getCell("A1").font = { bold: true, size: 16 };
  ws.mergeCells("D1:N1");
  ws.getCell("D1").value = "STATISTICAL REPORT";
  ws.getCell("D1").font = { bold: true, size: 18 };

  ws.getCell("D3").value = "For The Month Of:";
  ws.getCell("F3").value = report.monthLabel;
  ws.getCell("D4").value = "Name of Local Church:";
  ws.getCell("F4").value = report.churchName;
  ws.getCell("D5").value = "Name of Pastor:";
  ws.getCell("F5").value = report.pastorName;

  const headerRow1 = 7;
  const headerRow2 = 8;
  ws.mergeCells(headerRow1, 1, headerRow2, 1);
  ws.getCell(headerRow1, 1).value = "CUT-OFF PERIOD";
  ws.mergeCells(headerRow1, 2, headerRow1, 3);
  ws.getCell(headerRow1, 2).value = "All Official Activities Except Bible Study";
  ws.mergeCells(headerRow1, 4, headerRow1, 6);
  ws.getCell(headerRow1, 4).value = "BIBLE STUDY";
  ws.mergeCells(headerRow1, 7, headerRow1, 14);
  ws.getCell(headerRow1, 7).value = "EMPOWER POPULATION";

  const subHeaders = ["", "First Timer", "Running Total", "Actual BS Conducted", "First Timer", "Attendees",
    "Kids (0-8)", "Tweens (9-12)", "YTH (13-22)", "NXT (23-39)", "Solo Parent", "Senior Adult (40-59)", "Couples", "Legacy (60+)", "Total EPOP"];
  ws.mergeCells(headerRow1, 15, headerRow2, 15);
  ws.getCell(headerRow1, 15).value = "TOTAL EPOP";
  subHeaders.forEach((label, i) => {
    if (i === 0 || i === subHeaders.length - 1) return;
    ws.getCell(headerRow2, i + 1).value = label;
  });

  for (let r = headerRow1; r <= headerRow2; r++) {
    for (let c = 1; c <= 15; c++) {
      const cell = ws.getCell(r, c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
      cell.font = HEADER_FONT;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = thinBorder;
    }
  }

  let rowIndex = headerRow2 + 1;
  function writeRow(label: string, r: {
    firstTimerAllOfficial: number | null; runningTotal: number | null; actualBSConducted: number | null;
    firstTimerBS: number | null; attendees: number | null; categories: Record<string, number> | null; totalEpop: number | null;
  }) {
    const row = ws.getRow(rowIndex);
    row.getCell(1).value = label;
    row.getCell(2).value = r.firstTimerAllOfficial;
    row.getCell(3).value = r.runningTotal;
    row.getCell(4).value = r.actualBSConducted;
    row.getCell(5).value = r.firstTimerBS;
    row.getCell(6).value = r.attendees;
    CATEGORY_COLUMNS.forEach((cat, i) => {
      row.getCell(7 + i).value = r.categories?.[cat] ?? null;
    });
    row.getCell(15).value = r.totalEpop;
    for (let c = 1; c <= 15; c++) {
      row.getCell(c).border = thinBorder;
      row.getCell(c).alignment = { horizontal: c === 1 ? "left" : "center", vertical: "middle" };
    }
    row.getCell(15).font = { bold: true, italic: true };
    rowIndex++;
  }

  writeRow(report.base.label, report.base);
  report.periods.forEach((p) => writeRow(p.label, p));

  const totalRow = ws.getRow(rowIndex);
  totalRow.getCell(1).value = report.totals.label;
  totalRow.getCell(2).value = report.totals.firstTimerAllOfficial;
  totalRow.getCell(3).value = report.totals.runningTotal;
  totalRow.getCell(4).value = report.totals.actualBSConducted;
  totalRow.getCell(5).value = report.totals.firstTimerBS;
  totalRow.getCell(6).value = report.totals.attendees;
  CATEGORY_COLUMNS.forEach((cat, i) => {
    totalRow.getCell(7 + i).value = report.totals.categories?.[cat] ?? null;
  });
  totalRow.getCell(15).value = report.totals.totalEpop;
  for (let c = 1; c <= 15; c++) {
    const cell = totalRow.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.font = HEADER_FONT;
    cell.border = thinBorder;
    cell.alignment = { horizontal: c === 1 ? "left" : "center", vertical: "middle" };
  }
  rowIndex++;

  ws.getColumn(1).width = 20;
  for (let c = 2; c <= 15; c++) ws.getColumn(c).width = 13;

  // The page's notes (Unassigned members, leaders counted once in Attendees)
  // are info for whoever prepares the report — not part of the submitted file.

  const buffer = await wb.xlsx.writeBuffer();
  setResponseHeader(event, "content-type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  setResponseHeader(event, "content-disposition", `attachment; filename="Empower-Statistical-Report-${month}.xlsx"`);
  return buffer;
});
