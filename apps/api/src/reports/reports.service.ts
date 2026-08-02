import { Injectable } from '@nestjs/common';
import { PaymentMode, SlipStatus } from '@prisma/client';
import { Workbook } from 'exceljs';
import { AuthContext } from '../auth/auth-context';
import { assertSameMandal } from '../auth/tenant-scope';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionReportQueryDto } from './dto/collection-report-query.dto';

interface SlipReportWhere {
  areaName?: string;
  collectedByUserId?: string;
  createdAt?: {
    gte?: Date;
    lte?: Date;
  };
  festivalId: string;
  groupId?: string;
  mandalId: string;
  paymentMode?: PaymentMode;
  status: SlipStatus;
}

interface SqlWhere {
  clause: string;
  params: Array<Date | PaymentMode | SlipStatus | string>;
}

interface SummaryRow {
  amount: number | string | null;
  count: number;
}

interface MemberSummaryRow {
  amount: number | string | null;
  collectedByUserId: string;
  count: number;
}

interface GroupSummaryRow {
  amount: number | string | null;
  count: number;
  groupId: string | null;
}

interface PaymentModeSummaryRow {
  amount: number | string | null;
  count: number;
  paymentMode: PaymentMode;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCollectionReport(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    query: CollectionReportQueryDto,
  ) {
    assertSameMandal(ctx, mandalId);

    const createdAt =
      query.dateFrom || query.dateTo
        ? {
            gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
            lte: query.dateTo ? new Date(query.dateTo) : undefined,
          }
        : undefined;

    const where: SlipReportWhere = {
      areaName: query.areaName,
      collectedByUserId: query.memberId,
      createdAt,
      festivalId,
      groupId: query.groupId,
      mandalId,
      paymentMode: query.paymentMode,
      status: SlipStatus.ACTIVE,
    };

    const slipWhere = buildSlipSqlWhere(where);
    const [summaryRows, byMemberRows, byGroupRows, byPaymentModeRows, expenseRows] =
      await Promise.all([
        this.prisma.$queryRawUnsafe<SummaryRow[]>(
          `SELECT COUNT(*)::int AS "count", COALESCE(SUM("amount"), 0)::text AS "amount"
           FROM "vargani_slips"
           WHERE ${slipWhere.clause}`,
          ...slipWhere.params,
        ),
        this.prisma.$queryRawUnsafe<MemberSummaryRow[]>(
          `SELECT "collected_by_user_id" AS "collectedByUserId",
                  COUNT(*)::int AS "count",
                  COALESCE(SUM("amount"), 0)::text AS "amount"
           FROM "vargani_slips"
           WHERE ${slipWhere.clause}
           GROUP BY "collected_by_user_id"
           ORDER BY "collected_by_user_id" ASC`,
          ...slipWhere.params,
        ),
        this.prisma.$queryRawUnsafe<GroupSummaryRow[]>(
          `SELECT "group_id" AS "groupId",
                  COUNT(*)::int AS "count",
                  COALESCE(SUM("amount"), 0)::text AS "amount"
           FROM "vargani_slips"
           WHERE ${slipWhere.clause}
           GROUP BY "group_id"
           ORDER BY "group_id" ASC NULLS LAST`,
          ...slipWhere.params,
        ),
        this.prisma.$queryRawUnsafe<PaymentModeSummaryRow[]>(
          `SELECT "payment_mode" AS "paymentMode",
                  COUNT(*)::int AS "count",
                  COALESCE(SUM("amount"), 0)::text AS "amount"
           FROM "vargani_slips"
           WHERE ${slipWhere.clause}
           GROUP BY "payment_mode"
           ORDER BY "payment_mode" ASC`,
          ...slipWhere.params,
        ),
        this.prisma.$queryRawUnsafe<SummaryRow[]>(
          `SELECT COUNT(*)::int AS "count", COALESCE(SUM("amount"), 0)::text AS "amount"
           FROM "expenses"
           WHERE "mandal_id" = $1::uuid
             AND "festival_id" = $2::uuid
             AND "status" = 'APPROVED'`,
          mandalId,
          festivalId,
        ),
      ]);

    const summary = summaryRows[0] ?? { amount: 0, count: 0 };
    const expenses = expenseRows[0] ?? { amount: 0, count: 0 };
    const totalCollection = Number(summary.amount ?? 0);
    const totalExpenses = Number(expenses.amount ?? 0);

    return {
      balance: totalCollection - totalExpenses,
      byGroup: byGroupRows.map(toGroupSummary),
      byMember: byMemberRows.map(toMemberSummary),
      byPaymentMode: byPaymentModeRows.map(toPaymentModeSummary),
      slipCount: summary.count,
      totalCollection,
      totalExpenses,
    };
  }

