import { Injectable } from '@nestjs/common';
import { PaymentMode, SlipStatus } from '@prisma/client';
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
