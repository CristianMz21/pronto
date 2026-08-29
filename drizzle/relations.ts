import { relations } from "drizzle-orm/relations";
import { businesses, employeeUnavailability, users, employees, locations, campaigns, businessSettings, businessIntegrations, clients, cashRegisters, inventoryMovements, inventoryItems, holidays, services, serviceCategories, appointments, transactions, tips, memberships, clientMemberships, promotions, notificationLog, loyaltyAccounts, loyaltyMovements, businessHours, cashMovements, commissions, waitlist, transactionItems, recurringAppointments, employeeServices, campaignRecipients, clientTags, tags, serviceCombos, barbershopApplications } from "./schema";

export const employeeUnavailabilityRelations = relations(employeeUnavailability, ({one}) => ({
	business: one(businesses, {
		fields: [employeeUnavailability.businessId],
		references: [businesses.id]
	}),
	users: one(users, {
		fields: [employeeUnavailability.createdBy],
		references: [users.id]
	}),
	employee: one(employees, {
		fields: [employeeUnavailability.employeeId],
		references: [employees.id]
	}),
}));

export const businessesRelations = relations(businesses, ({one, many}) => ({
	employeeUnavailabilities: many(employeeUnavailability),
	locations: many(locations),
	users: one(users, {
		fields: [businesses.ownerId],
		references: [users.id]
	}),
	campaigns: many(campaigns),
	businessSettings: many(businessSettings),
	businessIntegrations: many(businessIntegrations),
	clients: many(clients),
	cashRegisters: many(cashRegisters),
	inventoryMovements: many(inventoryMovements),
	holidays: many(holidays),
	employees: many(employees),
	services: many(services),
	transactions: many(transactions),
	tips: many(tips),
	memberships: many(memberships),
	clientMemberships: many(clientMemberships),
	serviceCategories: many(serviceCategories),
	promotions: many(promotions),
	inventoryItems: many(inventoryItems),
	notificationLogs: many(notificationLog),
	loyaltyAccounts: many(loyaltyAccounts),
	loyaltyMovements: many(loyaltyMovements),
	businessHours: many(businessHours),
	cashMovements: many(cashMovements),
	commissions: many(commissions),
	waitlists: many(waitlist),
	appointments: many(appointments),
	recurringAppointments: many(recurringAppointments),
	serviceCombos: many(serviceCombos),
}));

export const usersRelations = relations(users, ({many}) => ({
	employeeUnavailabilities: many(employeeUnavailability),
	businesses: many(businesses),
	clients: many(clients),
	cashRegisters: many(cashRegisters),
	inventoryMovements: many(inventoryMovements),
	employees: many(employees),
	cashMovements: many(cashMovements),
}));

export const employeesRelations = relations(employees, ({one, many}) => ({
	employeeUnavailabilities: many(employeeUnavailability),
	business: one(businesses, {
		fields: [employees.businessId],
		references: [businesses.id]
	}),
	location: one(locations, {
		fields: [employees.locationId],
		references: [locations.id]
	}),
	users: one(users, {
		fields: [employees.userId],
		references: [users.id]
	}),
	transactions: many(transactions),
	tips: many(tips),
	commissions: many(commissions),
	waitlists: many(waitlist),
	appointments: many(appointments),
	recurringAppointments: many(recurringAppointments),
	employeeServices: many(employeeServices),
}));

export const locationsRelations = relations(locations, ({one, many}) => ({
	business: one(businesses, {
		fields: [locations.businessId],
		references: [businesses.id]
	}),
	campaigns: many(campaigns),
	cashRegisters: many(cashRegisters),
	inventoryMovements_fromLocationId: many(inventoryMovements, {
		relationName: "inventoryMovements_fromLocationId_locations_id"
	}),
	inventoryMovements_toLocationId: many(inventoryMovements, {
		relationName: "inventoryMovements_toLocationId_locations_id"
	}),
	holidays: many(holidays),
	employees: many(employees),
	services: many(services),
	memberships: many(memberships),
	promotions: many(promotions),
	inventoryItems: many(inventoryItems),
	waitlists: many(waitlist),
	appointments: many(appointments),
	recurringAppointments: many(recurringAppointments),
}));