  async exportCollectionReportCsv(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    query: CollectionReportQueryDto,
  ) {
    assertSameMandal(ctx, mandalId);

    const createdAt =
      query.dateFrom || query.dateTo
        ? {
            gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
            lte: query.dateTo ? new Date(query.dateTo) : undefined,
          }
        : undefined;

    const where: SlipReportWhere = {
      areaName: query.areaName,
      collectedByUserId: query.memberId,
      createdAt,
      festivalId,
      groupId: query.groupId,
      mandalId,
      paymentMode: query.paymentMode,
      status: SlipStatus.ACTIVE,
    };

    const slips = await this.prisma.varganiSlip.findMany({
      include: {
        collector: { select: { name: true, phone: true } },
        group: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      where,
    });

    const rows = slips.map((slip) => [
      slip.slipNumber,
      slip.createdAt.toISOString(),
      slip.contributorName,
      slip.shopName ?? '',
      slip.contributorPhone ?? '',
      slip.contributorAddress ?? '',
      slip.areaName ?? '',
      slip.group?.name ?? '',
      slip.collector.name,
      slip.collector.phone ?? '',
      slip.paymentMode,
      Number(slip.amount).toFixed(2),
    ]);

    return toCsv([
      [
        'Slip Number',
        'Created At',
        'Contributor Name',
        'Shop Name',
        'Phone',
        'Address',
        'Area',
        'Group',
        'Collected By',
        'Collector Phone',
        'Payment Mode',
        'Amount',
      ],
      ...rows,
    ]);
  }

  async exportAllVarganiEntriesXlsx(
    ctx: AuthContext,
    mandalId: string,
    festivalId: string,
    query: CollectionReportQueryDto,
  ): Promise<Buffer> {
    assertSameMandal(ctx, mandalId);

    const createdAt =
      query.dateFrom || query.dateTo
        ? {
            gte: query.dateFrom ? new Date(query.dateFrom) : undefined,
            lte: query.dateTo ? new Date(query.dateTo) : undefined,
          }
        : undefined;

    const [slips, mandal, festival] = await Promise.all([
      this.prisma.varganiSlip.findMany({
        include: {
          collector: { select: { name: true, phone: true } },
          group: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        where: {
          areaName: query.areaName,
          collectedByUserId: query.memberId,
          createdAt,
          festivalId,
          groupId: query.groupId,
          mandalId,
          paymentMode: query.paymentMode,
        },
      }),
      this.prisma.mandal.findUnique({ select: { name: true }, where: { id: mandalId } }),
      this.prisma.festival.findUnique({ select: { name: true }, where: { id: festivalId } }),
    ]);

    const workbook = new Workbook();
    workbook.creator = 'Digital Vargani';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Vargani Entries', {
      pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
      properties: { defaultRowHeight: 20 },
      views: [{ activeCell: 'A5', state: 'frozen', ySplit: 4 }],
    });
    sheet.mergeCells('A1:N1');
    const title = sheet.getCell('A1');
    title.value = `${mandal?.name ?? 'Mandal'} - ${festival?.name ?? 'Festival'} Vargani Entries`;
    title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
    title.alignment = { horizontal: 'left', vertical: 'middle' };
    title.fill = { fgColor: { argb: 'FFA54C20' }, pattern: 'solid', type: 'pattern' };
    sheet.getRow(1).height = 30;

    sheet.mergeCells('A2:N2');
    const summary = sheet.getCell('A2');
    summary.value = `Generated ${new Date().toLocaleString('en-IN')} | Total entries: ${slips.length}`;
    summary.font = { color: { argb: 'FF6F7280' }, italic: true, size: 10 };
    summary.alignment = { vertical: 'middle' };

    const headers = [
      'Slip Number',
      'Date & Time',
      'Contributor Name',
      'Shop Name',
      'Phone',
      'Address',
      'Area',
      'Group',
      'Collected By',
      'Collector Phone',
      'Payment Mode',
      'Status',
      'Amount',
      'Custom Details',
    ];
    const headerRow = sheet.getRow(4);
    headerRow.values = headers;
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.fill = { fgColor: { argb: 'FF21150F' }, pattern: 'solid', type: 'pattern' };
    });

    for (const slip of slips) {
      const row = sheet.addRow([
        slip.slipNumber,
        slip.createdAt,
        slip.contributorName,
        slip.shopName ?? '',
        slip.contributorPhone ?? '',
        slip.contributorAddress ?? '',
        slip.areaName ?? '',
        slip.group?.name ?? '',
        slip.collector.name,
        slip.collector.phone ?? '',
        slip.paymentMode.replaceAll('_', ' '),
        formatSlipStatus(slip.status),
        Number(slip.amount),
        formatCustomData(slip.customData),
      ]);
      row.getCell(2).numFmt = 'dd-mmm-yyyy hh:mm';
      row.getCell(13).numFmt = '₹#,##0.00';
      row.getCell(13).alignment = { horizontal: 'right' };
      row.getCell(14).alignment = { wrapText: true, vertical: 'top' };

      const statusCell = row.getCell(12);
      const statusColor = slip.status === SlipStatus.ACTIVE
        ? 'FFE8F7ED'
        : slip.status === SlipStatus.PENDING
          ? 'FFFFF4D6'
          : 'FFFDE8E5';
      statusCell.fill = { fgColor: { argb: statusColor }, pattern: 'solid', type: 'pattern' };
    }

    sheet.autoFilter = { from: 'A4', to: 'N4' };
    const widths = [18, 21, 25, 22, 16, 30, 18, 20, 22, 18, 18, 14, 16, 35];
    widths.forEach((width, index) => {
      sheet.getColumn(index + 1).width = width;
    });
    sheet.getColumn(5).numFmt = '@';
    sheet.getColumn(10).numFmt = '@';

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

