/**
 * Excel (.xlsx) export matching the CRM cashflow worksheet: structure, colours, and formulas.
 */
import ExcelJS from 'exceljs';
import {
  ALL_CASHFLOW_LINES,
  CASHFLOW_SECTION_LABELS,
  type CashflowSection,
} from '../config/businessPlanRef';
import { LANDING_STANDARDS_PACKAGE_CENTS } from '../config/customerProducts';
import { MEMBERSHIP_ANNUAL_CENTS } from '../config/pricing';
import { CASHFLOW_UNIT_ROWS, WORKSPACE_MONTHLY_ARPU_CENTS } from '../config/salesFunnelModel';
import { formatMonthLabel } from './businessPlan';
import type { BusinessCashflowLine, CashflowPeriodTotals } from './businessCashflow';
import type { CashflowUnitGrid } from './businessCashflowUnits';

/** Receipt expected $ = unit count × unit price (matches CRM volume → receipts). */
const RECEIPT_FROM_UNITS: Record<string, { unitKey: string; unitPriceDollars: number }> = {
  sales: { unitKey: 'badges', unitPriceDollars: MEMBERSHIP_ANNUAL_CENTS / 100 },
  sales_other: { unitKey: 'packages', unitPriceDollars: LANDING_STANDARDS_PACKAGE_CENTS / 100 },
  workspace_saas: { unitKey: 'workspace_active', unitPriceDollars: WORKSPACE_MONTHLY_ARPU_CENTS / 100 },
};

const MONEY_FMT = '"$"#,##0.00';
const COUNT_FMT = '#,##0';

const FILL = {
  skyHeader: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE0F2FE' } },
  skyRow: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0F9FF' } },
  skyExp: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFBAE6FD' } },
  receiptHeader: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFD1FAE5' } },
  receiptRow: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFECFDF5' } },
  expenseHeader: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFECACA' } },
  expenseRow: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFEF2F2' } },
  formulaHeader: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1F2937' } },
  formulaRow: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF3F4F6' } },
  totalCol: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF9FAFB' } },
};

const FONT = {
  header: { bold: true, size: 10, name: 'Calibri' },
  section: { bold: true, size: 9, name: 'Calibri' },
  body: { size: 9, name: 'Calibri' },
  formula: { bold: true, size: 9, name: 'Calibri' },
};

type Grid = Record<string, Record<string, BusinessCashflowLine>>;

function colExp(monthIndex: number): number {
  return 2 + monthIndex * 2;
}

function colAct(monthIndex: number): number {
  return 3 + monthIndex * 2;
}

function colTotalExp(periodCount: number): number {
  return 2 + periodCount * 2;
}

function colTotalAct(periodCount: number): number {
  return 3 + periodCount * 2;
}

function lastDataCol(periodCount: number): number {
  return colTotalAct(periodCount);
}

class CashflowSheetWriter {
  readonly ws: ExcelJS.Worksheet;
  readonly periods: string[];
  row = 1;
  readonly sectionLineRows: Record<CashflowSection, number[]> = {
    receipt: [],
    expense_gst: [],
    expense_non_gst: [],
    other_payment: [],
  };

  /** Row numbers for volume unit lines (badges, packages, …). */
  unitRows: Record<string, number> = {};

  formulaRows: {
    totalReceipts?: number;
    subtotalGst?: number;
    subtotalNonGst?: number;
    totalExpenses?: number;
    totalOther?: number;
    totalPayments?: number;
    operatingProfit?: number;
    netCashflow?: number;
    opening?: number;
    closing?: number;
  } = {};

  constructor(ws: ExcelJS.Worksheet, periods: string[]) {
    this.ws = ws;
    this.periods = periods;
  }

  ref(col: number, row: number): string {
    return `${this.ws.getColumn(col).letter}${row}`;
  }

  private setLabel(cell: ExcelJS.Cell, text: string, style?: Partial<ExcelJS.Style>) {
    cell.value = text;
    cell.font = { ...FONT.body, ...style?.font };
    if (style?.fill) cell.fill = style.fill;
    if (style?.alignment) cell.alignment = style.alignment;
  }

  private mergeSectionTitle(text: string, fill: ExcelJS.Fill) {
    const r = this.row;
    const endCol = lastDataCol(this.periods.length);
    this.ws.mergeCells(r, 1, r, endCol);
    const cell = this.ws.getCell(r, 1);
    this.setLabel(cell, text, { font: FONT.section, fill });
    this.row += 1;
  }

