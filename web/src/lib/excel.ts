// exceljs is loaded lazily (only when the user exports) to keep the
// calculator's initial bundle small.
import type ExcelJSNS from 'exceljs';

export interface ScheduleRow {
  year: number; rent: number; interest: number; principal: number; balance: number; tax: number; cashflow: number;
}

/** Raw numeric assumptions — these become the editable (amber) cells. */
export interface CalcModel {
  price: number; notairePct: number; works: number; furnishing: number; rent: number;
  taxe: number; copro: number; mgmtPct: number; insurance: number; vacancyPct: number;
  down: number; rate: number; term: number; holdYears: number; rentGrowth: number;
  appreciation: number; sellCosts: number; tmi: number; abatement: number;
}

/** Precomputed results (embedded so the file shows values before recalc). */
export interface CalcResults {
  notaire: number; total: number; loan: number; payment: number; monthlyCharges: number;
  grossYield: number; netYield: number; coc: number; dscr: number | null; breakEvenOcc: number | null;
  cashflowM: number; exitValueNet: number; totalProfit: number; irrPct: number | null;
}

export interface ExcelLabels {
  editableHint: string;
  sInputs: string; sResults: string; sSchedule: string;
  iPrice: string; iNotaire: string; iWorks: string; iFurnishing: string; iRent: string;
  iTaxe: string; iCopro: string; iMgmt: string; iInsurance: string; iVacancy: string;
  iDown: string; iRate: string; iTerm: string; iHolding: string; iRentGrowth: string;
  iAppreciation: string; iSellingCosts: string; iTmi: string; iAbatement: string;
  rNotaire: string; rTotal: string; rLoan: string; rPayment: string; rChargesM: string;
  rGross: string; rNet: string; rCoC: string; rDSCR: string; rBreakeven: string;
  rCashflowM: string; rExitValue: string; rTotalProfit: string; rIRR: string;
  cYear: string; cRent: string; cInterest: string; cPrincipal: string; cBalance: string; cTax: string; cCashflow: string;
  uYear: string; uMonth: string;
}

export interface ExcelExportOpts {
  fileName: string;
  title: string;
  generatedLabel: string;
  disclaimer: string;
  model: CalcModel;
  results: CalcResults;
  schedule: ScheduleRow[];
  labels: ExcelLabels;
}

const TEAL = 'FF0D9488';
const TEAL_DK = 'FF0F766E';
const AMBER = 'FFFEF3C7';
const AMBER_BD = 'FFF59E0B';
const ZEBRA = 'FFF8FAFC';
const SLATE = 'FF334155';

const EUR = '#,##0 "€"';
const PCTL = '0.0"%"';   // value stored as whole number (7.5 → "7.5%")
const PCT = '0.0%';      // value stored as ratio (0.05 → "5.0%")
const NUM0 = '#,##0';
const RATIO2 = '0.00';

