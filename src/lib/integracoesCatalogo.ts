export type CampoIntegracao = {
  chave: string;
  label: string;
  /** Campo sensível (password no form). */
  secreto?: boolean;
  ajuda?: string;
  placeholder?: string;
  tipo?: "text" | "url" | "select";
  opcoes?: { valor: string; label: string }[];
};

export type GrupoIntegracao = {
  id: string;
  titulo: string;
  descricao: string;
  campos: CampoIntegracao[];
  /** Só informativo — não grava no banco. */
  somenteInfo?: boolean;
  infoTexto?: string;
};

/** Catálogo editável no admin (espelha secrets das edge functions). */
export const CATALOGO_INTEGRACOES: GrupoIntegracao[] = [
  {
    id: "geral",
    titulo: "Geral",
    descricao: "URLs e ajustes usados em redirects e notificações.",
    campos: [
      {
        chave: "SITE_URL",
        label: "URL pública do site",
        tipo: "url",
        placeholder: "https://seu-dominio.com",
        ajuda: "Usada em links de pagamento e notificações push. Em produção use HTTPS.",
      },
    ],
  },
  {
    id: "asaas",
    titulo: "Asaas (pagamentos)",
    descricao: "Checkout PIX/cartão do delivery.",
    campos: [
      {
        chave: "ASAAS_API_KEY",
        label: "API Key",
        secreto: true,
        placeholder: "$aact_...",
        ajuda: "Chave da API no painel Asaas (sandbox ou produção).",
      },
      {
        chave: "ASAAS_ENV",
        label: "Ambiente",
        tipo: "select",
        opcoes: [
          { valor: "sandbox", label: "Sandbox (homologação)" },
          { valor: "production", label: "Produção" },
        ],
      },
      {
        chave: "ASAAS_API_URL",
        label: "URL da API (opcional)",
        tipo: "url",
        placeholder: "https://api-sandbox.asaas.com/v3",
        ajuda: "Deixe vazio para usar o padrão do ambiente escolhido.",
      },
      {
        chave: "ASAAS_WEBHOOK_TOKEN",
        label: "Token do webhook",
        secreto: true,
        ajuda: "Mesmo token configurado no painel Asaas (header asaas-access-token).",
      },
    ],
  },
  {
    id: "voa",
    titulo: "VOA Delivery",
    descricao: "Envio de pedidos para a plataforma VOA (motoboy).",
    campos: [
      {
        chave: "VOA_KEY",
        label: "Key (plataforma)",
        secreto: true,
        ajuda: "Chave fornecida pela VOA para a plataforma.",
      },
      {
        chave: "VOA_TOKEN",
        label: "Token (restaurante)",
        secreto: true,
        ajuda: "Token do painel do restaurante na VOA.",
      },
      {
        chave: "VOA_API_URL",
        label: "URL da API (opcional)",
        tipo: "url",
        placeholder: "https://api.voa.delivery",
      },
      {
        chave: "VOA_WEBHOOK_TOKEN",
        label: "Token do webhook",
        secreto: true,
        ajuda: "Token que a VOA envia nas atualizações de status.",
      },
    ],
  },
  {
    id: "whatsapp",
    titulo: "WhatsApp (Meta Cloud API)",
    descricao:
      "Envio automático de status (opcional). O número exibido no wa.me fica em Admin → Delivery.",
    campos: [
      {
        chave: "WHATSAPP_TOKEN",
        label: "Token permanente",
        secreto: true,
      },
      {
        chave: "WHATSAPP_PHONE_NUMBER_ID",
        label: "Phone Number ID",
        ajuda: "ID do número no Meta Business.",
      },
      {
        chave: "WHATSAPP_VERIFY_TOKEN",
        label: "Verify token (webhook)",
        secreto: true,
        ajuda: "Token inventado por você para verificar o webhook no Meta.",
      },
    ],
  },
  {
    id: "push",
    titulo: "Web Push (VAPID)",
    descricao: "Notificações no navegador do cliente.",
    campos: [
      {
        chave: "VAPID_PUBLIC_KEY",
        label: "Chave pública",
        ajuda:
          "Também precisa estar em VITE_VAPID_PUBLIC_KEY no front (rebuild após alterar).",
      },
      {
        chave: "VAPID_PRIVATE_KEY",
        label: "Chave privada",
        secreto: true,
      },
      {
        chave: "VAPID_SUBJECT",
        label: "Subject",
        placeholder: "mailto:contato@suaempresa.com",
      },
    ],
  },
  {
    id: "sms",
    titulo: "KingSMS (OTP)",
    descricao: "Envio de código SMS no login/checkout.",
    campos: [
      {
        chave: "KINGSMS_LOGIN",
        label: "Login",
      },
      {
        chave: "KINGSMS_TOKEN",
        label: "Token",
        secreto: true,
      },
      {
        chave: "SEND_SMS_HOOK_SECRET",
        label: "Send SMS Hook Secret",
        secreto: true,
        ajuda:
          "Gerado no Dashboard Supabase (Authentication → Hooks → Send SMS). Formato v1,whsec_...",
      },
    ],
  },
  {
    id: "google",
    titulo: "Google (login)",
    descricao: "OAuth do Google é configurado no painel do Supabase, não nesta tela.",
    somenteInfo: true,
    infoTexto:
      "Em Authentication → Providers → Google, informe Client ID e Client Secret do Google Cloud Console. Adicione a URL de redirect /auth/callback.",
    campos: [],
  },
];

export function todasChavesIntegracoes(): string[] {
  return CATALOGO_INTEGRACOES.flatMap((g) => g.campos.map((c) => c.chave));
}
