/**
 * Generated via `supabase gen types typescript --local --schema public`
 * Source of truth for legacy supabase.from calls; new code SHOULD prefer Drizzle ORM (drizzle/schema.ts).
 * Last synced: 2026-08-29 from local supabase (project_id escudero, 85 migrations)
 * Do NOT manually edit — re-run `npm run db:generate` (supabase gen types) after schema changes.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      appointments: {
        Row: {
          business_id: string
          campaign_id: string | null
          client_id: string | null
          created_at: string
          employee_id: string | null
          ends_at: string
          id: string
          location_id: string | null
          notes: string | null
          price: number | null
          recurring_id: string | null
          service_id: string | null
          source: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string
          employee_id?: string | null
          ends_at: string
          id?: string
          location_id?: string | null
          notes?: string | null
          price?: number | null
          recurring_id?: string | null
          service_id?: string | null
          source?: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string
          employee_id?: string | null
          ends_at?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          price?: number | null
          recurring_id?: string | null
          service_id?: string | null
          source?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      barbershop_applications: {
        Row: {
          business_name: string
          city: string | null
          created_at: string
          email: string
          id: string
          license_key: string | null
          nit: string | null
          owner_name: string
          phone: string | null
          requested_plan: string | null
          status: string
        }
        Insert: {
          business_name: string
          city?: string | null
          created_at?: string
          email: string
          id?: string
          license_key?: string | null
          nit?: string | null
          owner_name: string
          phone?: string | null
          requested_plan?: string | null
          status?: string
        }
        Update: {
          business_name?: string
          city?: string | null
          created_at?: string
          email?: string
          id?: string
          license_key?: string | null
          nit?: string | null
          owner_name?: string
          phone?: string | null
          requested_plan?: string | null
          status?: string
        }
        Relationships: []
      }
      business_hours: {
        Row: {
          break_end: string | null
          break_start: string | null
          business_id: string
          close_time: string
          day_of_week: number
          id: string
          is_open: boolean
          location_id: string | null
          open_time: string
        }
        Insert: {
          break_end?: string | null
          break_start?: string | null
          business_id: string
          close_time?: string
          day_of_week: number
          id?: string
          is_open?: boolean
          location_id?: string | null
          open_time?: string
        }
        Update: {
          break_end?: string | null
          break_start?: string | null
          business_id?: string
          close_time?: string
          day_of_week?: number
          id?: string
          is_open?: boolean
          location_id?: string | null
          open_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_hours_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_hours_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      business_integrations: {
        Row: {
          business_id: string
          config: Json
          created_at: string
          id: string
          provider: string
          token_encrypted: string | null
        }
        Insert: {
          business_id: string
          config?: Json
          created_at?: string
          id?: string
          provider: string
          token_encrypted?: string | null
        }
        Update: {
          business_id?: string
          config?: Json
          created_at?: string
          id?: string
          provider?: string
          token_encrypted?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_integrations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_integrations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          brand_color: string | null
          business_id: string
          cancel_lead_time: number
          created_at: string
          currency: string
          enabled_modules: string[]
          loyalty_earn_rate: number
          loyalty_redeem_rate: number
          loyalty_redeem_value: number
          notification_language: string | null
          payment_methods: string[]
          tax_rate: number
          timezone: string
          updated_at: string
        }
        Insert: {
          brand_color?: string | null
          business_id: string
          cancel_lead_time?: number
          created_at?: string
          currency?: string
          enabled_modules?: string[]
          loyalty_earn_rate?: number
          loyalty_redeem_rate?: number
          loyalty_redeem_value?: number
          notification_language?: string | null
          payment_methods?: string[]
          tax_rate?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          brand_color?: string | null
          business_id?: string
          cancel_lead_time?: number
          created_at?: string
          currency?: string
          enabled_modules?: string[]
          loyalty_earn_rate?: number
          loyalty_redeem_rate?: number
          loyalty_redeem_value?: number
          notification_language?: string | null
          payment_methods?: string[]
          tax_rate?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          address: string | null
          allow_guest_bookings: boolean
          booking_lead_time_enabled: boolean
          brand_color: string | null
          cancel_lead_time: number
          created_at: string
          currency: string
          email: string | null
          email_provider: string | null
          enabled_modules: string[]
          id: string
          license_expires_at: string | null
          license_key: string | null
          license_status: string
          logo_url: string | null
          loyalty_earn_rate: number
          loyalty_redeem_rate: number
          loyalty_redeem_value: number
          ls_customer_id: string | null
          ls_subscription_id: string | null
          ls_variant_id: string | null
          meta_whatsapp_access_token: string | null
          meta_whatsapp_phone_number_id: string | null
          min_advance_minutes: number
          name: string
          notification_language: string | null
          onboarding_completed: boolean
          owner_id: string
          owner_whatsapp: string | null
          payment_methods: string[]
          phone: string | null
          plan: string
          plan_expires_at: string | null
          require_cash_register_for_cash: boolean
          resend_api_key: string | null
          slug: string
          smtp_from: string | null
          smtp_host: string | null
          smtp_pass: string | null
          smtp_port: number | null
          smtp_user: string | null
          tax_rate: number
          telegram_bot_token: string | null
          telegram_chat_id: string | null
          timezone: string
          type: string | null
          updated_at: string
          viber_bot_token: string | null
          viber_chat_id: string | null
          wa_template_birthday: string | null
          wa_template_confirmation: string | null
          wa_template_language: string
          wa_template_reactivation: string | null
          wa_template_reminder: string | null
          wa_template_thankyou: string | null
        }
        Insert: {
          address?: string | null
          allow_guest_bookings?: boolean
          booking_lead_time_enabled?: boolean
          brand_color?: string | null
          cancel_lead_time?: number
          created_at?: string
          currency?: string
          email?: string | null
          email_provider?: string | null
          enabled_modules?: string[]
          id?: string
          license_expires_at?: string | null
          license_key?: string | null
          license_status?: string
          logo_url?: string | null
          loyalty_earn_rate?: number
          loyalty_redeem_rate?: number
          loyalty_redeem_value?: number
          ls_customer_id?: string | null
          ls_subscription_id?: string | null
          ls_variant_id?: string | null
          meta_whatsapp_access_token?: string | null
          meta_whatsapp_phone_number_id?: string | null
          min_advance_minutes?: number
          name: string
          notification_language?: string | null
          onboarding_completed?: boolean
          owner_id: string
          owner_whatsapp?: string | null
          payment_methods?: string[]
          phone?: string | null
          plan?: string
          plan_expires_at?: string | null
          require_cash_register_for_cash?: boolean
          resend_api_key?: string | null
          slug: string
          smtp_from?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          tax_rate?: number
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          timezone?: string
          type?: string | null
          updated_at?: string
          viber_bot_token?: string | null
          viber_chat_id?: string | null
          wa_template_birthday?: string | null
          wa_template_confirmation?: string | null
          wa_template_language?: string
          wa_template_reactivation?: string | null
          wa_template_reminder?: string | null
          wa_template_thankyou?: string | null
        }
        Update: {
          address?: string | null
          allow_guest_bookings?: boolean
          booking_lead_time_enabled?: boolean
          brand_color?: string | null
          cancel_lead_time?: number
          created_at?: string
          currency?: string
          email?: string | null
          email_provider?: string | null
          enabled_modules?: string[]
          id?: string
          license_expires_at?: string | null
          license_key?: string | null
          license_status?: string
          logo_url?: string | null
          loyalty_earn_rate?: number
          loyalty_redeem_rate?: number
          loyalty_redeem_value?: number
          ls_customer_id?: string | null
          ls_subscription_id?: string | null
          ls_variant_id?: string | null
          meta_whatsapp_access_token?: string | null
          meta_whatsapp_phone_number_id?: string | null
          min_advance_minutes?: number
          name?: string
          notification_language?: string | null
          onboarding_completed?: boolean
          owner_id?: string
          owner_whatsapp?: string | null
          payment_methods?: string[]
          phone?: string | null
          plan?: string
          plan_expires_at?: string | null
          require_cash_register_for_cash?: boolean
          resend_api_key?: string | null
          slug?: string
          smtp_from?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          tax_rate?: number
          telegram_bot_token?: string | null
          telegram_chat_id?: string | null
          timezone?: string
          type?: string | null
          updated_at?: string
          viber_bot_token?: string | null
          viber_chat_id?: string | null
          wa_template_birthday?: string | null
          wa_template_confirmation?: string | null
          wa_template_language?: string
          wa_template_reactivation?: string | null
          wa_template_reminder?: string | null
          wa_template_thankyou?: string | null
        }
        Relationships: []
      }
      campaign_recipients: {
        Row: {
          campaign_id: string
          client_id: string
          status: string
        }
        Insert: {
          campaign_id: string
          client_id: string
          status?: string
        }
        Update: {
          campaign_id?: string
          client_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "campaign_recipients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_recipients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          business_id: string
          channel: string
          created_at: string
          id: string
          location_id: string | null
          name: string
          segment: string
          sent_at: string | null
          stats: Json
          status: string
          template: string
        }
        Insert: {
          business_id: string
          channel?: string
          created_at?: string
          id?: string
          location_id?: string | null
          name: string
          segment: string
          sent_at?: string | null
          stats?: Json
          status?: string
          template: string
        }
        Update: {
          business_id?: string
          channel?: string
          created_at?: string
          id?: string
          location_id?: string | null
          name?: string
          segment?: string
          sent_at?: string | null
          stats?: Json
          status?: string
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_movements: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          reason: string | null
          register_id: string
          type: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          register_id: string
          type: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          register_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_register_id_fkey"
            columns: ["register_id"]
            isOneToOne: false
            referencedRelation: "cash_registers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_registers: {
        Row: {
          actual_cash: number | null
          business_id: string
          closed_at: string | null
          created_at: string
          difference: number | null
          expected_cash: number | null
          id: string
          location_id: string | null
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          status: string
        }
        Insert: {
          actual_cash?: number | null
          business_id: string
          closed_at?: string | null
          created_at?: string
          difference?: number | null
          expected_cash?: number | null
          id?: string
          location_id?: string | null
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_cash?: number
          status?: string
        }
        Update: {
          actual_cash?: number | null
          business_id?: string
          closed_at?: string | null
          created_at?: string
          difference?: number | null
          expected_cash?: number | null
          id?: string
          location_id?: string | null
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_registers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_registers_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_memberships: {
        Row: {
          business_id: string
          client_id: string
          created_at: string
          expires_at: string
          id: string
          membership_id: string
          remaining: number
          starts_at: string
          status: string
        }
        Insert: {
          business_id: string
          client_id: string
          created_at?: string
          expires_at: string
          id?: string
          membership_id: string
          remaining: number
          starts_at?: string
          status?: string
        }
        Update: {
          business_id?: string
          client_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          membership_id?: string
          remaining?: number
          starts_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_memberships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_memberships_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tags: {
        Row: {
          client_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "client_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          birthday: string | null
          business_id: string
          created_at: string
          email: string | null
          email_encrypted: string | null
          id: string
          last_visit_at: string | null
          location_id: string | null
          name: string
          notes: string | null
          phone: string | null
          phone_encrypted: string | null
          tags: string[]
          telegram_id: string | null
          total_spent: number
          total_visits: number
          user_id: string | null
          viber_user_id: string | null
          whatsapp_encrypted: string | null
          whatsapp_number: string | null
        }
        Insert: {
          birthday?: string | null
          business_id: string
          created_at?: string
          email?: string | null
          email_encrypted?: string | null
          id?: string
          last_visit_at?: string | null
          location_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          phone_encrypted?: string | null
          tags?: string[]
          telegram_id?: string | null
          total_spent?: number
          total_visits?: number
          user_id?: string | null
          viber_user_id?: string | null
          whatsapp_encrypted?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          birthday?: string | null
          business_id?: string
          created_at?: string
          email?: string | null
          email_encrypted?: string | null
          id?: string
          last_visit_at?: string | null
          location_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          phone_encrypted?: string | null
          tags?: string[]
          telegram_id?: string | null
          total_spent?: number
          total_visits?: number
          user_id?: string | null
          viber_user_id?: string | null
          whatsapp_encrypted?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          employee_id: string
          id: string
          rate_snapshot: number | null
          service_id: string | null
          transaction_id: string
          type: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          employee_id: string
          id?: string
          rate_snapshot?: number | null
          service_id?: string | null
          transaction_id: string
          type: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          rate_snapshot?: number | null
          service_id?: string | null
          transaction_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_services: {
        Row: {
          created_at: string
          employee_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_services_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_unavailability: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          employee_id: string
          ends_at: string
          id: string
          reason: string | null
          starts_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          employee_id: string
          ends_at: string
          id?: string
          reason?: string | null
          starts_at: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          employee_id?: string
          ends_at?: string
          id?: string
          reason?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_unavailability_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_unavailability_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_unavailability_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          avatar_url: string | null
          bio: string | null
          business_id: string
          color: string | null
          commission_fixed: number | null
          commission_rate: number | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          location_id: string | null
          name: string
          phone: string | null
          role: string
          specialties: string[]
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          business_id: string
          color?: string | null
          commission_fixed?: number | null
          commission_rate?: number | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          name: string
          phone?: string | null
          role?: string
          specialties?: string[]
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          business_id?: string
          color?: string | null
          commission_fixed?: number | null
          commission_rate?: number | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          name?: string
          phone?: string | null
          role?: string
          specialties?: string[]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      holidays: {
        Row: {
          business_id: string
          created_at: string
          date: string
          id: string
          is_open: boolean
          location_id: string | null
          reason: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          date: string
          id?: string
          is_open?: boolean
          location_id?: string | null
          reason?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          date?: string
          id?: string
          is_open?: boolean
          location_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holidays_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holidays_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holidays_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          barcode: string | null
          business_id: string
          category: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          id: string
          location_id: string | null
          low_stock_threshold: number
          name: string
          photo_url: string | null
          quantity: number
          sell_price: number | null
          sku: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          business_id: string
          category?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          location_id?: string | null
          low_stock_threshold?: number
          name: string
          photo_url?: string | null
          quantity?: number
          sell_price?: number | null
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          business_id?: string
          category?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          id?: string
          location_id?: string | null
          low_stock_threshold?: number
          name?: string
          photo_url?: string | null
          quantity?: number
          sell_price?: number | null
          sku?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          from_location_id: string | null
          id: string
          item_id: string
          note: string | null
          quantity: number
          to_location_id: string | null
          type: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          from_location_id?: string | null
          id?: string
          item_id: string
          note?: string | null
          quantity: number
          to_location_id?: string | null
          type: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          from_location_id?: string | null
          id?: string
          item_id?: string
          note?: string | null
          quantity?: number
          to_location_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_from_location_id_fkey"
            columns: ["from_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_to_location_id_fkey"
            columns: ["to_location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          slug: string
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          slug: string
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          business_id: string
          client_id: string
          points: number
          updated_at: string
        }
        Insert: {
          business_id: string
          client_id: string
          points?: number
          updated_at?: string
        }
        Update: {
          business_id?: string
          client_id?: string
          points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "client_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "loyalty_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_movements: {
        Row: {
          business_id: string
          client_id: string
          created_at: string
          id: string
          points: number
          reference: string | null
          type: string
        }
        Insert: {
          business_id: string
          client_id: string
          created_at?: string
          id?: string
          points: number
          reference?: string | null
          type: string
        }
        Update: {
          business_id?: string
          client_id?: string
          created_at?: string
          id?: string
          points?: number
          reference?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_movements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "loyalty_movements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_movements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          benefits: Json
          business_id: string
          created_at: string
          duration_days: number
          id: string
          is_active: boolean
          location_id: string | null
          name: string
          price: number
        }
        Insert: {
          benefits?: Json
          business_id: string
          created_at?: string
          duration_days: number
          id?: string
          is_active?: boolean
          location_id?: string | null
          name: string
          price: number
        }
        Update: {
          benefits?: Json
          business_id?: string
          created_at?: string
          duration_days?: number
          id?: string
          is_active?: boolean
          location_id?: string | null
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          business_id: string
          channel: string
          id: string
          ref_id: string
          sent_at: string
          type: string
        }
        Insert: {
          business_id: string
          channel?: string
          id?: string
          ref_id: string
          sent_at?: string
          type: string
        }
        Update: {
          business_id?: string
          channel?: string
          id?: string
          ref_id?: string
          sent_at?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_log_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          location_id: string | null
          name: string
          promo_code: string | null
          rules: Json
          type: string
          valid_from: string
          valid_to: string | null
          value: number
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          name: string
          promo_code?: string | null
          rules?: Json
          type: string
          valid_from?: string
          valid_to?: string | null
          value: number
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          location_id?: string | null
          name?: string
          promo_code?: string | null
          rules?: Json
          type?: string
          valid_from?: string
          valid_to?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_appointments: {
        Row: {
          business_id: string
          client_id: string
          created_at: string
          employee_id: string | null
          id: string
          is_active: boolean
          location_id: string | null
          next_at: string
          rrule: string
          service_id: string
          until: string | null
        }
        Insert: {
          business_id: string
          client_id: string
          created_at?: string
          employee_id?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          next_at: string
          rrule: string
          service_id: string
          until?: string | null
        }
        Update: {
          business_id?: string
          client_id?: string
          created_at?: string
          employee_id?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          next_at?: string
          rrule?: string
          service_id?: string
          until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_appointments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "recurring_appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_appointments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          applied_at: string
          filename: string
        }
        Insert: {
          applied_at?: string
          filename: string
        }
        Update: {
          applied_at?: string
          filename?: string
        }
        Relationships: []
      }
      service_categories: {
        Row: {
          business_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      service_combos: {
        Row: {
          business_id: string
          created_at: string
          duration_min: number
          id: string
          is_active: boolean
          location_id: string | null
          name: string
          price: number
          service_ids: string[]
        }
        Insert: {
          business_id: string
          created_at?: string
          duration_min: number
          id?: string
          is_active?: boolean
          location_id?: string | null
          name: string
          price: number
          service_ids: string[]
        }
        Update: {
          business_id?: string
          created_at?: string
          duration_min?: number
          id?: string
          is_active?: boolean
          location_id?: string | null
          name?: string
          price?: number
          service_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "service_combos_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_combos_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_combos_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          business_id: string
          capacity: number
          category: string | null
          category_id: string | null
          color: string | null
          cost: number | null
          created_at: string
          description: string | null
          duration_min: number
          id: string
          is_active: boolean
          is_featured: boolean
          location_id: string | null
          name: string
          price: number
        }
        Insert: {
          business_id: string
          capacity?: number
          category?: string | null
          category_id?: string | null
          color?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          duration_min?: number
          id?: string
          is_active?: boolean
          is_featured?: boolean
          location_id?: string | null
          name: string
          price?: number
        }
        Update: {
          business_id?: string
          capacity?: number
          category?: string | null
          category_id?: string | null
          color?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          duration_min?: number
          id?: string
          is_active?: boolean
          is_featured?: boolean
          location_id?: string | null
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      tips: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          employee_id: string
          id: string
          method: string
          transaction_id: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          employee_id: string
          id?: string
          method?: string
          transaction_id: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          method?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tips_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tips_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tips_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tips_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_items: {
        Row: {
          created_at: string
          id: string
          name_snapshot: string
          price_snapshot: number
          qty: number
          service_id: string | null
          transaction_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name_snapshot: string
          price_snapshot: number
          qty: number
          service_id?: string | null
          transaction_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name_snapshot?: string
          price_snapshot?: number
          qty?: number
          service_id?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          appointment_id: string | null
          business_id: string
          client_id: string | null
          created_at: string
          discount_amount: number
          discount_reason: string | null
          employee_id: string | null
          id: string
          items: Json
          location_id: string | null
          loyalty_points_earned: number
          loyalty_points_redeemed: number
          membership_id: string | null
          payment_method: string
          promo_code: string | null
          receipt_number: string | null
          status: string
          tip_amount: number
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          business_id: string
          client_id?: string | null
          created_at?: string
          discount_amount?: number
          discount_reason?: string | null
          employee_id?: string | null
          id?: string
          items?: Json
          location_id?: string | null
          loyalty_points_earned?: number
          loyalty_points_redeemed?: number
          membership_id?: string | null
          payment_method?: string
          promo_code?: string | null
          receipt_number?: string | null
          status?: string
          tip_amount?: number
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          business_id?: string
          client_id?: string | null
          created_at?: string
          discount_amount?: number
          discount_reason?: string | null
          employee_id?: string | null
          id?: string
          items?: Json
          location_id?: string | null
          loyalty_points_earned?: number
          loyalty_points_redeemed?: number
          membership_id?: string | null
          payment_method?: string
          promo_code?: string | null
          receipt_number?: string | null
          status?: string
          tip_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "client_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist: {
        Row: {
          business_id: string
          client_id: string
          created_at: string
          desired_at: string
          employee_id: string | null
          id: string
          location_id: string | null
          notified_at: string | null
          service_id: string
          status: string
        }
        Insert: {
          business_id: string
          client_id: string
          created_at?: string
          desired_at: string
          employee_id?: string | null
          id?: string
          location_id?: string | null
          notified_at?: string | null
          service_id: string
          status?: string
        }
        Update: {
          business_id?: string
          client_id?: string
          created_at?: string
          desired_at?: string
          employee_id?: string | null
          id?: string
          location_id?: string | null
          notified_at?: string | null
          service_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "waitlist_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      businesses_public: {
        Row: {
          address: string | null
          brand_color: string | null
          currency: string | null
          enabled_modules: string[] | null
          id: string | null
          name: string | null
          notification_language: string | null
          phone: string | null
          slug: string | null
          timezone: string | null
          type: string | null
        }
        Insert: {
          address?: string | null
          brand_color?: string | null
          currency?: string | null
          enabled_modules?: string[] | null
          id?: string | null
          name?: string | null
          notification_language?: string | null
          phone?: string | null
          slug?: string | null
          timezone?: string | null
          type?: string | null
        }
        Update: {
          address?: string | null
          brand_color?: string | null
          currency?: string | null
          enabled_modules?: string[] | null
          id?: string | null
          name?: string | null
          notification_language?: string | null
          phone?: string | null
          slug?: string | null
          timezone?: string | null
          type?: string | null
        }
        Relationships: []
      }
      client_stats: {
        Row: {
          business_id: string | null
          client_id: string | null
          last_visit_at: string | null
          total_spent: number | null
          total_visits: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      clients_secure: {
        Row: {
          birthday: string | null
          business_id: string | null
          created_at: string | null
          email: string | null
          email_encrypted: string | null
          email_secure: string | null
          id: string | null
          last_visit_at: string | null
          name: string | null
          notes: string | null
          phone: string | null
          phone_encrypted: string | null
          phone_secure: string | null
          tags: string[] | null
          telegram_id: string | null
          total_spent: number | null
          total_visits: number | null
          viber_user_id: string | null
          whatsapp_encrypted: string | null
          whatsapp_number: string | null
          whatsapp_secure: string | null
        }
        Insert: {
          birthday?: string | null
          business_id?: string | null
          created_at?: string | null
          email?: string | null
          email_encrypted?: string | null
          email_secure?: never
          id?: string | null
          last_visit_at?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          phone_encrypted?: string | null
          phone_secure?: never
          tags?: string[] | null
          telegram_id?: string | null
          total_spent?: number | null
          total_visits?: number | null
          viber_user_id?: string | null
          whatsapp_encrypted?: string | null
          whatsapp_number?: string | null
          whatsapp_secure?: never
        }
        Update: {
          birthday?: string | null
          business_id?: string | null
          created_at?: string | null
          email?: string | null
          email_encrypted?: string | null
          email_secure?: never
          id?: string | null
          last_visit_at?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          phone_encrypted?: string | null
          phone_secure?: never
          tags?: string[] | null
          telegram_id?: string | null
          total_spent?: number | null
          total_visits?: number | null
          viber_user_id?: string | null
          whatsapp_encrypted?: string | null
          whatsapp_number?: string | null
          whatsapp_secure?: never
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_points: {
        Row: {
          business_id: string | null
          client_id: string | null
          last_movement_at: string | null
          total_points: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_movements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "loyalty_movements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_movements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          business_id: string | null
          client_id: string | null
          created_at: string | null
          id: string | null
          points: number | null
          reference: string | null
          type: string | null
        }
        Insert: {
          business_id?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string | null
          points?: number | null
          reference?: string | null
          type?: string | null
        }
        Update: {
          business_id?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string | null
          points?: number | null
          reference?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_movements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_stats"
            referencedColumns: ["client_id"]
          },
          {
            foreignKeyName: "loyalty_movements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_movements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients_secure"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      consume_membership: {
        Args: { p_client_membership_id: string }
        Returns: {
          business_id: string
          client_id: string
          created_at: string
          expires_at: string
          id: string
          membership_id: string
          remaining: number
          starts_at: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "client_memberships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_employee_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      decrypt_pii: { Args: { cipher: string }; Returns: string }
      encrypt_pii: { Args: { plain: string }; Returns: string }
      get_booked_slots:
        | {
            Args: { p_business_id: string; p_date: string }
            Returns: {
              ends_at: string
              starts_at: string
            }[]
          }
        | {
            Args: {
              p_business_id: string
              p_date: string
              p_employee_id?: string
            }
            Returns: {
              ends_at: string
              starts_at: string
            }[]
          }
      get_tx_ids_by_item_name: {
        Args: { p_business_id: string; p_query: string }
        Returns: {
          id: string
        }[]
      }
      loyalty_earn: {
        Args: {
          p_business_id: string
          p_client_id: string
          p_points: number
          p_reference?: string
        }
        Returns: {
          business_id: string
          client_id: string
          points: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "loyalty_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      loyalty_redeem: {
        Args: {
          p_business_id: string
          p_client_id: string
          p_points: number
          p_reference?: string
        }
        Returns: {
          business_id: string
          client_id: string
          points: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "loyalty_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      my_business_ids: { Args: never; Returns: string[] }
      transfer_inventory: {
        Args: {
          p_business_id: string
          p_from_location_id: string
          p_item_id: string
          p_note: string
          p_quantity: number
          p_to_location_id: string
          p_user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

