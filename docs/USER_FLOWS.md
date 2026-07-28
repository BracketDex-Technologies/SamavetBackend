# User Flows: Digital Vargani

## 1. Super Admin Onboards A Mandal

```mermaid
flowchart TD
    A["Super admin logs in"] --> B["Create mandal account"]
    B --> C["Add mandal profile and contact person"]
    C --> D["Create mandal admin login"]
    D --> E["Assign plan and status"]
    E --> F["Upload or assign vargani template"]
    F --> G["Mandal is ready for setup"]
```

Steps:

1. Super admin logs in.
2. Opens Mandals.
3. Clicks Create Mandal.
4. Enters mandal name, locality, city, contact person, mobile, and status.
5. Creates mandal admin credentials.
6. Optionally uploads starter vargani template.
7. Sends login details to mandal admin.

## 2. Mandal Admin Sets Up Festival

```mermaid
flowchart TD
    A["Mandal admin logs in"] --> B["Create festival"]
    B --> C["Set target amount and dates"]
    C --> D["Create groups and areas"]
    D --> E["Add members"]
    E --> F["Assign members to groups"]
    F --> G["Activate festival"]
```

Example:

- Festival: Ganpati 2026.
- Target amount: Rs. 15,00,000.
- Groups: Market Area, Station Road, Society Area.
- Members: 50 to 300 people.
- Teams: 2 to 3 members per area.

## 3. Mandal Admin Configures Vargani Slip

```mermaid
flowchart TD
    A["Upload slip template"] --> B["Set canvas size"]
    B --> C["Add system fields"]
    C --> D["Add custom fields"]
    D --> E["Place fields on template"]
    E --> F["Preview with sample data"]
    F --> G["Activate template version"]
```

System fields:

- Slip number.
- Date.
- Contributor name.
- Shop name.
- Address/area.
- Amount.
- Payment mode.
- Collected by.
- Mandal name.
- Festival name.

Custom fields examples:

- Building name.
- Room number.
- Sponsor category.
- Reference person.
- Receipt notes.

## 4. Member Collects Vargani

```mermaid
flowchart TD
    A["Member logs in on mobile"] --> B["Active vargani form opens"]
    B --> C["Member enters contributor details"]
    C --> D["Member enters amount and payment mode"]
    D --> E["Submit"]
    E --> F["Slip number is generated"]
    F --> G["Receipt render job starts"]
    G --> H["Slip preview/download/share is available"]
    H --> I["Dashboard updates"]
```

Field experience:

1. Member visits a shop or house.
2. Opens Digital Mandal mobile web app.
3. Logs in.
4. Form opens directly for active festival.
5. Enters contributor name, shop name, amount, payment mode, and custom fields.
6. Taps Generate Slip.
7. Slip number is created instantly.
8. Receipt is generated from mandal template.
9. Member can show, download, or share the slip.

## 5. Treasurer Tracks Collection

```mermaid
flowchart TD
    A["Khajindar opens dashboard"] --> B["View total collection"]
    B --> C["Filter by member/group/area/date"]
    C --> D["Check payment mode totals"]
    D --> E["Compare with cash submitted"]
    E --> F["Export report"]
```

Dashboard answers:

- How much has the mandal collected today?
- Which member collected how much?
- Which group is leading?
- Which area is pending?
- How much cash should each member submit?
- How much came by UPI?
- What is the balance after expenses?

## 6. Expense Tracking Flow

```mermaid
flowchart TD
    A["Admin or treasurer adds expense"] --> B["Attach bill if available"]
    B --> C["Select category"]
    C --> D["Submit for approval"]
    D --> E["Approved expense appears in dashboard"]
    E --> F["Balance updates"]
```

Expense categories:

- Decoration.
- Sound.
- Lighting.
- Prasad.
- Permissions.
- Dahi Handi prize.
- Mandap.
- Miscellaneous.

## 7. Correction And Cancellation Flow

```mermaid
flowchart TD
    A["Wrong slip found"] --> B["Admin opens slip"]
    B --> C["Cancel or create correction"]
    C --> D["Reason is required"]
    D --> E["Audit log records action"]
    E --> F["Dashboard excludes cancelled amount"]
```

Rules:

- Members should not silently edit amount after generation.
- Admin or treasurer can cancel with reason.
- Correction creates a new record or correction event.
- Original slip remains auditable.

## 8. No-Login / Assisted Generator Option

Some mandals may want a controlled no-login generator for temporary volunteers or kiosks.

Recommended approach:

- Mandal admin creates a limited generator link.
- Link is scoped to mandal, festival, group, and optional area.
- Link has expiry date and max slip count.
- Link can be disabled instantly.
- Every slip generated from link is marked as `source = limited_link`.

This avoids giving permanent credentials to temporary helpers while still keeping accountability.

## 9. End-To-End MVP Journey

```mermaid
sequenceDiagram
    participant SA as Super Admin
    participant MA as Mandal Admin
    participant M as Member
    participant API as NestJS API
    participant DB as PostgreSQL
    participant W as Render Worker

    SA->>API: Create mandal and admin
    API->>DB: Save mandal/users
    MA->>API: Create festival, members, template
    API->>DB: Save setup
    M->>API: Login
    M->>API: Submit vargani form
    API->>DB: Generate slip number and save slip
    API->>W: Enqueue render job
    W->>DB: Load slip and template version
    W->>DB: Save receipt URLs
    M->>API: View/download slip
    MA->>API: View dashboard
```
