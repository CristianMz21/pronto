import { sql } from "drizzle-orm"
import { pgTable, index, foreignKey, pgPolicy, check, uuid, timestamp, text, unique, boolean, integer, jsonb, numeric, uniqueIndex, date, smallint, primaryKey, pgView, pgMaterializedView, pgSequence } from "drizzle-orm/pg-core"


export const receiptSeq = pgSequence("receipt_seq", {  startWith: "1000", increment: "1", minValue: "1", maxValue: "9223372036854775807", cache: "1", cycle: false })

export const users = pgTable("users", {
	id: uuid().primaryKey().notNull(),
}, (_table) => [])

export const employeeUnavailability = pgTable("employee_unavailability", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	employeeId: uuid("employee_id").notNull(),
	startsAt: timestamp("starts_at", { withTimezone: true, mode: 'string' }).notNull(),
	endsAt: timestamp("ends_at", { withTimezone: true, mode: 'string' }).notNull(),
	reason: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid("created_by"),
}, (table) => [
	index("idx_emp_unavail_business").using("btree", table.businessId.asc().nullsLast()),
	index("idx_emp_unavail_employee").using("btree", table.employeeId.asc().nullsLast()),
	index("idx_emp_unavail_range").using("btree", table.employeeId.asc().nullsLast(), table.startsAt.asc().nullsLast(), table.endsAt.asc().nullsLast()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "employee_unavailability_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "employee_unavailability_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_unavailability_employee_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant_access_employee_unavailability", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
	check("employee_unavailability_check", sql`ends_at > starts_at`),
]);

export const locations = pgTable("locations", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	address: text(),
	phone: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_locations_business").using("btree", table.businessId.asc().nullsLast()),
	index("idx_locations_slug").using("btree", table.businessId.asc().nullsLast(), table.slug.asc().nullsLast()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "locations_business_id_fkey"
		}).onDelete("cascade"),
	unique("locations_business_id_slug_key").on(table.businessId, table.slug),
	pgPolicy("tenant_access_locations", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
]);

export const businesses = pgTable("businesses", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	ownerId: uuid("owner_id").notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	type: text(),
	phone: text(),
	email: text(),
	address: text(),
	timezone: text().default('UTC').notNull(),
	currency: text().default('USD').notNull(),
	logoUrl: text("logo_url"),
	plan: text().default('free').notNull(),
	planExpiresAt: timestamp("plan_expires_at", { withTimezone: true, mode: 'string' }),
	telegramBotToken: text("telegram_bot_token"),
	viberBotToken: text("viber_bot_token"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	telegramChatId: text("telegram_chat_id"),
	lsSubscriptionId: text("ls_subscription_id"),
	lsCustomerId: text("ls_customer_id"),
	lsVariantId: text("ls_variant_id"),
	viberChatId: text("viber_chat_id"),
	ownerWhatsapp: text("owner_whatsapp"),
	onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
	emailProvider: text("email_provider"),
	smtpHost: text("smtp_host"),
	smtpPort: integer("smtp_port").default(587),
	smtpUser: text("smtp_user"),
	smtpPass: text("smtp_pass"),
	smtpFrom: text("smtp_from"),
	resendApiKey: text("resend_api_key"),
	brandColor: text("brand_color").default('#2D2926'),
	enabledModules: text("enabled_modules").array().default(["bookings","pos","crm","inventory","notifications"]).notNull(),
	notificationLanguage: text("notification_language").default('en'),
	metaWhatsappPhoneNumberId: text("meta_whatsapp_phone_number_id"),
	metaWhatsappAccessToken: text("meta_whatsapp_access_token"),
	waTemplateConfirmation: text("wa_template_confirmation"),
	waTemplateReminder: text("wa_template_reminder"),
	waTemplateThankyou: text("wa_template_thankyou"),
	waTemplateReactivation: text("wa_template_reactivation"),
	waTemplateBirthday: text("wa_template_birthday"),
	waTemplateLanguage: text("wa_template_language").default('en').notNull(),
	minAdvanceMinutes: integer("min_advance_minutes").default(30).notNull(),
	bookingLeadTimeEnabled: boolean("booking_lead_time_enabled").default(true).notNull(),
	requireCashRegisterForCash: boolean("require_cash_register_for_cash").default(true).notNull(),
	allowGuestBookings: boolean("allow_guest_bookings").default(true).notNull(),
	cancelLeadTime: integer("cancel_lead_time").default(60).notNull(),
	taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).default('0').notNull(),
	paymentMethods: text("payment_methods").array().default(["cash","card","transfer"]).notNull(),
	loyaltyEarnRate: integer("loyalty_earn_rate").default(1000).notNull(),
	loyaltyRedeemRate: integer("loyalty_redeem_rate").default(100).notNull(),
	loyaltyRedeemValue: integer("loyalty_redeem_value").default(10000).notNull(),
	licenseKey: uuid("license_key"),
	licenseStatus: text("license_status").default('pending').notNull(),
	licenseExpiresAt: timestamp("license_expires_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_businesses_owner").using("btree", table.ownerId.asc().nullsLast()),
	index("idx_businesses_slug").using("btree", table.slug.asc().nullsLast()),
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [users.id],
			name: "businesses_owner_id_fkey"
		}).onDelete("cascade"),
	unique("businesses_slug_key").on(table.slug),
	pgPolicy("client_can_read_own_business", { as: "permissive", for: "select", to: ["public"], using: sql`(id IN ( SELECT clients.business_id
   FROM clients
  WHERE (clients.user_id = auth.uid())))` }),
	pgPolicy("owner_access_businesses", { as: "permissive", for: "all", to: ["public"] }),
	check("businesses_min_advance_minutes_check", sql`min_advance_minutes >= 0`),
	check("businesses_notification_language_check", sql`notification_language = ANY (ARRAY['en'::text, 'es'::text, 'pt'::text])`),
	check("businesses_plan_check", sql`plan = ANY (ARRAY['free'::text, 'starter'::text, 'pro'::text, 'agency'::text])`),
]);

