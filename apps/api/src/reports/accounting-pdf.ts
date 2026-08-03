import PDFDocument from 'pdfkit';
import { PassThrough } from 'node:stream';

export interface AccountingBreakdownRow {
  amount: number;
  count: number;
  label: string;
}

export interface AccountingReceiptRow {
  amount: number;
  collector: string;
  contributor: string;
  date: Date;
  paymentMode: string;
  slipNumber: string;
  status: string;
}

export interface AccountingExpenseRow {
  amount: number;
  category: string;
  date: Date;
  status: string;
  vendor: string;
}

export interface AccountingPdfData {
  expenseCategories: AccountingBreakdownRow[];
  expenses: AccountingExpenseRow[];
  festivalName: string;
  filters: string[];
  generatedAt: Date;
  mandalName: string;
  paymentModes: AccountingBreakdownRow[];
  receipts: AccountingReceiptRow[];
  reportPeriod: string;
  summary: {
    approvedExpenseAmount: number;
    approvedExpenseCount: number;
    balance: number;
    cancelledAmount: number;
    cancelledCount: number;
    pendingAmount: number;
    pendingCount: number;
    receivedAmount: number;
    receivedCount: number;
    totalReceiptCount: number;
  };
}

const PAGE_WIDTH = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const INK = '#241914';
const MUTED = '#6B7280';
const ORANGE = '#C2410C';
const ORANGE_SOFT = '#FFF2E8';
const GREEN = '#157347';
const GREEN_SOFT = '#EAF7EF';
const RED = '#B42318';
const RED_SOFT = '#FDECEC';
const LINE = '#E5E7EB';
const PANEL = '#F8FAFC';

export function createAccountingPdf(data: AccountingPdfData): PassThrough {
  const output = new PassThrough();
  const doc = new PDFDocument({
    bufferPages: true,
    info: {
      Author: 'Samavet ePawati',
      CreationDate: data.generatedAt,
      Subject: 'Accounting analysis of Vargani collections and approved expenses',
      Title: `${data.mandalName} - ${data.festivalName} Financial Report`,
    },
    layout: 'landscape',
    margin: MARGIN,
    size: 'A4',
  });
  doc.pipe(output);

  drawReportHeader(doc, data);
  drawSummary(doc, data);
  drawReconciliation(doc, data);

  drawSectionTitle(doc, 'Collection analysis', 'Realized receipts grouped by payment method.');
  drawBreakdownTable(doc, data.paymentModes, 'Payment method');

  drawSectionTitle(doc, 'Expense analysis', 'Approved expenses grouped by accounting category.');
  drawBreakdownTable(doc, data.expenseCategories, 'Expense category');

  drawSectionTitle(
    doc,
    'Receipt register',
    `Latest ${data.receipts.length} of ${data.summary.totalReceiptCount} entries. Use the Excel export for the complete editable ledger.`,
  );
  drawReceiptTable(doc, data.receipts);

  drawSectionTitle(
    doc,
    'Approved expense register',
    `Displaying the latest ${data.expenses.length} of ${data.summary.approvedExpenseCount} approved expenses. All approved expenses are included in the balance.`,
  );
  drawExpenseTable(doc, data.expenses);

  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    drawFooter(doc, pageIndex - range.start + 1, range.count, data.generatedAt);
  }

  doc.end();
  return output;
}

function drawReportHeader(doc: PDFKit.PDFDocument, data: AccountingPdfData): void {
  doc.roundedRect(MARGIN, MARGIN, CONTENT_WIDTH, 74, 12).fill(INK);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(20)
    .text('Financial Analysis Report', MARGIN + 22, MARGIN + 17, { width: 430 });
  doc.fillColor('#FED7AA').font('Helvetica').fontSize(9)
    .text(`${data.mandalName}  |  ${data.festivalName}`, MARGIN + 22, MARGIN + 46, { width: 500 });
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9)
    .text(data.reportPeriod, PAGE_WIDTH - MARGIN - 260, MARGIN + 18, { align: 'right', width: 238 });
  doc.fillColor('#D1D5DB').font('Helvetica').fontSize(8)
    .text(`Generated ${formatDateTime(data.generatedAt)}`, PAGE_WIDTH - MARGIN - 260, MARGIN + 39, {
      align: 'right',
      width: 238,
    });

  doc.y = MARGIN + 90;
  if (data.filters.length > 0) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8)
      .text(`Applied filters: ${data.filters.join(' | ')}`, MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.8);
  }
}

