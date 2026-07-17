const CHAVE_TEMA_ESCURO = "exibicao_tema_escuro";
const CHAVE_ESCALA_FONTE = "exibicao_escala_fonte";

const ESCALAS_VALIDAS = [100, 110, 120] as const;

export type EscalaFonte = (typeof ESCALAS_VALIDAS)[number];

export function lerTemaEscuro(): boolean {
  const salvo = localStorage.getItem(CHAVE_TEMA_ESCURO);
  if (salvo === null) return false;
  return salvo === "true";
}

export function lerEscalaFonte(): EscalaFonte {
  const salvo = localStorage.getItem(CHAVE_ESCALA_FONTE);
  const valor = salvo ? Number(salvo) : 100;
  return ESCALAS_VALIDAS.includes(valor as EscalaFonte)
    ? (valor as EscalaFonte)
    : 100;
}

export function aplicarTemaEscuro(temaEscuro: boolean) {
  document.documentElement.classList.toggle("dark", temaEscuro);
}

export function aplicarEscalaFonte(escala: number) {
  document.documentElement.style.fontSize = `${escala}%`;
}

export function salvarTemaEscuro(temaEscuro: boolean) {
  localStorage.setItem(CHAVE_TEMA_ESCURO, String(temaEscuro));
  aplicarTemaEscuro(temaEscuro);
}

export function salvarEscalaFonte(escala: EscalaFonte) {
  localStorage.setItem(CHAVE_ESCALA_FONTE, String(escala));
  aplicarEscalaFonte(escala);
}

export function aplicarPreferenciasExibicaoSalvas() {
  aplicarTemaEscuro(lerTemaEscuro());
  aplicarEscalaFonte(lerEscalaFonte());
}