export const campaigns = pgTable("campaigns", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	locationId: uuid("location_id"),
	name: text().notNull(),
	segment: text().notNull(),
	channel: text().default('whatsapp').notNull(),
	template: text().notNull(),
	status: text().default('draft').notNull(),
	stats: jsonb().default({"sent":0,"rebooked":0,"delivered":0}).notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_campaigns_business").using("btree", table.businessId.asc().nullsLast(), table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "campaigns_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "campaigns_location_id_fkey"
		}).onDelete("set null"),
	pgPolicy("tenant_access_campaigns", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
	check("campaigns_channel_check", sql`channel = ANY (ARRAY['whatsapp'::text, 'email'::text, 'telegram'::text])`),
	check("campaigns_segment_check", sql`segment = ANY (ARRAY['inactive_30'::text, 'inactive_42'::text, 'inactive_60'::text, 'birthday_7'::text, 'vip'::text, 'new'::text, 'all'::text])`),
	check("campaigns_status_check", sql`status = ANY (ARRAY['draft'::text, 'sending'::text, 'sent'::text, 'cancelled'::text])`),
]);

export const businessSettings = pgTable("business_settings", {
	businessId: uuid("business_id").primaryKey().notNull(),
	timezone: text().default('UTC').notNull(),
	currency: text().default('USD').notNull(),
	brandColor: text("brand_color").default('#2D2926'),
	notificationLanguage: text("notification_language").default('en'),
	enabledModules: text("enabled_modules").array().default(["bookings","pos","crm","inventory","notifications"]).notNull(),
	paymentMethods: text("payment_methods").array().default(["cash","card","transfer"]).notNull(),
	taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).default('0').notNull(),
	cancelLeadTime: integer("cancel_lead_time").default(60).notNull(),
	loyaltyEarnRate: integer("loyalty_earn_rate").default(1000).notNull(),
	loyaltyRedeemRate: integer("loyalty_redeem_rate").default(100).notNull(),
	loyaltyRedeemValue: integer("loyalty_redeem_value").default(10000).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "business_settings_business_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant_access_business_settings", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
	check("business_settings_cancel_lead_time_check", sql`cancel_lead_time >= 0`),
	check("business_settings_notification_language_check", sql`notification_language = ANY (ARRAY['en'::text, 'es'::text, 'pt'::text])`),
	check("business_settings_tax_rate_check", sql`(tax_rate >= (0)::numeric) AND (tax_rate <= (100)::numeric)`),
]);

export const businessIntegrations = pgTable("business_integrations", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	provider: text().notNull(),
	tokenEncrypted: text("token_encrypted"),
	config: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "business_integrations_business_id_fkey"
		}).onDelete("cascade"),
	unique("business_integrations_business_id_provider_key").on(table.businessId, table.provider),
	pgPolicy("tenant_access_business_integrations", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
	check("business_integrations_provider_check", sql`provider = ANY (ARRAY['telegram'::text, 'viber'::text, 'whatsapp'::text, 'smtp'::text, 'resend'::text])`),
]);

export const clients = pgTable("clients", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	name: text().notNull(),
	phone: text(),
	email: text(),
	notes: text(),
	tags: text().array().default([""]).notNull(),
	telegramId: text("telegram_id"),
	birthday: date(),
	totalVisits: integer("total_visits").default(0).notNull(),
	totalSpent: numeric("total_spent", { precision: 10, scale:  2 }).default('0').notNull(),
	lastVisitAt: timestamp("last_visit_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	viberUserId: text("viber_user_id"),
	whatsappNumber: text("whatsapp_number"),
	// TODO: failed to parse database type 'bytea'
	phoneEncrypted: text("phone_encrypted"),
	// TODO: failed to parse database type 'bytea'
	emailEncrypted: text("email_encrypted"),
	// TODO: failed to parse database type 'bytea'
	whatsappEncrypted: text("whatsapp_encrypted"),
	userId: uuid("user_id"),
	locationId: uuid("location_id"),
}, (table) => [
	index("idx_clients_business").using("btree", table.businessId.asc().nullsLast()),
	index("idx_clients_last_visit").using("btree", table.businessId.asc().nullsLast(), table.lastVisitAt.asc().nullsLast()).where(sql`(last_visit_at IS NOT NULL)`),
	index("idx_clients_phone").using("btree", table.businessId.asc().nullsLast(), table.phone.asc().nullsLast()),
	index("idx_clients_user_id").using("btree", table.userId.asc().nullsLast()).where(sql`(user_id IS NOT NULL)`),
	uniqueIndex("unique_client_email_per_business").using("btree", table.businessId.asc().nullsLast(), table.email.asc().nullsLast()).where(sql`(email IS NOT NULL)`),
	uniqueIndex("unique_client_user_per_business").using("btree", table.businessId.asc().nullsLast(), table.userId.asc().nullsLast()).where(sql`(user_id IS NOT NULL)`),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "clients_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "clients_user_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "clients_location_id_fkey"
		}).onDelete("set null"),
	index("idx_clients_location").using("btree", table.businessId.asc().nullsLast(), table.locationId.asc().nullsLast()),
	unique("clients_business_phone_unique").on(table.businessId, table.phone),
	pgPolicy("client_self_update", { as: "permissive", for: "update", to: ["public"], using: sql`(user_id = auth.uid())`, withCheck: sql`(user_id = auth.uid())`  }),
	pgPolicy("client_self_select", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("tenant_access_clients", { as: "permissive", for: "all", to: ["public"] }),
]);

