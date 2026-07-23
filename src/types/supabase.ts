export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      adicionais: {
        Row: {
          criado_em: string
          disponivel: boolean
          id: string
          nome: string
          preco: number
        }
        Insert: {
          criado_em?: string
          disponivel?: boolean
          id?: string
          nome: string
          preco?: number
        }
        Update: {
          criado_em?: string
          disponivel?: boolean
          id?: string
          nome?: string
          preco?: number
        }
        Relationships: []
      }
      categorias: {
        Row: {
          criado_em: string
          icone: string | null
          id: string
          nome: string
          ordem: number
          slug: string
        }
        Insert: {
          criado_em?: string
          icone?: string | null
          id?: string
          nome: string
          ordem?: number
          slug: string
        }
        Update: {
          criado_em?: string
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number
          slug?: string
        }
        Relationships: []
      }
      mesas: {
        Row: {
          apelido: string | null
          ativo: boolean
          created_at: string
          id: string
          numero: string
        }
        Insert: {
          apelido?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          numero: string
        }
        Update: {
          apelido?: string | null
          ativo?: boolean
          created_at?: string
          id?: string
          numero?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          celular: string
          created_at: string | null
          id: string
          nome: string
          total_pedidos: number | null
          ultimo_pedido: string | null
          valor_gasto: number | null
        }
        Insert: {
          celular: string
          created_at?: string | null
          id?: string
          nome: string
          total_pedidos?: number | null
          ultimo_pedido?: string | null
          valor_gasto?: number | null
        }
        Update: {
          celular?: string
          created_at?: string | null
          id?: string
          nome?: string
          total_pedidos?: number | null
          ultimo_pedido?: string | null
          valor_gasto?: number | null
        }
        Relationships: []
      }
      cupons: {
        Row: {
          ativo: boolean | null
          cliente_id: string | null
          codigo: string
          created_at: string | null
          id: string
          limite_uso: number | null
          limite_por_cliente: number | null
          tipo: string
          usos: number | null
          validade: string | null
          valor: number
          valor_minimo: number | null
        }
        Insert: {
          ativo?: boolean | null
          cliente_id?: string | null
          codigo: string
          created_at?: string | null
          id?: string
          limite_uso?: number | null
          limite_por_cliente?: number | null
          tipo: string
          usos?: number | null
          validade?: string | null
          valor: number
          valor_minimo?: number | null
        }
        Update: {
          ativo?: boolean | null
          cliente_id?: string | null
          codigo?: string
          created_at?: string | null
          id?: string
          limite_uso?: number | null
          limite_por_cliente?: number | null
          tipo?: string
          usos?: number | null
          validade?: string | null
          valor?: number
          valor_minimo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cupons_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_item_adicionais: {
        Row: {
          adicional_id: string
          id: string
          pedido_item_id: string
          preco: number | null
          preco_aplicado: number
        }
        Insert: {
          adicional_id: string
          id?: string
          pedido_item_id: string
          preco?: number | null
          preco_aplicado: number
        }
        Update: {
          adicional_id?: string
          id?: string
          pedido_item_id?: string
          preco?: number | null
          preco_aplicado?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_item_adicionais_adicional_id_fkey"
            columns: ["adicional_id"]
            isOneToOne: false
            referencedRelation: "adicionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_item_adicionais_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "pedido_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_itens: {
        Row: {
          criado_em: string
          id: string
          observacoes: string | null
          pedido_id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          modo_consumo: string
        }
        Insert: {
          criado_em?: string
          id?: string
          observacoes?: string | null
          pedido_id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
          modo_consumo?: string
        }
        Update: {
          criado_em?: string
          id?: string
          observacoes?: string | null
          pedido_id?: string
          preco_unitario?: number
          produto_id?: string
          quantidade?: number
          modo_consumo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_itens_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_itens_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos: {
        Row: {
          atualizado_em: string
          cliente_celular: string | null
          cliente_id: string | null
          cliente_nome: string
          criado_em: string
          cupom_id: string | null
          desconto_aplicado: number | null
          id: string
          identificador: string
          impresso: boolean
          origem: Database["public"]["Enums"]["tipo_origem_pedido"]
          sequencia_pedido: number
          status: string
          total: number | null
          valor_total: number
        }
        Insert: {
          atualizado_em?: string
          cliente_celular?: string | null
          cliente_id?: string | null
          cliente_nome: string
          criado_em?: string
          cupom_id?: string | null
          desconto_aplicado?: number | null
          id?: string
          identificador: string
          impresso?: boolean
          origem: Database["public"]["Enums"]["tipo_origem_pedido"]
          sequencia_pedido?: number
          status?: string
          total?: number | null
          valor_total?: number
        }
        Update: {
          atualizado_em?: string
          cliente_celular?: string | null
          cliente_id?: string | null
          cliente_nome?: string
          criado_em?: string
          cupom_id?: string | null
          desconto_aplicado?: number | null
          id?: string
          identificador?: string
          impresso?: boolean
          origem?: Database["public"]["Enums"]["tipo_origem_pedido"]
          sequencia_pedido?: number
          status?: string
          total?: number | null
          valor_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_cupom_id_fkey"
            columns: ["cupom_id"]
            isOneToOne: false
            referencedRelation: "cupons"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_adicionais: {
        Row: {
          adicional_id: string
          produto_id: string
        }
        Insert: {
          adicional_id: string
          produto_id: string
        }
        Update: {
          adicional_id?: string
          produto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_adicionais_adicional_id_fkey"
            columns: ["adicional_id"]
            isOneToOne: false
            referencedRelation: "adicionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produto_adicionais_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_grupos: {
        Row: {
          id: string
          combo_produto_id: string
          nome: string
          descricao: string | null
          min_escolhas: number
          max_escolhas: number
          preco_referencia: number
          ordem: number
          criado_em: string
        }
        Insert: {
          id?: string
          combo_produto_id: string
          nome: string
          descricao?: string | null
          min_escolhas?: number
          max_escolhas?: number
          preco_referencia?: number
          ordem?: number
          criado_em?: string
        }
        Update: {
          id?: string
          combo_produto_id?: string
          nome?: string
          descricao?: string | null
          min_escolhas?: number
          max_escolhas?: number
          preco_referencia?: number
          ordem?: number
          criado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "combo_grupos_combo_produto_id_fkey"
            columns: ["combo_produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      combo_opcoes: {
        Row: {
          id: string
          grupo_id: string
          produto_id: string
          delta_preco: number | null
          ordem: number
          ativo: boolean
          criado_em: string
        }
        Insert: {
          id?: string
          grupo_id: string
          produto_id: string
          delta_preco?: number | null
          ordem?: number
          ativo?: boolean
          criado_em?: string
        }
        Update: {
          id?: string
          grupo_id?: string
          produto_id?: string
          delta_preco?: number | null
          ordem?: number
          ativo?: boolean
          criado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "combo_opcoes_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "combo_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "combo_opcoes_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_item_combo_escolhas: {
        Row: {
          id: string
          pedido_item_id: string
          grupo_id: string | null
          produto_escolhido_id: string | null
          nome_grupo: string
          nome_produto: string
          delta_preco: number
          criado_em: string
        }
        Insert: {
          id?: string
          pedido_item_id: string
          grupo_id?: string | null
          produto_escolhido_id?: string | null
          nome_grupo: string
          nome_produto: string
          delta_preco?: number
          criado_em?: string
        }
        Update: {
          id?: string
          pedido_item_id?: string
          grupo_id?: string | null
          produto_escolhido_id?: string | null
          nome_grupo?: string
          nome_produto?: string
          delta_preco?: number
          criado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_item_combo_escolhas_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "pedido_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_item_combo_escolhas_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "combo_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_item_combo_escolhas_produto_escolhido_id_fkey"
            columns: ["produto_escolhido_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          adicional_obrigatorio: boolean
          ativo: boolean
          categoria_id: string
          controlar_estoque: boolean
          criado_em: string
          descricao: string | null
          em_promocao: boolean
          id: string
          imagem_url: string | null
          medida_unidade: Database["public"]["Enums"]["unidade_medida_produto"] | null
          medida_valor: number | null
          nome: string
          ordem: number
          preco: number
          preco_promocional: number | null
          quantidade_estoque: number
          tipo: Database["public"]["Enums"]["tipo_produto"]
          disponibilidade: Database["public"]["Enums"]["disponibilidade_produto"]
          video_url: string | null
        }
        Insert: {
          adicional_obrigatorio?: boolean
          ativo?: boolean
          categoria_id: string
          controlar_estoque?: boolean
          criado_em?: string
          descricao?: string | null
          em_promocao?: boolean
          id?: string
          imagem_url?: string | null
          medida_unidade?: Database["public"]["Enums"]["unidade_medida_produto"] | null
          medida_valor?: number | null
          nome: string
          ordem?: number
          preco: number
          preco_promocional?: number | null
          quantidade_estoque?: number
          tipo?: Database["public"]["Enums"]["tipo_produto"]
          disponibilidade?: Database["public"]["Enums"]["disponibilidade_produto"]
          video_url?: string | null
        }
        Update: {
          adicional_obrigatorio?: boolean
          ativo?: boolean
          categoria_id?: string
          controlar_estoque?: boolean
          criado_em?: string
          descricao?: string | null
          em_promocao?: boolean
          id?: string
          imagem_url?: string | null
          medida_unidade?: Database["public"]["Enums"]["unidade_medida_produto"] | null
          medida_valor?: number | null
          nome?: string
          ordem?: number
          preco?: number
          preco_promocional?: number | null
          quantidade_estoque?: number
          tipo?: Database["public"]["Enums"]["tipo_produto"]
          disponibilidade?: Database["public"]["Enums"]["disponibilidade_produto"]
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produtos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      vendas_cruzadas: {
        Row: {
          alvo_produto_id: string
          ativo: boolean | null
          created_at: string | null
          gatilho_produto_id: string
          id: string
          mensagem_oferta: string | null
          tipo: string
          valor_desconto: number | null
        }
        Insert: {
          alvo_produto_id: string
          ativo?: boolean | null
          created_at?: string | null
          gatilho_produto_id: string
          id?: string
          mensagem_oferta?: string | null
          tipo: string
          valor_desconto?: number | null
        }
        Update: {
          alvo_produto_id?: string
          ativo?: boolean | null
          created_at?: string | null
          gatilho_produto_id?: string
          id?: string
          mensagem_oferta?: string | null
          tipo?: string
          valor_desconto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vendas_cruzadas_alvo_produto_id_fkey"
            columns: ["alvo_produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendas_cruzadas_gatilho_produto_id_fkey"
            columns: ["gatilho_produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancelar_pedido_com_estoque: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      validar_cupom: {
        Args: {
          p_codigo: string
          p_subtotal: number
          p_cliente_id?: string | null
        }
        Returns: Json
      }
      processar_pedido_pos_criacao: {
        Args: {
          p_pedido_id: string
          p_cupom_id?: string | null
        }
        Returns: undefined
      }
      incrementar_uso_cupom: {
        Args: { p_cupom_id: string }
        Returns: undefined
      }
      baixar_estoque_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      buscar_meus_pedidos: {
        Args: { p_celular: string }
        Returns: Json
      }
      calcular_delta_combo_opcao: {
        Args: { p_opcao_id: string }
        Returns: number
      }
    }
    Enums: {
      tipo_origem_pedido: "mesa" | "balcao"
      tipo_produto: "simples" | "combo"
      disponibilidade_produto: "loja" | "levar" | "ambos"
      unidade_medida_produto: "g" | "kg" | "ml" | "L"
      tipo_status_pedido:
        | "pendente"
        | "em_producao"
        | "pronto"
        | "entregue"
        | "pago"
        | "cancelado"
        | "aguardando_pagamento"
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
    Enums: {
      tipo_origem_pedido: ["mesa", "balcao"],
      tipo_produto: ["simples", "combo"],
      disponibilidade_produto: ["loja", "levar", "ambos"],
      unidade_medida_produto: ["g", "kg", "ml", "L"],
      tipo_status_pedido: [
        "pendente",
        "em_producao",
        "pronto",
        "entregue",
        "pago",
        "cancelado",
        "aguardando_pagamento",
      ],
    },
  },
} as const
