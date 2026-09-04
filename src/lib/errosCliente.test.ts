import { describe, expect, it } from "vitest";
import {
  MSG_ERRO_TECNICO_CLIENTE,
  classificarErroRpc,
  ErroNegocioCheckout,
  ErroTecnicoCheckout,
  mensagemToastCliente,
} from "./errosCliente";

describe("classificarErroRpc", () => {
  it("reconhece erro de negócio com prefixo", () => {
    const r = classificarErroRpc({
      message: "FORA_AREA: Endereço fora dos bairros.",
    });
    expect(r.tipo).toBe("negocio");
    if (r.tipo === "negocio") {
      expect(r.mensagem).toBe("Endereço fora dos bairros.");
    }
  });

  it("reconhece estoque insuficiente", () => {
    const r = classificarErroRpc({
      message: "Estoque insuficiente para o produto X",
    });
    expect(r.tipo).toBe("negocio");
  });

  it("trata function not unique como técnico", () => {
    const r = classificarErroRpc({
      message:
        "function public.localizar_bairro_frete(double precision, double precision) is not unique",
      code: "42725",
    });
    expect(r.tipo).toBe("tecnico");
    if (r.tipo === "tecnico") {
      expect(r.codigo).toBe("42725");
      expect(r.mensagem).toContain("is not unique");
    }
  });
});

describe("mensagemToastCliente", () => {
  it("mostra negócio", () => {
    expect(mensagemToastCliente(new ErroNegocioCheckout("Loja fechada"))).toBe(
      "Loja fechada",
    );
  });

  it("mostra genérico para técnico", () => {
    expect(
      mensagemToastCliente(new ErroTecnicoCheckout("is not unique", "42725")),
    ).toBe(MSG_ERRO_TECNICO_CLIENTE);
  });

  it("mostra genérico para Error comum", () => {
    expect(mensagemToastCliente(new Error("boom"))).toBe(
      MSG_ERRO_TECNICO_CLIENTE,
    );
  });
});