export const cashRegisters = pgTable("cash_registers", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	openedBy: uuid("opened_by").notNull(),
	openedAt: timestamp("opened_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	closedAt: timestamp("closed_at", { withTimezone: true, mode: 'string' }),
	openingCash: numeric("opening_cash", { precision: 10, scale:  2 }).default('0').notNull(),
	expectedCash: numeric("expected_cash", { precision: 10, scale:  2 }),
	actualCash: numeric("actual_cash", { precision: 10, scale:  2 }),
	difference: numeric({ precision: 10, scale:  2 }).generatedAlwaysAs(sql`(actual_cash - expected_cash)`),
	status: text().default('open').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	locationId: uuid("location_id"),
}, (table) => [
	index("idx_cash_registers_business_status").using("btree", table.businessId.asc().nullsLast(), table.status.asc().nullsLast()),
	index("idx_cash_registers_location").using("btree", table.businessId.asc().nullsLast(), table.locationId.asc().nullsLast()),
	index("idx_cash_registers_opened_at").using("btree", table.businessId.asc().nullsLast(), table.openedAt.desc().nullsFirst()),
	uniqueIndex("unique_open_register_per_business").using("btree", table.businessId.asc().nullsLast()).where(sql`(status = 'open'::text)`),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "cash_registers_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "cash_registers_location_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.openedBy],
			foreignColumns: [users.id],
			name: "cash_registers_opened_by_fkey"
		}),
	pgPolicy("tenant_access_cash_registers", { as: "permissive", for: "all", to: ["public"], using: sql`((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])))` }),
	check("cash_registers_actual_cash_check", sql`(actual_cash IS NULL) OR (actual_cash >= (0)::numeric)`),
	check("cash_registers_opening_cash_check", sql`opening_cash >= (0)::numeric`),
	check("cash_registers_status_check", sql`status = ANY (ARRAY['open'::text, 'closed'::text])`),
]);

export const inventoryMovements = pgTable("inventory_movements", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	itemId: uuid("item_id").notNull(),
	type: text().notNull(),
	quantity: numeric({ precision: 10, scale:  3 }).notNull(),
	note: text(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	fromLocationId: uuid("from_location_id"),
	toLocationId: uuid("to_location_id"),
}, (table) => [
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "inventory_movements_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "inventory_movements_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.fromLocationId],
			foreignColumns: [locations.id],
			name: "inventory_movements_from_location_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.itemId],
			foreignColumns: [inventoryItems.id],
			name: "inventory_movements_item_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.toLocationId],
			foreignColumns: [locations.id],
			name: "inventory_movements_to_location_id_fkey"
		}).onDelete("set null"),
	pgPolicy("tenant_access_inventory_movements", { as: "permissive", for: "all", to: ["public"], using: sql`((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])))` }),
	check("inventory_movements_type_check", sql`type = ANY (ARRAY['in'::text, 'out'::text, 'adjustment'::text, 'transfer'::text])`),
]);

export const schemaMigrations = pgTable("schema_migrations", {
	filename: text().primaryKey().notNull(),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const holidays = pgTable("holidays", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	locationId: uuid("location_id"),
	date: date().notNull(),
	reason: text(),
	isOpen: boolean("is_open").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_holidays_business_date").using("btree", table.businessId.asc().nullsLast(), table.date.asc().nullsLast()),
	index("idx_holidays_location").using("btree", table.locationId.asc().nullsLast()).where(sql`(location_id IS NOT NULL)`),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "holidays_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "holidays_location_id_fkey"
		}).onDelete("set null"),
	unique("holidays_business_id_location_id_date_key").on(table.businessId, table.locationId, table.date),
	pgPolicy("tenant_access_holidays", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
]);