export const campaignsRelations = relations(campaigns, ({one, many}) => ({
	business: one(businesses, {
		fields: [campaigns.businessId],
		references: [businesses.id]
	}),
	location: one(locations, {
		fields: [campaigns.locationId],
		references: [locations.id]
	}),
	campaignRecipients: many(campaignRecipients),
}));

export const businessSettingsRelations = relations(businessSettings, ({one}) => ({
	business: one(businesses, {
		fields: [businessSettings.businessId],
		references: [businesses.id]
	}),
}));

export const businessIntegrationsRelations = relations(businessIntegrations, ({one}) => ({
	business: one(businesses, {
		fields: [businessIntegrations.businessId],
		references: [businesses.id]
	}),
}));

export const clientsRelations = relations(clients, ({one, many}) => ({
	business: one(businesses, {
		fields: [clients.businessId],
		references: [businesses.id]
	}),
	users: one(users, {
		fields: [clients.userId],
		references: [users.id]
	}),
	location: one(locations, {
		fields: [clients.locationId],
		references: [locations.id]
	}),
	transactions: many(transactions),
	clientMemberships: many(clientMemberships),
	loyaltyAccounts: many(loyaltyAccounts),
	loyaltyMovements: many(loyaltyMovements),
	waitlists: many(waitlist),
	appointments: many(appointments),
	recurringAppointments: many(recurringAppointments),
	campaignRecipients: many(campaignRecipients),
	clientTags: many(clientTags),
}));

export const cashRegistersRelations = relations(cashRegisters, ({one, many}) => ({
	business: one(businesses, {
		fields: [cashRegisters.businessId],
		references: [businesses.id]
	}),
	location: one(locations, {
		fields: [cashRegisters.locationId],
		references: [locations.id]
	}),
	users: one(users, {
		fields: [cashRegisters.openedBy],
		references: [users.id]
	}),
	cashMovements: many(cashMovements),
}));

export const inventoryMovementsRelations = relations(inventoryMovements, ({one}) => ({
	business: one(businesses, {
		fields: [inventoryMovements.businessId],
		references: [businesses.id]
	}),
	users: one(users, {
		fields: [inventoryMovements.createdBy],
		references: [users.id]
	}),
	location_fromLocationId: one(locations, {
		fields: [inventoryMovements.fromLocationId],
		references: [locations.id],
		relationName: "inventoryMovements_fromLocationId_locations_id"
	}),
	inventoryItem: one(inventoryItems, {
		fields: [inventoryMovements.itemId],
		references: [inventoryItems.id]
	}),
	location_toLocationId: one(locations, {
		fields: [inventoryMovements.toLocationId],
		references: [locations.id],
		relationName: "inventoryMovements_toLocationId_locations_id"
	}),
}));

export const inventoryItemsRelations = relations(inventoryItems, ({one, many}) => ({
	inventoryMovements: many(inventoryMovements),
	business: one(businesses, {
		fields: [inventoryItems.businessId],
		references: [businesses.id]
	}),
	location: one(locations, {
		fields: [inventoryItems.locationId],
		references: [locations.id]
	}),
}));

export const holidaysRelations = relations(holidays, ({one}) => ({
	business: one(businesses, {
		fields: [holidays.businessId],
		references: [businesses.id]
	}),
	location: one(locations, {
		fields: [holidays.locationId],
		references: [locations.id]
	}),
}));

export const servicesRelations = relations(services, ({one, many}) => ({
	business: one(businesses, {
		fields: [services.businessId],
		references: [businesses.id]
	}),
	serviceCategory: one(serviceCategories, {
		fields: [services.categoryId],
		references: [serviceCategories.id]
	}),
	location: one(locations, {
		fields: [services.locationId],
		references: [locations.id]
	}),
	commissions: many(commissions),
	waitlists: many(waitlist),
	transactionItems: many(transactionItems),
	appointments: many(appointments),
	recurringAppointments: many(recurringAppointments),
	employeeServices: many(employeeServices),
}));

