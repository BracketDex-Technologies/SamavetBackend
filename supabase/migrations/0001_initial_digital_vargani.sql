-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Supabase UUID support
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'MANDAL_ADMIN', 'KHAJINDAR', 'GROUP_LEADER', 'MEMBER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FestivalStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'DROPDOWN', 'CHECKBOX', 'LONG_TEXT');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'UPI', 'CHEQUE', 'BANK_TRANSFER', 'OTHER');

-- CreateEnum
CREATE TYPE "SlipStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "RenderStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "mandals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo_url" TEXT,
    "address" TEXT,
    "locality" TEXT,
    "city" TEXT,
    "state" TEXT,
    "contact_name" TEXT,
    "contact_phone" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mandals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mandal_id" UUID,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "festivals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mandal_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "target_amount" DECIMAL(14,2),
    "status" "FestivalStatus" NOT NULL DEFAULT 'DRAFT',
    "active_template_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "festivals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mandal_id" UUID NOT NULL,
    "festival_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "leader_user_id" UUID,
    "area_name" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "member_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mandal_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "festival_id" UUID NOT NULL,
    "group_id" UUID,
    "display_name" TEXT NOT NULL,
    "phone" TEXT,
    "area_name" TEXT,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slip_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mandal_id" UUID NOT NULL,
    "festival_id" UUID,
    "name" TEXT NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "slip_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slip_template_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "background_file_url" TEXT NOT NULL,
    "canvas_width" INTEGER NOT NULL,
    "canvas_height" INTEGER NOT NULL,
    "render_config_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slip_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mandal_id" UUID NOT NULL,
    "festival_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options_json" JSONB,
    "print_on_slip" BOOLEAN NOT NULL DEFAULT true,
    "dashboard_filter" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "custom_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slip_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mandal_id" UUID NOT NULL,
    "festival_id" UUID NOT NULL,
    "current_value" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "slip_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vargani_slips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mandal_id" UUID NOT NULL,
    "festival_id" UUID NOT NULL,
    "template_version_id" UUID,
    "slip_number" TEXT NOT NULL,
    "contributor_name" TEXT NOT NULL,
    "contributor_phone" TEXT,
    "contributor_address" TEXT,
    "shop_name" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "collected_by_user_id" UUID NOT NULL,
    "group_id" UUID,
    "area_name" TEXT,
    "status" "SlipStatus" NOT NULL DEFAULT 'ACTIVE',
    "render_status" "RenderStatus" NOT NULL DEFAULT 'PENDING',
    "custom_data_json" JSONB NOT NULL DEFAULT '{}',
    "receipt_pdf_url" TEXT,
    "receipt_image_url" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" TEXT,

    CONSTRAINT "vargani_slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mandal_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mandal_id" UUID NOT NULL,
    "festival_id" UUID NOT NULL,
    "category_id" UUID,
    "amount" DECIMAL(14,2) NOT NULL,
    "vendor_name" TEXT,
    "expense_date" DATE NOT NULL,
    "notes" TEXT,
    "bill_file_url" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID NOT NULL,
    "approved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "mandal_id" UUID,
    "actor_user_id" UUID,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "metadata_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mandals_slug_key" ON "mandals"("slug");

-- CreateIndex
CREATE INDEX "users_mandal_id_role_idx" ON "users"("mandal_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_expires_at_idx" ON "user_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "festivals_mandal_id_status_idx" ON "festivals"("mandal_id", "status");

-- CreateIndex
CREATE INDEX "member_groups_mandal_id_festival_id_idx" ON "member_groups"("mandal_id", "festival_id");

-- CreateIndex
CREATE INDEX "members_mandal_id_festival_id_group_id_idx" ON "members"("mandal_id", "festival_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "members_mandal_id_festival_id_user_id_key" ON "members"("mandal_id", "festival_id", "user_id");

-- CreateIndex
CREATE INDEX "slip_templates_mandal_id_festival_id_idx" ON "slip_templates"("mandal_id", "festival_id");

-- CreateIndex
CREATE INDEX "slip_template_versions_template_id_is_active_idx" ON "slip_template_versions"("template_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "slip_template_versions_template_id_version_key" ON "slip_template_versions"("template_id", "version");

-- CreateIndex
CREATE INDEX "custom_fields_mandal_id_festival_id_sort_order_idx" ON "custom_fields"("mandal_id", "festival_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "custom_fields_mandal_id_festival_id_key_key" ON "custom_fields"("mandal_id", "festival_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "slip_sequences_festival_id_key" ON "slip_sequences"("festival_id");

-- CreateIndex
CREATE UNIQUE INDEX "slip_sequences_mandal_id_festival_id_key" ON "slip_sequences"("mandal_id", "festival_id");

-- CreateIndex
CREATE UNIQUE INDEX "vargani_slips_idempotency_key_key" ON "vargani_slips"("idempotency_key");

-- CreateIndex
CREATE INDEX "vargani_slips_mandal_id_festival_id_created_at_idx" ON "vargani_slips"("mandal_id", "festival_id", "created_at");

-- CreateIndex
CREATE INDEX "vargani_slips_mandal_id_festival_id_collected_by_user_id_cr_idx" ON "vargani_slips"("mandal_id", "festival_id", "collected_by_user_id", "created_at");

-- CreateIndex
CREATE INDEX "vargani_slips_mandal_id_festival_id_group_id_created_at_idx" ON "vargani_slips"("mandal_id", "festival_id", "group_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vargani_slips_mandal_id_festival_id_slip_number_key" ON "vargani_slips"("mandal_id", "festival_id", "slip_number");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_mandal_id_name_key" ON "expense_categories"("mandal_id", "name");

-- CreateIndex
CREATE INDEX "expenses_mandal_id_festival_id_expense_date_idx" ON "expenses"("mandal_id", "festival_id", "expense_date");

-- CreateIndex
CREATE INDEX "audit_events_mandal_id_entity_type_entity_id_idx" ON "audit_events"("mandal_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "festivals" ADD CONSTRAINT "festivals_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "festivals" ADD CONSTRAINT "festivals_active_template_version_id_fkey" FOREIGN KEY ("active_template_version_id") REFERENCES "slip_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_groups" ADD CONSTRAINT "member_groups_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_groups" ADD CONSTRAINT "member_groups_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_groups" ADD CONSTRAINT "member_groups_leader_user_id_fkey" FOREIGN KEY ("leader_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "member_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slip_templates" ADD CONSTRAINT "slip_templates_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slip_templates" ADD CONSTRAINT "slip_templates_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slip_template_versions" ADD CONSTRAINT "slip_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "slip_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_fields" ADD CONSTRAINT "custom_fields_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slip_sequences" ADD CONSTRAINT "slip_sequences_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vargani_slips" ADD CONSTRAINT "vargani_slips_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vargani_slips" ADD CONSTRAINT "vargani_slips_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vargani_slips" ADD CONSTRAINT "vargani_slips_template_version_id_fkey" FOREIGN KEY ("template_version_id") REFERENCES "slip_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vargani_slips" ADD CONSTRAINT "vargani_slips_collected_by_user_id_fkey" FOREIGN KEY ("collected_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vargani_slips" ADD CONSTRAINT "vargani_slips_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "member_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_festival_id_fkey" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_mandal_id_fkey" FOREIGN KEY ("mandal_id") REFERENCES "mandals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable RLS for Supabase public schema safety. Application access is enforced
-- through the NestJS API and tenant guards; public Data API access remains denied
-- until explicit policies are added.
ALTER TABLE "mandals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "festivals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "member_groups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "slip_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "slip_template_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "slip_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vargani_slips" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expense_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;