export const employees = pgTable("employees", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	userId: uuid("user_id"),
	name: text().notNull(),
	role: text().default('staff').notNull(),
	phone: text(),
	email: text(),
	avatarUrl: text("avatar_url"),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	color: text(),
	specialties: text().array().default([""]).notNull(),
	commissionRate: numeric("commission_rate", { precision: 5, scale:  2 }),
	commissionFixed: numeric("commission_fixed", { precision: 10, scale:  2 }),
	bio: text(),
	locationId: uuid("location_id"),
}, (table) => [
	index("idx_employees_business").using("btree", table.businessId.asc().nullsLast()),
	index("idx_employees_business_active").using("btree", table.businessId.asc().nullsLast(), table.isActive.asc().nullsLast()),
	index("idx_employees_location").using("btree", table.locationId.asc().nullsLast()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "employees_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "employees_location_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "employees_user_id_fkey"
		}).onDelete("set null"),
	pgPolicy("client_can_read_employees", { as: "permissive", for: "select", to: ["public"], using: sql`(business_id IN ( SELECT clients.business_id
   FROM clients
  WHERE (clients.user_id = auth.uid())))` }),
	pgPolicy("public_read_employees_for_booking", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("tenant_access_employees", { as: "permissive", for: "all", to: ["public"] }),
	check("employees_color_hex", sql`(color IS NULL) OR (color ~ '^#[0-9A-Fa-f]{6}$'::text)`),
	check("employees_commission_rate_range", sql`(commission_rate IS NULL) OR ((commission_rate >= (0)::numeric) AND (commission_rate <= (100)::numeric))`),
	check("employees_role_check", sql`role = ANY (ARRAY['admin'::text, 'staff'::text, 'barbero'::text])`),
]);

export const services = pgTable("services", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	name: text().notNull(),
	description: text(),
	price: numeric({ precision: 10, scale:  2 }).default('0').notNull(),
	durationMin: integer("duration_min").default(60).notNull(),
	category: text(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	capacity: integer().default(1).notNull(),
	cost: numeric({ precision: 10, scale:  2 }),
	color: text(),
	isFeatured: boolean("is_featured").default(false).notNull(),
	locationId: uuid("location_id"),
	categoryId: uuid("category_id"),
}, (table) => [
	index("idx_services_business").using("btree", table.businessId.asc().nullsLast()),
	index("idx_services_business_active").using("btree", table.businessId.asc().nullsLast(), table.isActive.asc().nullsLast()),
	index("idx_services_category_id").using("btree", table.categoryId.asc().nullsLast()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "services_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.categoryId],
			foreignColumns: [serviceCategories.id],
			name: "services_category_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "services_location_id_fkey"
		}).onDelete("set null"),
	pgPolicy("client_can_read_services", { as: "permissive", for: "select", to: ["public"], using: sql`(business_id IN ( SELECT clients.business_id
   FROM clients
  WHERE (clients.user_id = auth.uid())))` }),
	pgPolicy("public_read_services_for_booking", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("tenant_access_services", { as: "permissive", for: "all", to: ["public"] }),
	check("capacity_positive", sql`capacity >= 1`),
]);

export const transactions = pgTable("transactions", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	locationId: uuid("location_id"),
	appointmentId: uuid("appointment_id"),
	clientId: uuid("client_id"),
	employeeId: uuid("employee_id"),
	amount: numeric({ precision: 10, scale: 2 }).notNull(),
	paymentMethod: text("payment_method").default('cash').notNull(),
	status: text().default('completed').notNull(),
	items: jsonb().default([]).notNull(),
	receiptNumber: text("receipt_number"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	tipAmount: integer("tip_amount").default(0).notNull(),
	discountAmount: integer("discount_amount").default(0).notNull(),
	discountReason: text("discount_reason"),
	promoCode: text("promo_code"),
	membershipId: uuid("membership_id"),
	loyaltyPointsEarned: integer("loyalty_points_earned").default(0).notNull(),
	loyaltyPointsRedeemed: integer("loyalty_points_redeemed").default(0).notNull(),
}, (table) => [
	index("idx_transactions_business").using("btree", table.businessId.asc().nullsLast()),
	index("idx_transactions_business_status_created").using("btree", table.businessId.asc().nullsLast(), table.status.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	index("idx_transactions_client_status").using("btree", table.clientId.asc().nullsLast(), table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.appointmentId],
			foreignColumns: [appointments.id],
			name: "transactions_appointment_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "transactions_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "transactions_client_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "transactions_employee_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "transactions_location_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.membershipId],
			foreignColumns: [clientMemberships.id],
			name: "transactions_membership_id_fkey"
		}).onDelete("set null"),
	unique("transactions_receipt_number_key").on(table.receiptNumber),
	pgPolicy("tenant_access_transactions", { as: "permissive", for: "all", to: ["public"], using: sql`((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND ((current_user_role() IS NULL) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])) OR (employee_id = current_employee_id())))` }),
	pgPolicy("client_self_select_transactions", { as: "permissive", for: "select", to: ["public"] }),
	check("transactions_payment_method_check", sql`payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'transfer'::text, 'online'::text])`),
	check("transactions_status_check", sql`status = ANY (ARRAY['pending'::text, 'completed'::text, 'refunded'::text])`),
	check("transactions_tip_amount_check", sql`tip_amount >= 0`),
]);

export const tips = pgTable("tips", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	transactionId: uuid("transaction_id").notNull(),
	employeeId: uuid("employee_id").notNull(),
	amount: integer().notNull(),
	method: text().default('cash').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_tips_employee").using("btree", table.employeeId.asc().nullsLast()),
	index("idx_tips_transaction").using("btree", table.transactionId.asc().nullsLast()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "tips_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "tips_employee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.transactionId],
			foreignColumns: [transactions.id],
			name: "tips_transaction_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant_access_tips", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
	check("tips_amount_check", sql`amount > 0`),
	check("tips_method_check", sql`method = ANY (ARRAY['cash'::text, 'card'::text, 'transfer'::text, 'digital'::text])`),
]);

