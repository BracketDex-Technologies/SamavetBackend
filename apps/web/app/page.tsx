'use client';

import {
  BadgeIndianRupee,
  CalendarDays,
  CheckCircle2,
  CircleGauge,
  Download,
  FileText,
  IndianRupee,
  Layers3,
  LogIn,
  Plus,
  Printer,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  Upload,
} from 'lucide-react';
import { FormEvent, PointerEvent, useEffect, useMemo, useState } from 'react';
import {
  API_BASE_URL,
  apiRequest,
  AuthSession,
  CollectionReport,
  CustomField,
  downloadCsv,
  Festival,
  Mandal,
  PaymentMode,
  VarganiSlip,
} from './lib/api/client';

type Role = 'super' | 'admin' | 'member';
type UiState = 'idle' | 'loading' | 'saving';
type TextAlign = 'center' | 'left' | 'right';

interface TemplatePlacement {
  color: string;
  fontSize: number;
  fontWeight: number;
  textAlign: TextAlign;
  width: number;
  x: number;
  y: number;
}

const sessionKey = 'digital-mandal-session-v1';

const demoSlips: VarganiSlip[] = [
  {
    amount: 5100,
    areaName: 'Laxmi Road',
    contributorName: 'Mahesh Traders',
    contributorPhone: '9876543210',
    createdAt: '2026-07-26T05:12:00.000Z',
    id: 'demo-1',
    paymentMode: 'UPI',
    shopName: 'Mahesh Traders',
    slipNumber: 'DM-GAN-2026-000431',
  },
  {
    amount: 1101,
    areaName: 'Budhwar Peth Lane 3',
    contributorName: 'Joshi Family',
    contributorPhone: '9822211122',
    createdAt: '2026-07-26T05:35:00.000Z',
    id: 'demo-2',
    paymentMode: 'CASH',
    shopName: '',
    slipNumber: 'DM-GAN-2026-000432',
  },
];

