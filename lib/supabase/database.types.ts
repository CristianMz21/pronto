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
          allow_guest_bookings: boolean
          booking_lead_time_enabled: boolean
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
          min_advance_minutes: number
          name: string
          notification_language: string | null
          onboarding_completed: boolean
          owner_id: string
          owner_whatsapp: string | null
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
          min_advance_minutes?: number
          name: string
          notification_language?: string | null
          onboarding_completed?: boolean
          owner_id: string
          owner_whatsapp?: string | null
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
          min_advance_minutes?: number
          name?: string
          notification_language?: string | null
          onboarding_completed?: boolean
          owner_id?: string
          owner_whatsapp?: string | null
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
        ]
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
          user_id: string | null
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
          user_id?: string | null
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
          user_id?: string | null
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
        ]
      }
      inventory_movements: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          note: string | null
          quantity: number
          type: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          note?: string | null
          quantity: number
          type: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          note?: string | null
          quantity?: number
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
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
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
        ]
      }
      services: {
        Row: {
          business_id: string
          capacity: number
          category: string | null
          color: string | null
          cost: number | null
          created_at: string
          description: string | null
          duration_min: number
          id: string
          is_active: boolean
          is_featured: boolean
          name: string
          price: number
        }
        Insert: {
          business_id: string
          capacity?: number
          category?: string | null
          color?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          duration_min?: number
          id?: string
          is_active?: boolean
          is_featured?: boolean
          name: string
          price?: number
        }
        Update: {
          business_id?: string
          capacity?: number
          category?: string | null
          color?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          duration_min?: number
          id?: string
          is_active?: boolean
          is_featured?: boolean
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
        ]
      }
      transactions: {
        Row: {
          amount: number
          appointment_id: string | null
          business_id: string
          client_id: string | null
          created_at: string
          employee_id: string | null
          id: string
          items: Json
          payment_method: string
          receipt_number: string | null
          status: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          business_id: string
          client_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          items?: Json
          payment_method?: string
          receipt_number?: string | null
          status?: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          business_id?: string
          client_id?: string | null
          created_at?: string
          employee_id?: string | null
          id?: string
          items?: Json
          payment_method?: string
          receipt_number?: string | null
          status?: string
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
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      my_business_ids: { Args: never; Returns: string[] }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

