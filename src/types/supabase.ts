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
          disponibilidade: Database["public"]["Enums"]["disponibilidade_produto"]
          disponivel: boolean
          ficha_id: string | null
          id: string
          nome: string
          preco: number
        }
        Insert: {
          criado_em?: string
          disponibilidade?: Database["public"]["Enums"]["disponibilidade_produto"]
          disponivel?: boolean
          ficha_id?: string | null
          id?: string
          nome: string
          preco?: number
        }
        Update: {
          criado_em?: string
          disponibilidade?: Database["public"]["Enums"]["disponibilidade_produto"]
          disponivel?: boolean
          ficha_id?: string | null
          id?: string
          nome?: string
          preco?: number
        }
        Relationships: [
          {
            foreignKeyName: "adicionais_ficha_id_fkey"
            columns: ["ficha_id"]
            isOneToOne: false
            referencedRelation: "fichas_tecnicas"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_eventos: {
        Row: {
          canal: string
          cliente_id: string | null
          criado_em: string
          evento: string
          id: string
          pedido_id: string | null
          produto_id: string | null
          props: Json
          sessao_id: string
        }
        Insert: {
          canal: string
          cliente_id?: string | null
          criado_em?: string
          evento: string
          id?: string
          pedido_id?: string | null
          produto_id?: string | null
          props?: Json
          sessao_id: string
        }
        Update: {
          canal?: string
          cliente_id?: string | null
          criado_em?: string
          evento?: string
          id?: string
          pedido_id?: string | null
          produto_id?: string | null
          props?: Json
          sessao_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_eventos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_eventos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_eventos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
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
      cliente_enderecos: {
        Row: {
          atualizado_em: string
          bairro: string
          cep: string
          cidade: string
          cliente_id: string
          complemento: string | null
          criado_em: string
          id: string
          latitude: number | null
          longitude: number | null
          numero: string
          padrao: boolean
          referencia: string | null
          rotulo: string | null
          rua: string
          uf: string
        }
        Insert: {
          atualizado_em?: string
          bairro: string
          cep: string
          cidade: string
          cliente_id: string
          complemento?: string | null
          criado_em?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          numero: string
          padrao?: boolean
          referencia?: string | null
          rotulo?: string | null
          rua: string
          uf: string
        }
        Update: {
          atualizado_em?: string
          bairro?: string
          cep?: string
          cidade?: string
          cliente_id?: string
          complemento?: string | null
          criado_em?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          numero?: string
          padrao?: boolean
          referencia?: string | null
          rotulo?: string | null
          rua?: string
          uf?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_enderecos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_pontos: {
        Row: {
          atualizado_em: string
          cliente_id: string
          saldo: number
        }
        Insert: {
          atualizado_em?: string
          cliente_id: string
          saldo?: number
        }
        Update: {
          atualizado_em?: string
          cliente_id?: string
          saldo?: number
        }
        Relationships: [
          {
            foreignKeyName: "cliente_pontos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: true
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          auth_user_id: string | null
          celular: string
          cpf: string | null
          created_at: string | null
          email: string | null
          id: string
          nome: string
          total_pedidos: number | null
          ultimo_pedido: string | null
          valor_gasto: number | null
        }
        Insert: {
          auth_user_id?: string | null
          celular: string
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome: string
          total_pedidos?: number | null
          ultimo_pedido?: string | null
          valor_gasto?: number | null
        }
        Update: {
          auth_user_id?: string | null
          celular?: string
          cpf?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string
          total_pedidos?: number | null
          ultimo_pedido?: string | null
          valor_gasto?: number | null
        }
        Relationships: []
      }
      combo_grupos: {
        Row: {
          combo_produto_id: string
          criado_em: string
          descricao: string | null
          id: string
          max_escolhas: number
          min_escolhas: number
          nome: string
          ordem: number
          preco_referencia: number
        }
        Insert: {
          combo_produto_id: string
          criado_em?: string
          descricao?: string | null
          id?: string
          max_escolhas?: number
          min_escolhas?: number
          nome: string
          ordem?: number
          preco_referencia?: number
        }
        Update: {
          combo_produto_id?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          max_escolhas?: number
          min_escolhas?: number
          nome?: string
          ordem?: number
          preco_referencia?: number
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
          ativo: boolean
          criado_em: string
          delta_preco: number | null
          grupo_id: string
          id: string
          ordem: number
          produto_id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          delta_preco?: number | null
          grupo_id: string
          id?: string
          ordem?: number
          produto_id: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          delta_preco?: number | null
          grupo_id?: string
          id?: string
          ordem?: number
          produto_id?: string
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
      conversas: {
        Row: {
          cliente_id: string
          criado_em: string
          id: string
          nao_lida_admin: boolean
          nao_lida_cliente: boolean
          nao_lidas_admin_count: number
          nao_lidas_cliente_count: number
          pedido_id: string | null
          status: string
          ultima_mensagem_autor: string | null
          ultima_mensagem_corpo: string | null
          ultimo_mensagem_em: string | null
        }
        Insert: {
          cliente_id: string
          criado_em?: string
          id?: string
          nao_lida_admin?: boolean
          nao_lida_cliente?: boolean
          nao_lidas_admin_count?: number
          nao_lidas_cliente_count?: number
          pedido_id?: string | null
          status?: string
          ultima_mensagem_autor?: string | null
          ultima_mensagem_corpo?: string | null
          ultimo_mensagem_em?: string | null
        }
        Update: {
          cliente_id?: string
          criado_em?: string
          id?: string
          nao_lida_admin?: boolean
          nao_lida_cliente?: boolean
          nao_lidas_admin_count?: number
          nao_lidas_cliente_count?: number
          pedido_id?: string | null
          status?: string
          ultima_mensagem_autor?: string | null
          ultima_mensagem_corpo?: string | null
          ultimo_mensagem_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      cupons: {
        Row: {
          acumulativo: boolean
          ativo: boolean | null
          cliente_id: string | null
          codigo: string
          created_at: string | null
          id: string
          limite_por_cliente: number | null
          limite_uso: number | null
          pedido_origem_id: string | null
          tipo: string
          usos: number | null
          validade: string | null
          valor: number
          valor_minimo: number | null
        }
        Insert: {
          acumulativo?: boolean
          ativo?: boolean | null
          cliente_id?: string | null
          codigo: string
          created_at?: string | null
          id?: string
          limite_por_cliente?: number | null
          limite_uso?: number | null
          pedido_origem_id?: string | null
          tipo: string
          usos?: number | null
          validade?: string | null
          valor: number
          valor_minimo?: number | null
        }
        Update: {
          acumulativo?: boolean
          ativo?: boolean | null
          cliente_id?: string | null
          codigo?: string
          created_at?: string | null
          id?: string
          limite_por_cliente?: number | null
          limite_uso?: number | null
          pedido_origem_id?: string | null
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
          {
            foreignKeyName: "cupons_pedido_origem_id_fkey"
            columns: ["pedido_origem_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_bairros_frete: {
        Row: {
          atualizado_em: string
          descontos: Json
          distrito: string
          faixas: Json
          geom: unknown
          id: string
          nome: string
          raio_km: number | null
          regiao: string
          slug: string
          taxa: number | null
        }
        Insert: {
          atualizado_em?: string
          descontos?: Json
          distrito?: string
          faixas?: Json
          geom: unknown
          id?: string
          nome: string
          raio_km?: number | null
          regiao?: string
          slug: string
          taxa?: number | null
        }
        Update: {
          atualizado_em?: string
          descontos?: Json
          distrito?: string
          faixas?: Json
          geom?: unknown
          id?: string
          nome?: string
          raio_km?: number | null
          regiao?: string
          slug?: string
          taxa?: number | null
        }
        Relationships: []
      }
      delivery_config: {
        Row: {
          ativo: boolean
          atualizado_em: string
          clima_frete: Json
          enderecos_referencia: Json
          faixas_frete: Json
          id: number
          loja_latitude: number | null
          loja_longitude: number | null
          modo_frete: string
          pedido_minimo: number
          pontos_por_real: number
          raio_km: number
          regras_frete: Json
          resgate_pontos: number
          resgate_valor_reais: number
          tempo_estimado_min: number
          whatsapp_numero: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          clima_frete?: Json
          enderecos_referencia?: Json
          faixas_frete?: Json
          id?: number
          loja_latitude?: number | null
          loja_longitude?: number | null
          modo_frete?: string
          pedido_minimo?: number
          pontos_por_real?: number
          raio_km?: number
          regras_frete?: Json
          resgate_pontos?: number
          resgate_valor_reais?: number
          tempo_estimado_min?: number
          whatsapp_numero?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          clima_frete?: Json
          enderecos_referencia?: Json
          faixas_frete?: Json
          id?: number
          loja_latitude?: number | null
          loja_longitude?: number | null
          modo_frete?: string
          pedido_minimo?: number
          pontos_por_real?: number
          raio_km?: number
          regras_frete?: Json
          resgate_pontos?: number
          resgate_valor_reais?: number
          tempo_estimado_min?: number
          whatsapp_numero?: string | null
        }
        Relationships: []
      }
      ficha_tecnica_itens: {
        Row: {
          ficha_filha_id: string | null
          ficha_id: string
          id: string
          insumo_id: string | null
          observacao: string | null
          quantidade: number
          unidade: string | null
        }
        Insert: {
          ficha_filha_id?: string | null
          ficha_id: string
          id?: string
          insumo_id?: string | null
          observacao?: string | null
          quantidade: number
          unidade?: string | null
        }
        Update: {
          ficha_filha_id?: string | null
          ficha_id?: string
          id?: string
          insumo_id?: string | null
          observacao?: string | null
          quantidade?: number
          unidade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ficha_tecnica_itens_ficha_filha_id_fkey"
            columns: ["ficha_filha_id"]
            isOneToOne: false
            referencedRelation: "fichas_tecnicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_tecnica_itens_ficha_id_fkey"
            columns: ["ficha_id"]
            isOneToOne: false
            referencedRelation: "fichas_tecnicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ficha_tecnica_itens_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      fichas_tecnicas: {
        Row: {
          atualizado_em: string
          criado_em: string
          custo_atualizado_em: string | null
          custo_calculado: number | null
          descricao: string | null
          escopo: string | null
          id: string
          nome: string
          observacao: string | null
          rendimento: number
          status: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          custo_atualizado_em?: string | null
          custo_calculado?: number | null
          descricao?: string | null
          escopo?: string | null
          id?: string
          nome: string
          observacao?: string | null
          rendimento?: number
          status?: string
          tipo: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          custo_atualizado_em?: string | null
          custo_calculado?: number | null
          descricao?: string | null
          escopo?: string | null
          id?: string
          nome?: string
          observacao?: string | null
          rendimento?: number
          status?: string
          tipo?: string
        }
        Relationships: []
      }
      impressao_config: {
        Row: {
          atualizado_em: string
          config: Json
          id: number
        }
        Insert: {
          atualizado_em?: string
          config?: Json
          id?: number
        }
        Update: {
          atualizado_em?: string
          config?: Json
          id?: number
        }
        Relationships: []
      }
      insumo_alternativas: {
        Row: {
          alternativa_id: string
          criado_em: string
          id: string
          insumo_id: string
          ordem: number
        }
        Insert: {
          alternativa_id: string
          criado_em?: string
          id?: string
          insumo_id: string
          ordem?: number
        }
        Update: {
          alternativa_id?: string
          criado_em?: string
          id?: string
          insumo_id?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "insumo_alternativas_alternativa_id_fkey"
            columns: ["alternativa_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumo_alternativas_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      insumo_estoque_movimentos: {
        Row: {
          criado_em: string
          id: string
          insumo_id: string
          lista_compra_item_id: string | null
          observacao: string | null
          origem: string
          pedido_id: string | null
          quantidade: number
          tipo: string
        }
        Insert: {
          criado_em?: string
          id?: string
          insumo_id: string
          lista_compra_item_id?: string | null
          observacao?: string | null
          origem?: string
          pedido_id?: string | null
          quantidade: number
          tipo: string
        }
        Update: {
          criado_em?: string
          id?: string
          insumo_id?: string
          lista_compra_item_id?: string | null
          observacao?: string | null
          origem?: string
          pedido_id?: string | null
          quantidade?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "insumo_estoque_movimentos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumo_estoque_movimentos_lista_compra_item_id_fkey"
            columns: ["lista_compra_item_id"]
            isOneToOne: false
            referencedRelation: "lista_compras_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumo_estoque_movimentos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      insumo_precos_historico: {
        Row: {
          criado_em: string
          id: string
          insumo_id: string
          lista_compra_item_id: string | null
          observacao: string | null
          preco_unitario: number
          quantidade: number | null
        }
        Insert: {
          criado_em?: string
          id?: string
          insumo_id: string
          lista_compra_item_id?: string | null
          observacao?: string | null
          preco_unitario: number
          quantidade?: number | null
        }
        Update: {
          criado_em?: string
          id?: string
          insumo_id?: string
          lista_compra_item_id?: string | null
          observacao?: string | null
          preco_unitario?: number
          quantidade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "insumo_precos_historico_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insumo_precos_historico_lista_compra_item_id_fkey"
            columns: ["lista_compra_item_id"]
            isOneToOne: false
            referencedRelation: "lista_compras_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      insumos: {
        Row: {
          ativo: boolean
          atualizado_em: string
          conteudo_unidade: string | null
          conteudo_valor: number | null
          criado_em: string
          estoque_minimo: number
          id: string
          imagem_url: string | null
          marcas: string[]
          nome: string
          observacao: string | null
          preco_atual: number | null
          preco_atualizado_em: string | null
          quantidade_atual: number
          tipo: string
          unidade: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          conteudo_unidade?: string | null
          conteudo_valor?: number | null
          criado_em?: string
          estoque_minimo?: number
          id?: string
          imagem_url?: string | null
          marcas?: string[]
          nome: string
          observacao?: string | null
          preco_atual?: number | null
          preco_atualizado_em?: string | null
          quantidade_atual?: number
          tipo?: string
          unidade?: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          conteudo_unidade?: string | null
          conteudo_valor?: number | null
          criado_em?: string
          estoque_minimo?: number
          id?: string
          imagem_url?: string | null
          marcas?: string[]
          nome?: string
          observacao?: string | null
          preco_atual?: number | null
          preco_atualizado_em?: string | null
          quantidade_atual?: number
          tipo?: string
          unidade?: string
        }
        Relationships: []
      }
      integracoes_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          chave: string
          rotulo: string | null
          valor: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave: string
          rotulo?: string | null
          valor?: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          chave?: string
          rotulo?: string | null
          valor?: string
        }
        Relationships: []
      }
      lista_compras: {
        Row: {
          criado_em: string
          finalizada_em: string | null
          id: string
          status: string
          titulo: string | null
        }
        Insert: {
          criado_em?: string
          finalizada_em?: string | null
          id?: string
          status?: string
          titulo?: string | null
        }
        Update: {
          criado_em?: string
          finalizada_em?: string | null
          id?: string
          status?: string
          titulo?: string | null
        }
        Relationships: []
      }
      lista_compras_itens: {
        Row: {
          comprado: boolean
          criado_em: string
          id: string
          insumo_comprado_id: string | null
          insumo_id: string
          lista_id: string
          marcado: boolean
          observacao: string | null
          preco_unitario: number | null
          quantidade_comprada: number | null
          quantidade_planejada: number
        }
        Insert: {
          comprado?: boolean
          criado_em?: string
          id?: string
          insumo_comprado_id?: string | null
          insumo_id: string
          lista_id: string
          marcado?: boolean
          observacao?: string | null
          preco_unitario?: number | null
          quantidade_comprada?: number | null
          quantidade_planejada?: number
        }
        Update: {
          comprado?: boolean
          criado_em?: string
          id?: string
          insumo_comprado_id?: string | null
          insumo_id?: string
          lista_id?: string
          marcado?: boolean
          observacao?: string | null
          preco_unitario?: number | null
          quantidade_comprada?: number | null
          quantidade_planejada?: number
        }
        Relationships: [
          {
            foreignKeyName: "lista_compras_itens_insumo_comprado_id_fkey"
            columns: ["insumo_comprado_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_compras_itens_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_compras_itens_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "lista_compras"
            referencedColumns: ["id"]
          },
        ]
      }
      loja_config: {
        Row: {
          atualizado_em: string
          capacidade_embalagem_pedido_delivery: number
          capacidade_embalagem_pedido_retirada: number
          ficha_embalagem_pedido_delivery_id: string | null
          ficha_embalagem_pedido_retirada_id: string | null
          id: number
          limite_pedidos_ativos: number | null
          mensagem_pausa: string | null
          pausado: boolean
          tempo_preparo_min: number
        }
        Insert: {
          atualizado_em?: string
          capacidade_embalagem_pedido_delivery?: number
          capacidade_embalagem_pedido_retirada?: number
          ficha_embalagem_pedido_delivery_id?: string | null
          ficha_embalagem_pedido_retirada_id?: string | null
          id?: number
          limite_pedidos_ativos?: number | null
          mensagem_pausa?: string | null
          pausado?: boolean
          tempo_preparo_min?: number
        }
        Update: {
          atualizado_em?: string
          capacidade_embalagem_pedido_delivery?: number
          capacidade_embalagem_pedido_retirada?: number
          ficha_embalagem_pedido_delivery_id?: string | null
          ficha_embalagem_pedido_retirada_id?: string | null
          id?: number
          limite_pedidos_ativos?: number | null
          mensagem_pausa?: string | null
          pausado?: boolean
          tempo_preparo_min?: number
        }
        Relationships: [
          {
            foreignKeyName: "loja_config_ficha_embalagem_pedido_delivery_id_fkey"
            columns: ["ficha_embalagem_pedido_delivery_id"]
            isOneToOne: false
            referencedRelation: "fichas_tecnicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loja_config_ficha_embalagem_pedido_retirada_id_fkey"
            columns: ["ficha_embalagem_pedido_retirada_id"]
            isOneToOne: false
            referencedRelation: "fichas_tecnicas"
            referencedColumns: ["id"]
          },
        ]
      }
      loja_horarios: {
        Row: {
          aberto: boolean
          abre: string
          dia_semana: number
          fecha: string
        }
        Insert: {
          aberto?: boolean
          abre?: string
          dia_semana: number
          fecha?: string
        }
        Update: {
          aberto?: boolean
          abre?: string
          dia_semana?: number
          fecha?: string
        }
        Relationships: []
      }
      mensagens: {
        Row: {
          autor: string
          conversa_id: string
          corpo: string
          criado_em: string
          id: string
          lida_admin: boolean
          lida_cliente: boolean
        }
        Insert: {
          autor: string
          conversa_id: string
          corpo: string
          criado_em?: string
          id?: string
          lida_admin?: boolean
          lida_cliente?: boolean
        }
        Update: {
          autor?: string
          conversa_id?: string
          corpo?: string
          criado_em?: string
          id?: string
          lida_admin?: boolean
          lida_cliente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
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
      pedido_cupons: {
        Row: {
          cupom_id: string
          desconto: number
          pedido_id: string
        }
        Insert: {
          cupom_id: string
          desconto: number
          pedido_id: string
        }
        Update: {
          cupom_id?: string
          desconto?: number
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_cupons_cupom_id_fkey"
            columns: ["cupom_id"]
            isOneToOne: false
            referencedRelation: "cupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_cupons_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_insumo_consumos: {
        Row: {
          criado_em: string
          estornado: boolean
          id: string
          insumo_id: string
          pedido_id: string
          quantidade: number
        }
        Insert: {
          criado_em?: string
          estornado?: boolean
          id?: string
          insumo_id: string
          pedido_id: string
          quantidade: number
        }
        Update: {
          criado_em?: string
          estornado?: boolean
          id?: string
          insumo_id?: string
          pedido_id?: string
          quantidade?: number
        }
        Relationships: [
          {
            foreignKeyName: "pedido_insumo_consumos_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "insumos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_insumo_consumos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
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
      pedido_item_combo_escolhas: {
        Row: {
          criado_em: string
          delta_preco: number
          grupo_id: string | null
          id: string
          nome_grupo: string
          nome_produto: string
          pedido_item_id: string
          produto_escolhido_id: string | null
        }
        Insert: {
          criado_em?: string
          delta_preco?: number
          grupo_id?: string | null
          id?: string
          nome_grupo: string
          nome_produto: string
          pedido_item_id: string
          produto_escolhido_id?: string | null
        }
        Update: {
          criado_em?: string
          delta_preco?: number
          grupo_id?: string | null
          id?: string
          nome_grupo?: string
          nome_produto?: string
          pedido_item_id?: string
          produto_escolhido_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedido_item_combo_escolhas_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "combo_grupos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_item_combo_escolhas_pedido_item_id_fkey"
            columns: ["pedido_item_id"]
            isOneToOne: false
            referencedRelation: "pedido_itens"
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
      pedido_itens: {
        Row: {
          criado_em: string
          id: string
          modo_consumo: string
          observacoes: string | null
          pedido_id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
        }
        Insert: {
          criado_em?: string
          id?: string
          modo_consumo?: string
          observacoes?: string | null
          pedido_id: string
          preco_unitario: number
          produto_id: string
          quantidade: number
        }
        Update: {
          criado_em?: string
          id?: string
          modo_consumo?: string
          observacoes?: string | null
          pedido_id?: string
          preco_unitario?: number
          produto_id?: string
          quantidade?: number
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
          acrescimo_clima: number
          agendado_para: string | null
          asaas_checkout_id: string | null
          asaas_payment_id: string | null
          atualizado_em: string
          cliente_celular: string | null
          cliente_id: string | null
          cliente_nome: string
          cpf_nota: string | null
          criado_em: string
          cupom_id: string | null
          cupom_uso_registrado: boolean
          desconto_aplicado: number | null
          desconto_frete: number
          distancia_km: number | null
          endereco_json: Json | null
          id: string
          identificador: string
          impresso: boolean
          modalidade:
            | Database["public"]["Enums"]["tipo_modalidade_pedido"]
            | null
          origem: Database["public"]["Enums"]["tipo_origem_pedido"]
          sequencia_pedido: number
          status: string
          status_pagamento: Database["public"]["Enums"]["tipo_status_pagamento"]
          subtotal_itens: number | null
          taxa_entrega: number | null
          total: number | null
          tracking_url: string | null
          valor_total: number
          voa_order_id: string | null
        }
        Insert: {
          acrescimo_clima?: number
          agendado_para?: string | null
          asaas_checkout_id?: string | null
          asaas_payment_id?: string | null
          atualizado_em?: string
          cliente_celular?: string | null
          cliente_id?: string | null
          cliente_nome: string
          cpf_nota?: string | null
          criado_em?: string
          cupom_id?: string | null
          cupom_uso_registrado?: boolean
          desconto_aplicado?: number | null
          desconto_frete?: number
          distancia_km?: number | null
          endereco_json?: Json | null
          id?: string
          identificador: string
          impresso?: boolean
          modalidade?:
            | Database["public"]["Enums"]["tipo_modalidade_pedido"]
            | null
          origem: Database["public"]["Enums"]["tipo_origem_pedido"]
          sequencia_pedido?: number
          status?: string
          status_pagamento?: Database["public"]["Enums"]["tipo_status_pagamento"]
          subtotal_itens?: number | null
          taxa_entrega?: number | null
          total?: number | null
          tracking_url?: string | null
          valor_total?: number
          voa_order_id?: string | null
        }
        Update: {
          acrescimo_clima?: number
          agendado_para?: string | null
          asaas_checkout_id?: string | null
          asaas_payment_id?: string | null
          atualizado_em?: string
          cliente_celular?: string | null
          cliente_id?: string | null
          cliente_nome?: string
          cpf_nota?: string | null
          criado_em?: string
          cupom_id?: string | null
          cupom_uso_registrado?: boolean
          desconto_aplicado?: number | null
          desconto_frete?: number
          distancia_km?: number | null
          endereco_json?: Json | null
          id?: string
          identificador?: string
          impresso?: boolean
          modalidade?:
            | Database["public"]["Enums"]["tipo_modalidade_pedido"]
            | null
          origem?: Database["public"]["Enums"]["tipo_origem_pedido"]
          sequencia_pedido?: number
          status?: string
          status_pagamento?: Database["public"]["Enums"]["tipo_status_pagamento"]
          subtotal_itens?: number | null
          taxa_entrega?: number | null
          total?: number | null
          tracking_url?: string | null
          valor_total?: number
          voa_order_id?: string | null
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
      pontos_extrato: {
        Row: {
          cliente_id: string
          criado_em: string
          descricao: string | null
          id: string
          pedido_id: string | null
          pontos: number
          tipo: string
        }
        Insert: {
          cliente_id: string
          criado_em?: string
          descricao?: string | null
          id?: string
          pedido_id?: string | null
          pontos: number
          tipo: string
        }
        Update: {
          cliente_id?: string
          criado_em?: string
          descricao?: string | null
          id?: string
          pedido_id?: string | null
          pontos?: number
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "pontos_extrato_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pontos_extrato_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
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
      produtos: {
        Row: {
          adicional_maximo: number | null
          adicional_obrigatorio: boolean
          ativo: boolean
          categoria_id: string
          controlar_estoque: boolean
          criado_em: string
          descricao: string | null
          disponibilidade: Database["public"]["Enums"]["disponibilidade_produto"]
          em_promocao: boolean
          ficha_embalagem_delivery_id: string | null
          ficha_embalagem_levar_rapido_id: string | null
          ficha_embalagem_viagem_id: string | null
          ficha_produto_id: string | null
          id: string
          imagem_url: string | null
          medida_unidade:
            | Database["public"]["Enums"]["unidade_medida_produto"]
            | null
          medida_valor: number | null
          nome: string
          ordem: number
          preco: number
          preco_promocional: number | null
          quantidade_estoque: number
          tipo: Database["public"]["Enums"]["tipo_produto"]
          video_url: string | null
        }
        Insert: {
          adicional_maximo?: number | null
          adicional_obrigatorio?: boolean
          ativo?: boolean
          categoria_id: string
          controlar_estoque?: boolean
          criado_em?: string
          descricao?: string | null
          disponibilidade?: Database["public"]["Enums"]["disponibilidade_produto"]
          em_promocao?: boolean
          ficha_embalagem_delivery_id?: string | null
          ficha_embalagem_levar_rapido_id?: string | null
          ficha_embalagem_viagem_id?: string | null
          ficha_produto_id?: string | null
          id?: string
          imagem_url?: string | null
          medida_unidade?:
            | Database["public"]["Enums"]["unidade_medida_produto"]
            | null
          medida_valor?: number | null
          nome: string
          ordem?: number
          preco: number
          preco_promocional?: number | null
          quantidade_estoque?: number
          tipo?: Database["public"]["Enums"]["tipo_produto"]
          video_url?: string | null
        }
        Update: {
          adicional_maximo?: number | null
          adicional_obrigatorio?: boolean
          ativo?: boolean
          categoria_id?: string
          controlar_estoque?: boolean
          criado_em?: string
          descricao?: string | null
          disponibilidade?: Database["public"]["Enums"]["disponibilidade_produto"]
          em_promocao?: boolean
          ficha_embalagem_delivery_id?: string | null
          ficha_embalagem_levar_rapido_id?: string | null
          ficha_embalagem_viagem_id?: string | null
          ficha_produto_id?: string | null
          id?: string
          imagem_url?: string | null
          medida_unidade?:
            | Database["public"]["Enums"]["unidade_medida_produto"]
            | null
          medida_valor?: number | null
          nome?: string
          ordem?: number
          preco?: number
          preco_promocional?: number | null
          quantidade_estoque?: number
          tipo?: Database["public"]["Enums"]["tipo_produto"]
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
          {
            foreignKeyName: "produtos_ficha_embalagem_delivery_id_fkey"
            columns: ["ficha_embalagem_delivery_id"]
            isOneToOne: false
            referencedRelation: "fichas_tecnicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_ficha_embalagem_levar_rapido_id_fkey"
            columns: ["ficha_embalagem_levar_rapido_id"]
            isOneToOne: false
            referencedRelation: "fichas_tecnicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_ficha_embalagem_viagem_id_fkey"
            columns: ["ficha_embalagem_viagem_id"]
            isOneToOne: false
            referencedRelation: "fichas_tecnicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "produtos_ficha_produto_id_fkey"
            columns: ["ficha_produto_id"]
            isOneToOne: false
            referencedRelation: "fichas_tecnicas"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          atualizado_em: string
          auth: string
          cliente_id: string | null
          criado_em: string
          endpoint: string
          id: string
          p256dh: string
          pedido_id: string | null
          user_id: string | null
        }
        Insert: {
          atualizado_em?: string
          auth: string
          cliente_id?: string | null
          criado_em?: string
          endpoint: string
          id?: string
          p256dh: string
          pedido_id?: string | null
          user_id?: string | null
        }
        Update: {
          atualizado_em?: string
          auth?: string
          cliente_id?: string | null
          criado_em?: string
          endpoint?: string
          id?: string
          p256dh?: string
          pedido_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
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
      whatsapp_mensagens: {
        Row: {
          conteudo: string
          criado_em: string
          id: string
          ordem: number
          titulo: string
        }
        Insert: {
          conteudo: string
          criado_em?: string
          id?: string
          ordem?: number
          titulo: string
        }
        Update: {
          conteudo?: string
          criado_em?: string
          id?: string
          ordem?: number
          titulo?: string
        }
        Relationships: []
      }
      whatsapp_sessoes: {
        Row: {
          atualizado_em: string
          janela_ate: string
          telefone: string
          ultimo_inbound_em: string
          ultimo_pedido_id: string | null
        }
        Insert: {
          atualizado_em?: string
          janela_ate: string
          telefone: string
          ultimo_inbound_em?: string
          ultimo_pedido_id?: string | null
        }
        Update: {
          atualizado_em?: string
          janela_ate?: string
          telefone?: string
          ultimo_inbound_em?: string
          ultimo_pedido_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_sessoes_ultimo_pedido_id_fkey"
            columns: ["ultimo_pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acumular_consumo_ficha: {
        Args: { p_ficha_id: string; p_porcoes: number }
        Returns: undefined
      }
      ajustar_estoque_insumo: {
        Args: {
          p_delta: number
          p_insumo_id: string
          p_lista_compra_item_id?: string
          p_observacao?: string
          p_origem?: string
          p_pedido_id?: string
          p_permitir_negativo?: boolean
        }
        Returns: number
      }
      anexar_cupons_pedido: {
        Args: { p_cupons: Json; p_pedido_id: string }
        Returns: undefined
      }
      atualizar_config_bairro_frete: {
        Args: {
          p_descontos: Json
          p_faixas: Json
          p_id: string
          p_raio_km: number
        }
        Returns: Json
      }
      atualizar_stats_cliente_pedido: {
        Args: { p_cliente_id: string; p_delta_pedidos: number; p_valor: number }
        Returns: undefined
      }
      atualizar_taxa_bairro_frete: {
        Args: { p_id: string; p_taxa: number }
        Returns: Json
      }
      bairro_frete_aplicar_desconto: {
        Args: {
          p_descontos: Json
          p_distancia: number
          p_subtotal: number
          p_taxa_com_base: number
        }
        Returns: number
      }
      bairro_frete_raio_efetivo: {
        Args: { p_faixas: Json; p_raio: number }
        Returns: number
      }
      bairro_frete_taxa_faixa: {
        Args: { p_distancia: number; p_faixas: Json }
        Returns: number
      }
      baixar_estoque_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      baixar_insumos_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      buscar_meus_pedidos: { Args: { p_celular: string }; Returns: Json }
      calcular_delta_combo_opcao: {
        Args: { p_opcao_id: string }
        Returns: number
      }
      calcular_taxa_bairro_frete: {
        Args: { p_bairro_id: string; p_distancia: number; p_subtotal: number }
        Returns: Json
      }
      cancelar_pedido_com_estoque: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      cancelar_pedido_delivery_aguardando: {
        Args: { p_pedido_id: string }
        Returns: boolean
      }
      cancelar_pedidos_delivery_sem_pagamento: {
        Args: { p_minutos?: number }
        Returns: number
      }
      creditar_pontos_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      criar_pedido_completo: {
        Args: {
          p_cliente_celular: string
          p_cliente_id: string
          p_cliente_nome: string
          p_cupom_id: string
          p_desconto: number
          p_identificador: string
          p_itens: Json
          p_origem: string
          p_total: number
          p_valor_total: number
        }
        Returns: Json
      }
      criar_pedido_delivery: {
        Args: {
          p_acrescimo_clima?: number
          p_agendado_para?: string
          p_cliente_celular: string
          p_cliente_id: string
          p_cliente_nome: string
          p_cpf_nota: string
          p_cupom_id: string
          p_desconto: number
          p_desconto_frete?: number
          p_distancia_km: number
          p_endereco_json: Json
          p_identificador: string
          p_itens: Json
          p_modalidade: string
          p_status_pagamento: string
          p_subtotal_itens: number
          p_taxa_entrega: number
          p_total: number
          p_valor_total: number
        }
        Returns: Json
      }
      distancia_km_coords: {
        Args: { p_lat1: number; p_lat2: number; p_lng1: number; p_lng2: number }
        Returns: number
      }
      eh_admin: { Args: never; Returns: boolean }
      estornar_insumos_pedido: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      exigir_admin: { Args: never; Returns: undefined }
      expirar_pedidos_delivery_padrao: { Args: never; Returns: number }
      explodir_ficha_insumos: {
        Args: { p_ficha_id: string; p_porcoes: number; p_so_ativa?: boolean }
        Returns: {
          insumo_id: string
          quantidade_base: number
        }[]
      }
      ficha_qtd_para_base: {
        Args: { p_quantidade: number; p_tipo: string; p_unidade: string }
        Returns: number
      }
      finalizar_lista_compras: { Args: { p_lista_id: string }; Returns: number }
      incrementar_uso_cupom: {
        Args: { p_cupom_id: string }
        Returns: undefined
      }
      insumo_compra_para_base: {
        Args: {
          p_conteudo_unidade: string
          p_conteudo_valor: number
          p_qtd_compra: number
          p_tipo: string
        }
        Returns: number
      }
      insumo_preco_base_da_embalagem: {
        Args: {
          p_conteudo_unidade: string
          p_conteudo_valor: number
          p_preco_embalagem: number
          p_tipo: string
        }
        Returns: number
      }
      listar_bairros_frete_geojson: { Args: never; Returns: Json }
      localizar_bairro_frete: {
        Args: { p_lat: number; p_lng: number }
        Returns: Json
      }
      loja_aberta_agora: { Args: never; Returns: Json }
      marcar_conversa_lida_admin: {
        Args: { p_conversa_id: string }
        Returns: undefined
      }
      marcar_conversa_lida_cliente: {
        Args: { p_conversa_id: string }
        Returns: undefined
      }
      perfil_embalagem_item: {
        Args: { p_modalidade: string; p_modo_consumo: string; p_origem: string }
        Returns: string
      }
      processar_pedido_pos_criacao: {
        Args: { p_cupom_id?: string; p_pedido_id: string }
        Returns: undefined
      }
      registrar_uso_cupom_ao_confirmar_pagamento: {
        Args: { p_pedido_id: string }
        Returns: undefined
      }
      resgatar_pontos: { Args: { p_cliente_id: string }; Returns: Json }
      salvar_push_subscription: {
        Args: {
          p_auth: string
          p_cliente_id?: string
          p_endpoint: string
          p_p256dh: string
          p_pedido_id?: string
        }
        Returns: undefined
      }
      taxa_minima_bairro_frete: { Args: never; Returns: number }
      validar_agendamento_delivery: {
        Args: { p_agendado_para: string }
        Returns: undefined
      }
      validar_cupom: {
        Args: { p_cliente_id?: string; p_codigo: string; p_subtotal: number }
        Returns: Json
      }
    }
    Enums: {
      disponibilidade_produto: "loja" | "levar" | "ambos"
      tipo_modalidade_pedido: "entrega" | "retirada"
      tipo_origem_pedido: "mesa" | "balcao" | "delivery" | "totem"
      tipo_produto: "simples" | "combo"
      tipo_status_pagamento:
        | "nao_aplicavel"
        | "aguardando"
        | "pago"
        | "na_loja"
        | "expirado"
        | "cancelado"
      tipo_status_pedido:
        | "pendente"
        | "em_producao"
        | "pronto"
        | "entregue"
        | "cancelado"
        | "pago"
        | "aguardando_pagamento"
      unidade_medida_produto: "g" | "kg" | "ml" | "L"
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
      disponibilidade_produto: ["loja", "levar", "ambos"],
      tipo_modalidade_pedido: ["entrega", "retirada"],
      tipo_origem_pedido: ["mesa", "balcao", "delivery", "totem"],
      tipo_produto: ["simples", "combo"],
      tipo_status_pagamento: [
        "nao_aplicavel",
        "aguardando",
        "pago",
        "na_loja",
        "expirado",
        "cancelado",
      ],
      tipo_status_pedido: [
        "pendente",
        "em_producao",
        "pronto",
        "entregue",
        "cancelado",
        "pago",
        "aguardando_pagamento",
      ],
      unidade_medida_produto: ["g", "kg", "ml", "L"],
    },
  },
} as const