/** A faint, tiled diagonal "BLOOMINDER" watermark as a PNG data URL. */
function watermarkPng(): string {
  const c = document.createElement('canvas');
  c.width = 360; c.height = 360;
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
  const { model: m, results: R, labels: L } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bloominder';
  wb.created = new Date();
  const ws = wb.addWorksheet('Bloominder', { views: [{ showGridLines: false }] });

  ws.columns = [
    { width: 7 }, { width: 30 }, { width: 15 }, { width: 11 },
    { width: 14 }, { width: 12 }, { width: 14 },
  ];

  try {
    const imgId = wb.addImage({ base64: watermarkPng(), extension: 'png' });
    (ws as any).background = imgId;
  } catch { /* canvas unavailable */ }
  ws.headerFooter.oddFooter = '&LBloominder&Rbloominder.com';

  // ---- Title band ----
  ws.mergeCells('B1:G1');
  const t1 = ws.getCell('B1');
  t1.value = 'Bloominder';
  t1.font = { name: 'Arial', size: 22, bold: true, color: { argb: 'FFFFFFFF' } };
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
  t1.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 34;
  ['C1', 'D1', 'E1', 'F1', 'G1'].forEach((c) => {
    ws.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
  });
  ws.mergeCells('B2:G2');
  const t2 = ws.getCell('B2');
  t2.value = opts.title;
  t2.font = { size: 12, bold: true, color: { argb: SLATE } };
  ws.mergeCells('B3:G3');
  const t3 = ws.getCell('B3');
  t3.value = `${opts.generatedLabel}   ·   ${L.editableHint}`;
  t3.font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } };

  const sectionHeader = (row: number, label: string) => {
    ws.mergeCells(`B${row}:G${row}`);
    const cell = ws.getCell(`B${row}`);
    cell.value = label;
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
    cell.alignment = { indent: 1 };
    ws.getRow(row).height = 20;
  };

  // ---- INPUTS (editable amber cells) ----
  const IN = 6; // first input row
  sectionHeader(IN - 1, L.sInputs);
  const inputs: [string, number, string, string][] = [
    [L.iPrice, m.price, EUR, '€'],
    [L.iNotaire, m.notairePct, PCTL, '%'],
    [L.iWorks, m.works, EUR, '€'],
    [L.iFurnishing, m.furnishing, EUR, '€'],
    [L.iRent, m.rent, EUR, `€${L.uMonth}`],
    [L.iTaxe, m.taxe, EUR, '€/an'],
    [L.iCopro, m.copro, EUR, `€${L.uMonth}`],
    [L.iMgmt, m.mgmtPct, PCTL, '%'],
    [L.iInsurance, m.insurance, EUR, `€${L.uMonth}`],
    [L.iVacancy, m.vacancyPct, PCTL, '%'],
    [L.iDown, m.down, EUR, '€'],
    [L.iRate, m.rate, PCTL, '%'],
    [L.iTerm, m.term, NUM0, L.uYear],
    [L.iHolding, m.holdYears, NUM0, L.uYear],
    [L.iRentGrowth, m.rentGrowth, PCTL, '%'],
    [L.iAppreciation, m.appreciation, PCTL, '%'],
    [L.iSellingCosts, m.sellCosts, PCTL, '%'],
    [L.iTmi, m.tmi, PCTL, '%'],
    [L.iAbatement, m.abatement, RATIO2, ''],
  ];
  inputs.forEach(([label, value, fmt, unit], i) => {
    const row = IN + i;
    const b = ws.getCell(`B${row}`);
    const c = ws.getCell(`C${row}`);
    const d = ws.getCell(`D${row}`);
    b.value = label;
    b.font = { size: 10, color: { argb: SLATE } };
    c.value = value;
    c.numFmt = fmt;
    c.font = { size: 10, bold: true, color: { argb: 'FF92400E' } };
    c.alignment = { horizontal: 'right' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMBER } };
    c.border = {
      top: { style: 'thin', color: { argb: AMBER_BD } }, bottom: { style: 'thin', color: { argb: AMBER_BD } },
      left: { style: 'thin', color: { argb: AMBER_BD } }, right: { style: 'thin', color: { argb: AMBER_BD } },
    };
    d.value = unit;
    d.font = { size: 9, color: { argb: 'FF94A3B8' } };
  });
  // cell refs by input key
  const r = {
    price: IN, notairePct: IN + 1, works: IN + 2, furnishing: IN + 3, rent: IN + 4,
    taxe: IN + 5, copro: IN + 6, mgmtPct: IN + 7, insurance: IN + 8, vacancyPct: IN + 9,
    down: IN + 10, rate: IN + 11, term: IN + 12, holdYears: IN + 13, rentGrowth: IN + 14,
    appreciation: IN + 15, sellCosts: IN + 16, tmi: IN + 17, abatement: IN + 18,
  };
  const C = (row: number) => `C${row}`;

  // ---- Layout (rows computed so results can forward-reference the schedule) ----
  const N_RESULTS = 14;
  const RS = IN + inputs.length + 1; // results section header (one blank row after inputs)
  const SH = RS + N_RESULTS + 2;     // schedule section header (teal)
  const HEAD = SH + 1;               // schedule column header (dark)
  const Y0 = SH + 2;                 // year-0 row (down-payment outflow, for IRR)
  const Y1 = SH + 3;                 // first projected year
  const LAST = Y1 + opts.schedule.length - 1;
  const gRange = `G${Y0}:G${LAST}`;

  // ---- RESULTS (formulas) ----
  sectionHeader(RS, L.sResults);
  let rr = RS + 1;
  const addResult = (label: string, formula: string, result: number, fmt: string, strong = false, unit = '') => {
    const b = ws.getCell(`B${rr}`);
    const c = ws.getCell(`C${rr}`);
    const d = ws.getCell(`D${rr}`);
    b.value = label;
    b.font = { size: 10, color: { argb: SLATE } };
    c.value = { formula, result } as any;
    c.numFmt = fmt;
    c.font = { size: 10, bold: strong, color: { argb: strong ? TEAL_DK : 'FF0F172A' } };
    c.alignment = { horizontal: 'right' };
    if (unit) { d.value = unit; d.font = { size: 9, color: { argb: 'FF94A3B8' } }; }
    rr++;
  };
  addResult(L.rNotaire, `${C(r.price)}*${C(r.notairePct)}/100`, R.notaire, EUR, false, '€');
  const notaireRow = rr - 1;
  addResult(L.rTotal, `${C(r.price)}+C${notaireRow}+${C(r.works)}+${C(r.furnishing)}`, R.total, EUR, true, '€');
  const totalRow = rr - 1;
  addResult(L.rLoan, `MAX(0,C${totalRow}-${C(r.down)})`, R.loan, EUR, false, '€');
  const loanRow = rr - 1;
  addResult(L.rPayment, `IF(C${loanRow}<=0,0,-PMT(${C(r.rate)}/100/12,${C(r.term)}*12,C${loanRow}))`, R.payment, EUR, false, L.uMonth.trim() || '€');
  const payRow = rr - 1;
  addResult(L.rChargesM, `${C(r.taxe)}/12+${C(r.copro)}+${C(r.rent)}*${C(r.mgmtPct)}/100+${C(r.insurance)}+${C(r.rent)}*${C(r.vacancyPct)}/100`, R.monthlyCharges, EUR, false, L.uMonth.trim() || '€');
  const chgRow = rr - 1;
  addResult(L.rGross, `${C(r.rent)}*12/C${totalRow}`, R.grossYield / 100, PCT);
  addResult(L.rNet, `(${C(r.rent)}-C${chgRow})*12/C${totalRow}`, R.netYield / 100, PCT, true);
  addResult(L.rCoC, `(${C(r.rent)}-C${chgRow}-C${payRow})*12/${C(r.down)}`, R.coc / 100, PCT);
  addResult(L.rDSCR, `(${C(r.rent)}-C${chgRow})*12/(C${payRow}*12)`, R.dscr ?? 0, RATIO2);
  addResult(L.rBreakeven, `(${C(r.taxe)}/12+${C(r.copro)}+${C(r.insurance)}+${C(r.rent)}*${C(r.mgmtPct)}/100+C${payRow})/${C(r.rent)}`, (R.breakEvenOcc ?? 0) / 100, PCT);
  addResult(L.rCashflowM, `${C(r.rent)}-C${chgRow}-C${payRow}`, R.cashflowM, EUR, true, L.uMonth.trim() || '€');
  addResult(L.rExitValue, `${C(r.price)}*(1+${C(r.appreciation)}/100)^${C(r.holdYears)}*(1-${C(r.sellCosts)}/100)`, R.exitValueNet, EUR, false, '€');
  const exitRow = rr - 1;
  addResult(L.rTotalProfit, `SUM(${gRange})`, R.totalProfit, EUR, true, '€');
  addResult(L.rIRR, `IFERROR(IRR(${gRange}),0)`, (R.irrPct ?? 0) / 100, PCT, true);

  // ---- SCHEDULE rows ----
  sectionHeader(SH, L.sSchedule);
  const heads = [L.cYear, L.cRent, L.cInterest, L.cPrincipal, L.cBalance, L.cTax, L.cCashflow];
  const hr = ws.getRow(HEAD);
  heads.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE } };
    cell.alignment = { horizontal: i === 0 ? 'left' : 'right' };
  });

  // Year 0: only the down-payment outflow (for IRR).
  const y0 = ws.getRow(Y0);
  y0.getCell(1).value = 0;
  y0.getCell(7).value = { formula: `-${C(r.down)}`, result: -m.down } as any;
  y0.getCell(7).numFmt = NUM0;
  for (let i = 1; i <= 7; i++) y0.getCell(i).font = { size: 9, color: { argb: 'FF0F172A' } };

  opts.schedule.forEach((s, idx) => {
    const row = Y1 + idx;
    const A = `A${row}`;
    const rowObj = ws.getRow(row);
    const startP = `((${A}-1)*12+1)`;
    const endP = `MIN(${A}*12,${C(r.term)}*12)`;
    const rateRef = `${C(r.rate)}/100/12`;
    const nperRef = `${C(r.term)}*12`;
    const rentCell = `B${row}`;
    const balCell = `E${row}`;
    const taxCell = `F${row}`;
    const cells: { col: number; formula: string; result: number; fmt: string }[] = [
      { col: 1, formula: '', result: s.year, fmt: NUM0 },
      {
        col: 2,
        formula: idx === 0 ? `${C(r.rent)}*12` : `B${row - 1}*(1+${C(r.rentGrowth)}/100)`,
        result: s.rent, fmt: NUM0,
      },
      {
        col: 3,
        formula: `IF(${startP}>${nperRef},0,-CUMIPMT(${rateRef},${nperRef},C${loanRow},${startP},${endP},0))`,
        result: s.interest, fmt: NUM0,
      },
      {
        col: 4,
        formula: `IF(${startP}>${nperRef},0,-CUMPRINC(${rateRef},${nperRef},C${loanRow},${startP},${endP},0))`,
        result: s.principal, fmt: NUM0,
      },
      {
        col: 5,
        formula: `MAX(0,C${loanRow}+CUMPRINC(${rateRef},${nperRef},C${loanRow},1,${endP},0))`,
        result: s.balance, fmt: NUM0,
      },
      {
        col: 6,
        formula: `MAX(0,${rentCell}*(1-${C(r.abatement)}))*(${C(r.tmi)}/100+0.172)`,
        result: s.tax, fmt: NUM0,
      },
      {
        col: 7,
        formula: `${rentCell}-C${chgRow}*12-C${payRow}*12-${taxCell}+IF(${A}=${C(r.holdYears)},C${exitRow}-${balCell},0)`,
        result: s.cashflow, fmt: NUM0,
      },
    ];
    cells.forEach(({ col, formula, result, fmt }) => {
      const cell = rowObj.getCell(col);
      cell.value = formula ? ({ formula, result } as any) : result;
      cell.numFmt = fmt;
      cell.font = { size: 9, color: { argb: 'FF0F172A' } };
      cell.alignment = { horizontal: col === 1 ? 'left' : 'right' };
    });
    if (idx % 2 === 1) rowObj.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }; });
  });

  // ---- Disclaimer ----
  const discRow = LAST + 2;
  ws.mergeCells(`A${discRow}:G${discRow}`);
  const disc = ws.getCell(`A${discRow}`);
  disc.value = opts.disclaimer;
  disc.font = { size: 8, italic: true, color: { argb: 'FF94A3B8' } };
  disc.alignment = { wrapText: true };

  ws.views = [{ state: 'frozen', ySplit: 4 }];
  await download(wb, opts.fileName);
}

