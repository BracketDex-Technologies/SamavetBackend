export type UserRole = 'SUPER_ADMIN' | 'MANDAL_ADMIN' | 'KHAJINDAR' | 'GROUP_LEADER' | 'MEMBER';
export type PaymentMode = 'CASH' | 'UPI' | 'CHEQUE' | 'BANK_TRANSFER' | 'OTHER';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    mandalId: string | null;
    name: string;
    role: UserRole;
  };
}

export interface Mandal {
  id: string;
  name: string;
  slug: string;
  locality?: string | null;
  city?: string | null;
  state?: string | null;
  status: string;
}

export interface Festival {
  id: string;
  mandalId: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  activeTemplateVersionId?: string | null;
}

export interface CustomField {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  sortOrder: number;
}

export interface VarganiSlip {
  id: string;
  slipNumber: string;
  contributorName: string;
  contributorPhone?: string | null;
  contributorAddress?: string | null;
  shopName?: string | null;
  areaName?: string | null;
  amount: string | number;
  paymentMode: PaymentMode;
  createdAt: string;
}

export interface CollectionReport {
  balance: number;
  slipCount: number;
  totalCollection: number;
  totalExpenses: number;
  byMember: Array<{ collectedByUserId: string; _count: { id: number }; _sum: { amount: string } }>;
  byGroup: Array<{ groupId: string | null; _count: { id: number }; _sum: { amount: string } }>;
  byPaymentMode: Array<{
    paymentMode: PaymentMode;
    _count: { id: number };
    _sum: { amount: string };
  }>;
}

export const API_BASE_URL = normalizeApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  session?: AuthSession | null,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export async function downloadCsv(path: string, session: AuthSession): Promise<string> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  return response.text();
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string | string[]; error?: string };
    if (Array.isArray(body.message)) {
      return body.message.join(', ');
    }

    return body.message ?? body.error ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}

function normalizeApiBaseUrl(value?: string): string {
  const baseUrl = (value || 'http://localhost:4000').replace(/\/$/, '');

  if (/\/api\/v\d+$/.test(baseUrl)) {
    return baseUrl;
  }

  if (baseUrl.endsWith('/api')) {
    return `${baseUrl}/v1`;
  }

  return `${baseUrl}/api/v1`;
}
