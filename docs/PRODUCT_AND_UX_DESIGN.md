# Product And UX Design: Digital Vargani

## 1. Design Goal

The application should feel fast, serious, and trustworthy. Field members may be standing in front of a shopkeeper or resident, so the vargani form must open quickly, require minimum typing, and generate a receipt without confusion.

The admin dashboard should feel like an operations console, not a marketing page. It should prioritize totals, accountability, reconciliation, and drill-downs.

## 2. Product Navigation

### Super Admin

Primary navigation:

- Overview.
- Mandals.
- Templates.
- Usage.
- Plans.
- Admin Users.
- System Logs.

### Mandal Admin / Khajindar

Primary navigation:

- Dashboard.
- Vargani Slips.
- Members.
- Groups & Areas.
- Festivals.
- Templates.
- Expenses.
- Reports.
- Settings.

### Member

Primary navigation:

- Generate Slip.
- My Slips.
- My Collection.
- Profile.

For members, the app should open directly on the active vargani form after login.

## 3. Super Admin Screens

### Overview

Cards and tables:

- Total mandals.
- Active mandals.
- Active festivals.
- Slips generated today.
- Total slips generated.
- Storage usage.
- Highest volume mandals.
- Recent onboarding.

Actions:

- Create Mandal.
- Open Mandal.
- Suspend Mandal.
- Assign Template.

### Create Mandal

Sections:

- Mandal details.
- Contact person.
- Address and locality.
- Plan and access status.
- Mandal admin login.
- Initial festival optional.

Important behavior:

- Mandal slug should be auto-generated but editable.
- Duplicate phone/email should be detected.
- Admin password can be generated automatically.

## 4. Mandal Admin Dashboard

Top summary:

- Total collected.
- Today's collection.
- Total slips.
- Cash pending reconciliation.
- Expenses.
- Current balance.

Main dashboard sections:

- Collection trend by day.
- Collection by member.
- Collection by group.
- Collection by area.
- Collection by payment mode.
- Latest slips.
- Expense summary.

Filters:

- Festival.
- Date range.
- Group.
- Member.
- Area.
- Payment mode.

Dashboard must load fast even for large mandals. Use pre-aggregated numbers once slip count grows.

## 5. Member Mobile Slip Generator

### Screen Structure

Header:

- Mandal name.
- Festival name.
- Member name.

Form:

- Contributor name.
- Shop/company name.
- Mobile number.
- Address/area.
- Amount.
- Payment mode.
- Custom mandal fields.
- Notes if enabled.

Footer action:

- Generate Slip.

After submit:

- Show generated slip number.
- Show render status if receipt is still being prepared.
- Show receipt preview when ready.
- Actions: Share, Download, New Slip.

### Mobile UX Requirements

- Large touch targets.
- Numeric keyboard for amount and phone.
- Last used area prefilled when useful.
- Payment mode as quick segmented control.
- Clear loading state during submit.
- Prevent double submit.
- If render is delayed, slip must still be saved and visible.

## 6. Template Builder

The template builder should work like a controlled print layout editor.

Admin actions:

- Upload background receipt image or PDF.
- Select paper size or custom canvas size.
- Add fields.
- Bind each field to data.
- Drag field to exact position.
- Set font size, weight, color, alignment.
- Toggle print visibility.
- Preview with sample data.
- Activate version.

Field sources:

- System field.
- Custom field.
- Mandal profile field.
- Festival field.

Important rule:

- Once a template version is used for slips, that version should remain immutable. New edits create a new version.

## 7. Vargani Slip Detail Screen

Shows:

- Slip number.
- Receipt preview.
- Contributor details.
- Amount.
- Payment mode.
- Collected by.
- Group and area.
- Created date/time.
- Status.
- Custom fields.
- Audit history.

Actions by role:

- Member: view/share/download own active slips.
- Group leader: view team slips.
- Khajindar: reconcile, cancel with reason, export.
- Admin: all mandal actions.

## 8. Expense Screens

### Expense List

Columns:

- Date.
- Category.
- Vendor.
- Amount.
- Status.
- Created by.
- Approved by.

Filters:

- Festival.
- Date range.
- Category.
- Status.

### Add Expense

Fields:

- Category.
- Amount.
- Date.
- Vendor.
- Notes.
- Bill upload.

Approval:

- Draft.
- Submitted.
- Approved.
- Rejected.

## 9. Performance UX

The application must feel instant during field collection.

Rules:

- Login/session restore should be fast.
- Active form configuration should be cached.
- Slip submit button should disable immediately after tap.
- API should return created slip quickly.
- Receipt rendering can finish asynchronously.
- Dashboard heavy queries should never block slip generation.

Suggested loading states:

- "Saving slip..."
- "Slip created. Preparing receipt..."
- "Receipt ready."

## 10. Brainstormed Future Features

Strong future additions:

- UPI QR per mandal or collector.
- WhatsApp receipt sharing.
- Offline draft mode for poor network areas.
- Bulk member import.
- Donor history from previous festivals.
- Sponsor category management.
- Geo-tagged collection areas.
- Cash handover workflow from member to khajindar.
- Public donation page per mandal.
- Volunteer temporary links with limits.
- AI template field suggestion after uploading slip background.

Keep MVP focused on the working vargani engine first. Once mandals trust the collection data, every other festival management feature becomes easier to sell.
