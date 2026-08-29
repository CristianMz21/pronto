CREATE SEQUENCE "public"."receipt_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1000 CACHE 1;--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"client_id" uuid,
	"employee_id" uuid,
	"service_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"price" numeric(10, 2),
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"location_id" uuid,
	"recurring_id" uuid,
	"campaign_id" uuid,
	CONSTRAINT "appointments_source_check" CHECK (source = ANY (ARRAY['manual'::text, 'online'::text, 'telegram'::text, 'viber'::text])),
	CONSTRAINT "appointments_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'scheduled'::text, 'confirmed'::text, 'checked_in'::text, 'in_service'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text, 'paid'::text]))
);
--> statement-breakpoint
ALTER TABLE "appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "barbershop_applications" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_name" text NOT NULL,
	"owner_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"nit" text,
	"city" text,
	"requested_plan" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"license_key" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "barbershop_applications_license_key_key" UNIQUE("license_key"),
	CONSTRAINT "barbershop_applications_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))
);
--> statement-breakpoint
ALTER TABLE "barbershop_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "business_hours" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"location_id" uuid,
	"day_of_week" smallint NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"open_time" text DEFAULT '09:00' NOT NULL,
	"close_time" text DEFAULT '19:00' NOT NULL,
	"break_start" text,
	"break_end" text,
	CONSTRAINT "business_hours_business_id_day_of_week_key" UNIQUE("business_id","day_of_week"),
	CONSTRAINT "business_hours_business_location_day_key" UNIQUE("business_id","location_id","day_of_week"),
	CONSTRAINT "business_hours_day_of_week_check" CHECK ((day_of_week >= 0) AND (day_of_week <= 6))
);
--> statement-breakpoint
ALTER TABLE "business_hours" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "business_integrations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"token_encrypted" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_integrations_business_id_provider_key" UNIQUE("business_id","provider"),
	CONSTRAINT "business_integrations_provider_check" CHECK (provider = ANY (ARRAY['telegram'::text, 'viber'::text, 'whatsapp'::text, 'smtp'::text, 'resend'::text]))
);
--> statement-breakpoint
ALTER TABLE "business_integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "business_settings" (
	"business_id" uuid PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"brand_color" text DEFAULT '#2D2926',
	"notification_language" text DEFAULT 'en',
	"enabled_modules" text[] DEFAULT '{"bookings","pos","crm","inventory","notifications"}' NOT NULL,
	"payment_methods" text[] DEFAULT '{"cash","card","transfer"}' NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"cancel_lead_time" integer DEFAULT 60 NOT NULL,
	"loyalty_earn_rate" integer DEFAULT 1000 NOT NULL,
	"loyalty_redeem_rate" integer DEFAULT 100 NOT NULL,
	"loyalty_redeem_value" integer DEFAULT 10000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "business_settings_cancel_lead_time_check" CHECK (cancel_lead_time >= 0),
	CONSTRAINT "business_settings_notification_language_check" CHECK (notification_language = ANY (ARRAY['en'::text, 'es'::text, 'pt'::text])),
	CONSTRAINT "business_settings_tax_rate_check" CHECK ((tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric))
);
--> statement-breakpoint
ALTER TABLE "business_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" text,
	"phone" text,
	"email" text,
	"address" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"logo_url" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"plan_expires_at" timestamp with time zone,
	"telegram_bot_token" text,
	"viber_bot_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"telegram_chat_id" text,
	"ls_subscription_id" text,
	"ls_customer_id" text,
	"ls_variant_id" text,
	"viber_chat_id" text,
	"owner_whatsapp" text,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"email_provider" text,
	"smtp_host" text,
	"smtp_port" integer DEFAULT 587,
	"smtp_user" text,
	"smtp_pass" text,
	"smtp_from" text,
	"resend_api_key" text,
	"brand_color" text DEFAULT '#2D2926',
	"enabled_modules" text[] DEFAULT '{"bookings","pos","crm","inventory","notifications"}' NOT NULL,
	"notification_language" text DEFAULT 'en',
	"meta_whatsapp_phone_number_id" text,
	"meta_whatsapp_access_token" text,
	"wa_template_confirmation" text,
	"wa_template_reminder" text,
	"wa_template_thankyou" text,
	"wa_template_reactivation" text,
	"wa_template_birthday" text,
	"wa_template_language" text DEFAULT 'en' NOT NULL,
	"min_advance_minutes" integer DEFAULT 30 NOT NULL,
	"booking_lead_time_enabled" boolean DEFAULT true NOT NULL,
	"require_cash_register_for_cash" boolean DEFAULT true NOT NULL,
	"allow_guest_bookings" boolean DEFAULT true NOT NULL,
	"cancel_lead_time" integer DEFAULT 60 NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"payment_methods" text[] DEFAULT '{"cash","card","transfer"}' NOT NULL,
	"loyalty_earn_rate" integer DEFAULT 1000 NOT NULL,
	"loyalty_redeem_rate" integer DEFAULT 100 NOT NULL,
	"loyalty_redeem_value" integer DEFAULT 10000 NOT NULL,
	"license_key" uuid,
	"license_status" text DEFAULT 'pending' NOT NULL,
	"license_expires_at" timestamp with time zone,
	CONSTRAINT "businesses_slug_key" UNIQUE("slug"),
	CONSTRAINT "businesses_min_advance_minutes_check" CHECK (min_advance_minutes >= 0),
	CONSTRAINT "businesses_notification_language_check" CHECK (notification_language = ANY (ARRAY['en'::text, 'es'::text, 'pt'::text])),
	CONSTRAINT "businesses_plan_check" CHECK (plan = ANY (ARRAY['free'::text, 'starter'::text, 'pro'::text, 'agency'::text]))
);
--> statement-breakpoint
ALTER TABLE "businesses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "campaign_recipients" (
	"campaign_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY("campaign_id","client_id"),
	CONSTRAINT "campaign_recipients_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'rebooked'::text, 'failed'::text]))
);
--> statement-breakpoint
ALTER TABLE "campaign_recipients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"segment" text NOT NULL,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"template" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"stats" jsonb DEFAULT '{"sent":0,"rebooked":0,"delivered":0}'::jsonb NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_channel_check" CHECK (channel = ANY (ARRAY['whatsapp'::text, 'email'::text, 'telegram'::text])),
	CONSTRAINT "campaigns_segment_check" CHECK (segment = ANY (ARRAY['inactive_30'::text, 'inactive_42'::text, 'inactive_60'::text, 'birthday_7'::text, 'vip'::text, 'new'::text, 'all'::text])),
	CONSTRAINT "campaigns_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'sending'::text, 'sent'::text, 'cancelled'::text]))
);
--> statement-breakpoint
ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"register_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_movements_amount_check" CHECK (amount > (0)::numeric),
	CONSTRAINT "cash_movements_type_check" CHECK (type = ANY (ARRAY['in'::text, 'out'::text]))
);
--> statement-breakpoint
ALTER TABLE "cash_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cash_registers" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"opened_by" uuid NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"opening_cash" numeric(10, 2) DEFAULT '0' NOT NULL,
	"expected_cash" numeric(10, 2),
	"actual_cash" numeric(10, 2),
	"difference" numeric(10, 2) GENERATED ALWAYS AS ((actual_cash - expected_cash)) STORED,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"location_id" uuid,
	CONSTRAINT "cash_registers_actual_cash_check" CHECK ((actual_cash IS NULL) OR (actual_cash >= (0)::numeric)),
	CONSTRAINT "cash_registers_opening_cash_check" CHECK (opening_cash >= (0)::numeric),
	CONSTRAINT "cash_registers_status_check" CHECK (status = ANY (ARRAY['open'::text, 'closed'::text]))
);
--> statement-breakpoint
ALTER TABLE "cash_registers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_memberships" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"remaining" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_memberships_remaining_check" CHECK (remaining >= 0),
	CONSTRAINT "client_memberships_status_check" CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'cancelled'::text]))
);
--> statement-breakpoint
ALTER TABLE "client_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_tags" (
	"client_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_tags_pkey" PRIMARY KEY("client_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "client_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"notes" text,
	"tags" text[] DEFAULT '{""}' NOT NULL,
	"telegram_id" text,
	"birthday" date,
	"total_visits" integer DEFAULT 0 NOT NULL,
	"total_spent" numeric(10, 2) DEFAULT '0' NOT NULL,
	"last_visit_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"viber_user_id" text,
	"whatsapp_number" text,
	"phone_encrypted" text,
	"email_encrypted" text,
	"whatsapp_encrypted" text,
	"user_id" uuid,
	"location_id" uuid,
	CONSTRAINT "clients_business_phone_unique" UNIQUE("business_id","phone")
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"service_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"rate_snapshot" numeric(5, 2),
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commissions_amount_check" CHECK (amount >= (0)::numeric),
	CONSTRAINT "commissions_type_check" CHECK (type = ANY (ARRAY['percentage'::text, 'fixed'::text, 'per_service'::text, 'per_product'::text]))
);
--> statement-breakpoint
ALTER TABLE "commissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "employee_services" (
	"employee_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_services_pkey" PRIMARY KEY("employee_id","service_id")
);
--> statement-breakpoint
ALTER TABLE "employee_services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "employee_unavailability" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "employee_unavailability_check" CHECK (ends_at > starts_at)
);
--> statement-breakpoint
ALTER TABLE "employee_unavailability" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"role" text DEFAULT 'staff' NOT NULL,
	"phone" text,
	"email" text,
	"avatar_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"color" text,
	"specialties" text[] DEFAULT '{""}' NOT NULL,
	"commission_rate" numeric(5, 2),
	"commission_fixed" numeric(10, 2),
	"bio" text,
	"location_id" uuid,
	CONSTRAINT "employees_color_hex" CHECK ((color IS NULL) OR (color ~ '^#[0-9A-Fa-f]{6}$'::text)),
	CONSTRAINT "employees_commission_rate_range" CHECK ((commission_rate IS NULL) OR ((commission_rate >= (0)::numeric) AND (commission_rate <= (100)::numeric))),
	CONSTRAINT "employees_role_check" CHECK (role = ANY (ARRAY['admin'::text, 'staff'::text, 'barbero'::text]))
);
--> statement-breakpoint
ALTER TABLE "employees" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"location_id" uuid,
	"date" date NOT NULL,
	"reason" text,
	"is_open" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_business_id_location_id_date_key" UNIQUE("business_id","location_id","date")
);
--> statement-breakpoint
ALTER TABLE "holidays" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"category" text,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"quantity" numeric(10, 3) DEFAULT '0' NOT NULL,
	"low_stock_threshold" numeric(10, 3) DEFAULT '5' NOT NULL,
	"cost_price" numeric(10, 2),
	"sell_price" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"barcode" text,
	"description" text,
	"photo_url" text,
	"location_id" uuid
);
--> statement-breakpoint
ALTER TABLE "inventory_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"type" text NOT NULL,
	"quantity" numeric(10, 3) NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"from_location_id" uuid,
	"to_location_id" uuid,
	CONSTRAINT "inventory_movements_type_check" CHECK (type = ANY (ARRAY['in'::text, 'out'::text, 'adjustment'::text, 'transfer'::text]))
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"address" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_business_id_slug_key" UNIQUE("business_id","slug")
);
--> statement-breakpoint
ALTER TABLE "locations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "loyalty_accounts" (
	"client_id" uuid PRIMARY KEY NOT NULL,
	"business_id" uuid NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_accounts_points_check" CHECK (points >= 0)
);
--> statement-breakpoint
ALTER TABLE "loyalty_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "loyalty_movements" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"type" text NOT NULL,
	"points" integer NOT NULL,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_movements_points_check" CHECK (points <> 0),
	CONSTRAINT "loyalty_movements_type_check" CHECK (type = ANY (ARRAY['earn'::text, 'redeem'::text, 'adjust'::text]))
);
--> statement-breakpoint
ALTER TABLE "loyalty_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"duration_days" integer NOT NULL,
	"benefits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_duration_days_check" CHECK (duration_days > 0),
	CONSTRAINT "memberships_price_check" CHECK (price >= 0)
);
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"business_id" uuid NOT NULL,
	"ref_id" text NOT NULL,
	"type" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"promo_code" text,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_business_id_promo_code_key" UNIQUE("business_id","promo_code"),
	CONSTRAINT "promotions_type_check" CHECK (type = ANY (ARRAY['percent'::text, 'fixed'::text, 'combo'::text])),
	CONSTRAINT "promotions_value_check" CHECK (value >= (0)::numeric)
);
--> statement-breakpoint
ALTER TABLE "promotions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "recurring_appointments" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"location_id" uuid,
	"client_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"employee_id" uuid,
	"rrule" text NOT NULL,
	"next_at" timestamp with time zone NOT NULL,
	"until" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recurring_appointments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "schema_migrations" (
	"filename" text PRIMARY KEY NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_categories_business_id_name_key" UNIQUE("business_id","name")
);
--> statement-breakpoint
ALTER TABLE "service_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "service_combos" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"service_ids" uuid[] NOT NULL,
	"price" integer NOT NULL,
	"duration_min" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_combos_price_check" CHECK (price >= 0),
	CONSTRAINT "service_combos_duration_check" CHECK (duration_min > 0)
);
--> statement-breakpoint
ALTER TABLE "service_combos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"duration_min" integer DEFAULT 60 NOT NULL,
	"category" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"capacity" integer DEFAULT 1 NOT NULL,
	"cost" numeric(10, 2),
	"color" text,
	"is_featured" boolean DEFAULT false NOT NULL,
	"location_id" uuid,
	"category_id" uuid,
	CONSTRAINT "capacity_positive" CHECK (capacity >= 1)
);
--> statement-breakpoint
ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tips" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tips_amount_check" CHECK (amount > 0),
	CONSTRAINT "tips_method_check" CHECK (method = ANY (ARRAY['cash'::text, 'card'::text, 'transfer'::text, 'digital'::text]))
);
--> statement-breakpoint
ALTER TABLE "tips" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transaction_items" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"service_id" uuid,
	"name_snapshot" text NOT NULL,
	"price_snapshot" numeric(10, 2) NOT NULL,
	"qty" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_items_qty_check" CHECK (qty > 0)
);
--> statement-breakpoint
ALTER TABLE "transaction_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"location_id" uuid,
	"appointment_id" uuid,
	"client_id" uuid,
	"employee_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"receipt_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tip_amount" integer DEFAULT 0 NOT NULL,
	"discount_amount" integer DEFAULT 0 NOT NULL,
	"discount_reason" text,
	"promo_code" text,
	"membership_id" uuid,
	"loyalty_points_earned" integer DEFAULT 0 NOT NULL,
	"loyalty_points_redeemed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "transactions_receipt_number_key" UNIQUE("receipt_number"),
	CONSTRAINT "transactions_payment_method_check" CHECK (payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'transfer'::text, 'online'::text])),
	CONSTRAINT "transactions_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'completed'::text, 'refunded'::text])),
	CONSTRAINT "transactions_tip_amount_check" CHECK (tip_amount >= 0)
);
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"business_id" uuid NOT NULL,
	"location_id" uuid,
	"service_id" uuid NOT NULL,
	"employee_id" uuid,
	"client_id" uuid NOT NULL,
	"desired_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_business_id_client_id_desired_at_key" UNIQUE("business_id","client_id","desired_at"),
	CONSTRAINT "waitlist_status_check" CHECK (status = ANY (ARRAY['waiting'::text, 'notified'::text, 'converted'::text, 'expired'::text, 'cancelled'::text]))
);
--> statement-breakpoint
ALTER TABLE "waitlist" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_recurring_id_fkey" FOREIGN KEY ("recurring_id") REFERENCES "public"."recurring_appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hours" ADD CONSTRAINT "business_hours_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_integrations" ADD CONSTRAINT "business_integrations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_settings" ADD CONSTRAINT "business_settings_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_register_id_fkey" FOREIGN KEY ("register_id") REFERENCES "public"."cash_registers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_memberships" ADD CONSTRAINT "client_memberships_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_tags" ADD CONSTRAINT "client_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_services" ADD CONSTRAINT "employee_services_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_services" ADD CONSTRAINT "employee_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_unavailability" ADD CONSTRAINT "employee_unavailability_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_unavailability" ADD CONSTRAINT "employee_unavailability_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_unavailability" ADD CONSTRAINT "employee_unavailability_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_from_location_id_fkey" FOREIGN KEY ("from_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_to_location_id_fkey" FOREIGN KEY ("to_location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_movements" ADD CONSTRAINT "loyalty_movements_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_movements" ADD CONSTRAINT "loyalty_movements_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_appointments" ADD CONSTRAINT "recurring_appointments_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_appointments" ADD CONSTRAINT "recurring_appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_appointments" ADD CONSTRAINT "recurring_appointments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_appointments" ADD CONSTRAINT "recurring_appointments_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_appointments" ADD CONSTRAINT "recurring_appointments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_combos" ADD CONSTRAINT "service_combos_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_combos" ADD CONSTRAINT "service_combos_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "public"."client_memberships"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_appointments_business" ON "appointments" USING btree ("business_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_appointments_business_status_starts" ON "appointments" USING btree ("business_id" text_ops,"status" timestamptz_ops,"starts_at" text_ops);--> statement-breakpoint
CREATE INDEX "idx_appointments_location" ON "appointments" USING btree ("location_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_appointments_starts_at" ON "appointments" USING btree ("business_id" uuid_ops,"starts_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_appointments_status" ON "appointments" USING btree ("business_id" text_ops,"status" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_business_hours_business" ON "business_hours" USING btree ("business_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_business_hours_location" ON "business_hours" USING btree ("business_id" uuid_ops,"location_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_businesses_owner" ON "businesses" USING btree ("owner_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_businesses_slug" ON "businesses" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE INDEX "idx_campaigns_business" ON "campaigns" USING btree ("business_id" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cash_movements_business" ON "cash_movements" USING btree ("business_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_cash_movements_register" ON "cash_movements" USING btree ("register_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_cash_registers_business_status" ON "cash_registers" USING btree ("business_id" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_cash_registers_location" ON "cash_registers" USING btree ("business_id" uuid_ops,"location_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_cash_registers_opened_at" ON "cash_registers" USING btree ("business_id" uuid_ops,"opened_at" timestamptz_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "unique_open_register_per_business" ON "cash_registers" USING btree ("business_id" uuid_ops) WHERE (status = 'open'::text);--> statement-breakpoint
CREATE INDEX "idx_client_memberships_client" ON "client_memberships" USING btree ("client_id" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_client_tags_tag" ON "client_tags" USING btree ("tag_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_clients_business" ON "clients" USING btree ("business_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_clients_last_visit" ON "clients" USING btree ("business_id" timestamptz_ops,"last_visit_at" timestamptz_ops) WHERE (last_visit_at IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_clients_phone" ON "clients" USING btree ("business_id" text_ops,"phone" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_clients_user_id" ON "clients" USING btree ("user_id" uuid_ops) WHERE (user_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "unique_client_email_per_business" ON "clients" USING btree ("business_id" text_ops,"email" text_ops) WHERE (email IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "unique_client_user_per_business" ON "clients" USING btree ("business_id" uuid_ops,"user_id" uuid_ops) WHERE (user_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_clients_location" ON "clients" USING btree ("business_id" uuid_ops,"location_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_commissions_business" ON "commissions" USING btree ("business_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_commissions_created_at" ON "commissions" USING btree ("business_id" timestamptz_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_commissions_employee" ON "commissions" USING btree ("employee_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_commissions_transaction" ON "commissions" USING btree ("transaction_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_employee_services_employee" ON "employee_services" USING btree ("employee_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_employee_services_service" ON "employee_services" USING btree ("service_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_emp_unavail_business" ON "employee_unavailability" USING btree ("business_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_emp_unavail_employee" ON "employee_unavailability" USING btree ("employee_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_emp_unavail_range" ON "employee_unavailability" USING btree ("employee_id" timestamptz_ops,"starts_at" timestamptz_ops,"ends_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_employees_business" ON "employees" USING btree ("business_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_employees_business_active" ON "employees" USING btree ("business_id" bool_ops,"is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_employees_location" ON "employees" USING btree ("location_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_holidays_business_date" ON "holidays" USING btree ("business_id" date_ops,"date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_holidays_location" ON "holidays" USING btree ("location_id" uuid_ops) WHERE (location_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_inventory_items_business" ON "inventory_items" USING btree ("business_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_inventory_items_location" ON "inventory_items" USING btree ("business_id" uuid_ops,"location_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_business_barcode_idx" ON "inventory_items" USING btree ("business_id" text_ops,"barcode" text_ops) WHERE (barcode IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "unique_sku_per_business" ON "inventory_items" USING btree ("business_id" text_ops,"sku" uuid_ops) WHERE ((sku IS NOT NULL) AND (sku <> ''::text));--> statement-breakpoint
CREATE INDEX "idx_locations_business" ON "locations" USING btree ("business_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_locations_slug" ON "locations" USING btree ("business_id" uuid_ops,"slug" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_loyalty_movements_client" ON "loyalty_movements" USING btree ("client_id" timestamptz_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_memberships_business" ON "memberships" USING btree ("business_id" uuid_ops) WHERE is_active;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_log_unique" ON "notification_log" USING btree ("ref_id" text_ops,"type" text_ops,"channel" text_ops);--> statement-breakpoint
CREATE INDEX "idx_promotions_business_active" ON "promotions" USING btree ("business_id" uuid_ops) WHERE is_active;--> statement-breakpoint
CREATE INDEX "idx_recurring_business" ON "recurring_appointments" USING btree ("business_id" timestamptz_ops,"next_at" timestamptz_ops) WHERE is_active;--> statement-breakpoint
CREATE INDEX "idx_service_categories_business" ON "service_categories" USING btree ("business_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_service_combos_business" ON "service_combos" USING btree ("business_id" uuid_ops) WHERE is_active;--> statement-breakpoint
CREATE INDEX "idx_service_combos_location" ON "service_combos" USING btree ("location_id" uuid_ops) WHERE (location_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "idx_services_business" ON "services" USING btree ("business_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_services_business_active" ON "services" USING btree ("business_id" bool_ops,"is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_services_category_id" ON "services" USING btree ("category_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_tips_employee" ON "tips" USING btree ("employee_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_tips_transaction" ON "tips" USING btree ("transaction_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_transaction_items_service" ON "transaction_items" USING btree ("service_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_transaction_items_transaction" ON "transaction_items" USING btree ("transaction_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_transactions_business" ON "transactions" USING btree ("business_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_transactions_business_status_created" ON "transactions" USING btree ("business_id" text_ops,"status" text_ops,"created_at" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_transactions_client_status" ON "transactions" USING btree ("client_id" uuid_ops,"status" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_waitlist_desired" ON "waitlist" USING btree ("business_id" timestamptz_ops,"location_id" uuid_ops,"desired_at" uuid_ops) WHERE (status = 'waiting'::text);--> statement-breakpoint
CREATE VIEW "public"."businesses_public" AS (SELECT id, name, slug, type, phone, address, timezone, currency, brand_color, enabled_modules, notification_language FROM businesses);--> statement-breakpoint
CREATE VIEW "public"."clients_secure" WITH (security_invoker = true) AS (SELECT id, business_id, name, phone, email, notes, tags, telegram_id, birthday, total_visits, total_spent, last_visit_at, created_at, viber_user_id, whatsapp_number, phone_encrypted, email_encrypted, whatsapp_encrypted, decrypt_pii(phone_encrypted) AS phone_secure, decrypt_pii(email_encrypted) AS email_secure, decrypt_pii(whatsapp_encrypted) AS whatsapp_secure FROM clients);--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."client_stats" AS (SELECT c.id AS client_id, c.business_id, count(t.id)::integer AS total_visits, COALESCE(sum(t.amount), 0::numeric)::numeric(10,2) AS total_spent, max(t.created_at) AS last_visit_at FROM clients c LEFT JOIN transactions t ON t.client_id = c.id AND t.status = 'completed'::text GROUP BY c.id, c.business_id);--> statement-breakpoint
CREATE POLICY "tenant_access_appointments" ON "appointments" AS PERMISSIVE FOR ALL TO public USING (((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND ((current_user_role() IS NULL) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])) OR (employee_id = current_employee_id()))));--> statement-breakpoint
CREATE POLICY "client_self_update_appointments" ON "appointments" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "client_self_select_appointments" ON "appointments" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "super_admin_all_applications" ON "barbershop_applications" AS PERMISSIVE FOR ALL TO public USING ((EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' = 'super_admin') OR auth.email() IN (SELECT unnest(string_to_array(current_setting('app.super_admins', true), ',')))));--> statement-breakpoint
CREATE POLICY "public_read_business_hours" ON "business_hours" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "tenant_access_business_hours" ON "business_hours" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "tenant_access_business_integrations" ON "business_integrations" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "tenant_access_business_settings" ON "business_settings" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "client_can_read_own_business" ON "businesses" AS PERMISSIVE FOR SELECT TO public USING ((id IN ( SELECT clients.business_id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));--> statement-breakpoint
CREATE POLICY "owner_access_businesses" ON "businesses" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "tenant_access_campaign_recipients" ON "campaign_recipients" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM campaigns
  WHERE ((campaigns.id = campaign_recipients.campaign_id) AND (campaigns.business_id IN ( SELECT my_business_ids() AS my_business_ids))))));--> statement-breakpoint
CREATE POLICY "tenant_access_campaigns" ON "campaigns" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "tenant_access_cash_movements" ON "cash_movements" AS PERMISSIVE FOR ALL TO public USING (((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text]))));--> statement-breakpoint
CREATE POLICY "tenant_access_cash_registers" ON "cash_registers" AS PERMISSIVE FOR ALL TO public USING (((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text]))));--> statement-breakpoint
CREATE POLICY "tenant_access_client_memberships" ON "client_memberships" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "tenant_access_client_tags" ON "client_tags" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = client_tags.client_id) AND (clients.business_id IN ( SELECT my_business_ids() AS my_business_ids))))));--> statement-breakpoint
CREATE POLICY "client_self_update" ON "clients" AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "client_self_select" ON "clients" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "tenant_access_clients" ON "clients" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "tenant_access_commissions" ON "commissions" AS PERMISSIVE FOR ALL TO public USING (((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND ((current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])) OR (employee_id = current_employee_id()))));--> statement-breakpoint
CREATE POLICY "tenant_access_employee_services" ON "employee_services" AS PERMISSIVE FOR ALL TO public USING (((EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = employee_services.employee_id) AND (e.business_id IN ( SELECT my_business_ids() AS my_business_ids))))) AND ((current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])) OR (employee_id = current_employee_id()))));--> statement-breakpoint
CREATE POLICY "tenant_access_employee_unavailability" ON "employee_unavailability" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "client_can_read_employees" ON "employees" AS PERMISSIVE FOR SELECT TO public USING ((business_id IN ( SELECT clients.business_id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));--> statement-breakpoint
CREATE POLICY "public_read_employees_for_booking" ON "employees" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "tenant_access_employees" ON "employees" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "tenant_access_holidays" ON "holidays" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "tenant_access_inventory_items" ON "inventory_items" AS PERMISSIVE FOR ALL TO public USING (((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text]))));--> statement-breakpoint
CREATE POLICY "tenant_access_inventory_movements" ON "inventory_movements" AS PERMISSIVE FOR ALL TO public USING (((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text]))));--> statement-breakpoint
CREATE POLICY "tenant_access_locations" ON "locations" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "tenant_access_loyalty_accounts" ON "loyalty_accounts" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "tenant_access_loyalty_movements" ON "loyalty_movements" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "tenant_access_memberships" ON "memberships" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "business_isolation" ON "notification_log" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "tenant_access_promotions" ON "promotions" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "tenant_access_recurring" ON "recurring_appointments" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "tenant_access_service_categories" ON "service_categories" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "tenant_access_service_combos" ON "service_combos" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "client_can_read_services" ON "services" AS PERMISSIVE FOR SELECT TO public USING ((business_id IN ( SELECT clients.business_id
   FROM clients
  WHERE (clients.user_id = auth.uid()))));--> statement-breakpoint
CREATE POLICY "public_read_services_for_booking" ON "services" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "tenant_access_services" ON "services" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "tenant_access_tips" ON "tips" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));--> statement-breakpoint
CREATE POLICY "tenant_access_transaction_items" ON "transaction_items" AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM transactions
  WHERE ((transactions.id = transaction_items.transaction_id) AND (transactions.business_id IN ( SELECT my_business_ids() AS my_business_ids))))));--> statement-breakpoint
CREATE POLICY "tenant_access_transactions" ON "transactions" AS PERMISSIVE FOR ALL TO public USING (((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND ((current_user_role() IS NULL) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])) OR (employee_id = current_employee_id()))));--> statement-breakpoint
CREATE POLICY "client_self_select_transactions" ON "transactions" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "tenant_access_waitlist" ON "waitlist" AS PERMISSIVE FOR ALL TO public USING ((business_id IN ( SELECT my_business_ids() AS my_business_ids)));