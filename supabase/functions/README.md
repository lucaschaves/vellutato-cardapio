# Secrets das Edge Functions

Configure no Dashboard (Project Settings → Edge Functions → Secrets) ou via CLI:

```bash
npx supabase secrets set --project-ref uhaapfxdxivmwhvnuyie \
  ASAAS_API_KEY="sua_chave_sandbox" \
  ASAAS_API_URL="https://api-sandbox.asaas.com/v3" \
  ASAAS_ENV="sandbox" \
  ASAAS_WEBHOOK_TOKEN="um-token-secreto" \
  SITE_URL="http://localhost:5173" \
  KINGSMS_LOGIN="seu_login" \
  KINGSMS_TOKEN="seu_token" \
  SEND_SMS_HOOK_SECRET="v1,whsec_..."
```

## Asaas (sandbox)

| Secret | Valor sandbox |
|--------|----------------|
| `ASAAS_API_KEY` | Chave `$aact_hmlg_...` do painel Asaas Sandbox |
| `ASAAS_API_URL` | `https://api-sandbox.asaas.com/v3` |
| `ASAAS_ENV` | `sandbox` (ou `production`) |
| `ASAAS_WEBHOOK_TOKEN` | Token que você define; mesmo valor no header do webhook |
| `SITE_URL` | URL pública do front em **https** (produção). Em localhost o checkout usa o bridge `asaas-callback`. |

**Nunca** use `VITE_ASAAS_*` — a chave iria para o browser.

### Webhook no painel Asaas (Sandbox)

- URL: `https://uhaapfxdxivmwhvnuyie.supabase.co/functions/v1/webhook-asaas`
- **Token de autenticação** no Asaas: o mesmo valor de `ASAAS_WEBHOOK_TOKEN` (vai no header `asaas-access-token`)
- Eventos: `CHECKOUT_PAID`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`
- A function `webhook-asaas` está com `verify_jwt = false` (obrigatório — Asaas não manda JWT do Supabase)

Se a situação ficar **Interrompido**:
1. Confira se o token do painel = `ASAAS_WEBHOOK_TOKEN`
2. Nos logs da function, veja se houve 401
3. No painel Asaas, edite o webhook e desmarque/reative a fila (`interrupted: false`), ou use “Reativar fila”

## Auth SMS (KingSMS + Send SMS Hook)

Envia OTP de login/checkout via gateway brasileiro (sem Twilio).

| Secret | Onde obter |
|--------|------------|
| `KINGSMS_LOGIN` | Painel KingSMS (login da conta) |
| `KINGSMS_TOKEN` | Painel → Informações da Conta → token |
| `SEND_SMS_HOOK_SECRET` | Gerado ao criar o hook no Dashboard (formato `v1,whsec_...`) |

### Ativar no Dashboard Supabase

1. **Authentication → Providers → Phone** → Enable Phone provider  
   (não precisa configurar Twilio se o Send SMS Hook estiver ativo)
2. **Authentication → Hooks → Send SMS** → Enable  
   - Hook type: **HTTPS**  
   - URL: `https://uhaapfxdxivmwhvnuyie.supabase.co/functions/v1/send-sms`  
   - Gere/copie o secret → grave em `SEND_SMS_HOOK_SECRET`
3. Deploy e secrets:

```bash
npx supabase secrets set --project-ref uhaapfxdxivmwhvnuyie \
  KINGSMS_LOGIN="..." \
  KINGSMS_TOKEN="..." \
  SEND_SMS_HOOK_SECRET="v1,whsec_..."

npx supabase functions deploy send-sms --project-ref uhaapfxdxivmwhvnuyie
```

Fluxo: `signInWithOtp` → Auth gera OTP → hook chama `send-sms` → KingSMS → `verifyOtp` no app.

Só números **+55** (Brasil). Mensagem sem acento (limite KingSMS 160 chars).

### Deploy

```bash
npx supabase functions deploy criar-checkout-asaas --project-ref uhaapfxdxivmwhvnuyie
npx supabase functions deploy webhook-asaas --project-ref uhaapfxdxivmwhvnuyie
npx supabase functions deploy voa-enviar-pedido --project-ref uhaapfxdxivmwhvnuyie
npx supabase functions deploy webhook-voa --project-ref uhaapfxdxivmwhvnuyie
npx supabase functions deploy send-sms --project-ref uhaapfxdxivmwhvnuyie
npx supabase functions deploy notificar-status-pedido --project-ref uhaapfxdxivmwhvnuyie
npx supabase functions deploy webhook-whatsapp --project-ref uhaapfxdxivmwhvnuyie
npx supabase functions deploy confirmar-pagamento-asaas --project-ref uhaapfxdxivmwhvnuyie
```

## Notificações (Web Push + WhatsApp)

### Fluxo

1. Cliente na tela do pedido ativa **notificações** (Web Push) e/ou toca **Acompanhar no WhatsApp** (`wa.me`).
2. WhatsApp API automática (janela 24h) é opcional — secrets Meta só quando for ativar.
3. No KDS, ao mudar status → `notificar-status-pedido` envia push (+ WhatsApp API se configurado).

### Retorno Asaas (?pago=1)

A tela chama `confirmar-pagamento-asaas` (consulta cobranças por `externalReference`) e faz polling até marcar `pago`, mesmo se o webhook atrasar.

Rode também a migration `20250723160000_pedidos_realtime.sql` para `pedidos` no Realtime.

### Secrets (Edge)

| Secret | Uso |
|--------|-----|
| `VAPID_PUBLIC_KEY` | Chave pública Web Push |
| `VAPID_PRIVATE_KEY` | Chave privada Web Push |
| `VAPID_SUBJECT` | Ex: `mailto:seu@email.com` |
| `WHATSAPP_TOKEN` | Token permanente Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número no Meta |
| `WHATSAPP_VERIFY_TOKEN` | Token que você inventa para verificar o webhook |
| `SITE_URL` | URL https do front (link na notificação) |

Gerar VAPID (uma vez):

```bash
npx web-push generate-vapid-keys
```

Front (`.env`):

```bash
VITE_VAPID_PUBLIC_KEY="a_mesma_chave_publica"
```

Webhook Meta (Dashboard → WhatsApp → Configuration):

- Callback URL: `https://<project-ref>.supabase.co/functions/v1/webhook-whatsapp`
- Verify token: o mesmo de `WHATSAPP_VERIFY_TOKEN`
- Eventos: `messages`

Admin → Delivery: preencher **Número da loja** (ex: `5511999999999`) — o mesmo da API.

Migration: `20250723150000_notificacoes_push_whatsapp.sql`

## Fluxo KDS / impressão

1. Checkout online cria pedido com `status_pagamento = aguardando` → **não** aparece no KDS e **não** imprime.
2. Webhook Asaas marca `pago` + `status = pendente` → aí entra no KDS e imprime.
3. Retirada com “pagar na loja” (`na_loja`) entra direto na cozinha.