export const memberships = pgTable("memberships", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	locationId: uuid("location_id"),
	name: text().notNull(),
	price: integer().notNull(),
	durationDays: integer("duration_days").notNull(),
	benefits: jsonb().default({}).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_memberships_business").using("btree", table.businessId.asc().nullsLast()).where(sql`is_active`),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "memberships_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "memberships_location_id_fkey"
		}).onDelete("set null"),
	pgPolicy("tenant_access_memberships", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
	check("memberships_duration_days_check", sql`duration_days > 0`),
	check("memberships_price_check", sql`price >= 0`),
]);

export const clientMemberships = pgTable("client_memberships", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	clientId: uuid("client_id").notNull(),
	membershipId: uuid("membership_id").notNull(),
	startsAt: timestamp("starts_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	remaining: integer().notNull(),
	status: text().default('active').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_client_memberships_client").using("btree", table.clientId.asc().nullsLast(), table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "client_memberships_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "client_memberships_client_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.membershipId],
			foreignColumns: [memberships.id],
			name: "client_memberships_membership_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant_access_client_memberships", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
	check("client_memberships_remaining_check", sql`remaining >= 0`),
	check("client_memberships_status_check", sql`status = ANY (ARRAY['active'::text, 'expired'::text, 'cancelled'::text])`),
]);

export const tags = pgTable("tags", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("tags_name_key").on(table.name),
]);

export const serviceCategories = pgTable("service_categories", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	name: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_service_categories_business").using("btree", table.businessId.asc().nullsLast()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "service_categories_business_id_fkey"
		}).onDelete("cascade"),
	unique("service_categories_business_id_name_key").on(table.businessId, table.name),
	pgPolicy("tenant_access_service_categories", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
]);

export const promotions = pgTable("promotions", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	locationId: uuid("location_id"),
	name: text().notNull(),
	type: text().notNull(),
	value: numeric({ precision: 10, scale:  2 }).notNull(),
	promoCode: text("promo_code"),
	validFrom: timestamp("valid_from", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	validTo: timestamp("valid_to", { withTimezone: true, mode: 'string' }),
	rules: jsonb().default({}).notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_promotions_business_active").using("btree", table.businessId.asc().nullsLast()).where(sql`is_active`),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "promotions_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "promotions_location_id_fkey"
		}).onDelete("set null"),
	unique("promotions_business_id_promo_code_key").on(table.businessId, table.promoCode),
	pgPolicy("tenant_access_promotions", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
	check("promotions_type_check", sql`type = ANY (ARRAY['percent'::text, 'fixed'::text, 'combo'::text])`),
	check("promotions_value_check", sql`value >= (0)::numeric`),
]);

export const inventoryItems = pgTable("inventory_items", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	name: text().notNull(),
	sku: text(),
	category: text(),
	unit: text().default('pcs').notNull(),
	quantity: numeric({ precision: 10, scale:  3 }).default('0').notNull(),
	lowStockThreshold: numeric("low_stock_threshold", { precision: 10, scale:  3 }).default('5').notNull(),
	costPrice: numeric("cost_price", { precision: 10, scale:  2 }),
	sellPrice: numeric("sell_price", { precision: 10, scale:  2 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	barcode: text(),
	description: text(),
	photoUrl: text("photo_url"),
	locationId: uuid("location_id"),
}, (table) => [
	index("idx_inventory_items_business").using("btree", table.businessId.asc().nullsLast()),
	index("idx_inventory_items_location").using("btree", table.businessId.asc().nullsLast(), table.locationId.asc().nullsLast()),
	uniqueIndex("inventory_items_business_barcode_idx").using("btree", table.businessId.asc().nullsLast(), table.barcode.asc().nullsLast()).where(sql`(barcode IS NOT NULL)`),
	uniqueIndex("unique_sku_per_business").using("btree", table.businessId.asc().nullsLast(), table.sku.asc().nullsLast()).where(sql`((sku IS NOT NULL) AND (sku <> ''::text))`),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "inventory_items_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "inventory_items_location_id_fkey"
		}).onDelete("set null"),
	pgPolicy("tenant_access_inventory_items", { as: "permissive", for: "all", to: ["public"], using: sql`((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])))` }),
]);

export const notificationLog = pgTable("notification_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	refId: text("ref_id").notNull(),
	type: text().notNull(),
	channel: text().default('email').notNull(),
	sentAt: timestamp("sent_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("notification_log_unique").using("btree", table.refId.asc().nullsLast(), table.type.asc().nullsLast(), table.channel.asc().nullsLast()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "notification_log_business_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("business_isolation", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
]);

export const loyaltyAccounts = pgTable("loyalty_accounts", {
	clientId: uuid("client_id").primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	points: integer().default(0).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "loyalty_accounts_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "loyalty_accounts_client_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant_access_loyalty_accounts", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
	check("loyalty_accounts_points_check", sql`points >= 0`),
]);

export const loyaltyMovements = pgTable("loyalty_movements", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	clientId: uuid("client_id").notNull(),
	type: text().notNull(),
	points: integer().notNull(),
	reference: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_loyalty_movements_client").using("btree", table.clientId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "loyalty_movements_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "loyalty_movements_client_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant_access_loyalty_movements", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
	check("loyalty_movements_points_check", sql`points <> 0`),
	check("loyalty_movements_type_check", sql`type = ANY (ARRAY['earn'::text, 'redeem'::text, 'adjust'::text])`),
]);