  writePeriodHeaders() {
    const r1 = this.row;
    this.setLabel(this.ws.getCell(r1, 1), 'Line', { font: FONT.header });
    this.periods.forEach((p, i) => {
      const start = colExp(i);
      this.ws.mergeCells(r1, start, r1, colAct(i));
      const cell = this.ws.getCell(r1, start);
      cell.value = formatMonthLabel(p);
      cell.font = FONT.header;
      cell.alignment = { horizontal: 'center' };
    });
    const te = colTotalExp(this.periods.length);
    const ta = colTotalAct(this.periods.length);
    this.ws.mergeCells(r1, te, r1, ta);
    const tCell = this.ws.getCell(r1, te);
    tCell.value = 'TOTAL';
    tCell.font = FONT.header;
    tCell.alignment = { horizontal: 'center' };
    tCell.fill = FILL.totalCol;
    this.row += 1;

    const r2 = this.row;
    this.ws.getCell(r2, 1).value = '';
    this.periods.forEach((_, i) => {
      const exp = this.ws.getCell(r2, colExp(i));
      exp.value = 'Exp';
      exp.font = { ...FONT.header, size: 8 };
      exp.alignment = { horizontal: 'right' };
      const act = this.ws.getCell(r2, colAct(i));
      act.value = 'Act';
      act.font = { ...FONT.header, size: 8 };
      act.alignment = { horizontal: 'right' };
    });
    this.ws.getCell(r2, te).value = 'Exp';
    this.ws.getCell(r2, ta).value = 'Act';
    this.row += 1;
  }

  /** Stripe merchant fee in dollars from receipt dollars (same as stripeMerchantFeesCents). */
  private stripeFeeFormula(receiptsDollarsRef: string): string {
    return `IF(${receiptsDollarsRef}>0,ROUND(${receiptsDollarsRef}*100*0.029+MAX(2,ROUNDUP(${receiptsDollarsRef}*100/40000,0))*30,0)/100,0.15)`;
  }

  private writeCountRow(
    label: string,
    getCount: (period: string, field: 'expected' | 'actual') => number,
    fill?: ExcelJS.Fill,
  ): number {
    const r = this.row;
    this.setLabel(this.ws.getCell(r, 1), label, { fill });
    this.periods.forEach((p, i) => {
      const exp = getCount(p, 'expected');
      const act = getCount(p, 'actual');
      const expCell = this.ws.getCell(r, colExp(i));
      const actCell = this.ws.getCell(r, colAct(i));
      expCell.value = exp;
      actCell.value = act;
      expCell.numFmt = COUNT_FMT;
      actCell.numFmt = COUNT_FMT;
      if (fill) {
        expCell.fill = FILL.skyExp;
        actCell.fill = fill;
      }
      const te = colTotalExp(this.periods.length);
      const ta = colTotalAct(this.periods.length);
      const firstExp = this.ref(colExp(0), r);
      const lastExp = this.ref(colExp(this.periods.length - 1), r);
      const firstAct = this.ref(colAct(0), r);
      const lastAct = this.ref(colAct(this.periods.length - 1), r);
      this.ws.getCell(r, te).value = { formula: `SUM(${firstExp}:${lastExp})` };
      this.ws.getCell(r, ta).value = { formula: `SUM(${firstAct}:${lastAct})` };
      this.ws.getCell(r, te).numFmt = COUNT_FMT;
      this.ws.getCell(r, ta).numFmt = COUNT_FMT;
    });
    this.row += 1;
    return r;
  }

