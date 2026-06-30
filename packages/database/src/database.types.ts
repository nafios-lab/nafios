export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      account: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          type: Database["public"]["Enums"]["account_type"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          type: Database["public"]["Enums"]["account_type"];
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          type?: Database["public"]["Enums"]["account_type"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      category: {
        Row: {
          color: string | null;
          created_at: string;
          display_order: number;
          id: string;
          name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          display_order?: number;
          id?: string;
          name: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          display_order?: number;
          id?: string;
          name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      family_members: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          created_by: string | null;
          date_of_birth: string | null;
          deleted_at: string | null;
          id: string;
          mobile_no: string | null;
          name: string;
          nric: string | null;
          profile_id: string;
          relationship: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          date_of_birth?: string | null;
          deleted_at?: string | null;
          id?: string;
          mobile_no?: string | null;
          name: string;
          nric?: string | null;
          profile_id: string;
          relationship: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          date_of_birth?: string | null;
          deleted_at?: string | null;
          id?: string;
          mobile_no?: string | null;
          name?: string;
          nric?: string | null;
          profile_id?: string;
          relationship?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "family_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      monthly_ledger: {
        Row: {
          created_at: string;
          id: string;
          max_capped: number;
          month: string;
          opening_balance: number;
          settled_at: string | null;
          status: Database["public"]["Enums"]["ledger_status"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          max_capped: number;
          month: string;
          opening_balance: number;
          settled_at?: string | null;
          status?: Database["public"]["Enums"]["ledger_status"];
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          max_capped?: number;
          month?: string;
          opening_balance?: number;
          settled_at?: string | null;
          status?: Database["public"]["Enums"]["ledger_status"];
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          id: string;
          onboarding_completed_at: string | null;
          updated_at: string;
          updated_by: string | null;
          username: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          id: string;
          onboarding_completed_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          username?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          id?: string;
          onboarding_completed_at?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          username?: string | null;
        };
        Relationships: [];
      };
      template: {
        Row: {
          archived: boolean | null;
          category_id: string;
          created_at: string;
          default_amount: number;
          default_linked_member_id: string | null;
          default_payment_source_id: string | null;
          default_remark: string | null;
          end_month: string | null;
          id: string;
          item: string;
          last_used_month: string | null;
          next_due_month: string | null;
          sort_order: number | null;
          status: Database["public"]["Enums"]["recurring_template_status"] | null;
          termination_reason: string | null;
          type: Database["public"]["Enums"]["template_type"];
          updated_at: string;
          usage_count: number | null;
          user_id: string;
        };
        Insert: {
          archived?: boolean | null;
          category_id: string;
          created_at?: string;
          default_amount: number;
          default_linked_member_id?: string | null;
          default_payment_source_id?: string | null;
          default_remark?: string | null;
          end_month?: string | null;
          id?: string;
          item: string;
          last_used_month?: string | null;
          next_due_month?: string | null;
          sort_order?: number | null;
          status?: Database["public"]["Enums"]["recurring_template_status"] | null;
          termination_reason?: string | null;
          type: Database["public"]["Enums"]["template_type"];
          updated_at?: string;
          usage_count?: number | null;
          user_id?: string;
        };
        Update: {
          archived?: boolean | null;
          category_id?: string;
          created_at?: string;
          default_amount?: number;
          default_linked_member_id?: string | null;
          default_payment_source_id?: string | null;
          default_remark?: string | null;
          end_month?: string | null;
          id?: string;
          item?: string;
          last_used_month?: string | null;
          next_due_month?: string | null;
          sort_order?: number | null;
          status?: Database["public"]["Enums"]["recurring_template_status"] | null;
          termination_reason?: string | null;
          type?: Database["public"]["Enums"]["template_type"];
          updated_at?: string;
          usage_count?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "template_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "category";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "template_default_linked_member_id_fkey";
            columns: ["default_linked_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "template_default_payment_source_id_fkey";
            columns: ["default_payment_source_id"];
            isOneToOne: false;
            referencedRelation: "account";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      insert_user_profile: {
        Args: {
          p_avatar_url?: string;
          p_family_members?: Json;
          p_username?: string;
        };
        Returns: undefined;
      };
      save_onboarding_profile: {
        Args: { p_avatar_url?: string };
        Returns: undefined;
      };
    };
    Enums: {
      account_type: "bank" | "cash" | "other";
      ledger_status: "ongoing" | "reconciling" | "settled";
      recurring_template_status: "active" | "pending_reconciliation" | "completed" | "terminated";
      template_type: "recurring" | "adhoc";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: ["bank", "cash", "other"],
      ledger_status: ["ongoing", "reconciling", "settled"],
      recurring_template_status: ["active", "pending_reconciliation", "completed", "terminated"],
      template_type: ["recurring", "adhoc"],
    },
  },
} as const;