export const businessHours = pgTable("business_hours", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	locationId: uuid("location_id"),
	dayOfWeek: smallint("day_of_week").notNull(),
	isOpen: boolean("is_open").default(true).notNull(),
	openTime: text("open_time").default('09:00').notNull(),
	closeTime: text("close_time").default('19:00').notNull(),
	breakStart: text("break_start"),
	breakEnd: text("break_end"),
}, (table) => [
	index("idx_business_hours_business").using("btree", table.businessId.asc().nullsLast()),
	index("idx_business_hours_location").using("btree", table.businessId.asc().nullsLast(), table.locationId.asc().nullsLast()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "business_hours_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "business_hours_location_id_fkey"
		}).onDelete("cascade"),
	unique("business_hours_business_id_day_of_week_key").on(table.businessId, table.dayOfWeek),
	unique("business_hours_business_location_day_key").on(table.businessId, table.locationId, table.dayOfWeek),
	pgPolicy("public_read_business_hours", { as: "permissive", for: "select", to: ["public"], using: sql`true` }),
	pgPolicy("tenant_access_business_hours", { as: "permissive", for: "all", to: ["public"] }),
	check("business_hours_day_of_week_check", sql`(day_of_week >= 0) AND (day_of_week <= 6)`),
]);

export const cashMovements = pgTable("cash_movements", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	registerId: uuid("register_id").notNull(),
	type: text().notNull(),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	reason: text(),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_cash_movements_business").using("btree", table.businessId.asc().nullsLast()),
	index("idx_cash_movements_register").using("btree", table.registerId.asc().nullsLast()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "cash_movements_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "cash_movements_created_by_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.registerId],
			foreignColumns: [cashRegisters.id],
			name: "cash_movements_register_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant_access_cash_movements", { as: "permissive", for: "all", to: ["public"], using: sql`((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])))` }),
	check("cash_movements_amount_check", sql`amount > (0)::numeric`),
	check("cash_movements_type_check", sql`type = ANY (ARRAY['in'::text, 'out'::text])`),
]);

export const commissions = pgTable("commissions", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	transactionId: uuid("transaction_id").notNull(),
	employeeId: uuid("employee_id").notNull(),
	serviceId: uuid("service_id"),
	amount: numeric({ precision: 10, scale:  2 }).notNull(),
	rateSnapshot: numeric("rate_snapshot", { precision: 5, scale:  2 }),
	type: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_commissions_business").using("btree", table.businessId.asc().nullsLast()),
	index("idx_commissions_created_at").using("btree", table.businessId.asc().nullsLast(), table.createdAt.desc().nullsFirst()),
	index("idx_commissions_employee").using("btree", table.employeeId.asc().nullsLast()),
	index("idx_commissions_transaction").using("btree", table.transactionId.asc().nullsLast()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "commissions_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "commissions_employee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.serviceId],
			foreignColumns: [services.id],
			name: "commissions_service_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.transactionId],
			foreignColumns: [transactions.id],
			name: "commissions_transaction_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant_access_commissions", { as: "permissive", for: "all", to: ["public"], using: sql`((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND ((current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])) OR (employee_id = current_employee_id())))` }),
	check("commissions_amount_check", sql`amount >= (0)::numeric`),
	check("commissions_type_check", sql`type = ANY (ARRAY['percentage'::text, 'fixed'::text, 'per_service'::text, 'per_product'::text])`),
]);

export const waitlist = pgTable("waitlist", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	locationId: uuid("location_id"),
	serviceId: uuid("service_id").notNull(),
	employeeId: uuid("employee_id"),
	clientId: uuid("client_id").notNull(),
	desiredAt: timestamp("desired_at", { withTimezone: true, mode: 'string' }).notNull(),
	status: text().default('waiting').notNull(),
	notifiedAt: timestamp("notified_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_waitlist_desired").using("btree", table.businessId.asc().nullsLast(), table.locationId.asc().nullsLast(), table.desiredAt.asc().nullsLast()).where(sql`(status = 'waiting'::text)`),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "waitlist_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "waitlist_client_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "waitlist_employee_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "waitlist_location_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.serviceId],
			foreignColumns: [services.id],
			name: "waitlist_service_id_fkey"
		}).onDelete("cascade"),
	unique("waitlist_business_id_client_id_desired_at_key").on(table.businessId, table.clientId, table.desiredAt),
	pgPolicy("tenant_access_waitlist", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
	check("waitlist_status_check", sql`status = ANY (ARRAY['waiting'::text, 'notified'::text, 'converted'::text, 'expired'::text, 'cancelled'::text])`),
]);