function formatSlipStatus(status: SlipStatus): string {
  if (status === SlipStatus.ACTIVE) return 'Paid';
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatCustomData(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== null && item !== undefined && item !== '')
    .map(([key, item]) => `${key}: ${String(item)}`)
    .join(' | ');
}

export function toCsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function csvCell(value: string | number): string {
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function buildSlipSqlWhere(where: SlipReportWhere): SqlWhere {
  const params: SqlWhere['params'] = [];
  const conditions: string[] = [];

  addCondition(conditions, params, '"mandal_id" = $n::uuid', where.mandalId);
  addCondition(conditions, params, '"festival_id" = $n::uuid', where.festivalId);
  addCondition(conditions, params, '"status" = $n::"SlipStatus"', where.status);
  addCondition(conditions, params, '"area_name" = $n', where.areaName);
  addCondition(conditions, params, '"collected_by_user_id" = $n::uuid', where.collectedByUserId);
  addCondition(conditions, params, '"group_id" = $n::uuid', where.groupId);
  addCondition(conditions, params, '"payment_mode" = $n::"PaymentMode"', where.paymentMode);

  if (where.createdAt?.gte) {
    addCondition(conditions, params, '"created_at" >= $n', where.createdAt.gte);
  }

  if (where.createdAt?.lte) {
    addCondition(conditions, params, '"created_at" <= $n', where.createdAt.lte);
  }

  return {
    clause: conditions.join(' AND '),
    params,
  };
}

function addCondition(
  conditions: string[],
  params: SqlWhere['params'],
  template: string,
  value?: Date | PaymentMode | SlipStatus | string,
): void {
  if (value === undefined || value === '') {
    return;
  }

  params.push(value);
  conditions.push(template.replace('$n', `$${params.length}`));
}

function toMemberSummary(row: MemberSummaryRow) {
  return {
    _count: { id: row.count },
    _sum: { amount: row.amount },
    collectedByUserId: row.collectedByUserId,
  };
}

function toGroupSummary(row: GroupSummaryRow) {
  return {
    _count: { id: row.count },
    _sum: { amount: row.amount },
    groupId: row.groupId,
  };
}

function toPaymentModeSummary(row: PaymentModeSummaryRow) {
  return {
    _count: { id: row.count },
    _sum: { amount: row.amount },
    paymentMode: row.paymentMode,
  };
}