  /** Expected & actual $ linked to a volume unit row × unit price. */
  private writeUnitLinkedMoneyRow(
    label: string,
    unitKey: string,
    unitPriceDollars: number,
    fill: ExcelJS.Fill,
  ): number {
    const unitRow = this.unitRows[unitKey];
    const r = this.row;
    this.setLabel(this.ws.getCell(r, 1), label, { fill });
    this.ws.getCell(r, 1).font = { ...FONT.body, italic: true };

    this.periods.forEach((_, i) => {
      const expCol = colExp(i);
      const actCol = colAct(i);
      const expCell = this.ws.getCell(r, expCol);
      const actCell = this.ws.getCell(r, actCol);
      const unitExp = this.ref(expCol, unitRow);
      const unitAct = this.ref(actCol, unitRow);
      expCell.value = { formula: `${unitExp}*${unitPriceDollars}` };
      actCell.value = { formula: `${unitAct}*${unitPriceDollars}` };
      for (const cell of [expCell, actCell]) {
        cell.numFmt = MONEY_FMT;
        cell.font = { color: { argb: 'FF047857' }, bold: true, size: 9, name: 'Calibri' };
        cell.fill = fill;
      }
    });

    const te = colTotalExp(this.periods.length);
    const ta = colTotalAct(this.periods.length);
    const firstExp = this.ref(colExp(0), r);
    const lastExp = this.ref(colExp(this.periods.length - 1), r);
    const firstAct = this.ref(colAct(0), r);
    const lastAct = this.ref(colAct(this.periods.length - 1), r);
    this.ws.getCell(r, te).value = { formula: `SUM(${firstExp}:${lastExp})` };
    this.ws.getCell(r, ta).value = { formula: `SUM(${firstAct}:${lastAct})` };
    this.ws.getCell(r, te).numFmt = MONEY_FMT;
    this.ws.getCell(r, ta).numFmt = MONEY_FMT;
    this.ws.getCell(r, te).fill = FILL.totalCol;
    this.ws.getCell(r, ta).fill = FILL.totalCol;
    this.row += 1;
    return r;
  }

  private writeMoneyRow(
    label: string,
    section: CashflowSection | 'formula',
    getCents: (period: string, field: 'expected' | 'actual') => number,
    opts?: { fill?: ExcelJS.Fill; bold?: boolean; isFormulaRow?: boolean },
  ) {
    const r = this.row;
    const fill = opts?.fill;
    this.setLabel(this.ws.getCell(r, 1), label, {
      font: opts?.bold ? FONT.formula : FONT.body,
      fill,
    });

    const moneyColor = (section: CashflowSection | 'formula', cents: number): Partial<ExcelJS.Font> => {
      if (!cents) return { color: { argb: 'FF9CA3AF' } };
      if (section === 'receipt') return { color: { argb: 'FF047857' }, bold: true };
      if (section === 'formula') return { bold: true };
      return { color: { argb: 'FFB91C1C' }, bold: true };
    };

    this.periods.forEach((p, i) => {
      const expCents = getCents(p, 'expected');
      const actCents = getCents(p, 'actual');
      const expCell = this.ws.getCell(r, colExp(i));
      const actCell = this.ws.getCell(r, colAct(i));
      expCell.value = expCents / 100;
      actCell.value = actCents / 100;
      expCell.numFmt = MONEY_FMT;
      actCell.numFmt = MONEY_FMT;
      expCell.font = { ...FONT.body, ...moneyColor(section, expCents) };
      actCell.font = { ...FONT.body, ...moneyColor(section, actCents) };
      if (fill) {
        expCell.fill = fill;
        actCell.fill = fill;
      }
    });

    const te = colTotalExp(this.periods.length);
    const ta = colTotalAct(this.periods.length);
    const firstExp = this.ref(colExp(0), r);
    const lastExp = this.ref(colExp(this.periods.length - 1), r);
    const firstAct = this.ref(colAct(0), r);
    const lastAct = this.ref(colAct(this.periods.length - 1), r);
    this.ws.getCell(r, te).value = { formula: `SUM(${firstExp}:${lastExp})` };
    this.ws.getCell(r, ta).value = { formula: `SUM(${firstAct}:${lastAct})` };
    this.ws.getCell(r, te).numFmt = MONEY_FMT;
    this.ws.getCell(r, ta).numFmt = MONEY_FMT;
    this.ws.getCell(r, te).fill = FILL.totalCol;
    this.ws.getCell(r, ta).fill = FILL.totalCol;

    this.row += 1;
    return r;
  }

  private sumRowsFormula(rowNums: number[], col: number): { formula: string } | number {
    if (!rowNums.length) return 0;
    const c = this.ws.getColumn(col).letter;
    if (rowNums.length === 1) return { formula: `${c}${rowNums[0]}` };
    const min = Math.min(...rowNums);
    const max = Math.max(...rowNums);
    return { formula: `SUM(${c}${min}:${c}${max})` };
  }