export const serviceCategoriesRelations = relations(serviceCategories, ({one, many}) => ({
	services: many(services),
	business: one(businesses, {
		fields: [serviceCategories.businessId],
		references: [businesses.id]
	}),
}));

export const transactionsRelations = relations(transactions, ({one, many}) => ({
	appointment: one(appointments, {
		fields: [transactions.appointmentId],
		references: [appointments.id]
	}),
	business: one(businesses, {
		fields: [transactions.businessId],
		references: [businesses.id]
	}),
	client: one(clients, {
		fields: [transactions.clientId],
		references: [clients.id]
	}),
	employee: one(employees, {
		fields: [transactions.employeeId],
		references: [employees.id]
	}),
	tips: many(tips),
	commissions: many(commissions),
	transactionItems: many(transactionItems),
}));

export const appointmentsRelations = relations(appointments, ({one, many}) => ({
	transactions: many(transactions),
	business: one(businesses, {
		fields: [appointments.businessId],
		references: [businesses.id]
	}),
	client: one(clients, {
		fields: [appointments.clientId],
		references: [clients.id]
	}),
	employee: one(employees, {
		fields: [appointments.employeeId],
		references: [employees.id]
	}),
	location: one(locations, {
		fields: [appointments.locationId],
		references: [locations.id]
	}),
	recurringAppointment: one(recurringAppointments, {
		fields: [appointments.recurringId],
		references: [recurringAppointments.id]
	}),
	service: one(services, {
		fields: [appointments.serviceId],
		references: [services.id]
	}),
}));

export const tipsRelations = relations(tips, ({one}) => ({
	business: one(businesses, {
		fields: [tips.businessId],
		references: [businesses.id]
	}),
	employee: one(employees, {
		fields: [tips.employeeId],
		references: [employees.id]
	}),
	transaction: one(transactions, {
		fields: [tips.transactionId],
		references: [transactions.id]
	}),
}));

export const membershipsRelations = relations(memberships, ({one, many}) => ({
	business: one(businesses, {
		fields: [memberships.businessId],
		references: [businesses.id]
	}),
	location: one(locations, {
		fields: [memberships.locationId],
		references: [locations.id]
	}),
	clientMemberships: many(clientMemberships),
}));

export const clientMembershipsRelations = relations(clientMemberships, ({one}) => ({
	business: one(businesses, {
		fields: [clientMemberships.businessId],
		references: [businesses.id]
	}),
	client: one(clients, {
		fields: [clientMemberships.clientId],
		references: [clients.id]
	}),
	membership: one(memberships, {
		fields: [clientMemberships.membershipId],
		references: [memberships.id]
	}),
}));

export const promotionsRelations = relations(promotions, ({one}) => ({
	business: one(businesses, {
		fields: [promotions.businessId],
		references: [businesses.id]
	}),
	location: one(locations, {
		fields: [promotions.locationId],
		references: [locations.id]
	}),
}));

export const notificationLogRelations = relations(notificationLog, ({one}) => ({
	business: one(businesses, {
		fields: [notificationLog.businessId],
		references: [businesses.id]
	}),
}));

export const loyaltyAccountsRelations = relations(loyaltyAccounts, ({one}) => ({
	business: one(businesses, {
		fields: [loyaltyAccounts.businessId],
		references: [businesses.id]
	}),
	client: one(clients, {
		fields: [loyaltyAccounts.clientId],
		references: [clients.id]
	}),
}));

export const loyaltyMovementsRelations = relations(loyaltyMovements, ({one}) => ({
	business: one(businesses, {
		fields: [loyaltyMovements.businessId],
		references: [businesses.id]
	}),
	client: one(clients, {
		fields: [loyaltyMovements.clientId],
		references: [clients.id]
	}),
}));

export const businessHoursRelations = relations(businessHours, ({one}) => ({
	business: one(businesses, {
		fields: [businessHours.businessId],
		references: [businesses.id]
	}),
}));

