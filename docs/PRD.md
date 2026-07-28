# Product Requirements Document: Digital Mandal

## 1. Product Vision

Digital Mandal is a scalable festival management platform for onboarding thousands of local mandals and digitizing their core operations, starting with **Digital Vargani**.

During festivals like Ganpati, Dahi Handi, Navratri, and local events, organizer teams collect contributions from residents, shops, and sponsors. Today this is mostly handwritten, hard to audit, difficult to reconcile, and impossible to analyze in real time.

Digital Mandal will replace paper-first vargani workflows with mobile-first collection, configurable receipt templates, member-wise dashboards, mandal expenses, and production-grade reporting.

## 2. Target Scale

- 10,000+ mandals onboarded.
- 50 to 300 members per mandal.
- Multiple active festivals per mandal per year.
- Lakhs to crores of vargani slips over time.
- Heavy peak traffic during festival collection windows.
- Mobile-first usage by field members in local areas.

## 3. Primary Users

### Super Admin

Platform owner/operator.

Responsibilities:

- Create and manage mandal accounts.
- Configure subscription/access status.
- Upload or assign slip templates.
- Define default fields and mandal-specific custom fields.
- Monitor usage, collections, slip volume, and platform health.

### Mandal Admin

Owner or committee lead of one mandal.

Responsibilities:

- Manage mandal profile, festival, members, groups, areas, and collectors.
- Configure vargani slip template and fields.
- View collections, expenses, and reports.
- Approve corrections, cancellations, and expense entries.

### Khajindar / Treasurer

Finance owner inside a mandal.

Responsibilities:

- Track cash, UPI, cheque, and other collection modes.
- Reconcile member-wise collections.
- Manage expenses.
- Export reports.

### Group Leader

Leads a small collection group.

Responsibilities:

- Assign areas to 2 to 3 person teams.
- Track team collection progress.
- Review member-wise slips.

### Member / Collector

Field team member collecting vargani.

Responsibilities:

- Login from mobile.
- Fill vargani generator form.
- Generate digital slip.
- Share/download/print receipt if needed.
- View own collection history.

## 4. Core Feature: Digital Vargani

### Problem

Local festival teams collect vargani from homes, shops, and sponsors using handwritten slips. This creates:

- Lost slips.
- Wrong totals.
- No live collection visibility.
- Fraud or duplicate receipt risk.
- Hard member-wise accountability.
- Manual expense tracking.
- No clean historical data for next year.

### Solution

Each mandal gets a configurable digital vargani slip generator. Members log in, fill donor details, amount, payment mode, and custom fields. The system generates a numbered slip using that mandal's template and stores structured collection data for dashboards and reports.

## 5. MVP Scope

### Included

- Super admin login.
- Mandal onboarding.
- Mandal admin login.
- Member login.
- Festival setup.
- Vargani template upload.
- Custom slip field configuration.
- Mobile vargani form.
- Slip number generation.
- PDF/image receipt generation.
- Member-wise collection dashboard.
- Group-wise and area-wise collection dashboard.
- Mandal expense tracking.
- Basic exports.
- Audit trail for slip creation, update, cancel, and expense changes.

### Excluded From MVP

- Full accounting ledger.
- GST/tax automation.
- Offline-first sync.
- Native mobile apps.
- Payment gateway settlement automation.
- WhatsApp Business API automation.
- AI-based template field detection.

These can be added after the core vargani engine is stable.

## 6. Functional Requirements

### Super Admin

- Create mandal account with name, city, locality, registration info, contact person, and plan.
- Create mandal admin user.
- Activate, suspend, or archive mandal.
- View total mandals, active festivals, slips generated, collections, and storage usage.
- Upload default template library.
- Assign template to mandal.
- Configure mandal-specific fields.

### Mandal Management

- Store mandal name, logo, address, area, city, state, contact numbers, and social links.
- Support multiple festivals per mandal.
- Each festival has date range, target amount, active status, and template.

