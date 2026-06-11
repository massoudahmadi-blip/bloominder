// exceljs is loaded lazily (only when the user exports) to keep the
// calculator's initial bundle small.
import type ExcelJSNS from 'exceljs';

export interface ScheduleRow {
  year: number;
  rent: number;
  interest: number;
  principal: number;
  balance: number;
  tax: number;
  cashflow: number;
}

export interface ExcelExportOpts {
  fileName: string;
  title: string;
  generatedLabel: string;
  inputs: { label: string; value: string }[];
  results: { label: string; value: string }[];
  schedule: ScheduleRow[];
  scheduleHeaders: string[]; // 7 column headers
  sectionInputs: string;
  sectionResults: string;
  sectionSchedule: string;
  disclaimer: string;
}

const TEAL = 'FF0D9488';
const STONE = 'FFF5F5F4';

/** A faint, tiled diagonal "BLOOMINDER" watermark as a PNG data URL. */
function watermarkPng(): string {
  const c = document.createElement('canvas');
  c.width = 360;
  c.height = 360;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((-30 * Math.PI) / 180);
  ctx.font = 'bold 30px Arial';
  ctx.fillStyle = 'rgba(13,148,136,0.07)';
  ctx.textAlign = 'center';
  ctx.fillText('BLOOMINDER', 0, 0);
  return c.toDataURL('image/png');
}

export async function exportCalculatorXlsx(opts: ExcelExportOpts): Promise<void> {
  const ExcelJS: typeof ExcelJSNS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bloominder';
  wb.created = new Date();
  const ws = wb.addWorksheet('Bloominder', {
    properties: { defaultColWidth: 18 },
    views: [{ showGridLines: false }],
  });

  // Tiled watermark behind the data.
  try {
    const imgId = wb.addImage({ base64: watermarkPng(), extension: 'png' });
    (ws as any).background = imgId; // exceljs tiles a background image across the sheet
  } catch {
    /* canvas unavailable — skip watermark */
  }

  ws.headerFooter.oddFooter = '&LBloominder · bloominder.com&Rbloominder.com';

  let row = 1;
  const title = ws.getCell(`A${row}`);
  title.value = 'Bloominder';
  title.font = { name: 'Arial', size: 20, bold: true, color: { argb: TEAL } };
  row++;
  const sub = ws.getCell(`A${row}`);
  sub.value = opts.title;
  sub.font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF334155' } };
  row++;
  ws.getCell(`A${row}`).value = opts.generatedLabel;
  ws.getCell(`A${row}`).font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } };
  row += 2;

  const sectionHeader = (label: string) => {
    const cell = ws.getCell(`A${row}`);
    cell.value = label;
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
    ws.mergeCells(`A${row}:B${row}`);
    ws.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
    row++;
  };

  const kvRow = (label: string, value: string, strong = false) => {
    const a = ws.getCell(`A${row}`);
    const b = ws.getCell(`B${row}`);
    a.value = label;
    b.value = value;
    a.font = { size: 10, color: { argb: 'FF475569' } };
    b.font = { size: 10, bold: strong, color: { argb: strong ? TEAL : 'FF0F172A' } };
    b.alignment = { horizontal: 'right' };
    if (row % 2 === 0) {
      a.fill = b.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STONE } };
    }
    row++;
  };

  sectionHeader(opts.sectionInputs);
  opts.inputs.forEach((i) => kvRow(i.label, i.value));
  row++;

  sectionHeader(opts.sectionResults);
  opts.results.forEach((r, i) => kvRow(r.label, r.value, i >= opts.results.length - 4));
  row++;

  // Projection schedule table.
  sectionHeader(opts.sectionSchedule);
  const headerRow = ws.getRow(row);
  opts.scheduleHeaders.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    cell.alignment = { horizontal: i === 0 ? 'left' : 'right' };
  });
  row++;
  opts.schedule.forEach((s) => {
    const r = ws.getRow(row);
    const vals = [s.year, s.rent, s.interest, s.principal, s.balance, s.tax, s.cashflow];
    vals.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v;
      cell.font = { size: 9, color: { argb: 'FF0F172A' } };
      cell.alignment = { horizontal: i === 0 ? 'left' : 'right' };
      if (i > 0) cell.numFmt = '#,##0';
    });
    if (row % 2 === 0) r.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STONE } }; });
    row++;
  });
  row += 2;

  const disc = ws.getCell(`A${row}`);
  disc.value = opts.disclaimer;
  disc.font = { size: 8, italic: true, color: { argb: 'FF94A3B8' } };
  ws.mergeCells(`A${row}:G${row}`);
  disc.alignment = { wrapText: true };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = opts.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