  private writeFormulaTotalRow(
    label: string,
    rowNums: number[],
    key: keyof CashflowSheetWriter['formulaRows'],
    fill: ExcelJS.Fill,
    tone: 'in' | 'out' | 'net',
  ) {
    const r = this.row;
    this.formulaRows[key] = r;
    this.setLabel(this.ws.getCell(r, 1), label, { font: FONT.formula, fill });

    this.periods.forEach((_, i) => {
      const expCol = colExp(i);
      const actCol = colAct(i);
      const expCell = this.ws.getCell(r, expCol);
      const actCell = this.ws.getCell(r, actCol);
      expCell.value = this.sumRowsFormula(rowNums, expCol);
      actCell.value = this.sumRowsFormula(rowNums, actCol);
      expCell.numFmt = MONEY_FMT;
      actCell.numFmt = MONEY_FMT;
      const fontColor =
        tone === 'in'
          ? { argb: 'FF065F46' }
          : tone === 'out'
            ? { argb: 'FF991B1B' }
            : { argb: 'FF1F2937' };
      expCell.font = { ...FONT.formula, color: fontColor };
      actCell.font = { ...FONT.formula, color: fontColor };
      expCell.fill = fill;
      actCell.fill = fill;
    });

    const te = colTotalExp(this.periods.length);
    const ta = colTotalAct(this.periods.length);
    this.ws.getCell(r, te).value = this.sumRowsFormula(rowNums, te);
    this.ws.getCell(r, ta).value = this.sumRowsFormula(rowNums, ta);
    this.ws.getCell(r, te).numFmt = MONEY_FMT;
    this.ws.getCell(r, ta).numFmt = MONEY_FMT;
    this.row += 1;
  }

  private writeDerivedFormulaRow(
    label: string,
    key: keyof CashflowSheetWriter['formulaRows'],
    build: (col: number, field: 'exp' | 'act') => { formula: string },
    fill: ExcelJS.Fill,
  ) {
    const r = this.row;
    this.formulaRows[key] = r;
    this.setLabel(this.ws.getCell(r, 1), label, { font: FONT.formula, fill });
    this.periods.forEach((_, i) => {
      for (const [field, col] of [
        ['exp', colExp(i)],
        ['act', colAct(i)],
      ] as const) {
        const cell = this.ws.getCell(r, col);
        cell.value = build(col, field);
        cell.numFmt = MONEY_FMT;
        cell.font = FONT.formula;
        cell.fill = fill;
      }
    });
    const te = colTotalExp(this.periods.length);
    const ta = colTotalAct(this.periods.length);
    this.ws.getCell(r, te).value = build(te, 'exp');
    this.ws.getCell(r, ta).value = build(ta, 'act');
    this.ws.getCell(r, te).numFmt = MONEY_FMT;
    this.ws.getCell(r, ta).numFmt = MONEY_FMT;
    this.row += 1;
  }

  writeVolumeSection(unitGrid: CashflowUnitGrid) {
    this.unitRows = {};
    this.mergeSectionTitle('Volume (units) — sky = expected · white = actual', FILL.skyHeader);
    for (const def of CASHFLOW_UNIT_ROWS) {
      const r = this.writeCountRow(
        def.label,
        (p, field) => {
          const row = unitGrid[p]?.[def.key];
          return field === 'expected' ? (row?.expected_count ?? 0) : (row?.actual_count ?? 0);
        },
        FILL.skyRow,
      );
      this.unitRows[def.key] = r;
    }
  }

  writeReceiptSection(grid: Grid) {
    this.mergeSectionTitle(CASHFLOW_SECTION_LABELS.receipt, FILL.receiptHeader);
    const lines = ALL_CASHFLOW_LINES.filter((l) => l.section === 'receipt');
    for (const def of lines) {
      const link = RECEIPT_FROM_UNITS[def.key];
      const r =
        link && this.unitRows[link.unitKey] != null
          ? this.writeUnitLinkedMoneyRow(def.label, link.unitKey, link.unitPriceDollars, FILL.receiptRow)
          : this.writeMoneyRow(
              def.label,
              'receipt',
              (p, field) => {
                const row = grid[p]?.[def.key];
                return field === 'expected' ? (row?.expected_cents ?? 0) : (row?.actual_cents ?? 0);
              },
              { fill: FILL.receiptRow },
            );
      this.sectionLineRows.receipt.push(r);
    }
  }

