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
      account_change_histories: {
        Row: {
          account_id: string
          changed_at: string
          changed_by: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          account_id: string
          changed_at?: string
          changed_by: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          account_id?: string
          changed_at?: string
          changed_by?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_change_histories_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_change_histories_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      account_contacts: {
        Row: {
          account_id: string
          contact_id: string
          created_at: string
          created_by: string
          id: string
          role: string | null
        }
        Insert: {
          account_id: string
          contact_id: string
          created_at?: string
          created_by?: string
          id?: string
          role?: string | null
        }
        Update: {
          account_id?: string
          contact_id?: string
          created_at?: string
          created_by?: string
          id?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      account_role_types: {
        Row: {
          code: string
          color: string | null
          created_at: string
          created_by: string | null
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          pipeline_type_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          pipeline_type_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          created_by?: string | null
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          pipeline_type_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_role_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_role_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_role_types_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_role_types_pipeline_type_id_fkey"
            columns: ["pipeline_type_id"]
            isOneToOne: false
            referencedRelation: "pipeline_types"
            referencedColumns: ["id"]
          },
        ]
      }
      account_roles: {
        Row: {
          account_id: string
          assigned_by_contract: boolean
          created_at: string
          created_by: string | null
          id: string
          role_type_id: string
        }
        Insert: {
          account_id: string
          assigned_by_contract?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          role_type_id: string
        }
        Update: {
          account_id?: string
          assigned_by_contract?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          role_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_roles_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_roles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_roles_role_type_id_fkey"
            columns: ["role_type_id"]
            isOneToOne: false
            referencedRelation: "account_role_types"
            referencedColumns: ["id"]
          },
        ]
      }
      account_statuses: {
        Row: {
          code: string
          color: string | null
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_statuses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_statuses_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      account_types: {
        Row: {
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_types_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_code: string
          account_status_id: string
          account_type_id: string | null
          company_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          description: string | null
          id: string
          last_updated_by: string | null
          lead_source_id: string | null
          name: string
          owner_user_id: string | null
          status_updated_at: string | null
          updated_at: string
        }
        Insert: {
          account_code?: string
          account_status_id: string
          account_type_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          description?: string | null
          id?: string
          last_updated_by?: string | null
          lead_source_id?: string | null
          name: string
          owner_user_id?: string | null
          status_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          account_code?: string
          account_status_id?: string
          account_type_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          description?: string | null
          id?: string
          last_updated_by?: string | null
          lead_source_id?: string | null
          name?: string
          owner_user_id?: string | null
          status_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_account_status_id_fkey"
            columns: ["account_status_id"]
            isOneToOne: false
            referencedRelation: "account_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_account_type_id_fkey"
            columns: ["account_type_id"]
            isOneToOne: false
            referencedRelation: "account_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_lead_source_id_fkey"
            columns: ["lead_source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_logs: {
        Row: {
          account_id: string | null
          activity_type: string
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          description: string | null
          id: string
          subject: string | null
        }
        Insert: {
          account_id?: string | null
          activity_type: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string
          subject?: string | null
        }
        Update: {
          account_id?: string | null
          activity_type?: string
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          id?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      addresses: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          created_at: string
          created_by: string | null
          id: string
          last_updated_by: string | null
          postal_code: string | null
          prefecture: string | null
          raw_text: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_updated_by?: string | null
          postal_code?: string | null
          prefecture?: string | null
          raw_text?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_updated_by?: string | null
          postal_code?: string | null
          prefecture?: string | null
          raw_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "addresses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "addresses_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          description: string | null
          end_date: string | null
          id: string
          last_updated_by: string | null
          name: string
          start_date: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          start_date?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          start_date?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_code: string
          company_status_id: string
          corporate_number: string | null
          corporate_type_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          fax: string | null
          id: string
          industry_classification_id: string | null
          internal_memo: string | null
          invoice_registered: boolean
          invoice_registration_number: string | null
          last_updated_by: string | null
          lead_source_id: string | null
          name: string
          name_kana: string | null
          owner_user_id: string | null
          phone: string | null
          postal_code: string | null
          prefecture: string | null
          primary_contact_id: string | null
          registration_certificate_url: string | null
          representative_name: string | null
          status_updated_at: string | null
          updated_at: string
          verification_note: string | null
          verification_source: string | null
          verified_at: string | null
          verified_by: string | null
          website_url: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_code?: string
          company_status_id: string
          corporate_number?: string | null
          corporate_type_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          fax?: string | null
          id?: string
          industry_classification_id?: string | null
          internal_memo?: string | null
          invoice_registered?: boolean
          invoice_registration_number?: string | null
          last_updated_by?: string | null
          lead_source_id?: string | null
          name: string
          name_kana?: string | null
          owner_user_id?: string | null
          phone?: string | null
          postal_code?: string | null
          prefecture?: string | null
          primary_contact_id?: string | null
          registration_certificate_url?: string | null
          representative_name?: string | null
          status_updated_at?: string | null
          updated_at?: string
          verification_note?: string | null
          verification_source?: string | null
          verified_at?: string | null
          verified_by?: string | null
          website_url?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_code?: string
          company_status_id?: string
          corporate_number?: string | null
          corporate_type_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          fax?: string | null
          id?: string
          industry_classification_id?: string | null
          internal_memo?: string | null
          invoice_registered?: boolean
          invoice_registration_number?: string | null
          last_updated_by?: string | null
          lead_source_id?: string | null
          name?: string
          name_kana?: string | null
          owner_user_id?: string | null
          phone?: string | null
          postal_code?: string | null
          prefecture?: string | null
          primary_contact_id?: string | null
          registration_certificate_url?: string | null
          representative_name?: string | null
          status_updated_at?: string | null
          updated_at?: string
          verification_note?: string | null
          verification_source?: string | null
          verified_at?: string | null
          verified_by?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_company_status_id_fkey"
            columns: ["company_status_id"]
            isOneToOne: false
            referencedRelation: "company_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_corporate_type_id_fkey"
            columns: ["corporate_type_id"]
            isOneToOne: false
            referencedRelation: "corporate_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_industry_classification_id_fkey"
            columns: ["industry_classification_id"]
            isOneToOne: false
            referencedRelation: "industry_classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_lead_source_id_fkey"
            columns: ["lead_source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_change_histories: {
        Row: {
          changed_at: string
          changed_by: string
          company_id: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          company_id: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          company_id?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_change_histories_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_change_histories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_domains: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          domain: string
          id: string
          is_primary: boolean
          last_updated_by: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          domain: string
          id?: string
          is_primary?: boolean
          last_updated_by?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          domain?: string
          id?: string
          is_primary?: boolean
          last_updated_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_domains_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_domains_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_domains_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_statuses: {
        Row: {
          code: string | null
          color: string | null
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          color?: string | null
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          color?: string | null
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_statuses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_statuses_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      company_verification_logs: {
        Row: {
          checked_at: string
          checked_by: string | null
          company_id: string
          corporate_number: string | null
          detail: Json | null
          id: string
          result: string
          source: string
        }
        Insert: {
          checked_at?: string
          checked_by?: string | null
          company_id: string
          corporate_number?: string | null
          detail?: Json | null
          id?: string
          result: string
          source: string
        }
        Update: {
          checked_at?: string
          checked_by?: string | null
          company_id?: string
          corporate_number?: string | null
          detail?: Json | null
          id?: string
          result?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_verification_logs_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_verification_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      constellation_fortune_telling: {
        Row: {
          boundary_day: number
          characteristics: string | null
          constellation: string
          created_at: string
          element: string
          element_description: string | null
          id: string
          keywords: string | null
          month: number
          nature: string | null
          nature_description: string | null
          sort_number: number
          strengths: string | null
          updated_at: string
          weaknesses: string | null
        }
        Insert: {
          boundary_day: number
          characteristics?: string | null
          constellation: string
          created_at?: string
          element: string
          element_description?: string | null
          id?: string
          keywords?: string | null
          month: number
          nature?: string | null
          nature_description?: string | null
          sort_number: number
          strengths?: string | null
          updated_at?: string
          weaknesses?: string | null
        }
        Update: {
          boundary_day?: number
          characteristics?: string | null
          constellation?: string
          created_at?: string
          element?: string
          element_description?: string | null
          id?: string
          keywords?: string | null
          month?: number
          nature?: string | null
          nature_description?: string | null
          sort_number?: number
          strengths?: string | null
          updated_at?: string
          weaknesses?: string | null
        }
        Relationships: []
      }
      contact_affiliations: {
        Row: {
          company_id: string | null
          company_name_raw: string | null
          contact_id: string
          created_at: string
          created_by: string | null
          department: string | null
          ended_on: string | null
          id: string
          is_current: boolean
          job_title: string | null
          last_updated_by: string | null
          source: string
          source_record_id: string | null
          started_on: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          company_name_raw?: string | null
          contact_id: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          ended_on?: string | null
          id?: string
          is_current?: boolean
          job_title?: string | null
          last_updated_by?: string | null
          source?: string
          source_record_id?: string | null
          started_on?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          company_name_raw?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string | null
          department?: string | null
          ended_on?: string | null
          id?: string
          is_current?: boolean
          job_title?: string | null
          last_updated_by?: string | null
          source?: string
          source_record_id?: string | null
          started_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_affiliations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_affiliations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_affiliations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_affiliations_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_change_histories: {
        Row: {
          changed_at: string
          changed_by: string
          contact_id: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          contact_id: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          contact_id?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_change_histories_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_change_histories_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_emails: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string
          email: string
          id: string
          is_primary: boolean
          label: string
          last_updated_by: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string
          email: string
          id?: string
          is_primary?: boolean
          label?: string
          last_updated_by?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string
          email?: string
          id?: string
          is_primary?: boolean
          label?: string
          last_updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_emails_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_emails_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_phones: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string
          id: string
          is_primary: boolean
          label: string
          last_updated_by: string | null
          phone: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string
          id?: string
          is_primary?: boolean
          label?: string
          last_updated_by?: string | null
          phone: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_primary?: boolean
          label?: string
          last_updated_by?: string | null
          phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_phones_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_phones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_phones_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_statuses: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_statuses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_statuses_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          birth_date: string | null
          blood_type: string | null
          city: string | null
          company_id: string | null
          constellation_id: string | null
          contact_code: string
          contact_status_id: string
          contact_type: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          department: string | null
          first_name: string | null
          first_name_kana: string | null
          id: string
          internal_memo: string | null
          invoice_registered: boolean
          invoice_registration_number: string | null
          job_title: string | null
          last_name: string
          last_name_kana: string | null
          last_updated_by: string | null
          lead_source_id: string | null
          line_user_id: string | null
          middle_name: string | null
          middle_name_kana: string | null
          owner_user_id: string | null
          postal_code: string | null
          potential_number: number | null
          prefecture: string | null
          status_updated_at: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          birth_date?: string | null
          blood_type?: string | null
          city?: string | null
          company_id?: string | null
          constellation_id?: string | null
          contact_code?: string
          contact_status_id: string
          contact_type?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          department?: string | null
          first_name?: string | null
          first_name_kana?: string | null
          id?: string
          internal_memo?: string | null
          invoice_registered?: boolean
          invoice_registration_number?: string | null
          job_title?: string | null
          last_name: string
          last_name_kana?: string | null
          last_updated_by?: string | null
          lead_source_id?: string | null
          line_user_id?: string | null
          middle_name?: string | null
          middle_name_kana?: string | null
          owner_user_id?: string | null
          postal_code?: string | null
          potential_number?: number | null
          prefecture?: string | null
          status_updated_at?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          birth_date?: string | null
          blood_type?: string | null
          city?: string | null
          company_id?: string | null
          constellation_id?: string | null
          contact_code?: string
          contact_status_id?: string
          contact_type?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          department?: string | null
          first_name?: string | null
          first_name_kana?: string | null
          id?: string
          internal_memo?: string | null
          invoice_registered?: boolean
          invoice_registration_number?: string | null
          job_title?: string | null
          last_name?: string
          last_name_kana?: string | null
          last_updated_by?: string | null
          lead_source_id?: string | null
          line_user_id?: string | null
          middle_name?: string | null
          middle_name_kana?: string | null
          owner_user_id?: string | null
          postal_code?: string | null
          potential_number?: number | null
          prefecture?: string | null
          status_updated_at?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_constellation_id_fkey"
            columns: ["constellation_id"]
            isOneToOne: false
            referencedRelation: "constellation_fortune_telling"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_contact_status_id_fkey"
            columns: ["contact_status_id"]
            isOneToOne: false
            referencedRelation: "contact_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_lead_source_id_fkey"
            columns: ["lead_source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_potential_number_fkey"
            columns: ["potential_number"]
            isOneToOne: false
            referencedRelation: "number_diagnosis"
            referencedColumns: ["number"]
          },
        ]
      }
      contract_types: {
        Row: {
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_types_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          auto_renewal: boolean
          cancellation_date: string | null
          contract_code: string
          contract_content: string | null
          contract_method: string | null
          contract_name: string | null
          contract_type_id: string | null
          contract_url: string | null
          counterparty_company_id: string | null
          counterparty_contact_id: string | null
          counterparty_manager_id: string | null
          counterparty_type: string | null
          created_at: string
          created_by: string
          deal_id: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          end_date: string | null
          execution_date: string | null
          id: string
          last_updated_by: string | null
          original_document_url: string | null
          registered_by: string | null
          sent_date: string | null
          signback_date: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          auto_renewal?: boolean
          cancellation_date?: string | null
          contract_code?: string
          contract_content?: string | null
          contract_method?: string | null
          contract_name?: string | null
          contract_type_id?: string | null
          contract_url?: string | null
          counterparty_company_id?: string | null
          counterparty_contact_id?: string | null
          counterparty_manager_id?: string | null
          counterparty_type?: string | null
          created_at?: string
          created_by?: string
          deal_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          end_date?: string | null
          execution_date?: string | null
          id?: string
          last_updated_by?: string | null
          original_document_url?: string | null
          registered_by?: string | null
          sent_date?: string | null
          signback_date?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          auto_renewal?: boolean
          cancellation_date?: string | null
          contract_code?: string
          contract_content?: string | null
          contract_method?: string | null
          contract_name?: string | null
          contract_type_id?: string | null
          contract_url?: string | null
          counterparty_company_id?: string | null
          counterparty_contact_id?: string | null
          counterparty_manager_id?: string | null
          counterparty_type?: string | null
          created_at?: string
          created_by?: string
          deal_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          end_date?: string | null
          execution_date?: string | null
          id?: string
          last_updated_by?: string | null
          original_document_url?: string | null
          registered_by?: string | null
          sent_date?: string | null
          signback_date?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_contract_type_id_fkey"
            columns: ["contract_type_id"]
            isOneToOne: false
            referencedRelation: "contract_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_counterparty_company_id_fkey"
            columns: ["counterparty_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_counterparty_contact_id_fkey"
            columns: ["counterparty_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_counterparty_manager_id_fkey"
            columns: ["counterparty_manager_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_types: {
        Row: {
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "corporate_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corporate_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corporate_types_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          full_name_kana: string | null
          id: string
          is_active: boolean
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          full_name_kana?: string | null
          id: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          full_name_kana?: string | null
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      deal_activities: {
        Row: {
          activity_at: string
          activity_type: string
          contact_id: string | null
          created_at: string
          deal_id: string
          description: string | null
          duration_minutes: number | null
          id: string
          performed_by: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          activity_at: string
          activity_type: string
          contact_id?: string | null
          created_at?: string
          deal_id: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          performed_by: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          activity_at?: string
          activity_type?: string
          contact_id?: string | null
          created_at?: string
          deal_id?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          performed_by?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_activities_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_activity_emails: {
        Row: {
          body: string | null
          created_at: string
          deal_activity_id: string
          id: string
          recipient_email: string | null
          sender_email: string | null
          sender_name: string | null
          summary: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          deal_activity_id: string
          id?: string
          recipient_email?: string | null
          sender_email?: string | null
          sender_name?: string | null
          summary?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          deal_activity_id?: string
          id?: string
          recipient_email?: string | null
          sender_email?: string | null
          sender_name?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_activity_emails_deal_activity_id_fkey"
            columns: ["deal_activity_id"]
            isOneToOne: true
            referencedRelation: "deal_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_change_histories: {
        Row: {
          changed_at: string
          changed_by: string
          deal_id: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          deal_id: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          deal_id?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_change_histories_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_change_histories_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_projects: {
        Row: {
          created_at: string
          created_by: string
          deal_id: string
          id: string
          project_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          deal_id: string
          id?: string
          project_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deal_id?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_projects_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_services: {
        Row: {
          created_at: string
          created_by: string
          deal_id: string
          id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          deal_id: string
          id?: string
          service_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deal_id?: string
          id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_services_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stage_histories: {
        Row: {
          changed_at: string
          changed_by: string
          deal_id: string
          from_stage_id: string | null
          id: string
          reason: string | null
          to_stage_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          deal_id: string
          from_stage_id?: string | null
          id?: string
          reason?: string | null
          to_stage_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          deal_id?: string
          from_stage_id?: string | null
          id?: string
          reason?: string | null
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_stage_histories_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_histories_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_histories_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stage_histories_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_stages: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          current_situation: string | null
          customer_situation: string | null
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          pipeline_type_id: string
          required_action: string | null
          sort_order: number
          transition_condition: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string
          current_situation?: string | null
          customer_situation?: string | null
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          pipeline_type_id: string
          required_action?: string | null
          sort_order?: number
          transition_condition?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          current_situation?: string | null
          customer_situation?: string | null
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          pipeline_type_id?: string
          required_action?: string | null
          sort_order?: number
          transition_condition?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_stages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stages_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_stages_pipeline_type_id_fkey"
            columns: ["pipeline_type_id"]
            isOneToOne: false
            referencedRelation: "pipeline_types"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_status_histories: {
        Row: {
          changed_at: string
          changed_by: string
          deal_id: string
          from_status_id: string | null
          id: string
          reason: string | null
          stage_id: string
          to_status_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          deal_id: string
          from_status_id?: string | null
          id?: string
          reason?: string | null
          stage_id: string
          to_status_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          deal_id?: string
          from_status_id?: string | null
          id?: string
          reason?: string | null
          stage_id?: string
          to_status_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_status_histories_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_status_histories_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_status_histories_from_status_id_fkey"
            columns: ["from_status_id"]
            isOneToOne: false
            referencedRelation: "deal_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_status_histories_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_status_histories_to_status_id_fkey"
            columns: ["to_status_id"]
            isOneToOne: false
            referencedRelation: "deal_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_statuses: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          deal_stage_id: string | null
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          pipeline_type_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string
          deal_stage_id?: string | null
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          pipeline_type_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          deal_stage_id?: string | null
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          pipeline_type_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_statuses_deal_stage_id_fkey"
            columns: ["deal_stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_statuses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_statuses_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_statuses_pipeline_type_id_fkey"
            columns: ["pipeline_type_id"]
            isOneToOne: false
            referencedRelation: "pipeline_types"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          account_id: string | null
          amount: number | null
          application_date: string | null
          closed_at: string | null
          company_id: string | null
          contact_id: string | null
          contract_name: string | null
          created_at: string
          created_by: string
          deal_code: string
          deal_stage_id: string
          deal_status_id: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          expected_close_date: string | null
          id: string
          last_updated_by: string | null
          name: string
          owner_user_id: string | null
          pipeline_type_id: string
          review_completed_date: string | null
          stage_updated_at: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount?: number | null
          application_date?: string | null
          closed_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          contract_name?: string | null
          created_at?: string
          created_by?: string
          deal_code?: string
          deal_stage_id: string
          deal_status_id: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          expected_close_date?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          owner_user_id?: string | null
          pipeline_type_id: string
          review_completed_date?: string | null
          stage_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number | null
          application_date?: string | null
          closed_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          contract_name?: string | null
          created_at?: string
          created_by?: string
          deal_code?: string
          deal_stage_id?: string
          deal_status_id?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          expected_close_date?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          owner_user_id?: string | null
          pipeline_type_id?: string
          review_completed_date?: string | null
          stage_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_deal_stage_id_fkey"
            columns: ["deal_stage_id"]
            isOneToOne: false
            referencedRelation: "deal_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_deal_status_id_fkey"
            columns: ["deal_status_id"]
            isOneToOne: false
            referencedRelation: "deal_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_pipeline_type_id_fkey"
            columns: ["pipeline_type_id"]
            isOneToOne: false
            referencedRelation: "pipeline_types"
            referencedColumns: ["id"]
          },
        ]
      }
      email_contact_candidates: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          display_name: string | null
          email_address: string
          first_seen_at: string
          id: string
          last_seen_at: string
          message_count: number
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          display_name?: string | null
          email_address: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          message_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          display_name?: string | null
          email_address?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          message_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_contact_candidates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_contact_candidates_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_contact_candidates_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_message_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          message_id: string
          role: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          message_id: string
          role: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          message_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_message_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_message_contacts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          cc_emails: string[]
          connection_id: string
          created_at: string
          direction: string
          from_email: string
          from_name: string | null
          gmail_message_id: string
          gmail_thread_id: string
          id: string
          sent_at: string
          subject: string | null
          to_emails: string[]
        }
        Insert: {
          cc_emails?: string[]
          connection_id: string
          created_at?: string
          direction: string
          from_email: string
          from_name?: string | null
          gmail_message_id: string
          gmail_thread_id: string
          id?: string
          sent_at: string
          subject?: string | null
          to_emails?: string[]
        }
        Update: {
          cc_emails?: string[]
          connection_id?: string
          created_at?: string
          direction?: string
          from_email?: string
          from_name?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string
          id?: string
          sent_at?: string
          subject?: string | null
          to_emails?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "gmail_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_change_logs: {
        Row: {
          changed_at: string
          changed_by: string | null
          changed_fields: Json
          id: string
          operation: string
          record_id: string
          table_name: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          changed_fields: Json
          id?: string
          operation: string
          record_id: string
          table_name: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          changed_fields?: Json
          id?: string
          operation?: string
          record_id?: string
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_change_logs_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_info: {
        Row: {
          account_holder: string | null
          account_holder_kana: string | null
          account_number: string | null
          account_type: string | null
          bank_code: string | null
          bank_name: string
          branch_code: string | null
          branch_name: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          is_primary: boolean
          last_updated_by: string | null
          passbook_copy_url: string | null
          updated_at: string
        }
        Insert: {
          account_holder?: string | null
          account_holder_kana?: string | null
          account_number?: string | null
          account_type?: string | null
          bank_code?: string | null
          bank_name: string
          branch_code?: string | null
          branch_name?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          is_primary?: boolean
          last_updated_by?: string | null
          passbook_copy_url?: string | null
          updated_at?: string
        }
        Update: {
          account_holder?: string | null
          account_holder_kana?: string | null
          account_number?: string | null
          account_type?: string | null
          bank_code?: string | null
          bank_name?: string
          branch_code?: string | null
          branch_name?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          is_primary?: boolean
          last_updated_by?: string | null
          passbook_copy_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_info_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_info_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_info_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_info_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_info_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_connections: {
        Row: {
          created_at: string
          crm_user_id: string
          email_address: string
          granted_scope: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_history_id: string | null
          last_synced_at: string | null
          refresh_token_enc: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          crm_user_id: string
          email_address: string
          granted_scope?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_history_id?: string | null
          last_synced_at?: string | null
          refresh_token_enc: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          crm_user_id?: string
          email_address?: string
          granted_scope?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_history_id?: string | null
          last_synced_at?: string | null
          refresh_token_enc?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_connections_crm_user_id_fkey"
            columns: ["crm_user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      industry_classifications: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_updated_by: string | null
          major_code: string
          major_name: string
          middle_code: string | null
          middle_name: string | null
          minor_code: string | null
          minor_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          last_updated_by?: string | null
          major_code: string
          major_name: string
          middle_code?: string | null
          middle_name?: string | null
          minor_code?: string | null
          minor_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_updated_by?: string | null
          major_code?: string
          major_name?: string
          middle_code?: string | null
          middle_name?: string | null
          minor_code?: string | null
          minor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "industry_classifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "industry_classifications_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type_id: string | null
          call_number: number
          call_status_id: string
          called_at_time: string | null
          called_on: string
          caller_user_id: string
          created_at: string
          id: string
          last_edited_at: string | null
          last_edited_by_user_id: string | null
          lead_id: string
          note: string | null
        }
        Insert: {
          activity_type_id?: string | null
          call_number: number
          call_status_id: string
          called_at_time?: string | null
          called_on: string
          caller_user_id: string
          created_at?: string
          id?: string
          last_edited_at?: string | null
          last_edited_by_user_id?: string | null
          lead_id: string
          note?: string | null
        }
        Update: {
          activity_type_id?: string | null
          call_number?: number
          call_status_id?: string
          called_at_time?: string | null
          called_on?: string
          caller_user_id?: string
          created_at?: string
          id?: string
          last_edited_at?: string | null
          last_edited_by_user_id?: string | null
          lead_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "lead_activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_call_status_id_fkey"
            columns: ["call_status_id"]
            isOneToOne: false
            referencedRelation: "lead_call_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_caller_user_id_fkey"
            columns: ["caller_user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_last_edited_by_user_id_fkey"
            columns: ["last_edited_by_user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_with_category"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activity_types: {
        Row: {
          code: string
          color: string | null
          created_at: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_call_statuses: {
        Row: {
          code: string
          color: string | null
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inside_sales_call_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inside_sales_call_statuses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inside_sales_call_statuses_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_campaigns: {
        Row: {
          assigned_at: string
          campaign_id: string
          lead_id: string
        }
        Insert: {
          assigned_at?: string
          campaign_id: string
          lead_id: string
        }
        Update: {
          assigned_at?: string
          campaign_id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_campaigns_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_campaigns_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_campaigns_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_with_category"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_categories: {
        Row: {
          code: string
          color: string | null
          created_at: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_categories_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_company_sizes: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          max_capital: number | null
          max_employees: number | null
          min_capital: number | null
          min_employees: number | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          max_capital?: number | null
          max_employees?: number | null
          min_capital?: number | null
          min_employees?: number | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          max_capital?: number | null
          max_employees?: number | null
          min_capital?: number | null
          min_employees?: number | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_company_sizes_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_customer_activities: {
        Row: {
          activity_type_id: string
          created_at: string
          created_by: string | null
          detail: string | null
          id: string
          last_updated_by: string | null
          lead_id: string
          occurred_at: string
          source: string | null
          updated_at: string
        }
        Insert: {
          activity_type_id: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          last_updated_by?: string | null
          lead_id: string
          occurred_at?: string
          source?: string | null
          updated_at?: string
        }
        Update: {
          activity_type_id?: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          last_updated_by?: string | null
          lead_id?: string
          occurred_at?: string
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_customer_activities_activity_type_id_fkey"
            columns: ["activity_type_id"]
            isOneToOne: false
            referencedRelation: "lead_customer_activity_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_customer_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_customer_activities_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_customer_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_customer_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_with_category"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_customer_activity_types: {
        Row: {
          code: string
          color: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_customer_activity_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_import_batches: {
        Row: {
          created_count: number
          encoding: string
          error_count: number
          file_name: string
          id: string
          imported_at: string
          imported_by: string
          row_count: number
          skipped_count: number
          source_slug: string
          updated_count: number
        }
        Insert: {
          created_count?: number
          encoding: string
          error_count?: number
          file_name: string
          id?: string
          imported_at?: string
          imported_by: string
          row_count: number
          skipped_count?: number
          source_slug: string
          updated_count?: number
        }
        Update: {
          created_count?: number
          encoding?: string
          error_count?: number
          file_name?: string
          id?: string
          imported_at?: string
          imported_by?: string
          row_count?: number
          skipped_count?: number
          source_slug?: string
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_import_batches_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_import_records: {
        Row: {
          batch_id: string
          created_at: string
          error_reason: string | null
          external_key: string | null
          id: string
          lead_id: string | null
          outcome: string
          raw: Json
          row_number: number
        }
        Insert: {
          batch_id: string
          created_at?: string
          error_reason?: string | null
          external_key?: string | null
          id?: string
          lead_id?: string | null
          outcome: string
          raw: Json
          row_number: number
        }
        Update: {
          batch_id?: string
          created_at?: string
          error_reason?: string | null
          external_key?: string | null
          id?: string
          lead_id?: string | null
          outcome?: string
          raw?: Json
          row_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_import_records_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "lead_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_import_records_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_import_records_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_with_category"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_large_segments: {
        Row: {
          code: string
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inside_sales_large_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inside_sales_large_segments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inside_sales_large_segments_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_owners: {
        Row: {
          assigned_at: string
          lead_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          lead_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          lead_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_owners_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_owners_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_with_category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_owners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_score_breakdowns: {
        Row: {
          applied_at: string
          id: string
          lead_id: string
          rule_id: string
          score_delta: number
        }
        Insert: {
          applied_at?: string
          id?: string
          lead_id: string
          rule_id: string
          score_delta: number
        }
        Update: {
          applied_at?: string
          id?: string
          lead_id?: string
          rule_id?: string
          score_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_score_breakdowns_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_score_breakdowns_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads_with_category"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_score_breakdowns_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "lead_score_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_score_rules: {
        Row: {
          category: string
          condition_type: string
          condition_value_id: string | null
          condition_value_text: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          score_delta: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          category: string
          condition_type: string
          condition_value_id?: string | null
          condition_value_text?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          score_delta: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          condition_type?: string
          condition_value_id?: string | null
          condition_value_text?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          score_delta?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_score_rules_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_score_thresholds: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          max_score: number | null
          min_score: number
          sort_order: number
          temperature_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          max_score?: number | null
          min_score: number
          sort_order?: number
          temperature_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          max_score?: number | null
          min_score?: number
          sort_order?: number
          temperature_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_scoring_rules_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_scoring_rules_temperature_id_fkey"
            columns: ["temperature_id"]
            isOneToOne: false
            referencedRelation: "lead_temperatures"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_small_segments: {
        Row: {
          code: string
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          large_segment_id: string
          last_updated_by: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          large_segment_id: string
          last_updated_by?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          large_segment_id?: string
          last_updated_by?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inside_sales_small_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inside_sales_small_segments_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inside_sales_small_segments_large_segment_id_fkey"
            columns: ["large_segment_id"]
            isOneToOne: false
            referencedRelation: "lead_large_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inside_sales_small_segments_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sources_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_sources_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_stages: {
        Row: {
          auto_promote_to_deal: boolean
          color: string | null
          created_at: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          is_terminal: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          auto_promote_to_deal?: boolean
          color?: string | null
          created_at?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          is_terminal?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          auto_promote_to_deal?: boolean
          color?: string | null
          created_at?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          is_terminal?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_stages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_statuses: {
        Row: {
          code: string
          color: string | null
          created_at: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          name: string
          sort_order: number
          stage_id: string
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          name: string
          sort_order?: number
          stage_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          name?: string
          sort_order?: number
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_statuses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_statuses_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "lead_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_temperatures: {
        Row: {
          code: string
          color: string | null
          created_at: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_temperatures_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          account_type_id: string | null
          address_id: string | null
          capital: number | null
          category_id: string | null
          company_id: string | null
          company_name: string | null
          company_name_kana: string | null
          company_phone: string | null
          company_size_id: string | null
          contact_department: string | null
          contact_email: string | null
          contact_first_name: string | null
          contact_first_name_kana: string | null
          contact_id: string | null
          contact_job_title: string | null
          contact_last_name: string | null
          contact_last_name_kana: string | null
          contact_middle_name: string | null
          contact_middle_name_kana: string | null
          contact_phone: string | null
          corporate_number: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          employee_count: number | null
          id: string
          large_segment_id: string | null
          last_updated_by: string | null
          lead_name: string
          lead_source_id: string | null
          owner_user_id: string
          promoted_account_id: string | null
          promoted_company_id: string | null
          promoted_contact_id: string | null
          promoted_deal_id: string | null
          representative_name: string | null
          score: number | null
          small_segment_id: string | null
          source_external_key: string | null
          stage_id: string
          status_id: string | null
          temperature_id: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          account_type_id?: string | null
          address_id?: string | null
          capital?: number | null
          category_id?: string | null
          company_id?: string | null
          company_name?: string | null
          company_name_kana?: string | null
          company_phone?: string | null
          company_size_id?: string | null
          contact_department?: string | null
          contact_email?: string | null
          contact_first_name?: string | null
          contact_first_name_kana?: string | null
          contact_id?: string | null
          contact_job_title?: string | null
          contact_last_name?: string | null
          contact_last_name_kana?: string | null
          contact_middle_name?: string | null
          contact_middle_name_kana?: string | null
          contact_phone?: string | null
          corporate_number?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          employee_count?: number | null
          id?: string
          large_segment_id?: string | null
          last_updated_by?: string | null
          lead_name: string
          lead_source_id?: string | null
          owner_user_id: string
          promoted_account_id?: string | null
          promoted_company_id?: string | null
          promoted_contact_id?: string | null
          promoted_deal_id?: string | null
          representative_name?: string | null
          score?: number | null
          small_segment_id?: string | null
          source_external_key?: string | null
          stage_id: string
          status_id?: string | null
          temperature_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          account_type_id?: string | null
          address_id?: string | null
          capital?: number | null
          category_id?: string | null
          company_id?: string | null
          company_name?: string | null
          company_name_kana?: string | null
          company_phone?: string | null
          company_size_id?: string | null
          contact_department?: string | null
          contact_email?: string | null
          contact_first_name?: string | null
          contact_first_name_kana?: string | null
          contact_id?: string | null
          contact_job_title?: string | null
          contact_last_name?: string | null
          contact_last_name_kana?: string | null
          contact_middle_name?: string | null
          contact_middle_name_kana?: string | null
          contact_phone?: string | null
          corporate_number?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          employee_count?: number | null
          id?: string
          large_segment_id?: string | null
          last_updated_by?: string | null
          lead_name?: string
          lead_source_id?: string | null
          owner_user_id?: string
          promoted_account_id?: string | null
          promoted_company_id?: string | null
          promoted_contact_id?: string | null
          promoted_deal_id?: string | null
          representative_name?: string | null
          score?: number | null
          small_segment_id?: string | null
          source_external_key?: string | null
          stage_id?: string
          status_id?: string | null
          temperature_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_account_type_id_fkey"
            columns: ["account_type_id"]
            isOneToOne: false
            referencedRelation: "account_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "lead_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_size_id_fkey"
            columns: ["company_size_id"]
            isOneToOne: false
            referencedRelation: "lead_company_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_large_segment_id_fkey"
            columns: ["large_segment_id"]
            isOneToOne: false
            referencedRelation: "lead_large_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_lead_source_id_fkey"
            columns: ["lead_source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_promoted_account_id_fkey"
            columns: ["promoted_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_promoted_company_id_fkey"
            columns: ["promoted_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_promoted_contact_id_fkey"
            columns: ["promoted_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_promoted_deal_id_fkey"
            columns: ["promoted_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_small_segment_id_fkey"
            columns: ["small_segment_id"]
            isOneToOne: false
            referencedRelation: "lead_small_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "lead_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "lead_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_temperature_id_fkey"
            columns: ["temperature_id"]
            isOneToOne: false
            referencedRelation: "lead_temperatures"
            referencedColumns: ["id"]
          },
        ]
      }
      number_diagnosis: {
        Row: {
          animal: string | null
          animal_no: number | null
          axis: string | null
          brain_characteristics: string | null
          center: string | null
          character: string | null
          character_image_url: string | null
          circulation: string | null
          classification_no: number | null
          count: number | null
          created_at: string
          dominant_brain: string | null
          frequency: string | null
          id: string
          judgment_criteria: string | null
          number: number
          orientation: string | null
          outlook: string | null
          potential: string | null
          priority: string | null
          rhythm: string | null
          rhythm_no: number | null
          strengths: string | null
          strong_area: string | null
          three_classification: string | null
          type: string | null
          updated_at: string
          weaknesses: string | null
        }
        Insert: {
          animal?: string | null
          animal_no?: number | null
          axis?: string | null
          brain_characteristics?: string | null
          center?: string | null
          character?: string | null
          character_image_url?: string | null
          circulation?: string | null
          classification_no?: number | null
          count?: number | null
          created_at?: string
          dominant_brain?: string | null
          frequency?: string | null
          id?: string
          judgment_criteria?: string | null
          number: number
          orientation?: string | null
          outlook?: string | null
          potential?: string | null
          priority?: string | null
          rhythm?: string | null
          rhythm_no?: number | null
          strengths?: string | null
          strong_area?: string | null
          three_classification?: string | null
          type?: string | null
          updated_at?: string
          weaknesses?: string | null
        }
        Update: {
          animal?: string | null
          animal_no?: number | null
          axis?: string | null
          brain_characteristics?: string | null
          center?: string | null
          character?: string | null
          character_image_url?: string | null
          circulation?: string | null
          classification_no?: number | null
          count?: number | null
          created_at?: string
          dominant_brain?: string | null
          frequency?: string | null
          id?: string
          judgment_criteria?: string | null
          number?: number
          orientation?: string | null
          outlook?: string | null
          potential?: string | null
          priority?: string | null
          rhythm?: string | null
          rhythm_no?: number | null
          strengths?: string | null
          strong_area?: string | null
          three_classification?: string | null
          type?: string | null
          updated_at?: string
          weaknesses?: string | null
        }
        Relationships: []
      }
      other_addresses: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          fax: string | null
          id: string
          label: string | null
          last_updated_by: string | null
          memo: string | null
          phone: string | null
          postal_code: string | null
          prefecture: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          fax?: string | null
          id?: string
          label?: string | null
          last_updated_by?: string | null
          memo?: string | null
          phone?: string | null
          postal_code?: string | null
          prefecture?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          fax?: string | null
          id?: string
          label?: string | null
          last_updated_by?: string | null
          memo?: string | null
          phone?: string | null
          postal_code?: string | null
          prefecture?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "other_addresses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_addresses_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_addresses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_addresses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "other_addresses_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_types: {
        Row: {
          created_at: string
          created_by: string
          default_close_months: number | null
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          default_close_months?: number | null
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          default_close_months?: number | null
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_types_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_types_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_types_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_change_histories: {
        Row: {
          changed_at: string
          changed_by: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          project_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_change_histories_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_change_histories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          created_by: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_statuses: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_statuses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_statuses_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_statuses_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          description: string | null
          end_date: string | null
          id: string
          internal_memo: string | null
          is_active: boolean
          last_updated_by: string | null
          name: string
          owner_user_id: string | null
          project_code: string
          project_status_id: string
          start_date: string | null
          status_updated_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          internal_memo?: string | null
          is_active?: boolean
          last_updated_by?: string | null
          name: string
          owner_user_id?: string | null
          project_code?: string
          project_status_id: string
          start_date?: string | null
          status_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          internal_memo?: string | null
          is_active?: boolean
          last_updated_by?: string | null
          name?: string
          owner_user_id?: string | null
          project_code?: string
          project_status_id?: string
          start_date?: string | null
          status_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_project_status_id_fkey"
            columns: ["project_status_id"]
            isOneToOne: false
            referencedRelation: "project_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_categories: {
        Row: {
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skill_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_categories_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skill_categories_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          axis: string | null
          created_at: string
          created_by: string
          definition: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          name: string
          note: string | null
          skill_category_id: string
          skill_code: string | null
          sort_order: number
          system_tags: string[]
          updated_at: string
        }
        Insert: {
          axis?: string | null
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name: string
          note?: string | null
          skill_category_id: string
          skill_code?: string | null
          sort_order?: number
          system_tags?: string[]
          updated_at?: string
        }
        Update: {
          axis?: string | null
          created_at?: string
          created_by?: string
          definition?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          name?: string
          note?: string | null
          skill_category_id?: string
          skill_code?: string | null
          sort_order?: number
          system_tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skills_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skills_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "skills_skill_category_id_fkey"
            columns: ["skill_category_id"]
            isOneToOne: false
            referencedRelation: "skill_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_achievements: {
        Row: {
          achieved_at: string | null
          achievement_code: string
          created_at: string
          id: string
          note: string | null
          talent_id: string
          updated_at: string
        }
        Insert: {
          achieved_at?: string | null
          achievement_code: string
          created_at?: string
          id?: string
          note?: string | null
          talent_id: string
          updated_at?: string
        }
        Update: {
          achieved_at?: string | null
          achievement_code?: string
          created_at?: string
          id?: string
          note?: string | null
          talent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_achievements_achievement_code_fkey"
            columns: ["achievement_code"]
            isOneToOne: false
            referencedRelation: "talent_achievements_master"
            referencedColumns: ["achievement_code"]
          },
          {
            foreignKeyName: "talent_achievements_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_achievements_master: {
        Row: {
          achievement_code: string
          created_at: string
          criteria: string | null
          id: string
          name: string
          quantitative_threshold: Json | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          achievement_code: string
          created_at?: string
          criteria?: string | null
          id?: string
          name: string
          quantitative_threshold?: Json | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          achievement_code?: string
          created_at?: string
          criteria?: string | null
          id?: string
          name?: string
          quantitative_threshold?: Json | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      talent_careers: {
        Row: {
          career_type: string
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          id: string
          is_current: boolean
          last_updated_by: string | null
          organization: string
          sort_order: number
          start_date: string | null
          talent_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          career_type: string
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean
          last_updated_by?: string | null
          organization: string
          sort_order?: number
          start_date?: string | null
          talent_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          career_type?: string
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          id?: string
          is_current?: boolean
          last_updated_by?: string | null
          organization?: string
          sort_order?: number
          start_date?: string | null
          talent_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_careers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_careers_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_careers_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_change_histories: {
        Row: {
          changed_at: string
          changed_by: string
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          talent_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          talent_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          talent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_change_histories_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_change_histories_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_grade_requirements: {
        Row: {
          created_at: string
          grade_code: string
          id: string
          required_achievements: string[]
          skill_thresholds: Json
          sort_order: number
          system_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grade_code: string
          id?: string
          required_achievements?: string[]
          skill_thresholds: Json
          sort_order?: number
          system_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grade_code?: string
          id?: string
          required_achievements?: string[]
          skill_thresholds?: Json
          sort_order?: number
          system_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      talent_grades: {
        Row: {
          band: string
          created_at: string
          evaluation_points: string | null
          expected_role: string | null
          grade_code: string
          id: string
          sort_order: number
          updated_at: string
          years_max: number | null
          years_min: number | null
        }
        Insert: {
          band: string
          created_at?: string
          evaluation_points?: string | null
          expected_role?: string | null
          grade_code: string
          id?: string
          sort_order: number
          updated_at?: string
          years_max?: number | null
          years_min?: number | null
        }
        Update: {
          band?: string
          created_at?: string
          evaluation_points?: string | null
          expected_role?: string | null
          grade_code?: string
          id?: string
          sort_order?: number
          updated_at?: string
          years_max?: number | null
          years_min?: number | null
        }
        Relationships: []
      }
      talent_job_types: {
        Row: {
          category: string | null
          created_at: string
          id: string
          job_type_code: string
          name: string
          rules: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          job_type_code: string
          name: string
          rules: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          job_type_code?: string
          name?: string
          rules?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      talent_skills: {
        Row: {
          created_at: string
          created_by: string
          id: string
          last_updated_by: string | null
          note: string | null
          proficiency_level: number
          skill_id: string
          talent_id: string
          updated_at: string
          years_experience: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          last_updated_by?: string | null
          note?: string | null
          proficiency_level?: number
          skill_id: string
          talent_id: string
          updated_at?: string
          years_experience?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          last_updated_by?: string | null
          note?: string | null
          proficiency_level?: number
          skill_id?: string
          talent_id?: string
          updated_at?: string
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_skills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_skills_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_skills_talent_id_fkey"
            columns: ["talent_id"]
            isOneToOne: false
            referencedRelation: "talents"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_system_tags: {
        Row: {
          created_at: string
          definition: string | null
          determination_rule: Json
          id: string
          name: string
          sort_order: number
          system_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          definition?: string | null
          determination_rule: Json
          id?: string
          name: string
          sort_order?: number
          system_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          definition?: string | null
          determination_rule?: Json
          id?: string
          name?: string
          sort_order?: number
          system_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      talents: {
        Row: {
          aptitude_notes: string | null
          contact_id: string
          created_at: string
          created_by: string
          custom_strengths: string | null
          custom_weaknesses: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          id: string
          last_updated_by: string | null
          overall_assessment: string | null
          personality_memo: string | null
          updated_at: string
        }
        Insert: {
          aptitude_notes?: string | null
          contact_id: string
          created_at?: string
          created_by?: string
          custom_strengths?: string | null
          custom_weaknesses?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          overall_assessment?: string | null
          personality_memo?: string | null
          updated_at?: string
        }
        Update: {
          aptitude_notes?: string | null
          contact_id?: string
          created_at?: string
          created_by?: string
          custom_strengths?: string | null
          custom_weaknesses?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deletion_reason?: string | null
          id?: string
          last_updated_by?: string | null
          overall_assessment?: string | null
          personality_memo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talents_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talents_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      activity_feed: {
        Row: {
          activity_color: string | null
          activity_name: string | null
          actor_name: string | null
          detail: string | null
          entity_id: string | null
          entity_label: string | null
          entity_type: string | null
          has_time: boolean | null
          id: string | null
          occurred_at: string | null
          outcome_color: string | null
          outcome_name: string | null
          owner_user_id: string | null
          source_kind: string | null
        }
        Relationships: []
      }
      v_leads_with_category: {
        Row: {
          account_type_id: string | null
          auto_promote_to_deal: boolean | null
          capital: number | null
          category_code: string | null
          category_color: string | null
          category_id: string | null
          category_name: string | null
          company_id: string | null
          company_name: string | null
          company_name_kana: string | null
          company_phone: string | null
          company_size_id: string | null
          contact_department: string | null
          contact_email: string | null
          contact_first_name: string | null
          contact_first_name_kana: string | null
          contact_id: string | null
          contact_job_title: string | null
          contact_last_name: string | null
          contact_last_name_kana: string | null
          contact_middle_name: string | null
          contact_middle_name_kana: string | null
          contact_phone: string | null
          corporate_number: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deletion_reason: string | null
          employee_count: number | null
          id: string | null
          is_terminal: boolean | null
          large_segment_id: string | null
          last_updated_by: string | null
          lead_name: string | null
          lead_source_id: string | null
          owner_user_id: string | null
          promoted_account_id: string | null
          promoted_company_id: string | null
          promoted_contact_id: string | null
          promoted_deal_id: string | null
          representative_name: string | null
          score: number | null
          small_segment_id: string | null
          stage_id: string | null
          stage_name: string | null
          stage_slug: string | null
          status_code: string | null
          status_id: string | null
          status_name: string | null
          temperature_code: string | null
          temperature_color: string | null
          temperature_id: string | null
          temperature_name: string | null
          updated_at: string | null
          url: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_account_type_id_fkey"
            columns: ["account_type_id"]
            isOneToOne: false
            referencedRelation: "account_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "lead_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_company_size_id_fkey"
            columns: ["company_size_id"]
            isOneToOne: false
            referencedRelation: "lead_company_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_large_segment_id_fkey"
            columns: ["large_segment_id"]
            isOneToOne: false
            referencedRelation: "lead_large_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_lead_source_id_fkey"
            columns: ["lead_source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "crm_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_promoted_account_id_fkey"
            columns: ["promoted_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_promoted_company_id_fkey"
            columns: ["promoted_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_promoted_contact_id_fkey"
            columns: ["promoted_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_promoted_deal_id_fkey"
            columns: ["promoted_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_small_segment_id_fkey"
            columns: ["small_segment_id"]
            isOneToOne: false
            referencedRelation: "lead_small_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "lead_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "lead_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_temperature_id_fkey"
            columns: ["temperature_id"]
            isOneToOne: false
            referencedRelation: "lead_temperatures"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_contact_affiliation: {
        Args: {
          p_actor?: string
          p_company_id: string
          p_company_name_raw: string
          p_contact_id: string
          p_department: string
          p_exchanged_on: string
          p_job_title: string
          p_source?: string
          p_source_record_id?: string
        }
        Returns: string
      }
      apply_default_status_colors: { Args: never; Returns: undefined }
      approve_email_contact_candidate: {
        Args: {
          p_candidate_id: string
          p_company_id?: string
          p_first_name?: string
          p_last_name: string
          p_owner_user_id?: string
        }
        Returns: string
      }
      find_contact_by_email: { Args: { p_email: string }; Returns: string }
      get_user_role: { Args: never; Returns: string }
      import_eight_leads: {
        Args: { p_batch: Json; p_defaults: Json; p_errors: Json; p_leads: Json }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      is_deal_accessible: { Args: { p_deal_id: string }; Returns: boolean }
      is_free_email_domain: { Args: { p_domain: string }; Returns: boolean }
      is_lead_accessible: { Args: { p_lead_id: string }; Returns: boolean }
      is_manager_or_above: { Args: never; Returns: boolean }
      is_mobile_phone: { Args: { p_phone: string }; Returns: boolean }
      normalize_company_name: { Args: { p_name: string }; Returns: string }
      normalize_domain: { Args: { p_input: string }; Returns: string }
      promote_lead_to_deal: {
        Args: {
          p_account: Json
          p_company: Json
          p_contact: Json
          p_contact_email: string
          p_contact_phone: string
          p_deal: Json
          p_lead_id: string
        }
        Returns: Json
      }
      purge_soft_deleted_records: { Args: never; Returns: undefined }
      recalculate_all_lead_scores: { Args: never; Returns: number }
      recalculate_lead_score: { Args: { p_lead_id: string }; Returns: number }
      record_email_message: {
        Args: {
          p_cc_emails?: string[]
          p_connection_id: string
          p_direction: string
          p_from_email: string
          p_from_name?: string
          p_gmail_message_id: string
          p_gmail_thread_id: string
          p_participants?: Json
          p_sent_at: string
          p_subject: string
          p_to_emails?: string[]
        }
        Returns: string
      }
      resolve_lead_company_size: {
        Args: { p_capital: number; p_employee_count: number }
        Returns: string
      }
      resolve_or_create_company: {
        Args: {
          p_actor: string
          p_company_name: string
          p_email: string
          p_lead_source_id: string
          p_owner_user_id: string
          p_phone: string
          p_url: string
        }
        Returns: string
      }
      resolve_or_create_contact: {
        Args: {
          p_actor: string
          p_company_id: string
          p_department: string
          p_email: string
          p_first_name: string
          p_job_title: string
          p_last_name: string
          p_lead_source_id: string
          p_owner_user_id: string
          p_phone: string
        }
        Returns: string
      }
      sync_contact_current_affiliation: {
        Args: { p_contact_id: string }
        Returns: undefined
      }
      upsert_company_domain: {
        Args: { p_company_id: string; p_input: string; p_is_primary?: boolean }
        Returns: {
          company_id: string
          created_at: string
          created_by: string | null
          domain: string
          id: string
          is_primary: boolean
          last_updated_by: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "company_domains"
          isOneToOne: true
          isSetofReturn: false
        }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

