import { supabase } from "./supabase";
import { normalizarTelefoneParaSalvar } from "./telefone";

export interface ClienteDelivery {
  id: string;
  nome: string;
  celular: string | null;
  cpf: string | null;
  email: string | null;
  auth_user_id: string | null;
  total_pedidos: number;
  valor_gasto: number;
}

export interface EnderecoCliente {
  id: string;
  cliente_id: string;
  rotulo: string | null;
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  complemento: string | null;
  referencia: string | null;
  latitude: number | null;
  longitude: number | null;
  padrao: boolean;
}

function soDigitosCpf(cpf: string): string {
  return cpf.replace(/\D/g, "").slice(0, 11);
}

export function formatarCpf(valor: string): string {
  const d = soDigitosCpf(valor);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9)
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function cpfValido(cpf: string): boolean {
  const d = soDigitosCpf(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += Number(d[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  if (resto !== Number(d[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += Number(d[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10) resto = 0;
  return resto === Number(d[10]);
}

function mapClienteDelivery(data: {
  id: string;
  nome: string;
  celular: string | null;
  cpf: string | null;
  email: string | null;
  auth_user_id: string | null;
  total_pedidos: number | null;
  valor_gasto: number | null;
}): ClienteDelivery {
  return {
    id: data.id,
    nome: data.nome,
    celular: data.celular,
    cpf: data.cpf,
    email: data.email,
    auth_user_id: data.auth_user_id,
    total_pedidos: Number(data.total_pedidos ?? 0),
    valor_gasto: Number(data.valor_gasto ?? 0),
  };
}

const SELECT_CLIENTE_DELIVERY =
  "id, nome, celular, cpf, email, auth_user_id, total_pedidos, valor_gasto";

export async function buscarClientePorAuthUserId(
  authUserId: string,
): Promise<ClienteDelivery | null> {
  const { data, error } = await supabase
    .from("clientes")
    .select(SELECT_CLIENTE_DELIVERY)
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapClienteDelivery(data);
}

export async function buscarClienteDeliveryPorCelular(
  celular: string,
): Promise<ClienteDelivery | null> {
  const celularNormalizado = normalizarTelefoneParaSalvar(celular);
  if (celularNormalizado.length < 10) return null;

  const { data, error } = await supabase
    .from("clientes")
    .select(SELECT_CLIENTE_DELIVERY)
    .eq("celular", celularNormalizado)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapClienteDelivery(data);
}

/**
 * Após login (Google ou SMS): resolve o registro em `clientes`.
 * Prioriza auth_user_id; depois celular do Auth; cria stub mínimo se preciso.
 */
export async function resolverClienteAposAuth(opts: {
  authUserId: string;
  /** Celular do Auth (E.164 ou dígitos BR). */
  phone?: string | null;
  nomeSugestao?: string | null;
  emailSugestao?: string | null;
}): Promise<ClienteDelivery | null> {
  const porAuth = await buscarClientePorAuthUserId(opts.authUserId);
  if (porAuth) return porAuth;

  let celularDigitos = "";
  if (opts.phone) {
    let d = opts.phone.replace(/\D/g, "");
    if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
    celularDigitos = d.slice(0, 11);
  }

  if (celularDigitos.length >= 10) {
    const porCelular = await buscarClienteDeliveryPorCelular(celularDigitos);
    if (porCelular) {
      if (
        porCelular.auth_user_id &&
        porCelular.auth_user_id !== opts.authUserId
      ) {
        throw new Error(
          "Este telefone já está vinculado a outra conta. Entre com a conta correta.",
        );
      }
      const { data, error } = await supabase
        .from("clientes")
        .update({
          auth_user_id: opts.authUserId,
          email: opts.emailSugestao?.trim() || porCelular.email,
          nome:
            porCelular.nome?.trim() ||
            opts.nomeSugestao?.trim() ||
            porCelular.nome,
        })
        .eq("id", porCelular.id)
        .select(SELECT_CLIENTE_DELIVERY)
        .single();
      if (error) throw new Error(error.message);
      return mapClienteDelivery(data);
    }

    const nome =
      opts.nomeSugestao?.trim() ||
      `Cliente ${celularDigitos.slice(-4)}`;
    const { data, error } = await supabase
      .from("clientes")
      .insert({
        nome,
        celular: celularDigitos,
        email: opts.emailSugestao?.trim() || null,
        auth_user_id: opts.authUserId,
      })
      .select(SELECT_CLIENTE_DELIVERY)
      .single();
    if (error) throw new Error(error.message);
    return mapClienteDelivery(data);
  }

  return null;
}

/** Cria ou atualiza cliente vinculado ao usuário autenticado (Google).
 * Prioriza match por celular (cadastro presencial / delivery antigo). */
export async function upsertClienteAuth(opts: {
  authUserId: string;
  nome: string;
  email?: string | null;
  celular?: string | null;
  cpf?: string | null;
}): Promise<ClienteDelivery> {
  const nome = opts.nome.trim();
  if (!nome) throw new Error("Nome obrigatório.");

  const celular = opts.celular
    ? normalizarTelefoneParaSalvar(opts.celular)
    : null;
  if (!celular || celular.length < 10) {
    throw new Error("Celular obrigatório.");
  }
  const cpf = opts.cpf ? soDigitosCpf(opts.cpf) : null;
  const email = opts.email?.trim() || null;

  const porAuth = await buscarClientePorAuthUserId(opts.authUserId);
  const porCelular = await buscarClienteDeliveryPorCelular(celular);

  if (
    porCelular?.auth_user_id &&
    porCelular.auth_user_id !== opts.authUserId
  ) {
    throw new Error(
      "Este telefone já está vinculado a outra conta Google.",
    );
  }

  // Telefone já existe → vincula e atualiza
  if (porCelular) {
    // Se havia outro registro só do Google (stub antigo), desvincula
    if (porAuth && porAuth.id !== porCelular.id) {
      await supabase
        .from("clientes")
        .update({ auth_user_id: null })
        .eq("id", porAuth.id);
    }

    const { data, error } = await supabase
      .from("clientes")
      .update({
        auth_user_id: opts.authUserId,
        nome,
        email: email || porCelular.email,
        celular,
        cpf: cpf || porCelular.cpf,
      })
      .eq("id", porCelular.id)
      .select(SELECT_CLIENTE_DELIVERY)
      .single();
    if (error) throw new Error(error.message);
    return mapClienteDelivery(data);
  }

  // Já vinculado ao Google, sem conflito de telefone → atualiza
  if (porAuth) {
    const { data, error } = await supabase
      .from("clientes")
      .update({
        nome,
        email: email || porAuth.email,
        celular,
        cpf: cpf || porAuth.cpf,
      })
      .eq("id", porAuth.id)
      .select(SELECT_CLIENTE_DELIVERY)
      .single();
    if (error) throw new Error(error.message);
    return mapClienteDelivery(data);
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      auth_user_id: opts.authUserId,
      nome,
      email,
      celular,
      cpf,
    })
    .select(SELECT_CLIENTE_DELIVERY)
    .single();

  if (error) throw new Error(error.message);
  return mapClienteDelivery(data);
}

export function cadastroDeliveryCompleto(c: ClienteDelivery | null): boolean {
  if (!c) return false;
  return Boolean(
    c.nome?.trim() &&
      c.cpf &&
      soDigitosCpf(c.cpf).length === 11 &&
      c.celular &&
      normalizarTelefoneParaSalvar(c.celular).length >= 10,
  );
}

/** Convidado no checkout: encontra por telefone ou cria cliente sem Google. */
export async function garantirClienteCheckout(opts: {
  nome: string;
  celular: string;
  email?: string | null;
}): Promise<ClienteDelivery> {
  const nome = opts.nome.trim();
  if (!nome) throw new Error("Informe seu nome.");

  const celular = normalizarTelefoneParaSalvar(opts.celular);
  if (celular.length < 10) {
    throw new Error("Informe um telefone válido com DDD.");
  }

  const email = opts.email?.trim() || null;
  const existente = await buscarClienteDeliveryPorCelular(celular);

  if (existente) {
    const { data, error } = await supabase
      .from("clientes")
      .update({
        nome,
        email: email || existente.email,
        celular,
      })
      .eq("id", existente.id)
      .select(SELECT_CLIENTE_DELIVERY)
      .single();
    if (error) throw new Error(error.message);
    return mapClienteDelivery(data);
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      nome,
      email,
      celular,
      auth_user_id: null,
    })
    .select(SELECT_CLIENTE_DELIVERY)
    .single();

  if (error) throw new Error(error.message);
  return mapClienteDelivery(data);
}

export async function listarEnderecos(
  clienteId: string,
): Promise<EnderecoCliente[]> {
  const { data, error } = await supabase
    .from("cliente_enderecos")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("padrao", { ascending: false })
    .order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EnderecoCliente[];
}

export async function salvarEndereco(
  endereco: Omit<EnderecoCliente, "id"> & { id?: string },
): Promise<EnderecoCliente> {
  if (endereco.padrao) {
    await supabase
      .from("cliente_enderecos")
      .update({ padrao: false })
      .eq("cliente_id", endereco.cliente_id);
  }

  const cepLimpo = endereco.cep.replace(/\D/g, "");
  const payload = {
    cliente_id: endereco.cliente_id,
    rotulo: endereco.rotulo,
    cep: cepLimpo,
    rua: endereco.rua,
    numero: endereco.numero,
    bairro: endereco.bairro,
    cidade: endereco.cidade,
    uf: endereco.uf,
    complemento: endereco.complemento,
    referencia: endereco.referencia,
    latitude: endereco.latitude,
    longitude: endereco.longitude,
    padrao: endereco.padrao,
    atualizado_em: new Date().toISOString(),
  };

  // Evita duplicar o mesmo CEP+número do cliente
  if (!endereco.id) {
    const { data: existente } = await supabase
      .from("cliente_enderecos")
      .select("id")
      .eq("cliente_id", endereco.cliente_id)
      .eq("cep", cepLimpo)
      .eq("numero", endereco.numero)
      .maybeSingle();
    if (existente?.id) {
      const { data, error } = await supabase
        .from("cliente_enderecos")
        .update(payload)
        .eq("id", existente.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return data as EnderecoCliente;
    }
  }

  if (endereco.id) {
    const { data, error } = await supabase
      .from("cliente_enderecos")
      .update(payload)
      .eq("id", endereco.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data as EnderecoCliente;
  }

  const { data, error } = await supabase
    .from("cliente_enderecos")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as EnderecoCliente;
}

export async function excluirEndereco(id: string): Promise<void> {
  const { error } = await supabase
    .from("cliente_enderecos")
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Busca endereço via ViaCEP + geocode Nominatim (OpenStreetMap). */
export async function buscarCep(cep: string): Promise<{
  rua: string;
  bairro: string;
  cidade: string;
  uf: string;
} | null> {
  const limpo = cep.replace(/\D/g, "");
  if (limpo.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
  const data = await res.json();
  if (data.erro) return null;
  return {
    rua: data.logradouro || "",
    bairro: data.bairro || "",
    cidade: data.localidade || "",
    uf: data.uf || "",
  };
}

type NominatimHit = { lat: string; lon: string };

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  // Política de uso do Nominatim exige identificar o app
  "User-Agent": "VellutatoCardapioDigital/1.0 (delivery)",
};

async function nominatimBusca(
  params: Record<string, string>,
): Promise<{ latitude: number; longitude: number } | null> {
  const qs = new URLSearchParams({
    format: "json",
    limit: "1",
    addressdetails: "0",
    countrycodes: "br",
    ...params,
  });
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${qs.toString()}`,
    { headers: NOMINATIM_HEADERS },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as NominatimHit[];
  if (!data?.[0]?.lat || !data?.[0]?.lon) return null;
  const latitude = Number(data[0].lat);
  const longitude = Number(data[0].lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

/**
 * Geocodifica endereço no Brasil.
 * Usa busca estruturada do Nominatim (mais precisa) e fallbacks progressivos.
 */
export async function geocodificarEndereco(opts: {
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
}): Promise<{ latitude: number; longitude: number } | null> {
  const rua = (opts.rua || "").trim();
  const numero = (opts.numero || "").trim();
  const bairro = (opts.bairro || "").trim();
  const cidade = (opts.cidade || "").trim();
  const uf = (opts.uf || "").trim().toUpperCase().slice(0, 2);
  const cep = (opts.cep || "").replace(/\D/g, "");

  if (!cidade && !cep) {
    throw new Error("Informe cidade ou CEP para localizar o endereço.");
  }
  if (!rua && !cep) {
    throw new Error("Informe a rua ou o CEP para localizar o endereço.");
  }

  // 1) Estruturado: rua + número + cidade + UF + CEP
  if (rua && cidade) {
    const street = [numero, rua].filter(Boolean).join(" ").trim();
    const hit = await nominatimBusca({
      street,
      city: cidade,
      ...(uf ? { state: uf } : {}),
      ...(cep.length === 8 ? { postalcode: cep } : {}),
      country: "Brazil",
    });
    if (hit) return hit;
  }

  // 2) Estruturado sem número (ponto médio da rua)
  if (rua && cidade) {
    const hit = await nominatimBusca({
      street: rua,
      city: cidade,
      ...(uf ? { state: uf } : {}),
      ...(cep.length === 8 ? { postalcode: cep } : {}),
      country: "Brazil",
    });
    if (hit) return hit;
  }

  // 3) Texto livre só com partes preenchidas (evita ", , , Brasil")
  const partes = [rua, numero, bairro, cidade, uf, cep, "Brasil"].filter(
    (p) => Boolean(p && String(p).trim()),
  );
  if (partes.length >= 2) {
    const hit = await nominatimBusca({ q: partes.join(", ") });
    if (hit) return hit;
  }

  // 4) Só CEP (centroide aproximado do código postal)
  if (cep.length === 8) {
    const hit = await nominatimBusca({
      postalcode: cep,
      country: "Brazil",
      ...(cidade ? { city: cidade } : {}),
      ...(uf ? { state: uf } : {}),
    });
    if (hit) return hit;
  }

  return null;
}