function drawSummary(doc: PDFKit.PDFDocument, data: AccountingPdfData): void {
  const gap = 10;
  const width = (CONTENT_WIDTH - gap * 3) / 4;
  const cards = [
    { color: GREEN, fill: GREEN_SOFT, label: 'REALIZED COLLECTIONS', value: money(data.summary.receivedAmount), note: `${data.summary.receivedCount} paid receipts` },
    { color: ORANGE, fill: ORANGE_SOFT, label: 'PENDING COLLECTIONS', value: money(data.summary.pendingAmount), note: `${data.summary.pendingCount} pending receipts` },
    { color: RED, fill: RED_SOFT, label: 'APPROVED EXPENSES', value: money(data.summary.approvedExpenseAmount), note: `${data.summary.approvedExpenseCount} approved expenses` },
    { color: data.summary.balance >= 0 ? GREEN : RED, fill: data.summary.balance >= 0 ? GREEN_SOFT : RED_SOFT, label: 'NET AVAILABLE BALANCE', value: money(data.summary.balance), note: 'Collections less approved expenses' },
  ];
  const y = doc.y;

  cards.forEach((card, index) => {
    const x = MARGIN + index * (width + gap);
    doc.roundedRect(x, y, width, 68, 9).fillAndStroke(card.fill, card.fill);
    doc.fillColor(card.color).font('Helvetica-Bold').fontSize(7.5).text(card.label, x + 13, y + 11, { width: width - 26 });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(15).text(card.value, x + 13, y + 28, { width: width - 26 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(card.note, x + 13, y + 51, { width: width - 26 });
  });

  doc.y = y + 84;
}

function drawReconciliation(doc: PDFKit.PDFDocument, data: AccountingPdfData): void {
  const y = doc.y;
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 45, 8).fillAndStroke(PANEL, LINE);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text('Reconciliation', MARGIN + 14, y + 10);
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(
    `${money(data.summary.receivedAmount)} realized collections - ${money(data.summary.approvedExpenseAmount)} approved expenses = ${money(data.summary.balance)} net available balance. Pending ${money(data.summary.pendingAmount)} and cancelled/corrected ${money(data.summary.cancelledAmount)} are excluded.`,
    MARGIN + 14,
    y + 25,
    { width: CONTENT_WIDTH - 28 },
  );
  doc.y = y + 61;
}

function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, subtitle: string): void {
  ensureSpace(doc, 80);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(13).text(title, MARGIN, doc.y);
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(subtitle, MARGIN, doc.y + 3, { width: CONTENT_WIDTH });
  doc.moveDown(1.1);
}

function drawBreakdownTable(doc: PDFKit.PDFDocument, rows: AccountingBreakdownRow[], labelHeader: string): void {
  const headers = [labelHeader, 'Transactions', 'Amount', '% of total'];
  const widths = [360, 110, 160, CONTENT_WIDTH - 630];
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  drawTableHeader(doc, headers, widths);

  if (rows.length === 0) {
    drawEmptyRow(doc, 'No financial data available for this section.');
    return;
  }

  rows.forEach((row) => {
    ensureTableSpace(doc, 25, () => drawTableHeader(doc, headers, widths));
    const percent = total > 0 ? (row.amount / total) * 100 : 0;
    drawTableRow(doc, [row.label, String(row.count), money(row.amount), `${percent.toFixed(1)}%`], widths, [0, 1, 2, 3], false, [1, 2, 3]);
  });
  ensureTableSpace(doc, 25, () => drawTableHeader(doc, headers, widths));
  drawTableRow(doc, ['Total', String(rows.reduce((sum, row) => sum + row.count, 0)), money(total), '100.0%'], widths, [0, 1, 2, 3], true, [1, 2, 3]);
  doc.moveDown(1.1);
}

function drawReceiptTable(doc: PDFKit.PDFDocument, rows: AccountingReceiptRow[]): void {
  const headers = ['Date', 'Slip', 'Contributor', 'Collector', 'Mode', 'Status', 'Amount'];
  const widths = [78, 92, 180, 135, 80, 72, CONTENT_WIDTH - 637];
  drawTableHeader(doc, headers, widths);
  if (rows.length === 0) {
    drawEmptyRow(doc, 'No receipt entries found.');
    return;
  }
  rows.forEach((row) => {
    ensureTableSpace(doc, 25, () => drawTableHeader(doc, headers, widths));
    drawTableRow(
      doc,
      [formatDate(row.date), row.slipNumber, row.contributor, row.collector, row.paymentMode, row.status, money(row.amount)],
      widths,
      [0, 1, 2, 3, 4, 5, 6],
      false,
      [6],
    );
  });
  doc.moveDown(1.1);
}