export const transactionItems = pgTable("transaction_items", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	transactionId: uuid("transaction_id").notNull(),
	serviceId: uuid("service_id"),
	nameSnapshot: text("name_snapshot").notNull(),
	priceSnapshot: numeric("price_snapshot", { precision: 10, scale:  2 }).notNull(),
	qty: integer().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_transaction_items_service").using("btree", table.serviceId.asc().nullsLast()),
	index("idx_transaction_items_transaction").using("btree", table.transactionId.asc().nullsLast()),
	foreignKey({
			columns: [table.serviceId],
			foreignColumns: [services.id],
			name: "transaction_items_service_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.transactionId],
			foreignColumns: [transactions.id],
			name: "transaction_items_transaction_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant_access_transaction_items", { as: "permissive", for: "all", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM transactions
  WHERE ((transactions.id = transaction_items.transaction_id) AND (transactions.business_id IN ( SELECT my_business_ids() AS my_business_ids)))))` }),
	check("transaction_items_qty_check", sql`qty > 0`),
]);

export const appointments = pgTable("appointments", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	clientId: uuid("client_id"),
	employeeId: uuid("employee_id"),
	serviceId: uuid("service_id"),
	startsAt: timestamp("starts_at", { withTimezone: true, mode: 'string' }).notNull(),
	endsAt: timestamp("ends_at", { withTimezone: true, mode: 'string' }).notNull(),
	status: text().default('pending').notNull(),
	price: numeric({ precision: 10, scale: 2 }),
	notes: text(),
	source: text().default('manual').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	locationId: uuid("location_id"),
	recurringId: uuid("recurring_id"),
	campaignId: uuid("campaign_id"),
}, (table) => [
	index("idx_appointments_business").using("btree", table.businessId.asc().nullsLast()),
	index("idx_appointments_business_status_starts").using("btree", table.businessId.asc().nullsLast(), table.status.asc().nullsLast(), table.startsAt.asc().nullsLast()),
	index("idx_appointments_location").using("btree", table.locationId.asc().nullsLast()),
	index("idx_appointments_starts_at").using("btree", table.businessId.asc().nullsLast(), table.startsAt.asc().nullsLast()),
	index("idx_appointments_status").using("btree", table.businessId.asc().nullsLast(), table.status.asc().nullsLast()),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "appointments_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "appointments_client_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "appointments_employee_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "appointments_location_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.recurringId],
			foreignColumns: [recurringAppointments.id],
			name: "appointments_recurring_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaigns.id],
			name: "appointments_campaign_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.serviceId],
			foreignColumns: [services.id],
			name: "appointments_service_id_fkey"
		}).onDelete("set null"),
	pgPolicy("tenant_access_appointments", { as: "permissive", for: "all", to: ["public"], using: sql`((business_id IN ( SELECT my_business_ids() AS my_business_ids)) AND ((current_user_role() IS NULL) OR (current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])) OR (employee_id = current_employee_id())))` }),
	pgPolicy("client_self_update_appointments", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("client_self_select_appointments", { as: "permissive", for: "select", to: ["public"] }),
	check("appointments_source_check", sql`source = ANY (ARRAY['manual'::text, 'online'::text, 'telegram'::text, 'viber'::text])`),
	check("appointments_status_check", sql`status = ANY (ARRAY['pending'::text, 'scheduled'::text, 'confirmed'::text, 'checked_in'::text, 'in_service'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text, 'paid'::text])`),
]);

export const recurringAppointments = pgTable("recurring_appointments", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	locationId: uuid("location_id"),
	clientId: uuid("client_id").notNull(),
	serviceId: uuid("service_id").notNull(),
	employeeId: uuid("employee_id"),
	rrule: text().notNull(),
	nextAt: timestamp("next_at", { withTimezone: true, mode: 'string' }).notNull(),
	until: timestamp({ withTimezone: true, mode: 'string' }),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_recurring_business").using("btree", table.businessId.asc().nullsLast(), table.nextAt.asc().nullsLast()).where(sql`is_active`),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "recurring_appointments_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "recurring_appointments_client_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "recurring_appointments_employee_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "recurring_appointments_location_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.serviceId],
			foreignColumns: [services.id],
			name: "recurring_appointments_service_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("tenant_access_recurring", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
]);

export const employeeServices = pgTable("employee_services", {
	employeeId: uuid("employee_id").notNull(),
	serviceId: uuid("service_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_employee_services_employee").using("btree", table.employeeId.asc().nullsLast()),
	index("idx_employee_services_service").using("btree", table.serviceId.asc().nullsLast()),
	foreignKey({
			columns: [table.employeeId],
			foreignColumns: [employees.id],
			name: "employee_services_employee_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.serviceId],
			foreignColumns: [services.id],
			name: "employee_services_service_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.employeeId, table.serviceId], name: "employee_services_pkey"}),
	pgPolicy("tenant_access_employee_services", { as: "permissive", for: "all", to: ["public"], using: sql`((EXISTS ( SELECT 1
   FROM employees e
  WHERE ((e.id = employee_services.employee_id) AND (e.business_id IN ( SELECT my_business_ids() AS my_business_ids))))) AND ((current_user_role() = ANY (ARRAY['owner'::text, 'admin'::text, 'staff'::text])) OR (employee_id = current_employee_id())))` }),
]);

export const campaignRecipients = pgTable("campaign_recipients", {
	campaignId: uuid("campaign_id").notNull(),
	clientId: uuid("client_id").notNull(),
	status: text().default('pending').notNull(),
}, (table) => [
	foreignKey({
			columns: [table.campaignId],
			foreignColumns: [campaigns.id],
			name: "campaign_recipients_campaign_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "campaign_recipients_client_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.campaignId, table.clientId], name: "campaign_recipients_pkey"}),
	pgPolicy("tenant_access_campaign_recipients", { as: "permissive", for: "all", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM campaigns
  WHERE ((campaigns.id = campaign_recipients.campaign_id) AND (campaigns.business_id IN ( SELECT my_business_ids() AS my_business_ids)))))` }),
	check("campaign_recipients_status_check", sql`status = ANY (ARRAY['pending'::text, 'sent'::text, 'delivered'::text, 'rebooked'::text, 'failed'::text])`),
]);