async function download(wb: ExcelJSNS.Workbook, fileName: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Address-estimation dossier (snapshot, not a live model)
// ---------------------------------------------------------------------------
export interface EstimationExportOpts {
  fileName: string; title: string; generatedLabel: string; disclaimer: string;
  address: string;
  surface: number;
  estimate: { value: number | null; low: number | null; high: number | null; medianM2: number | null; reliability: string; n: number };
  parcel?: { ref: string; land: number | null } | null;
  city?: { name: string; scoreGlobal: number | null; medianM2: number | null; yieldPct: number | null; population: number | null; income: number | null } | null;
  comps: { date: string; type: string; surface: number | null; prixM2: number | null; prix: number }[];
  labels: {
    sEstimate: string; sPosition: string; sCity: string; sComps: string;
    estValue: string; estRange: string; estPerM2: string; reliability: string; basedOn: string;
    surface: string; parcelRef: string; land: string;
    scoreGlobal: string; priceM2: string; yieldLbl: string; population: string; income: string;
    cDate: string; cType: string; cSurface: string; cPriceM2: string; cPrice: string;
  };
}

export async function exportEstimationXlsx(opts: EstimationExportOpts): Promise<void> {
  const ExcelJS: typeof ExcelJSNS = (await import('exceljs')).default;
  const { estimate: E, city, parcel, labels: L } = opts;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bloominder';
  wb.created = new Date();
  const ws = wb.addWorksheet('Bloominder', { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 3 }, { width: 26 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }];

  try {
    const imgId = wb.addImage({ base64: watermarkPng(), extension: 'png' });
    (ws as any).background = imgId;
  } catch { /* canvas unavailable */ }
  ws.headerFooter.oddFooter = '&LBloominder&Rbloominder.com';

  ws.mergeCells('B1:F1');
  const t1 = ws.getCell('B1');
  t1.value = 'Bloominder';
  t1.font = { name: 'Arial', size: 22, bold: true, color: { argb: 'FFFFFFFF' } };
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
  t1.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 34;
  ['C1', 'D1', 'E1', 'F1'].forEach((c) => { ws.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } }; });
  ws.mergeCells('B2:F2');
  ws.getCell('B2').value = opts.title;
  ws.getCell('B2').font = { size: 12, bold: true, color: { argb: SLATE } };
  ws.mergeCells('B3:F3');
  ws.getCell('B3').value = `${opts.generatedLabel}   ·   ${opts.address}`;
  ws.getCell('B3').font = { size: 9, italic: true, color: { argb: 'FF94A3B8' } };

  let row = 5;
  const section = (label: string) => {
    ws.mergeCells(`B${row}:F${row}`);
    const cell = ws.getCell(`B${row}`);
    cell.value = label;
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
    cell.alignment = { indent: 1 };
    ws.getRow(row).height = 20;
    row++;
  };
  const kv = (label: string, value: string | number, fmt?: string, strong = false) => {
    const b = ws.getCell(`B${row}`); const c = ws.getCell(`C${row}`);
    b.value = label; b.font = { size: 10, color: { argb: SLATE } };
    c.value = value; if (fmt) c.numFmt = fmt;
    c.font = { size: strong ? 13 : 10, bold: strong, color: { argb: strong ? TEAL_DK : 'FF0F172A' } };
    c.alignment = { horizontal: 'right' };
    if (row % 2 === 0) { b.fill = c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }; }
    row++;
  };

  section(L.sEstimate);
  kv(L.surface, opts.surface, '#,##0 "m²"');
  if (E.value != null) kv(L.estValue, E.value, EUR, true);
  if (E.low != null && E.high != null) kv(L.estRange, `${E.low.toLocaleString('fr-FR')} – ${E.high.toLocaleString('fr-FR')} €`);
  if (E.medianM2 != null) kv(L.estPerM2, E.medianM2, '#,##0 "€/m²"');
  kv(L.reliability, E.reliability);
  kv(L.basedOn, E.n);
  row++;

  if (parcel) {
    section(L.sPosition);
    kv(L.parcelRef, parcel.ref);
    if (parcel.land != null) kv(L.land, parcel.land, '#,##0 "m²"');
    row++;
  }

  if (city) {
    section(`${L.sCity} — ${city.name}`);
    if (city.scoreGlobal != null) kv(L.scoreGlobal, Math.round(city.scoreGlobal), '0');
    if (city.medianM2 != null) kv(L.priceM2, city.medianM2, '#,##0 "€/m²"');
    if (city.yieldPct != null) kv(L.yieldLbl, city.yieldPct / 100, '0.0%');
    if (city.population != null) kv(L.population, city.population, '#,##0');
    if (city.income != null) kv(L.income, city.income, EUR);
    row++;
  }

  if (opts.comps.length) {
    section(L.sComps);
    const heads = [L.cDate, L.cType, L.cSurface, L.cPriceM2, L.cPrice];
    const hr = ws.getRow(row);
    heads.forEach((h, i) => {
      const cell = hr.getCell(i + 2);
      cell.value = h;
      cell.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SLATE } };
      cell.alignment = { horizontal: i === 0 || i === 1 ? 'left' : 'right' };
    });
    row++;
    opts.comps.slice(0, 15).forEach((c, idx) => {
      const r = ws.getRow(row);
      r.getCell(2).value = c.date;
      r.getCell(3).value = c.type;
      r.getCell(4).value = c.surface ?? '—'; r.getCell(4).numFmt = '#,##0 "m²"';
      r.getCell(5).value = c.prixM2 ?? '—'; r.getCell(5).numFmt = '#,##0 "€"';
      r.getCell(6).value = c.prix; r.getCell(6).numFmt = EUR;
      for (let i = 2; i <= 6; i++) {
        r.getCell(i).font = { size: 9, color: { argb: 'FF0F172A' } };
        r.getCell(i).alignment = { horizontal: i <= 3 ? 'left' : 'right' };
      }
      if (idx % 2 === 1) for (let i = 2; i <= 6; i++) r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      row++;
    });
    row++;
  }

  ws.mergeCells(`B${row}:F${row}`);
  const disc = ws.getCell(`B${row}`);
  disc.value = opts.disclaimer;
  disc.font = { size: 8, italic: true, color: { argb: 'FF94A3B8' } };
  disc.alignment = { wrapText: true };

  ws.views = [{ state: 'frozen', ySplit: 4 }];
  await download(wb, opts.fileName);
}
