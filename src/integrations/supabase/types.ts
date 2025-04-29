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
      bar_order_items: {
        Row: {
          id: string
          is_deposit: boolean | null
          is_return: boolean | null
          order_id: string | null
          price: number
          product_name: string
          quantity: number
        }
        Insert: {
          id?: string
          is_deposit?: boolean | null
          is_return?: boolean | null
          order_id?: string | null
          price: number
          product_name: string
          quantity?: number
        }
        Update: {
          id?: string
          is_deposit?: boolean | null
          is_return?: boolean | null
          order_id?: string | null
          price?: number
          product_name?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "bar_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "bar_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_orders: {
        Row: {
          card_id: string | null
          created_at: string | null
          id: string
          status: string | null
          total_amount: number
        }
        Insert: {
          card_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          total_amount: number
        }
        Update: {
          card_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "bar_orders_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "table_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      bar_products: {
        Row: {
          category: string | null
          id: number
          is_deposit: boolean | null
          is_return: boolean | null
          name: string
          price: number
        }
        Insert: {
          category?: string | null
          id?: number
          is_deposit?: boolean | null
          is_return?: boolean | null
          name: string
          price: number
        }
        Update: {
          category?: string | null
          id?: number
          is_deposit?: boolean | null
          is_return?: boolean | null
          name?: string
          price?: number
        }
        Relationships: []
      }
      paiements: {
        Row: {
          amount: number | null
          created_at: string
          id: number
          id_card: string | null
          paid_by_card: boolean | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          id?: number
          id_card?: string | null
          paid_by_card?: boolean | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          id?: number
          id_card?: string | null
          paid_by_card?: boolean | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
      refunds: {
        Row: {
          account: number | null
          created_at: string
          email: string | null
          "first name": string | null
          id: number
          id_card: string | null
          "last name": string | null
        }
        Insert: {
          account?: number | null
          created_at?: string
          email?: string | null
          "first name"?: string | null
          id?: number
          id_card?: string | null
          "last name"?: string | null
        }
        Update: {
          account?: number | null
          created_at?: string
          email?: string | null
          "first name"?: string | null
          id?: number
          id_card?: string | null
          "last name"?: string | null
        }
        Relationships: []
      }
      table_cards: {
        Row: {
          amount: number | null
          description: string | null
          id: string
        }
        Insert: {
          amount?: number | null
          description?: string | null
          id: string
        }
        Update: {
          amount?: number | null
          description?: string | null
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      user_role: "admin" | "bar" | "recharge"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      user_role: ["admin", "bar", "recharge"],
    },
  },
} as const