export const clientTags = pgTable("client_tags", {
	clientId: uuid("client_id").notNull(),
	tagId: uuid("tag_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_client_tags_tag").using("btree", table.tagId.asc().nullsLast()),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [clients.id],
			name: "client_tags_client_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [tags.id],
			name: "client_tags_tag_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.clientId, table.tagId], name: "client_tags_pkey"}),
	pgPolicy("tenant_access_client_tags", { as: "permissive", for: "all", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM clients
  WHERE ((clients.id = client_tags.client_id) AND (clients.business_id IN ( SELECT my_business_ids() AS my_business_ids)))))` }),
]);
export const serviceCombos = pgTable("service_combos", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessId: uuid("business_id").notNull(),
	locationId: uuid("location_id"),
	name: text().notNull(),
	serviceIds: uuid("service_ids").array().notNull(),
	price: integer().notNull(),
	durationMin: integer("duration_min").notNull(),
	isActive: boolean("is_active").default(true).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_service_combos_business").using("btree", table.businessId.asc().nullsLast()).where(sql`is_active`),
	index("idx_service_combos_location").using("btree", table.locationId.asc().nullsLast()).where(sql`(location_id IS NOT NULL)`),
	foreignKey({
			columns: [table.businessId],
			foreignColumns: [businesses.id],
			name: "service_combos_business_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.locationId],
			foreignColumns: [locations.id],
			name: "service_combos_location_id_fkey"
		}).onDelete("set null"),
	pgPolicy("tenant_access_service_combos", { as: "permissive", for: "all", to: ["public"], using: sql`(business_id IN ( SELECT my_business_ids() AS my_business_ids))` }),
	check("service_combos_price_check", sql`price >= 0`),
	check("service_combos_duration_check", sql`duration_min > 0`),
]);

export const barbershopApplications = pgTable("barbershop_applications", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	businessName: text("business_name").notNull(),
	ownerName: text("owner_name").notNull(),
	email: text().notNull(),
	phone: text(),
	nit: text(),
	city: text(),
	requestedPlan: text("requested_plan"),
	status: text().default('pending').notNull(),
	licenseKey: uuid("license_key"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("barbershop_applications_license_key_key").on(table.licenseKey),
	pgPolicy("super_admin_all_applications", { as: "permissive", for: "all", to: ["public"], using: sql`(EXISTS (SELECT 1 FROM auth.users WHERE auth.users.id = auth.uid() AND auth.users.raw_user_meta_data->>'role' = 'super_admin') OR auth.email() IN (SELECT unnest(string_to_array(current_setting('app.super_admins', true), ','))))` }),
	check("barbershop_applications_status_check", sql`status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])`),
]);

export const businessesPublic = pgView("businesses_public", {	id: uuid(),
	name: text(),
	slug: text(),
	type: text(),
	phone: text(),
	address: text(),
	timezone: text(),
	currency: text(),
	brandColor: text("brand_color"),
	enabledModules: text("enabled_modules"),
	notificationLanguage: text("notification_language"),
}).as(sql`SELECT id, name, slug, type, phone, address, timezone, currency, brand_color, enabled_modules, notification_language FROM businesses`);

export const clientStats = pgMaterializedView("client_stats", {	clientId: uuid("client_id"),
	businessId: uuid("business_id"),
	totalVisits: integer("total_visits"),
	totalSpent: numeric("total_spent", { precision: 10, scale:  2 }),
	lastVisitAt: timestamp("last_visit_at", { withTimezone: true, mode: 'string' }),
}).as(sql`SELECT c.id AS client_id, c.business_id, count(t.id)::integer AS total_visits, COALESCE(sum(t.amount), 0::numeric)::numeric(10,2) AS total_spent, max(t.created_at) AS last_visit_at FROM clients c LEFT JOIN transactions t ON t.client_id = c.id AND t.status = 'completed'::text GROUP BY c.id, c.business_id`);

export const clientsSecure = pgView("clients_secure", {	id: uuid(),
	businessId: uuid("business_id"),
	name: text(),
	phone: text(),
	email: text(),
	notes: text(),
	tags: text(),
	telegramId: text("telegram_id"),
	birthday: date(),
	totalVisits: integer("total_visits"),
	totalSpent: numeric("total_spent", { precision: 10, scale:  2 }),
	lastVisitAt: timestamp("last_visit_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }),
	viberUserId: text("viber_user_id"),
	whatsappNumber: text("whatsapp_number"),
	// TODO: failed to parse database type 'bytea'
	phoneEncrypted: text("phone_encrypted"),
	// TODO: failed to parse database type 'bytea'
	emailEncrypted: text("email_encrypted"),
	// TODO: failed to parse database type 'bytea'
	whatsappEncrypted: text("whatsapp_encrypted"),
	phoneSecure: text("phone_secure"),
	emailSecure: text("email_secure"),
	whatsappSecure: text("whatsapp_secure"),
}).with({"securityInvoker":true}).as(sql`SELECT id, business_id, name, phone, email, notes, tags, telegram_id, birthday, total_visits, total_spent, last_visit_at, created_at, viber_user_id, whatsapp_number, phone_encrypted, email_encrypted, whatsapp_encrypted, phone_encrypted AS phone_secure, email_encrypted AS email_secure, whatsapp_encrypted AS whatsapp_secure FROM clients`);