### Member Management

- Add members manually.
- Bulk import members by CSV later.
- Assign role: admin, khajindar, group leader, member.
- Assign group and area.
- Enable or disable login.
- Track member-wise collection.

### Digital Vargani Form

Required base fields:

- Contributor name.
- Mobile number.
- Address or area.
- Shop/company name where applicable.
- Amount.
- Payment mode: cash, UPI, cheque, bank transfer, other.
- Collected by member.
- Festival.
- Date/time.

Configurable custom fields:

- Text.
- Number.
- Date.
- Dropdown.
- Checkbox.
- Long text.
- Required/optional.
- Print on slip true/false.
- Dashboard filter true/false.

### Slip Generation

- Generate unique slip number per mandal and festival.
- Render receipt using mandal template.
- Support uploaded background template similar to print-id-craft style workflows.
- Place dynamic fields on template using configured x/y coordinates, font, size, color, alignment, and visibility.
- Generate PDF and preview image.
- Allow share/download.
- Store immutable original collection payload.

### Dashboard

Mandal dashboard:

- Total collection.
- Collection by member.
- Collection by group.
- Collection by area.
- Collection by payment mode.
- Daily collection trend.
- Top contributors.
- Pending reconciliation.
- Expenses and balance.

Member dashboard:

- Today's collection.
- Total collection for active festival.
- Own slips.
- Own cancelled slips.

Super admin dashboard:

- Mandals onboarded.
- Active mandals.
- Total slips generated.
- Slip generation volume over time.
- Storage usage.
- High traffic mandals.

### Expenses

- Add expense category.
- Add expense with amount, date, vendor, bill image, notes, and approved by.
- View expense by category.
- Show balance: total vargani collected minus approved expenses.

### Audit And Controls

- Every slip has created by, created at, device metadata, IP, and status.
- Slip statuses: active, cancelled, corrected.
- Cancellation requires reason and permission.
- Amount update after creation should create correction record instead of silently mutating history.
- Admin can export audit log.

## 7. Non-Functional Requirements

### Performance

- Form submission target: under 500 ms for API response excluding PDF rendering.
- Dashboard API target: under 1 second for normal date ranges.
- Slip rendering should be asynchronous when traffic is high.
- Use cached dashboard aggregates for large mandals.

### Scalability

- Multi-tenant architecture with mandal isolation.
- Partition large slip tables by time or mandal hash once scale requires it.
- Queue receipt rendering.
- Use object storage for generated PDFs/images.
- Use read replicas for reporting when needed.

### Reliability

- No duplicate slip numbers.
- Idempotent slip creation API.
- Queue retries for rendering.
- Daily backups.
- Structured logs and error tracking.

### Security

- Role-based access control.
- Mandal-level tenant isolation on every query.
- Strong password hashing.
- Refresh token rotation.
- Optional OTP login for members in later phase.
- Signed URLs for private slip files.
- Rate limits on login, slip creation, and exports.

### Compliance And Privacy

- Store only necessary contributor data.
- Allow mandal admin to export their data.
- Define retention policy for inactive mandals.
- Encrypt sensitive secrets and credentials.

## 8. Success Metrics

- Mandal onboarding time under 10 minutes.
- Member can create first slip in under 30 seconds.
- Less than 1 percent failed slip render jobs.
- Dashboard totals match exported raw slips.
- 95th percentile API latency under target during festival peak.
- Mandal admins use dashboard daily during collection season.

## 9. MVP Release Milestones

### Phase 1: Foundation

- Auth, roles, mandal tenant model, festival model.
- Basic member management.
- Manual template setup.

### Phase 2: Digital Vargani

- Mobile form.
- Slip number generation.
- Receipt rendering.
- Member history.

### Phase 3: Dashboards And Expenses

- Collection dashboard.
- Expenses.
- Exports.

### Phase 4: Scale Hardening

- Queues.
- Aggregates.
- Object storage.
- Monitoring.
- Load testing.