export default function Home() {
  const [role, setRole] = useState<Role>('super');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<UiState>('idle');
  const [notice, setNotice] = useState(
    'Demo mode is ready. Login to use live Supabase-backed data.',
  );
  const [mandals, setMandals] = useState<Mandal[]>([]);
  const [festivals, setFestivals] = useState<Festival[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [slips, setSlips] = useState<VarganiSlip[]>(demoSlips);
  const [report, setReport] = useState<CollectionReport | null>(null);
  const [selectedMandalId, setSelectedMandalId] = useState('');
  const [selectedFestivalId, setSelectedFestivalId] = useState('');
  const [selectedSlip, setSelectedSlip] = useState<VarganiSlip>(demoSlips[0]);

  const isLive = Boolean(session);
  const activeMandalId = selectedMandalId || session?.user.mandalId || '';
  const activeFestivalId = selectedFestivalId || festivals[0]?.id || '';

  const totalCollection = useMemo(
    () => slips.reduce((sum, slip) => sum + Number(slip.amount), 0),
    [slips],
  );
  const cashTotal = useMemo(
    () =>
      slips
        .filter((slip) => slip.paymentMode === 'CASH')
        .reduce((sum, slip) => sum + Number(slip.amount), 0),
    [slips],
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(sessionKey);
    if (stored) {
      const parsed = JSON.parse(stored) as AuthSession;
      setSession(parsed);
      setRole(
        parsed.user.role === 'SUPER_ADMIN'
          ? 'super'
          : parsed.user.role === 'MEMBER'
            ? 'member'
            : 'admin',
      );
    }
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    void refreshWorkspace(session);
  }, [session]);

  async function refreshWorkspace(currentSession = session) {
    if (!currentSession) {
      return;
    }

    setStatus('loading');
    try {
      if (currentSession.user.role === 'SUPER_ADMIN') {
        const response = await apiRequest<{ items: Mandal[] }>(
          '/mandals?limit=50',
          {},
          currentSession,
        );
        setMandals(response.items);
        setSelectedMandalId((current) => current || response.items[0]?.id || '');
      } else if (currentSession.user.mandalId) {
        setSelectedMandalId(currentSession.user.mandalId);
        const festivalList = await apiRequest<Festival[]>(
          `/mandals/${currentSession.user.mandalId}/festivals`,
          {},
          currentSession,
        );
        setFestivals(festivalList);
        setSelectedFestivalId((current) => current || festivalList[0]?.id || '');
        await refreshActiveForm(currentSession);
        await refreshSlips(currentSession);
      }
      setNotice('Live data loaded from the API.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load live workspace.');
    } finally {
      setStatus('idle');
    }
  }

  async function refreshActiveForm(currentSession = session) {
    if (!currentSession || currentSession.user.role === 'SUPER_ADMIN') {
      return;
    }

    const form = await apiRequest<{ customFields: CustomField[]; festival: Festival }>(
      '/vargani/active-form',
      {},
      currentSession,
    );
    setCustomFields(form.customFields);
    setSelectedFestivalId(form.festival.id);
  }

  async function refreshSlips(currentSession = session) {
    if (!currentSession || currentSession.user.role === 'SUPER_ADMIN') {
      return;
    }

    const response = await apiRequest<{ items: VarganiSlip[] }>(
      '/vargani/slips?limit=25',
      {},
      currentSession,
    );
    setSlips(response.items.length ? response.items : demoSlips);
    setSelectedSlip(response.items[0] ?? demoSlips[0]);
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus('saving');
    try {
      const nextSession = await apiRequest<AuthSession>('/auth/login', {
        body: JSON.stringify({
          identifier: String(form.get('identifier')),
          password: String(form.get('password')),
        }),
        method: 'POST',
      });
      window.localStorage.setItem(sessionKey, JSON.stringify(nextSession));
      setSession(nextSession);
      setRole(
        nextSession.user.role === 'SUPER_ADMIN'
          ? 'super'
          : nextSession.user.role === 'MEMBER'
            ? 'member'
            : 'admin',
      );
      setNotice(`Logged in as ${nextSession.user.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setStatus('idle');
    }
  }

  async function logout() {
    if (session) {
      await apiRequest('/auth/logout', { method: 'POST' }, session).catch(() => undefined);
    }
    window.localStorage.removeItem(sessionKey);
    setSession(null);
    setMandals([]);
    setFestivals([]);
    setCustomFields([]);
    setSlips(demoSlips);
    setSelectedSlip(demoSlips[0]);
    setNotice('Logged out. Demo data is visible.');
  }

  async function createMandal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const form = new FormData(event.currentTarget);
    setStatus('saving');
    try {
      await apiRequest(
        '/mandals',
        {
          body: JSON.stringify({
            admin: {
              email: String(form.get('adminEmail')),
              name: String(form.get('adminName')),
              password: String(form.get('adminPassword')),
              phone: String(form.get('adminPhone')),
            },
            city: String(form.get('city')),
            contactName: String(form.get('adminName')),
            contactPhone: String(form.get('adminPhone')),
            locality: String(form.get('locality')),
            name: String(form.get('name')),
            state: 'Maharashtra',
          }),
          method: 'POST',
        },
        session,
      );
      event.currentTarget.reset();
      await refreshWorkspace();
      setNotice('Mandal account created with admin login.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create mandal.');
    } finally {
      setStatus('idle');
    }
  }

  async function createFestival(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !activeMandalId) return;
    const form = new FormData(event.currentTarget);
    setStatus('saving');
    try {
      const festival = await apiRequest<Festival>(
        `/mandals/${activeMandalId}/festivals`,
        {
          body: JSON.stringify({
            endDate: String(form.get('endDate')),
            name: String(form.get('name')),
            startDate: String(form.get('startDate')),
            targetAmount: Number(form.get('targetAmount') || 0),
            type: String(form.get('type')),
          }),
          method: 'POST',
        },
        session,
      );
      await apiRequest(
        `/mandals/${activeMandalId}/festivals/${festival.id}/status`,
        { body: JSON.stringify({ status: 'ACTIVE' }), method: 'PATCH' },
        session,
      );
      event.currentTarget.reset();
      await refreshWorkspace();
      setNotice('Festival created and activated.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create festival.');
    } finally {
      setStatus('idle');
    }
  }

  async function createCustomField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !activeMandalId || !activeFestivalId) return;
    const form = new FormData(event.currentTarget);
    setStatus('saving');
    try {
      await apiRequest(
        `/mandals/${activeMandalId}/festivals/${activeFestivalId}/custom-fields`,
        {
          body: JSON.stringify({
            dashboardFilter: Boolean(form.get('dashboardFilter')),
            label: String(form.get('label')),
            options: String(form.get('options') || '')
              .split(',')
              .map((option) => option.trim())
              .filter(Boolean),
            printOnSlip: true,
            required: Boolean(form.get('required')),
            type: String(form.get('type')),
          }),
          method: 'POST',
        },
        session,
      );
      event.currentTarget.reset();
      await refreshActiveForm();
      setNotice('Custom field added to the active vargani form.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create custom field.');
    } finally {
      setStatus('idle');
    }
  }

  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !activeMandalId || !activeFestivalId) return;
    const form = new FormData(event.currentTarget);
    setStatus('saving');
    try {
      const template = await apiRequest<{ id: string }>(
        `/mandals/${activeMandalId}/festivals/${activeFestivalId}/templates`,
        {
          body: JSON.stringify({ name: String(form.get('name')) }),
          method: 'POST',
        },
        session,
      );
      const version = await apiRequest<{ id: string }>(
        `/mandals/${activeMandalId}/festivals/${activeFestivalId}/templates/${template.id}/versions`,
        {
          body: JSON.stringify({
            backgroundFileUrl: String(form.get('backgroundFileUrl')),
            canvasHeight: Number(form.get('canvasHeight') || 1754),
            canvasWidth: Number(form.get('canvasWidth') || 1240),
            renderConfig: JSON.parse(String(form.get('renderConfig') || '{"fields":{}}')),
          }),
          method: 'POST',
        },
        session,
      );
      await apiRequest(
        `/mandals/${activeMandalId}/festivals/${activeFestivalId}/templates/${template.id}/versions/${version.id}/activate`,
        { method: 'PATCH' },
        session,
      );
      event.currentTarget.reset();
      setNotice('Template version uploaded and activated.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not create template.');
    } finally {
      setStatus('idle');
    }
  }

  async function generateSlip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    const form = new FormData(event.currentTarget);
    setStatus('saving');
    try {
      const customData = Object.fromEntries(
        customFields.map((field) => [field.key, String(form.get(`custom_${field.key}`) || '')]),
      );
      const slip = await apiRequest<VarganiSlip>(
        '/vargani/slips',
        {
          body: JSON.stringify({
            amount: Number(form.get('amount')),
            areaName: String(form.get('areaName')),
            contributorAddress: String(form.get('contributorAddress')),
            contributorName: String(form.get('contributorName')),
            contributorPhone: String(form.get('contributorPhone')),
            customData,
            idempotencyKey: crypto.randomUUID(),
            paymentMode: String(form.get('paymentMode')) as PaymentMode,
            shopName: String(form.get('shopName')),
          }),
          method: 'POST',
        },
        session,
      );
      setSlips((current) => [slip, ...current]);
      setSelectedSlip(slip);
      event.currentTarget.reset();
      setNotice(`Slip ${slip.slipNumber} generated.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not generate slip.');
    } finally {
      setStatus('idle');
    }
  }

  async function refreshReport() {
    if (!session || !activeMandalId || !activeFestivalId) return;
    setStatus('loading');
    try {
      const nextReport = await apiRequest<CollectionReport>(
        `/mandals/${activeMandalId}/festivals/${activeFestivalId}/reports/collections`,
        {},
        session,
      );
      setReport(nextReport);
      setNotice('Collection report refreshed.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not refresh report.');
    } finally {
      setStatus('idle');
    }
  }

  async function exportCsv() {
    if (!session || !activeMandalId || !activeFestivalId) return;
    const csv = await downloadCsv(
      `/mandals/${activeMandalId}/festivals/${activeFestivalId}/reports/collections.csv`,
      session,
    );
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'digital-vargani-collections.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark">DM</div>
          <div>
            <strong>Digital Mandal</strong>
            <span>Festival OS</span>
          </div>
        </div>
        <nav className="role-switcher" aria-label="Workspace role">
          <button className={role === 'super' ? 'active' : ''} onClick={() => setRole('super')}>
            <ShieldCheck size={18} /> Super Admin
          </button>
          <button className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>
            <CircleGauge size={18} /> Mandal Admin
          </button>
          <button className={role === 'member' ? 'active' : ''} onClick={() => setRole('member')}>
            <Smartphone size={18} /> Member App
          </button>
        </nav>
        <div className="pitch-card">
          <BadgeIndianRupee size={22} />
          <strong>{isLive ? session?.user.name : 'Demo Mode'}</strong>
          <span>
            {isLive ? `${session?.user.role} connected to ${API_BASE_URL}` : `API: ${API_BASE_URL}`}
          </span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>{isLive ? 'Live Supabase-backed workspace' : 'Demo workspace'}</p>
            <h1>{roleTitle(role)}</h1>
          </div>
          <div className="top-actions">
            {session ? (
              <button type="button" onClick={logout}>
                Logout
              </button>
            ) : null}
            <button type="button" onClick={() => window.print()}>
              <Printer size={18} /> Print Receipt
            </button>
            <button type="button" onClick={exportCsv} disabled={!session || !activeFestivalId}>
              <Download size={18} /> Export
            </button>
          </div>
        </header>

        <div className={`notice ${status !== 'idle' ? 'busy' : ''}`}>
          {status === 'idle' ? notice : 'Working...'}
        </div>

        {!session && <LoginPanel onSubmit={login} />}

        <section className="metrics-grid">
          <Metric
            icon={<IndianRupee />}
            label="Total Vargani"
            value={money(report?.totalCollection ?? totalCollection)}
            note="Live collection"
          />
          <Metric
            icon={<ReceiptText />}
            label="Slips Generated"
            value={String(report?.slipCount ?? slips.length)}
            note="Unique receipts"
          />
          <Metric
            icon={<FileText />}
            label="Expenses"
            value={money(report?.totalExpenses ?? 67500)}
            note="Approved spend"
          />
          <Metric
            icon={<CheckCircle2 />}
            label="Balance"
            value={money(report?.balance ?? totalCollection - 67500)}
            note={`Cash ${money(cashTotal)}`}
          />
        </section>

        {role === 'super' && (
          <section className="two-column">
            <MandalCreatePanel
              disabled={!session || session.user.role !== 'SUPER_ADMIN'}
              onSubmit={createMandal}
            />
            <MandalTable
              mandals={mandals}
              selectedMandalId={selectedMandalId}
              onSelect={setSelectedMandalId}
            />
          </section>
        )}

        {role === 'admin' && (
          <section className="dashboard-grid">
            <div className="panel wide">
              <WorkspaceSelectors
                activeFestivalId={activeFestivalId}
                activeMandalId={activeMandalId}
                festivals={festivals}
                mandals={mandals}
                onFestivalChange={setSelectedFestivalId}
                onMandalChange={setSelectedMandalId}
                showMandal={session?.user.role === 'SUPER_ADMIN'}
              />
              <button
                className="primary"
                type="button"
                onClick={refreshReport}
                disabled={!session || !activeFestivalId}
              >
                <CircleGauge size={18} /> Refresh Report
              </button>
            </div>
            <FestivalPanel disabled={!session || !activeMandalId} onSubmit={createFestival} />
            <CustomFieldsPanel
              fields={customFields}
              disabled={!session || !activeFestivalId}
              onSubmit={createCustomField}
            />
            <TemplatePanel disabled={!session || !activeFestivalId} onSubmit={createTemplate} />
            <VisualTemplateBuilder
              customFields={customFields}
              disabled={!session || !activeFestivalId}
              onSubmit={createTemplate}
            />
            <SlipList slips={slips} onSelect={setSelectedSlip} />
            <ReceiptPreview slip={selectedSlip} />
          </section>
        )}

        {role === 'member' && (
          <section className="two-column member-view">
            <SlipForm customFields={customFields} disabled={!session} onSubmit={generateSlip} />
            <ReceiptPreview slip={selectedSlip} />
          </section>
        )}
      </section>
    </main>
  );
}

function LoginPanel({ onSubmit }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <p>Live Login</p>
          <h2>Connect to API</h2>
        </div>
        <LogIn size={20} />
      </div>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Email or phone
          <input name="identifier" required placeholder="admin@mandal.com" />
        </label>
        <label>
          Password
          <input name="password" required type="password" placeholder="Minimum 8 characters" />
        </label>
        <button className="primary" type="submit">
          <LogIn size={18} /> Login
        </button>
      </form>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="metric">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
      <em>{note}</em>
    </article>
  );
}

