# NestJS Implementation Plan

## 1. Repository Structure

Recommended structure:

```text
apps/
  api/
    src/
      main.ts
      app.module.ts
      common/
      config/
      auth/
      mandals/
      festivals/
      members/
      templates/
      vargani/
      expenses/
      reports/
      audit/
      storage/
      queue/
  worker/
    src/
      main.ts
      receipt-render/
packages/
  database/
  shared/
docs/
```

Use a monorepo only if the frontend and worker will live together. If starting very fast, keep `api` and `worker` inside one NestJS app with separate entry points.

## 2. Recommended Packages

- `@nestjs/core`
- `@nestjs/config`
- `@nestjs/jwt`
- `@nestjs/passport`
- `@nestjs/swagger`
- `class-validator`
- `class-transformer`
- `helmet`
- `@nestjs/throttler`
- `@prisma/client`
- `prisma`
- `bullmq`
- `ioredis`
- `argon2`
- `zod` for dynamic custom field validation
- `pdf-lib` or `puppeteer` for receipt rendering
- S3 SDK for object storage

## 3. Module Responsibilities

### AuthModule

Deliverables:

- `POST /auth/login`
- `POST /auth/refresh`
- JWT strategy.
- Role guard.
- Tenant context decorator.
- Password hashing with Argon2.

Key rule:

- Every authenticated request must produce `AuthContext` containing `userId`, `mandalId`, `role`, `permissions`.

### MandalsModule

Deliverables:

- Super admin mandal CRUD.
- Mandal profile update.
- Mandal status management.

### FestivalsModule

Deliverables:

- Festival CRUD.
- Activate/deactivate festival.
- Link active template.

### MembersModule

Deliverables:

- Member CRUD.
- Group CRUD.
- Area assignment.
- Role assignment.
- Disable member.

### TemplatesModule

Deliverables:

- Upload template background.
- Save render configuration.
- Version templates.
- Preview template with sample data.
- Validate field bindings.

### VarganiModule

Deliverables:

- Get active member form.
- Create slip.
- Generate slip number.
- Enqueue render job.
- Get slip details.
- Cancel slip.
- Member slip history.

### ReportsModule

Deliverables:

- Collection summary.
- Member-wise summary.
- Group-wise summary.
- Area-wise summary.
- Payment-mode summary.
- Export CSV.

### ExpensesModule

Deliverables:

- Expense categories.
- Expense CRUD.
- Approval status.
- Expense reports.

### AuditModule

Deliverables:

- Record audit events from service layer.
- Query audit events for admin.

## 4. Implementation Sequence

### Sprint 1: Foundation

1. Create NestJS app.
2. Configure environment validation.
3. Add Prisma and PostgreSQL schema.
4. Add AuthModule.
5. Add role guard and tenant guard.
6. Add Super Admin seed.

Acceptance:

- Super admin can login.
- Protected routes reject unauthorized users.
- Tenant context is available in services.

### Sprint 2: Mandal And Member Setup

1. Implement mandal CRUD.
2. Implement festival CRUD.
3. Implement member and group CRUD.
4. Implement basic admin dashboard shell endpoints.

Acceptance:

- Super admin can onboard mandal.
- Mandal admin can create festival and members.
- Member can login.

### Sprint 3: Template Engine

1. Upload background template to storage.
2. Store template version.
3. Store render config JSON.
4. Validate field bindings.
5. Generate preview.

Acceptance:

- Admin can upload template and place fields.
- Preview renders with sample vargani data.
- Template version is immutable after activation.

### Sprint 4: Digital Vargani

1. Create active form endpoint.
2. Implement custom field validation.
3. Implement transactional slip number generation.
4. Create vargani slip.
5. Enqueue receipt render job.
6. Add slip history endpoint.

Acceptance:

- Member fills mobile form and creates slip.
- Slip number is unique under concurrent submissions.
- Receipt file is generated and available.

### Sprint 5: Dashboards And Expenses

1. Implement collection summary queries.
2. Implement member/group/area reports.
3. Add expense module.
4. Add balance report.
5. Add CSV export.

Acceptance:

- Mandal admin can see member-wise collection and expenses.
- Treasurer can reconcile totals.

### Sprint 6: Production Hardening

1. Add load tests.
2. Add queue retries and dead-letter logs.
3. Add observability.
4. Add rate limits.
5. Add backup and restore scripts.
6. Add security checks.

Acceptance:

- System handles festival-peak slip creation targets.
- Failures are visible and recoverable.

## 5. Key Service Pseudocode

### Create Slip

```ts
async createSlip(ctx: AuthContext, dto: CreateVarganiSlipDto) {
  return this.prisma.$transaction(async (tx) => {
    const festival = await this.festivals.getActiveForMember(tx, ctx);
    await this.customFields.validate(tx, ctx.mandalId, festival.id, dto.customData);

    const nextValue = await this.slipSequences.next(tx, ctx.mandalId, festival.id);
    const slipNumber = formatSlipNumber(festival, nextValue);

    const slip = await tx.varganiSlip.create({
      data: {
        mandalId: ctx.mandalId,
        festivalId: festival.id,
        slipNumber,
        contributorName: dto.contributorName,
        contributorPhone: dto.contributorPhone,
        contributorAddress: dto.contributorAddress,
        shopName: dto.shopName,
        amount: dto.amount,
        paymentMode: dto.paymentMode,
        collectedByUserId: ctx.userId,
        customData: dto.customData,
        templateVersionId: festival.activeTemplateVersionId,
      },
    });

    await this.audit.record(tx, ctx, "vargani_slip", slip.id, "created", null, slip);
    await this.queue.enqueueReceiptRender(slip.id);

    return slip;
  });
}
```

## 6. DTO Validation

Use strict DTO validation for system fields:

- Amount must be positive.
- Payment mode must be enum.
- Contributor phone must match configured locale rules if provided.
- Required custom fields must be present.
- Unknown custom fields should be rejected unless the mandal config allows draft fields.

## 7. Testing Strategy

### Unit Tests

- Slip number formatter.
- Custom field validator.
- Role permission matrix.
- Template binding validator.

### Integration Tests

- Super admin creates mandal.
- Mandal admin creates festival and member.
- Member creates slip.
- Member cannot access another member's private data.
- Mandal admin cannot access another mandal.

### Concurrency Tests

- 100 parallel slip creation requests for same mandal/festival.
- Assert no duplicate slip numbers.
- Assert sequence has no broken transaction state.

### Load Tests

- Simulate festival peak traffic.
- Track p50, p95, p99 API latency.
- Track database CPU, queue depth, and render worker throughput.

## 8. Deployment Plan

Recommended environments:

- Local.
- Staging.
- Production.

Production components:

- API containers behind load balancer.
- Worker containers autoscaled separately.
- PostgreSQL managed database.
- Redis managed instance.
- Object storage bucket.
- CDN for public/static template previews.
- Private signed URLs for receipts where privacy is required.

## 9. Scalability Decisions

Start simple:

- One PostgreSQL database.
- Modular NestJS app.
- Indexed SQL reporting.
- BullMQ rendering.

Scale when needed:

- Add read replica for reporting.
- Add aggregate tables.
- Partition slips by month or festival year.
- Increase worker pool.
- Move reporting to separate service only after real pressure appears.

## 10. Security Checklist

- Helmet enabled.
- CORS restricted.
- Rate limits configured.
- Argon2 password hashing.
- Refresh token rotation.
- File upload MIME and size validation.
- Signed object storage URLs.
- Tenant guard tested.
- Audit log for financial actions.
- No raw custom field HTML rendered in receipts without sanitization.
