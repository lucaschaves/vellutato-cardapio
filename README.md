# Cardápio digital — Vellutato

App de cardápio, delivery, totem e operação de loja (KDS, caixa, estoque e impressão). Front em React; dados e regras de negócio no **Supabase** (Postgres + Realtime + Edge Functions).

## Canais

| Canal | URL | Uso |
|-------|-----|-----|
| Delivery | `/` | Cardápio, sacola, checkout, conta, pedidos, chat |
| Loja / mesa | `/inicio`, `/cardapio` | Cardápio no salão (QR da mesa) |
| Totem | `/totem` | Autoatendimento na loja |
| Admin | `/admin` | KDS, catálogo, clientes, delivery, insumos, impressão |

Rotas antigas `/delivery/*` e `/cardapio-toten/*` redirecionam para as URLs atuais.

## O que o sistema faz

**Cliente (delivery)**
- Catálogo, combos, adicionais e vendas cruzadas
- Entrega ou retirada; agendamento no mesmo dia (slots de 15 min) ou “o quanto antes”
- Frete por bairro/distância, cupons (incluindo acumulativos), pontos e resgate
- Pagamento Asaas (PIX / cartão) ou pagar na loja na retirada
- Conta: dados, endereços e extrato de pontos (pedidos ficam no header)
- Chat com a loja e acompanhamento do pedido

**Operação (admin)**
- KDS em colunas (Novos → Preparando → Pronto)
- Novo pedido pelo balcão (delivery, retirada, mesa, viagem) com os mesmos campos do checkout, inclusive agendamento
- Caixa, histórico, funcionamento da loja, chat, cupons, clientes
- Insumos (cadastro + lista) e lista de compras
- Cupom térmico configurável (vias cozinha/cliente)

**KDS, agendamento e impressão**
- Pedido imediato: imprime ao entrar em **Novos**; se ninguém clicar Preparar em **1 min**, sobe sozinho para Preparando
- Pedido **agendado**: fica em Novos **sem impressão**; **30 min antes** de `agendado_para` vai para Preparando e **aí imprime**
- Checkout online só entra no KDS depois de pago (ou `na_loja`). Sem pagamento em **10 min**, o pedido é apagado (mínimo do Asaas: `minutesToExpire` ≥ 10)

## Stack

- React 19 + TypeScript + Vite + Tailwind 4
- React Router, Zustand, Supabase JS
- Vitest, PWA (`vite-plugin-pwa`)
- Edge Functions (Asaas, Voa, SMS, push, WhatsApp)

## Desenvolvimento

```bash
npm install
npm run dev
```

```bash
npm run build
npm test
npm run lint
```

Impressão em dev gera PDF (`VITE_IMPRESSORA_MODO` padrão `pdf`). Em produção, POST para o servidor local da impressora.

## Variáveis de ambiente (front)

Crie um `.env` na raiz (não versionado):

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_VAPID_PUBLIC_KEY=          # opcional — Web Push
VITE_IMPRESSORA_URL=            # opcional — default http://localhost:8080/imprimir-comanda
VITE_IMPRESSORA_MODO=           # opcional — servidor | pdf
VITE_VIDEO_DIVULGACAO=          # opcional — vídeo da tela de boas-vindas
```

Chaves Asaas **não** vão no front. Secrets das Edge Functions: `supabase/functions/README.md`.

## Segurança (admin e guest)

- Staff: usuários Auth do Supabase com `app_metadata.role = admin` (não `user_metadata`). Após aplicar a migration, **todos os admins precisam sair e entrar de novo** para o JWT trazer o papel.
- Delivery: cliente **guest por telefone** (sem Google/SMS por enquanto). Busca de cliente por telefone permanece.
- Edge Functions de checkout/confirmação exigem JWT anon ou admin e `pedido_id` UUID. Webhooks Asaas/Voa recusam se o secret estiver vazio.
- CORS das functions: só `https://vellutatocookies.com.br` e localhost. `SITE_URL` de produção: `https://vellutatocookies.com.br`.

## Backend (Supabase)

Migrations em `supabase/migrations/`. Aplique no projeto remoto pelo Dashboard ou CLI. A migration `20260813220000_seguranca_admin_rls.sql` precisa ir para o projeto **antes** de depender do papel admin no KDS.

Edge Functions (deploy e secrets no README das functions):

- `criar-checkout-asaas` / `webhook-asaas` / `confirmar-pagamento-asaas` / `asaas-callback`
- `send-sms` (OTP KingSMS)
- `voa-enviar-pedido` / `webhook-voa`
- `notificar-status-pedido` / `webhook-whatsapp`

```bash
npx supabase functions deploy criar-checkout-asaas --project-ref <ref>
```

## Admin (atalhos)

KDS · Novo pedido · Caixa · Lista de compras — `/admin/pedidos`, `/admin/novo-pedido`, `/admin/caixa`, `/admin/lista-compras`.