function drawExpenseTable(doc: PDFKit.PDFDocument, rows: AccountingExpenseRow[]): void {
  const headers = ['Date', 'Vendor / payee', 'Category', 'Status', 'Amount'];
  const widths = [90, 250, 190, 95, CONTENT_WIDTH - 625];
  drawTableHeader(doc, headers, widths);
  if (rows.length === 0) {
    drawEmptyRow(doc, 'No approved expenses found.');
    return;
  }
  rows.forEach((row) => {
    ensureTableSpace(doc, 25, () => drawTableHeader(doc, headers, widths));
    drawTableRow(doc, [formatDate(row.date), row.vendor, row.category, row.status, money(row.amount)], widths, [0, 1, 2, 3, 4], false, [4]);
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument, headers: string[], widths: number[]): void {
  ensureTableSpace(doc, 25);
  const y = doc.y;
  doc.rect(MARGIN, y, CONTENT_WIDTH, 24).fill(INK);
  let x = MARGIN;
  headers.forEach((header, index) => {
    const align = index === headers.length - 1 || header === 'Transactions' || header === '% of total' ? 'right' : 'left';
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5)
      .text(header.toUpperCase(), x + 7, y + 8, {
        align,
        ellipsis: true,
        height: 10,
        lineBreak: false,
        width: widths[index] - 14,
      });
    x += widths[index];
  });
  doc.y = y + 24;
}

function drawTableRow(
  doc: PDFKit.PDFDocument,
  values: string[],
  widths: number[],
  visibleColumns: number[],
  bold = false,
  rightAlignedColumns: number[] = [values.length - 1],
): void {
  const rowHeight = 25;
  const y = doc.y;
  doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight).fillAndStroke(bold ? ORANGE_SOFT : '#FFFFFF', LINE);
  let x = MARGIN;
  values.forEach((value, index) => {
    if (!visibleColumns.includes(index)) return;
    const align = rightAlignedColumns.includes(index) ? 'right' : 'left';
    doc.fillColor(bold ? ORANGE : INK).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5)
      .text(truncate(value, widths[index] > 160 ? 40 : 22), x + 7, y + 8, {
        align,
        ellipsis: true,
        height: 10,
        lineBreak: false,
        width: widths[index] - 14,
      });
    x += widths[index];
  });
  doc.y = y + rowHeight;
}

function drawEmptyRow(doc: PDFKit.PDFDocument, message: string): void {
  const y = doc.y;
  doc.rect(MARGIN, y, CONTENT_WIDTH, 30).fillAndStroke(PANEL, LINE);
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(message, MARGIN + 10, y + 10, { width: CONTENT_WIDTH - 20 });
  doc.y = y + 30;
}

function ensureSpace(doc: PDFKit.PDFDocument, requiredHeight: number): void {
  if (doc.y + requiredHeight > doc.page.height - 78) addReportPage(doc);
}

function ensureTableSpace(doc: PDFKit.PDFDocument, requiredHeight: number, repeatHeader?: () => void): void {
  if (doc.y + requiredHeight <= doc.page.height - 78) return;
  addReportPage(doc);
  if (repeatHeader) repeatHeader();
}

function addReportPage(doc: PDFKit.PDFDocument): void {
  doc.addPage();
  doc.x = MARGIN;
  doc.y = MARGIN;
}

function drawFooter(doc: PDFKit.PDFDocument, page: number, totalPages: number, generatedAt: Date): void {
  const y = doc.page.height - 54;
  doc.moveTo(MARGIN, y - 8).lineTo(PAGE_WIDTH - MARGIN, y - 8).strokeColor(LINE).lineWidth(0.7).stroke();
  doc.fillColor(MUTED).font('Helvetica').fontSize(7)
    .text('Samavet ePawati - Accounting review report', MARGIN, y, { lineBreak: false, width: 320 });
  doc.text(`Generated ${formatDate(generatedAt)}  |  Page ${page} of ${totalPages}`, PAGE_WIDTH - MARGIN - 260, y, {
    align: 'right',
    lineBreak: false,
    width: 260,
  });
}

function money(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}INR ${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(value);
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}
