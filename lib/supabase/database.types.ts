Connecting to db 5432
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      appointments: {
        Row: {
          business_id: string
          client_id: string | null
          created_at: string
          employee_id: string | null
          ends_at: string
          id: string
          notes: string | null
          price: number | null
          service_id: string | null
          source: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          business_id: string
          client_id?: string | null
          created_at?: string
          employee_id?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          price?: number | null
          service_id?: string | null
          source?: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          client_id?: string | null
          created_at?: string
          employee_id?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          price?: number | null
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
            foreignKeyName: "appointments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
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
        ]
      }
      businesses: {
        Row: {
          address: string | null
          brand_color: string | null
          created_at: string
          currency: string
          email: string | null
          email_provider: string | null
          enabled_modules: string[]
          id: string
          logo_url: string | null
          ls_customer_id: string | null
          ls_subscription_id: string | null
          ls_variant_id: string | null
          meta_whatsapp_access_token: string | null
          meta_whatsapp_phone_number_id: string | null
          name: string
          notification_language: string | null
          onboarding_completed: boolean
          owner_id: string
          owner_whatsapp: string | null
          phone: string | null
          plan: string
          plan_expires_at: string | null
          resend_api_key: string | null
          slug: string
          smtp_from: string | null
          smtp_host: string | null
          smtp_pass: string | null
          smtp_port: number | null
          smtp_user: string | null
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
          brand_color?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          email_provider?: string | null
          enabled_modules?: string[]
          id?: string
          logo_url?: string | null
          ls_customer_id?: string | null
          ls_subscription_id?: string | null
          ls_variant_id?: string | null
          meta_whatsapp_access_token?: string | null
          meta_whatsapp_phone_number_id?: string | null
          name: string
          notification_language?: string | null
          onboarding_completed?: boolean
          owner_id: string
          owner_whatsapp?: string | null
          phone?: string | null
          plan?: string
          plan_expires_at?: string | null
          resend_api_key?: string | null
          slug: string
          smtp_from?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
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
          brand_color?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          email_provider?: string | null
          enabled_modules?: string[]
          id?: string
          logo_url?: string | null
          ls_customer_id?: string | null
          ls_subscription_id?: string | null
          ls_variant_id?: string | null
          meta_whatsapp_access_token?: string | null
          meta_whatsapp_phone_number_id?: string | null
          name?: string
          notification_language?: string | null
          onboarding_completed?: boolean
          owner_id?: string
          owner_whatsapp?: string | null
          phone?: string | null
          plan?: string
          plan_expires_at?: string | null
          resend_api_key?: string | null
          slug?: string
          smtp_from?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
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
      clients: {
        Row: {
          birthday: string | null
          business_id: string
          created_at: string
          email: string | null
          id: string
          last_visit_at: string | null
          name: string
          notes: string | null
          phone: string | null
          tags: string[]
          telegram_id: string | null
          total_spent: number
          total_visits: number
          viber_user_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          birthday?: string | null
          business_id: string
          created_at?: string
          email?: string | null
          id?: string
          last_visit_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          tags?: string[]
          telegram_id?: string | null
          total_spent?: number
          total_visits?: number
          viber_user_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          birthday?: string | null
          business_id?: string
          created_at?: string
          email?: string | null
          id?: string
          last_visit_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          tags?: string[]
          telegram_id?: string | null
          total_spent?: number
          total_visits?: number
          viber_user_id?: string | null
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
        