  writeLineSection(section: CashflowSection, grid: Grid) {
    const headerFill = section === 'receipt' ? FILL.receiptHeader : FILL.expenseHeader;
    const rowFill = section === 'receipt' ? FILL.receiptRow : FILL.expenseRow;
    this.mergeSectionTitle(CASHFLOW_SECTION_LABELS[section], headerFill);

    const lines = ALL_CASHFLOW_LINES.filter((l) => l.section === section);
    const totalReceiptsRow = this.formulaRows.totalReceipts;

    for (const def of lines) {
      let r: number;

      if (def.key === 'bank_fees' && totalReceiptsRow != null) {
        r = this.row;
        this.setLabel(this.ws.getCell(r, 1), def.label, { fill: rowFill });
        this.periods.forEach((_, i) => {
          const expCol = colExp(i);
          const actCol = colAct(i);
          const receiptsExp = this.ref(expCol, totalReceiptsRow);
          const receiptsAct = this.ref(actCol, totalReceiptsRow);
          const expCell = this.ws.getCell(r, expCol);
          const actCell = this.ws.getCell(r, actCol);
          expCell.value = { formula: this.stripeFeeFormula(receiptsExp) };
          actCell.value = { formula: this.stripeFeeFormula(receiptsAct) };
          for (const cell of [expCell, actCell]) {
            cell.numFmt = MONEY_FMT;
            cell.font = { color: { argb: 'FFB91C1C' }, bold: true, size: 9, name: 'Calibri' };
            cell.fill = rowFill;
          }
        });
        const te = colTotalExp(this.periods.length);
        const ta = colTotalAct(this.periods.length);
        this.ws.getCell(r, te).value = { formula: `SUM(${this.ref(colExp(0), r)}:${this.ref(colExp(this.periods.length - 1), r)})` };
        this.ws.getCell(r, ta).value = { formula: `SUM(${this.ref(colAct(0), r)}:${this.ref(colAct(this.periods.length - 1), r)})` };
        this.ws.getCell(r, te).numFmt = MONEY_FMT;
        this.ws.getCell(r, ta).numFmt = MONEY_FMT;
        this.row += 1;
      } else {
        r = this.writeMoneyRow(
          def.label,
          section,
          (p, field) => {
            const row = grid[p]?.[def.key];
            const cents = field === 'expected' ? (row?.expected_cents ?? 0) : (row?.actual_cents ?? 0);
            return cents;
          },
          { fill: rowFill },
        );
      }
      this.sectionLineRows[section].push(r);
    }
  }

  writeReceiptTotals() {
    this.writeFormulaTotalRow(
      '(A) Total receipts',
      this.sectionLineRows.receipt,
      'totalReceipts',
      FILL.receiptHeader,
      'in',
    );
  }

  writeSubtotalGst() {
    this.writeFormulaTotalRow(
      '(B) Sub-total expenses (GST)',
      this.sectionLineRows.expense_gst,
      'subtotalGst',
      FILL.expenseHeader,
      'out',
    );
  }

  writeSubtotalNonGstAndTotalExpenses() {
    this.writeFormulaTotalRow(
      'Sub-total non-GST expenses',
      this.sectionLineRows.expense_non_gst,
      'subtotalNonGst',
      FILL.formulaRow,
      'out',
    );
    this.writeDerivedFormulaRow('(C) Total expenses', 'totalExpenses', (col) => {
      const gst = this.formulaRows.subtotalGst!;
      const non = this.formulaRows.subtotalNonGst!;
      return { formula: `${this.ref(col, gst)}+${this.ref(col, non)}` };
    }, FILL.expenseHeader);
  }

  writeOtherPaymentTotals() {
    this.writeFormulaTotalRow(
      'Total other payments',
      this.sectionLineRows.other_payment,
      'totalOther',
      FILL.formulaRow,
      'out',
    );
    this.writeDerivedFormulaRow('(E) Total payments', 'totalPayments', (col) => {
      const c = this.formulaRows.totalExpenses!;
      const o = this.formulaRows.totalOther!;
      return { formula: `${this.ref(col, c)}+${this.ref(col, o)}` };
    }, FILL.expenseHeader);
  }