export const cashMovementsRelations = relations(cashMovements, ({one}) => ({
	business: one(businesses, {
		fields: [cashMovements.businessId],
		references: [businesses.id]
	}),
	users: one(users, {
		fields: [cashMovements.createdBy],
		references: [users.id]
	}),
	cashRegister: one(cashRegisters, {
		fields: [cashMovements.registerId],
		references: [cashRegisters.id]
	}),
}));

export const commissionsRelations = relations(commissions, ({one}) => ({
	business: one(businesses, {
		fields: [commissions.businessId],
		references: [businesses.id]
	}),
	employee: one(employees, {
		fields: [commissions.employeeId],
		references: [employees.id]
	}),
	service: one(services, {
		fields: [commissions.serviceId],
		references: [services.id]
	}),
	transaction: one(transactions, {
		fields: [commissions.transactionId],
		references: [transactions.id]
	}),
}));

export const waitlistRelations = relations(waitlist, ({one}) => ({
	business: one(businesses, {
		fields: [waitlist.businessId],
		references: [businesses.id]
	}),
	client: one(clients, {
		fields: [waitlist.clientId],
		references: [clients.id]
	}),
	employee: one(employees, {
		fields: [waitlist.employeeId],
		references: [employees.id]
	}),
	location: one(locations, {
		fields: [waitlist.locationId],
		references: [locations.id]
	}),
	service: one(services, {
		fields: [waitlist.serviceId],
		references: [services.id]
	}),
}));

export const transactionItemsRelations = relations(transactionItems, ({one}) => ({
	service: one(services, {
		fields: [transactionItems.serviceId],
		references: [services.id]
	}),
	transaction: one(transactions, {
		fields: [transactionItems.transactionId],
		references: [transactions.id]
	}),
}));

export const recurringAppointmentsRelations = relations(recurringAppointments, ({one, many}) => ({
	appointments: many(appointments),
	business: one(businesses, {
		fields: [recurringAppointments.businessId],
		references: [businesses.id]
	}),
	client: one(clients, {
		fields: [recurringAppointments.clientId],
		references: [clients.id]
	}),
	employee: one(employees, {
		fields: [recurringAppointments.employeeId],
		references: [employees.id]
	}),
	location: one(locations, {
		fields: [recurringAppointments.locationId],
		references: [locations.id]
	}),
	service: one(services, {
		fields: [recurringAppointments.serviceId],
		references: [services.id]
	}),
}));

export const employeeServicesRelations = relations(employeeServices, ({one}) => ({
	employee: one(employees, {
		fields: [employeeServices.employeeId],
		references: [employees.id]
	}),
	service: one(services, {
		fields: [employeeServices.serviceId],
		references: [services.id]
	}),
}));

export const campaignRecipientsRelations = relations(campaignRecipients, ({one}) => ({
	campaign: one(campaigns, {
		fields: [campaignRecipients.campaignId],
		references: [campaigns.id]
	}),
	client: one(clients, {
		fields: [campaignRecipients.clientId],
		references: [clients.id]
	}),
}));

export const clientTagsRelations = relations(clientTags, ({one}) => ({
	client: one(clients, {
		fields: [clientTags.clientId],
		references: [clients.id]
	}),
	tag: one(tags, {
		fields: [clientTags.tagId],
		references: [tags.id]
	}),
}));

export const tagsRelations = relations(tags, ({many}) => ({
	clientTags: many(clientTags),
}));

export const serviceCombosRelations = relations(serviceCombos, ({one}) => ({
	business: one(businesses, {
		fields: [serviceCombos.businessId],
		references: [businesses.id]
	}),
	location: one(locations, {
		fields: [serviceCombos.locationId],
		references: [locations.id]
	}),
}));

export const businessHoursRelationsWithLocation = relations(businessHours, ({one}) => ({
	business: one(businesses, {
		fields: [businessHours.businessId],
		references: [businesses.id]
	}),
	location: one(locations, {
		fields: [businessHours.locationId],
		references: [locations.id]
	}),
}));