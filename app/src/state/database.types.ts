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
      angle_presets: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          scope: string
          search: unknown
          tags: string[]
          thumbnail_path: string | null
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          owner_id: string
          scope: string
          search?: unknown
          tags?: string[]
          thumbnail_path?: string | null
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string
          scope?: string
          search?: unknown
          tags?: string[]
          thumbnail_path?: string | null
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      assets: {
        Row: {
          bucket: string
          byte_size: number
          checksum: string | null
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["asset_kind"]
          mime_type: string
          original_name: string | null
          owner_id: string
          project_id: string | null
          storage_path: string
          width: number | null
        }
        Insert: {
          bucket?: string
          byte_size: number
          checksum?: string | null
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind: Database["public"]["Enums"]["asset_kind"]
          mime_type: string
          original_name?: string | null
          owner_id: string
          project_id?: string | null
          storage_path: string
          width?: number | null
        }
        Update: {
          bucket?: string
          byte_size?: number
          checksum?: string | null
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["asset_kind"]
          mime_type?: string
          original_name?: string | null
          owner_id?: string
          project_id?: string | null
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          id: string
          stripe_customer_id: string | null
        }
        Insert: {
          id: string
          stripe_customer_id?: string | null
        }
        Update: {
          id?: string
          stripe_customer_id?: string | null
        }
        Relationships: []
      }
      exports: {
        Row: {
          byte_size: number | null
          created_at: string
          duration_seconds: number | null
          error: string | null
          format: Database["public"]["Enums"]["export_format"]
          fps: number | null
          height: number
          id: string
          owner_id: string
          project_id: string | null
          status: Database["public"]["Enums"]["export_status"]
          storage_path: string | null
          transparent: boolean
          width: number
        }
        Insert: {
          byte_size?: number | null
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          format: Database["public"]["Enums"]["export_format"]
          fps?: number | null
          height: number
          id?: string
          owner_id: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["export_status"]
          storage_path?: string | null
          transparent?: boolean
          width: number
        }
        Update: {
          byte_size?: number | null
          created_at?: string
          duration_seconds?: number | null
          error?: string | null
          format?: Database["public"]["Enums"]["export_format"]
          fps?: number | null
          height?: number
          id?: string
          owner_id?: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["export_status"]
          storage_path?: string | null
          transparent?: boolean
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_limits: {
        Row: {
          feature: string
          limit_value: number | null
          plan_key: string
        }
        Insert: {
          feature: string
          limit_value?: number | null
          plan_key: string
        }
        Update: {
          feature?: string
          limit_value?: number | null
          plan_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_limits_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["key"]
          },
        ]
      }
      plans: {
        Row: {
          key: string
          name: string
          rank: number
          stripe_product_id: string | null
        }
        Insert: {
          key: string
          name: string
          rank: number
          stripe_product_id?: string | null
        }
        Update: {
          key?: string
          name?: string
          rank?: number
          stripe_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_stripe_product_id_fkey"
            columns: ["stripe_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          active: boolean | null
          currency: string | null
          description: string | null
          id: string
          interval: Database["public"]["Enums"]["pricing_interval"] | null
          interval_count: number | null
          metadata: Json | null
          product_id: string | null
          trial_period_days: number | null
          type: Database["public"]["Enums"]["pricing_type"] | null
          unit_amount: number | null
        }
        Insert: {
          active?: boolean | null
          currency?: string | null
          description?: string | null
          id: string
          interval?: Database["public"]["Enums"]["pricing_interval"] | null
          interval_count?: number | null
          metadata?: Json | null
          product_id?: string | null
          trial_period_days?: number | null
          type?: Database["public"]["Enums"]["pricing_type"] | null
          unit_amount?: number | null
        }
        Update: {
          active?: boolean | null
          currency?: string | null
          description?: string | null
          id?: string
          interval?: Database["public"]["Enums"]["pricing_interval"] | null
          interval_count?: number | null
          metadata?: Json | null
          product_id?: string | null
          trial_period_days?: number | null
          type?: Database["public"]["Enums"]["pricing_type"] | null
          unit_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean | null
          description: string | null
          id: string
          image: string | null
          metadata: Json | null
          name: string | null
        }
        Insert: {
          active?: boolean | null
          description?: string | null
          id: string
          image?: string | null
          metadata?: Json | null
          name?: string | null
        }
        Update: {
          active?: boolean | null
          description?: string | null
          id?: string
          image?: string | null
          metadata?: Json | null
          name?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          avatar_url: string | null
          company: string | null
          created_at: string
          display_name: string | null
          id: string
          locale: string
          marketing_opt_in: boolean
          onboarding_completed_at: string | null
          theme: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          locale?: string
          marketing_opt_in?: boolean
          onboarding_completed_at?: string | null
          theme?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          locale?: string
          marketing_opt_in?: boolean
          onboarding_completed_at?: string | null
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_versions: {
        Row: {
          changes: Json
          created_at: string
          created_by: string | null
          document: Json
          id: string
          is_autosave: boolean
          label: string | null
          project_id: string
          schema_version: number
          summary: string | null
        }
        Insert: {
          changes?: Json
          created_at?: string
          created_by?: string | null
          document: Json
          id?: string
          is_autosave?: boolean
          label?: string | null
          project_id: string
          schema_version?: number
          summary?: string | null
        }
        Update: {
          changes?: Json
          created_at?: string
          created_by?: string | null
          document?: Json
          id?: string
          is_autosave?: boolean
          label?: string | null
          project_id?: string
          schema_version?: number
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          deleted_at: string | null
          device: string | null
          document: Json
          duration_seconds: number | null
          id: string
          last_opened_at: string | null
          name: string
          owner_id: string
          revision: number
          schema_version: number
          status: Database["public"]["Enums"]["project_status"]
          thumbnail_path: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          device?: string | null
          document: Json
          duration_seconds?: number | null
          id?: string
          last_opened_at?: string | null
          name?: string
          owner_id: string
          revision?: number
          schema_version?: number
          status?: Database["public"]["Enums"]["project_status"]
          thumbnail_path?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          device?: string | null
          document?: Json
          duration_seconds?: number | null
          id?: string
          last_opened_at?: string | null
          name?: string
          owner_id?: string
          revision?: number
          schema_version?: number
          status?: Database["public"]["Enums"]["project_status"]
          thumbnail_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          created: string
          current_period_end: string
          current_period_start: string
          ended_at: string | null
          id: string
          metadata: Json | null
          price_id: string | null
          quantity: number | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          trial_end: string | null
          trial_start: string | null
          user_id: string
        }
        Insert: {
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created?: string
          current_period_end?: string
          current_period_start?: string
          ended_at?: string | null
          id: string
          metadata?: Json | null
          price_id?: string | null
          quantity?: number | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          trial_end?: string | null
          trial_start?: string | null
          user_id: string
        }
        Update: {
          cancel_at?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created?: string
          current_period_end?: string
          current_period_start?: string
          ended_at?: string | null
          id?: string
          metadata?: Json | null
          price_id?: string | null
          quantity?: number | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          trial_end?: string | null
          trial_start?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_price_id_fkey"
            columns: ["price_id"]
            isOneToOne: false
            referencedRelation: "prices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_plan: { Args: never; Returns: string }
      may_i: {
        Args: { p_feature: string; p_wanted?: number }
        Returns: boolean
      }
      plan_allows: {
        Args: { p_feature: string; p_uid: string; p_wanted: number }
        Returns: boolean
      }
      plan_for: { Args: { p_uid: string }; Returns: string }
    }
    Enums: {
      asset_kind:
        | "screen_image"
        | "screen_video"
        | "background_image"
        | "background_video"
        | "hdri"
        | "lottie"
        | "thumbnail"
        | "export"
      export_format: "png" | "mp4" | "webm"
      export_status: "queued" | "running" | "done" | "failed"
      pricing_interval: "day" | "week" | "month" | "year"
      pricing_type: "one_time" | "recurring"
      project_status: "draft" | "active" | "archived"
      subscription_status:
        | "trialing"
        | "active"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "past_due"
        | "unpaid"
        | "paused"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    Enums: {
      asset_kind: [
        "screen_image",
        "screen_video",
        "background_image",
        "background_video",
        "hdri",
        "lottie",
        "thumbnail",
        "export",
      ],
      export_format: ["png", "mp4", "webm"],
      export_status: ["queued", "running", "done", "failed"],
      pricing_interval: ["day", "week", "month", "year"],
      pricing_type: ["one_time", "recurring"],
      project_status: ["draft", "active", "archived"],
      subscription_status: [
        "trialing",
        "active",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "past_due",
        "unpaid",
        "paused",
      ],
    },
  },
} as const