  writeSummaryFormulas(totalsByPeriod: Record<string, CashflowPeriodTotals>) {
    this.mergeSectionTitle('Calculated (Excel formulas)', {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F2937' },
    });
    const summaryFill = FILL.formulaRow;
    const a = () => this.formulaRows.totalReceipts!;
    const c = () => this.formulaRows.totalExpenses!;
    const e = () => this.formulaRows.totalPayments!;

    this.writeDerivedFormulaRow('Operating profit (A − C)', 'operatingProfit', (col) => ({
      formula: `${this.ref(col, a())}-${this.ref(col, c())}`,
    }), summaryFill);

    this.writeDerivedFormulaRow('Net cashflow (A − E)', 'netCashflow', (col) => ({
      formula: `${this.ref(col, a())}-${this.ref(col, e())}`,
    }), summaryFill);

    const openingRow = this.row;
    this.formulaRows.opening = openingRow;
    this.setLabel(this.ws.getCell(openingRow, 1), 'Opening bank balance', { font: FONT.formula, fill: summaryFill });
    const t0 = totalsByPeriod[this.periods[0]];
    this.ws.getCell(openingRow, colExp(0)).value = (t0?.openingBalance.expected ?? 0) / 100;
    this.ws.getCell(openingRow, colAct(0)).value = (t0?.openingBalance.actual ?? 0) / 100;
    this.row += 1;

    const closingRow = this.row;
    this.formulaRows.closing = closingRow;
    this.setLabel(this.ws.getCell(closingRow, 1), 'Closing bank balance', { font: FONT.formula, fill: summaryFill });
    const open = this.formulaRows.opening!;
    const net = this.formulaRows.netCashflow!;
    this.periods.forEach((_, i) => {
      const expCol = colExp(i);
      const actCol = colAct(i);
      const expCell = this.ws.getCell(closingRow, expCol);
      const actCell = this.ws.getCell(closingRow, actCol);
      expCell.value = { formula: `${this.ref(expCol, open)}+${this.ref(expCol, net)}` };
      actCell.value = { formula: `${this.ref(actCol, open)}+${this.ref(actCol, net)}` };
      expCell.numFmt = MONEY_FMT;
      actCell.numFmt = MONEY_FMT;
      expCell.font = FONT.formula;
      actCell.font = FONT.formula;
      expCell.fill = summaryFill;
      actCell.fill = summaryFill;
    });
    this.row += 1;

    for (let i = 0; i < this.periods.length; i++) {
      const expCol = colExp(i);
      const actCol = colAct(i);
      this.ws.getCell(openingRow, expCol).numFmt = MONEY_FMT;
      this.ws.getCell(openingRow, actCol).numFmt = MONEY_FMT;
      this.ws.getCell(openingRow, expCol).fill = summaryFill;
      this.ws.getCell(openingRow, actCol).fill = summaryFill;
      if (i > 0) {
        const prevExp = colExp(i - 1);
        const prevAct = colAct(i - 1);
        this.ws.getCell(openingRow, expCol).value = { formula: this.ref(prevExp, closingRow) };
        this.ws.getCell(openingRow, actCol).value = { formula: this.ref(prevAct, closingRow) };
      }
    }
  }

  finishLayout() {
    this.ws.getColumn(1).width = 42;
    const last = lastDataCol(this.periods.length);
    for (let c = 2; c <= last; c++) {
      this.ws.getColumn(c).width = 11;
    }
    this.ws.views = [{ state: 'frozen', ySplit: 2, xSplit: 1 }];
  }
}

export async function buildCashflowWorkbook(
  periods: string[],
  grid: Grid,
  totalsByPeriod: Record<string, CashflowPeriodTotals>,
  unitGrid?: CashflowUnitGrid,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'NGOreality CRM';
  workbook.created = new Date();
  const ws = workbook.addWorksheet('Cashflow', {
    views: [{ showGridLines: true }],
  });

  const writer = new CashflowSheetWriter(ws, periods);
  writer.writePeriodHeaders();
  if (unitGrid) writer.writeVolumeSection(unitGrid);

  if (unitGrid) {
    writer.writeReceiptSection(grid);
  } else {
    writer.writeLineSection('receipt', grid);
  }
  writer.writeReceiptTotals();

  writer.writeLineSection('expense_gst', grid);
  writer.writeSubtotalGst();

  writer.writeLineSection('expense_non_gst', grid);
  writer.writeSubtotalNonGstAndTotalExpenses();

  writer.writeLineSection('other_payment', grid);
  writer.writeOtherPaymentTotals();

  writer.writeSummaryFormulas(totalsByPeriod);
  writer.finishLayout();

  ws.getCell(writer.row + 1, 1).value =
    'Receipts (membership, $650, workspace) = unit count × price · (A)=Σ receipts · Bank fees ≈ Stripe on (A) · Net=(A)−(E)';
  ws.getCell(writer.row + 1, 1).font = { size: 8, italic: true, name: 'Calibri' };

  return workbook;
}

export async function downloadCashflowExcel(
  periods: string[],
  grid: Grid,
  totalsByPeriod: Record<string, CashflowPeriodTotals>,
  unitGrid?: CashflowUnitGrid,
  filename = 'ngoreality-cashflow.xlsx',
): Promise<void> {
  const workbook = await buildCashflowWorkbook(periods, grid, totalsByPeriod, unitGrid);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