function MandalCreatePanel({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <p>Onboarding</p>
          <h2>Create Mandal Account</h2>
        </div>
        <Plus size={20} />
      </div>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Mandal name
          <input disabled={disabled} name="name" required placeholder="Shree Ganesh Mitra Mandal" />
        </label>
        <label>
          Locality
          <input disabled={disabled} name="locality" required placeholder="Budhwar Peth" />
        </label>
        <label>
          City
          <input disabled={disabled} name="city" required defaultValue="Pune" />
        </label>
        <label>
          Admin name
          <input disabled={disabled} name="adminName" required placeholder="Amit Patil" />
        </label>
        <label>
          Admin email
          <input
            disabled={disabled}
            name="adminEmail"
            required
            type="email"
            placeholder="admin@mandal.com"
          />
        </label>
        <label>
          Admin mobile
          <input disabled={disabled} name="adminPhone" required placeholder="+919876543210" />
        </label>
        <label className="full">
          Admin password
          <input
            disabled={disabled}
            name="adminPassword"
            required
            minLength={12}
            type="password"
            placeholder="Minimum 12 characters"
          />
        </label>
        <button className="primary full" disabled={disabled} type="submit">
          <Plus size={18} /> Create Mandal
        </button>
      </form>
    </div>
  );
}

function MandalTable({
  mandals,
  onSelect,
  selectedMandalId,
}: {
  mandals: Mandal[];
  onSelect: (id: string) => void;
  selectedMandalId: string;
}) {
  return (
    <div className="panel table-panel">
      <div className="panel-heading">
        <div>
          <p>Onboarded Mandals</p>
          <h2>Accounts</h2>
        </div>
        <Layers3 size={20} />
      </div>
      <table>
        <thead>
          <tr>
            <th>Mandal</th>
            <th>City</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {mandals.map((mandal) => (
            <tr
              key={mandal.id}
              onClick={() => onSelect(mandal.id)}
              className={selectedMandalId === mandal.id ? 'selected-row' : ''}
            >
              <td>
                <strong>{mandal.name}</strong>
                <span>{mandal.slug}</span>
              </td>
              <td>{mandal.city ?? '-'}</td>
              <td>
                <span className={`status ${mandal.status.toLowerCase()}`}>{mandal.status}</span>
              </td>
            </tr>
          ))}
          {!mandals.length && (
            <tr>
              <td colSpan={3}>Login as super admin to load live mandals.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function WorkspaceSelectors({
  activeFestivalId,
  activeMandalId,
  festivals,
  mandals,
  onFestivalChange,
  onMandalChange,
  showMandal,
}: {
  activeFestivalId: string;
  activeMandalId: string;
  festivals: Festival[];
  mandals: Mandal[];
  onFestivalChange: (id: string) => void;
  onMandalChange: (id: string) => void;
  showMandal: boolean;
}) {
  return (
    <div className="form-grid compact">
      {showMandal && (
        <label>
          Mandal
          <select value={activeMandalId} onChange={(event) => onMandalChange(event.target.value)}>
            {mandals.map((mandal) => (
              <option key={mandal.id} value={mandal.id}>
                {mandal.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Festival
        <select value={activeFestivalId} onChange={(event) => onFestivalChange(event.target.value)}>
          {festivals.map((festival) => (
            <option key={festival.id} value={festival.id}>
              {festival.name} - {festival.status}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function FestivalPanel({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <p>Festival Setup</p>
          <h2>Create Active Festival</h2>
        </div>
        <CalendarDays size={20} />
      </div>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Name
          <input disabled={disabled} name="name" required defaultValue="Ganpati 2026" />
        </label>
        <label>
          Type
          <input disabled={disabled} name="type" required defaultValue="GANPATI" />
        </label>
        <label>
          Start date
          <input disabled={disabled} name="startDate" required type="date" />
        </label>
        <label>
          End date
          <input disabled={disabled} name="endDate" required type="date" />
        </label>
        <label className="full">
          Target amount
          <input
            disabled={disabled}
            name="targetAmount"
            inputMode="numeric"
            placeholder="1500000"
          />
        </label>
        <button className="primary full" disabled={disabled} type="submit">
          Create And Activate
        </button>
      </form>
    </div>
  );
}

function CustomFieldsPanel({
  disabled,
  fields,
  onSubmit,
}: {
  disabled: boolean;
  fields: CustomField[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <p>Form Builder</p>
          <h2>Custom Fields</h2>
        </div>
        <FileText size={20} />
      </div>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Label
          <input disabled={disabled} name="label" required placeholder="Building name" />
        </label>
        <label>
          Type
          <select disabled={disabled} name="type" defaultValue="TEXT">
            <option value="TEXT">Text</option>
            <option value="NUMBER">Number</option>
            <option value="DATE">Date</option>
            <option value="DROPDOWN">Dropdown</option>
            <option value="CHECKBOX">Checkbox</option>
            <option value="LONG_TEXT">Long text</option>
          </select>
        </label>
        <label className="full">
          Dropdown options
          <input disabled={disabled} name="options" placeholder="Gold, Silver, General" />
        </label>
        <label className="checkline">
          <input disabled={disabled} name="required" type="checkbox" /> Required
        </label>
        <label className="checkline">
          <input disabled={disabled} name="dashboardFilter" type="checkbox" /> Dashboard filter
        </label>
        <button className="primary full" disabled={disabled} type="submit">
          Add Field
        </button>
      </form>
      <div className="field-map">
        {fields.map((field) => (
          <span key={field.id}>
            {field.label} ({field.type})
          </span>
        ))}
      </div>
    </div>
  );
}

function TemplatePanel({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <p>Template Engine</p>
          <h2>JSON Template</h2>
        </div>
        <Upload size={20} />
      </div>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Template name
          <input disabled={disabled} name="name" required defaultValue="Ganpati Receipt" />
        </label>
        <label>
          Background file URL
          <input disabled={disabled} name="backgroundFileUrl" required placeholder="https://..." />
        </label>
        <label>
          Canvas width
          <input disabled={disabled} name="canvasWidth" required defaultValue="1240" />
        </label>
        <label>
          Canvas height
          <input disabled={disabled} name="canvasHeight" required defaultValue="1754" />
        </label>
        <label className="full">
          Render config JSON
          <textarea
            disabled={disabled}
            name="renderConfig"
            defaultValue='{"fields":{"slipNumber":{"x":100,"y":80},"contributorName":{"x":160,"y":280},"amount":{"x":820,"y":280}}}'
          />
        </label>
        <button className="primary full" disabled={disabled} type="submit">
          Activate Template
        </button>
      </form>
    </div>
  );
}

function VisualTemplateBuilder({
  customFields,
  disabled,
  onSubmit,
}: {
  customFields: CustomField[];
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const fieldOptions = useMemo(
    () => [
      { key: 'slipNumber', label: 'Slip Number' },
      { key: 'createdAt', label: 'Date' },
      { key: 'contributorName', label: 'Contributor Name' },
      { key: 'contributorAddress', label: 'Address' },
      { key: 'shopName', label: 'Shop Name' },
      { key: 'areaName', label: 'Area' },
      { key: 'amount', label: 'Amount' },
      { key: 'paymentMode', label: 'Payment Mode' },
      ...customFields.map((field) => ({ key: field.key, label: field.label })),
    ],
    [customFields],
  );
  const [backgroundFileUrl, setBackgroundFileUrl] = useState(
    '/templates/akhilnayak-mitra-mandal-vargani.jpeg',
  );
  const [canvasWidth, setCanvasWidth] = useState(1328);
  const [canvasHeight, setCanvasHeight] = useState(800);
  const [activeField, setActiveField] = useState(fieldOptions[0]?.key ?? 'slipNumber');
  const [placements, setPlacements] = useState<Record<string, TemplatePlacement>>({
    amount: {
      color: '#111111',
      fontSize: 31,
      fontWeight: 900,
      textAlign: 'left',
      width: 250,
      x: 720,
      y: 706,
    },
    building_name: {
      color: '#111111',
      fontSize: 24,
      fontWeight: 700,
      textAlign: 'left',
      width: 420,
      x: 715,
      y: 648,
    },
    contributorAddress: {
      color: '#111111',
      fontSize: 27,
      fontWeight: 800,
      textAlign: 'left',
      width: 560,
      x: 715,
      y: 612,
    },
    contributorName: {
      color: '#111111',
      fontSize: 30,
      fontWeight: 900,
      textAlign: 'left',
      width: 610,
      x: 670,
      y: 544,
    },
    createdAt: {
      color: '#111111',
      fontSize: 25,
      fontWeight: 800,
      textAlign: 'center',
      width: 160,
      x: 1115,
      y: 478,
    },
    slipNumber: {
      color: '#b62028',
      fontSize: 31,
      fontWeight: 900,
      textAlign: 'left',
      width: 100,
      x: 648,
      y: 470,
    },
  });
  const selectedPlacement = placements[activeField];
  const renderConfig = useMemo(() => ({ fields: placements }), [placements]);

  function placeField(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * canvasWidth);
    const y = Math.round(((event.clientY - rect.top) / rect.height) * canvasHeight);
    setPlacements((current) => ({
      ...current,
      [activeField]: {
        color: current[activeField]?.color ?? '#111111',
        fontSize: current[activeField]?.fontSize ?? 28,
        fontWeight: current[activeField]?.fontWeight ?? 800,
        textAlign: current[activeField]?.textAlign ?? 'left',
        width: current[activeField]?.width ?? 280,
        x,
        y,
      },
    }));
  }

  function updatePlacement(partial: Partial<TemplatePlacement>) {
    setPlacements((current) => ({
      ...current,
      [activeField]: {
        ...defaultPlacement(),
        ...current[activeField],
        ...partial,
      },
    }));
  }

  function removePlacement() {
    setPlacements((current) => {
      const next = { ...current };
      delete next[activeField];
      return next;
    });
  }

  return (
    <div className="panel wide">
      <div className="panel-heading">
        <div>
          <p>Visual Template Builder</p>
          <h2>Place Slip Fields</h2>
        </div>
        <Upload size={20} />
      </div>
      <form className="template-builder" onSubmit={onSubmit}>
        <div className="builder-controls">
          <label>
            Template name
            <input
              disabled={disabled}
              name="name"
              required
              defaultValue="Akhilnayak Original Vargani Slip"
            />
          </label>
          <label>
            Background image URL
            <input
              disabled={disabled}
              name="backgroundFileUrl"
              required
              value={backgroundFileUrl}
              onChange={(event) => setBackgroundFileUrl(event.target.value)}
            />
          </label>
          <div className="form-grid">
            <label>
              Canvas width
              <input
                disabled={disabled}
                name="canvasWidth"
                required
                type="number"
                value={canvasWidth}
                onChange={(event) => setCanvasWidth(Number(event.target.value))}
              />
            </label>
            <label>
              Canvas height
              <input
                disabled={disabled}
                name="canvasHeight"
                required
                type="number"
                value={canvasHeight}
                onChange={(event) => setCanvasHeight(Number(event.target.value))}
              />
            </label>
          </div>
          <label>
            Active field
            <select
              disabled={disabled}
              value={activeField}
              onChange={(event) => setActiveField(event.target.value)}
            >
              {fieldOptions.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label>
              X
              <input
                disabled={disabled}
                type="number"
                value={selectedPlacement?.x ?? 0}
                onChange={(event) => updatePlacement({ x: Number(event.target.value) })}
              />
            </label>
            <label>
              Y
              <input
                disabled={disabled}
                type="number"
                value={selectedPlacement?.y ?? 0}
                onChange={(event) => updatePlacement({ y: Number(event.target.value) })}
              />
            </label>
            <label>
              Width
              <input
                disabled={disabled}
                type="number"
                value={selectedPlacement?.width ?? 280}
                onChange={(event) => updatePlacement({ width: Number(event.target.value) })}
              />
            </label>
            <label>
              Font size
              <input
                disabled={disabled}
                type="number"
                value={selectedPlacement?.fontSize ?? 28}
                onChange={(event) => updatePlacement({ fontSize: Number(event.target.value) })}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Weight
              <select
                disabled={disabled}
                value={selectedPlacement?.fontWeight ?? 800}
                onChange={(event) => updatePlacement({ fontWeight: Number(event.target.value) })}
              >
                <option value={400}>Regular</option>
                <option value={700}>Bold</option>
                <option value={800}>Extra Bold</option>
                <option value={900}>Black</option>
              </select>
            </label>
            <label>
              Align
              <select
                disabled={disabled}
                value={selectedPlacement?.textAlign ?? 'left'}
                onChange={(event) =>
                  updatePlacement({ textAlign: event.target.value as TextAlign })
                }
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
          <label>
            Color
            <input
              disabled={disabled}
              type="color"
              value={selectedPlacement?.color ?? '#111111'}
              onChange={(event) => updatePlacement({ color: event.target.value })}
            />
          </label>
          <input name="renderConfig" type="hidden" value={JSON.stringify(renderConfig)} />
          <div className="builder-actions">
            <button className="primary" disabled={disabled} type="submit">
              Activate Visual Template
            </button>
            <button
              disabled={disabled || !selectedPlacement}
              type="button"
              onClick={removePlacement}
            >
              Remove Field
            </button>
          </div>
        </div>
        <div className="builder-canvas-wrap">
          <div
            className="builder-canvas"
            onPointerDown={placeField}
            style={{ aspectRatio: `${canvasWidth} / ${canvasHeight}` }}
          >
            <img alt="" src={backgroundFileUrl} />
            {Object.entries(placements).map(([key, placement]) => {
              const field = fieldOptions.find((item) => item.key === key);
              return (
                <button
                  className={`template-field ${activeField === key ? 'active' : ''}`}
                  key={key}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setActiveField(key);
                  }}
                  style={{
                    color: placement.color,
                    fontSize: `${placement.fontSize}px`,
                    fontWeight: placement.fontWeight,
                    left: `${(placement.x / canvasWidth) * 100}%`,
                    textAlign: placement.textAlign,
                    top: `${(placement.y / canvasHeight) * 100}%`,
                    width: `${(placement.width / canvasWidth) * 100}%`,
                  }}
                  type="button"
                >
                  {sampleFieldValue(key, field?.label ?? key)}
                </button>
              );
            })}
          </div>
          <div className="field-map">
            {Object.keys(placements).map((key) => (
              <span key={key}>{fieldOptions.find((field) => field.key === key)?.label ?? key}</span>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}

function defaultPlacement(): TemplatePlacement {
  return {
    color: '#111111',
    fontSize: 28,
    fontWeight: 800,
    textAlign: 'left',
    width: 280,
    x: 120,
    y: 120,
  };
}

function sampleFieldValue(key: string, label: string) {
  const samples: Record<string, string> = {
    amount: '5100',
    areaName: 'Ramtekdi',
    building_name: 'Prathama Building',
    contributorAddress: 'Ramtekdi, Pune',
    contributorName: 'Mahesh Traders',
    createdAt: '26/07/2026',
    paymentMode: 'UPI',
    shopName: 'Mahesh Traders',
    slipNumber: '003',
  };

  return samples[key] ?? label;
}

function SlipForm({
  customFields,
  disabled,
  onSubmit,
}: {
  customFields: CustomField[];
  disabled: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <p>Member Login</p>
          <h2>Generate Vargani Slip</h2>
        </div>
        <ReceiptText size={20} />
      </div>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Contributor name
          <input
            disabled={disabled}
            name="contributorName"
            required
            placeholder="Donor / shop owner"
          />
        </label>
        <label>
          Shop / company
          <input disabled={disabled} name="shopName" placeholder="Optional" />
        </label>
        <label>
          Mobile
          <input disabled={disabled} name="contributorPhone" placeholder="+919876543210" />
        </label>
        <label>
          Area
          <input disabled={disabled} name="areaName" required placeholder="Laxmi Road" />
        </label>
        <label>
          Amount
          <input
            disabled={disabled}
            name="amount"
            required
            inputMode="numeric"
            placeholder="1101"
          />
        </label>
        <label>
          Payment mode
          <select disabled={disabled} name="paymentMode" defaultValue="CASH">
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CHEQUE">Cheque</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="full">
          Address
          <input
            disabled={disabled}
            name="contributorAddress"
            placeholder="Society, lane, shop address"
          />
        </label>
        {customFields.map((field) => (
          <label key={field.id}>
            {field.label}
            <input disabled={disabled} name={`custom_${field.key}`} required={field.required} />
          </label>
        ))}
        <button className="primary full" disabled={disabled} type="submit">
          <ReceiptText size={18} /> Generate Digital Slip
        </button>
      </form>
    </div>
  );
}

function SlipList({
  onSelect,
  slips,
}: {
  onSelect: (slip: VarganiSlip) => void;
  slips: VarganiSlip[];
}) {
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <p>Collections</p>
          <h2>Latest Slips</h2>
        </div>
        <ReceiptText size={20} />
      </div>
      <div className="slip-list">
        {slips.map((slip) => (
          <button key={slip.id} onClick={() => onSelect(slip)}>
            <span>{slip.slipNumber}</span>
            <strong>{slip.contributorName}</strong>
            <em>
              {money(Number(slip.amount))} - {slip.paymentMode} - {slip.areaName ?? 'No area'}
            </em>
          </button>
        ))}
      </div>
    </div>
  );
}

function ReceiptPreview({ slip }: { slip: VarganiSlip }) {
  return (
    <div className="receipt-panel">
      <div className="receipt">
        <div className="receipt-top">
          <span>SH</span>
          <div>
            <h2>Digital Mandal Receipt</h2>
            <p>Verified Digital Vargani Slip</p>
          </div>
        </div>
        <div className="receipt-number">{slip.slipNumber}</div>
        <dl>
          <div>
            <dt>Name</dt>
            <dd>{slip.contributorName}</dd>
          </div>
          <div>
            <dt>Shop</dt>
            <dd>{slip.shopName || '-'}</dd>
          </div>
          <div>
            <dt>Area</dt>
            <dd>{slip.areaName || '-'}</dd>
          </div>
          <div>
            <dt>Mobile</dt>
            <dd>{slip.contributorPhone || '-'}</dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>{slip.paymentMode}</dd>
          </div>
          <div>
            <dt>Date</dt>
            <dd>
              {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(slip.createdAt),
              )}
            </dd>
          </div>
        </dl>
        <div className="receipt-amount">
          <span>Amount Received</span>
          <strong>{money(Number(slip.amount))}</strong>
        </div>
        <p className="receipt-note">Thank you for supporting the festival.</p>
        <div className="receipt-footer">
          <span>{slip.id}</span>
          <CheckCircle2 size={18} /> Verified
        </div>
      </div>
    </div>
  );
}

function roleTitle(role: Role) {
  if (role === 'super') return 'Super Admin: Mandal Onboarding';
  if (role === 'admin') return 'Mandal Admin: Festival Operations';
  return 'Member: Mobile Vargani Generator';
}

function money(value: number) {
  return new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(Number.isFinite(value) ? value : 0);
}
