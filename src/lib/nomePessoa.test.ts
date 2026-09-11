import { describe, expect, it } from "vitest";
import {
  mensagemNomeIncompleto,
  nomeCompletoValido,
  partesNomePessoa,
} from "./nomePessoa";

describe("nomePessoa", () => {
  it("exige pelo menos duas partes", () => {
    expect(nomeCompletoValido("Clara")).toBe(false);
    expect(nomeCompletoValido("Clara Provin")).toBe(true);
    expect(nomeCompletoValido("Clara Cecília Provin")).toBe(true);
  });

  it("ignora espaços extras", () => {
    expect(partesNomePessoa("  Ana   Paula  ")).toEqual(["Ana", "Paula"]);
    expect(nomeCompletoValido("  Ana   Paula  ")).toBe(true);
  });

  it("rejeita partes muito curtas", () => {
    expect(nomeCompletoValido("A Silva")).toBe(false);
    expect(nomeCompletoValido("Jo Silva")).toBe(true);
  });

  it("mensagem amigável", () => {
    expect(mensagemNomeIncompleto("")).toMatch(/nome e sobrenome/i);
    expect(mensagemNomeIncompleto("Clara")).toMatch(/nome e sobrenome/i);
    expect(mensagemNomeIncompleto("Clara Provin")).toBeNull();
  });
});
