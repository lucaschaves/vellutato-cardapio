import { formatarTelefoneBr } from "./telefone";
import { normalizarTelefoneParaSalvar } from "./telefone";

const KEY_GUEST = "delivery_guest_v1";
const KEY_ENDERECO = "delivery_endereco_ultimo_v1";

export interface DeliveryGuestLocal {
  nome: string;
  telefone: string;
  email: string;
  clienteId?: string | null;
}

export interface DeliveryEnderecoLocal {
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  complemento: string;
  referencia: string;
  latitude: number | null;
  longitude: number | null;
}

function lerJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function lerGuestDeliveryLocal(): DeliveryGuestLocal | null {
  const g = lerJson<DeliveryGuestLocal>(KEY_GUEST);
  if (!g?.telefone && !g?.nome) return null;
  return {
    nome: g.nome || "",
    telefone: g.telefone ? formatarTelefoneBr(g.telefone) : "",
    email: g.email || "",
    clienteId: g.clienteId || null,
  };
}

export function salvarGuestDeliveryLocal(dados: {
  nome: string;
  telefone: string;
  email?: string | null;
  clienteId?: string | null;
}): void {
  const telefone = normalizarTelefoneParaSalvar(dados.telefone);
  const payload: DeliveryGuestLocal = {
    nome: dados.nome.trim(),
    telefone,
    email: (dados.email || "").trim(),
    clienteId: dados.clienteId || null,
  };
  localStorage.setItem(KEY_GUEST, JSON.stringify(payload));
}

export function lerEnderecoDeliveryLocal(): DeliveryEnderecoLocal | null {
  const e = lerJson<DeliveryEnderecoLocal>(KEY_ENDERECO);
  if (!e?.cep || !e?.rua) return null;
  return {
    cep: e.cep || "",
    rua: e.rua || "",
    numero: e.numero || "",
    bairro: e.bairro || "",
    cidade: e.cidade || "",
    uf: e.uf || "",
    complemento: e.complemento || "",
    referencia: e.referencia || "",
    latitude: e.latitude ?? null,
    longitude: e.longitude ?? null,
  };
}

export function salvarEnderecoDeliveryLocal(
  endereco: DeliveryEnderecoLocal,
): void {
  localStorage.setItem(
    KEY_ENDERECO,
    JSON.stringify({
      cep: endereco.cep.replace(/\D/g, ""),
      rua: endereco.rua.trim(),
      numero: endereco.numero.trim(),
      bairro: endereco.bairro.trim(),
      cidade: endereco.cidade.trim(),
      uf: endereco.uf.trim().toUpperCase().slice(0, 2),
      complemento: (endereco.complemento || "").trim(),
      referencia: (endereco.referencia || "").trim(),
      latitude: endereco.latitude,
      longitude: endereco.longitude,
    }),
  );
}
