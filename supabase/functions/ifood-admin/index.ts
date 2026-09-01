import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsBrowser, respostaOpcoes } from "../_shared/cors.ts";
import { ehAdminRequest } from "../_shared/jwt.ts";
import {
  carregarCredenciaisIfood,
  criarInterrupcao,
  listarInterrupcoes,
  listarItensCatalogo,
  motivosCancelamento,
  obterAccessTokenIfood,
  patchItemPrice,
  patchItemStatus,
  removerInterrupcao,
  solicitarCancelamento,
  statusMerchant,
} from "../_shared/ifood.ts";

function json(data: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(req ? corsBrowser(req) : {}),
    },
  });
}

async function statusDisponivelLocal(
  sb: ReturnType<typeof createClient>,
  p: {
    id?: string;
    ativo?: boolean | null;
    controlar_estoque?: boolean | null;
    quantidade_estoque?: number | null;
    encomenda_programada?: boolean | null;
  },
): Promise<"AVAILABLE" | "UNAVAILABLE"> {
  if (!p.ativo) return "UNAVAILABLE";
  if (p.encomenda_programada && p.id) {
    const { data, error } = await sb.rpc("produto_disponivel_ifood", {
      p_produto_id: p.id,
    });
    if (!error && data === true) return "AVAILABLE";
    if (!error && data === false) return "UNAVAILABLE";
  }
  if (p.controlar_estoque && Number(p.quantidade_estoque ?? 0) <= 0) {
    return "UNAVAILABLE";
  }
  return "AVAILABLE";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return respostaOpcoes(req);

  if (!ehAdminRequest(req)) {
    return json({ erro: "Não autorizado" }, 401, req);
  }

  try {
    const url = new URL(req.url);
    const acao = url.searchParams.get("acao") ||
      (req.method === "GET" ? "ping" : "");
    const body = req.method !== "GET" && req.method !== "HEAD"
      ? await req.json().catch(() => ({}))
      : {};
    const acaoFinal = (body as { acao?: string }).acao || acao;

    const cred = await carregarCredenciaisIfood();
    const token = await obterAccessTokenIfood(cred);
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    if (acaoFinal === "ping") {
      return json({ ok: true, merchantId: cred.merchantId }, 200, req);
    }

    if (acaoFinal === "status-loja") {
      const [status, interrupcoes] = await Promise.all([
        statusMerchant(token, cred.merchantId),
        listarInterrupcoes(token, cred.merchantId),
      ]);
      return json({ ok: true, status, interrupcoes }, 200, req);
    }

    if (acaoFinal === "pausar-loja") {
      const minutos = Math.max(
        1,
        Math.min(24 * 60, Number((body as { minutos?: number }).minutos) || 30),
      );
      const description = String(
        (body as { description?: string }).description ||
          `Pausa de ${minutos} minutos (cardápio digital)`,
      ).slice(0, 250);
      const start = new Date().toISOString();
      const end = new Date(Date.now() + minutos * 60_000).toISOString();
      const criada = await criarInterrupcao(token, cred.merchantId, {
        description,
        start,
        end,
      });
      const id = typeof criada === "object" && criada && "id" in criada
        ? String((criada as { id: string }).id)
        : null;
      if (id) {
        await sb.from("integracoes_config").upsert({
          chave: "IFOOD_INTERRUPTION_ID",
          valor: id,
          rotulo: "Interrupção iFood ativa",
          atualizado_em: new Date().toISOString(),
        });
      }
      return json({ ok: true, interrupcao: criada, minutos }, 200, req);
    }

    if (acaoFinal === "reabrir-loja") {
      let interruptionId = String(
        (body as { interruptionId?: string }).interruptionId || "",
      ).trim();
      if (!interruptionId) {
        const { data } = await sb
          .from("integracoes_config")
          .select("valor")
          .eq("chave", "IFOOD_INTERRUPTION_ID")
          .maybeSingle();
        interruptionId = (data?.valor || "").trim();
      }
      if (!interruptionId) {
        const lista = await listarInterrupcoes(token, cred.merchantId);
        const agora = Date.now();
        for (const raw of lista) {
          const it = raw as { id?: string; end?: string };
          if (!it.id) continue;
          if (!it.end || new Date(it.end).getTime() > agora) {
            await removerInterrupcao(token, cred.merchantId, String(it.id));
          }
        }
      } else {
        await removerInterrupcao(token, cred.merchantId, interruptionId);
      }
      await sb.from("integracoes_config").upsert({
        chave: "IFOOD_INTERRUPTION_ID",
        valor: "",
        rotulo: "Interrupção iFood ativa",
        atualizado_em: new Date().toISOString(),
      });
      return json({ ok: true }, 200, req);
    }

    if (acaoFinal === "listar-catalogo") {
      const itens = await listarItensCatalogo(token, cred.merchantId);
      return json({ ok: true, itens }, 200, req);
    }

    if (acaoFinal === "sync-produto") {
      const produtoId = String(
        (body as { produto_id?: string }).produto_id || "",
      ).trim();
      if (!produtoId) return json({ erro: "produto_id obrigatório" }, 400, req);

      const { data: mapa } = await sb
        .from("ifood_mapeamentos")
        .select("external_code, ifood_item_id, produto_id")
        .eq("produto_id", produtoId)
        .maybeSingle();

      if (!mapa?.ifood_item_id) {
        return json({
          ok: false,
          ignorado: true,
          motivo: "Sem ifood_item_id no mapeamento",
        }, 200, req);
      }

      const { data: produto } = await sb
        .from("produtos")
        .select("id, nome, preco, preco_ifood, ativo, controlar_estoque, quantidade_estoque, encomenda_programada")
        .eq("id", produtoId)
        .maybeSingle();

      if (!produto) return json({ erro: "Produto não encontrado" }, 404, req);

      const status = await statusDisponivelLocal(sb, produto);
      const precoRaw =
        produto.preco_ifood != null ? produto.preco_ifood : produto.preco;
      const preco = Number(precoRaw);

      const [st, pr] = await Promise.all([
        patchItemStatus(token, cred.merchantId, {
          itemId: mapa.ifood_item_id,
          status,
        }),
        Number.isFinite(preco)
          ? patchItemPrice(token, cred.merchantId, {
            itemId: mapa.ifood_item_id,
            price: { value: preco },
          })
          : Promise.resolve(null),
      ]);

      return json({
        ok: true,
        produto_id: produtoId,
        status,
        preco,
        statusResp: st,
        priceResp: pr,
      }, 200, req);
    }

    if (acaoFinal === "sync-todos") {
      const { data: mapas } = await sb
        .from("ifood_mapeamentos")
        .select("produto_id, ifood_item_id")
        .not("produto_id", "is", null)
        .not("ifood_item_id", "is", null);

      const resultados: Array<Record<string, unknown>> = [];
      for (const m of mapas || []) {
        const produtoId = m.produto_id as string;
        const { data: produto } = await sb
          .from("produtos")
          .select(
            "id, preco, preco_ifood, ativo, controlar_estoque, quantidade_estoque, encomenda_programada",
          )
          .eq("id", produtoId)
          .maybeSingle();
        if (!produto || !m.ifood_item_id) continue;

        const status = await statusDisponivelLocal(sb, produto);
        const preco = Number(
          produto.preco_ifood != null ? produto.preco_ifood : produto.preco,
        );
        try {
          await patchItemStatus(token, cred.merchantId, {
            itemId: m.ifood_item_id,
            status,
          });
          if (Number.isFinite(preco)) {
            await patchItemPrice(token, cred.merchantId, {
              itemId: m.ifood_item_id,
              price: { value: preco },
            });
          }
          resultados.push({ produto_id: produtoId, ok: true, status, preco });
        } catch (e) {
          resultados.push({
            produto_id: produtoId,
            ok: false,
            erro: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return json({
        ok: true,
        total: resultados.length,
        resultados,
      }, 200, req);
    }

    if (acaoFinal === "motivos-cancelamento") {
      const orderId = String(
        (body as { order_id?: string }).order_id ||
          url.searchParams.get("order_id") ||
          "",
      ).trim();
      if (!orderId) return json({ erro: "order_id obrigatório" }, 400, req);
      const motivos = await motivosCancelamento(token, orderId);
      return json({ ok: true, motivos }, 200, req);
    }

    if (acaoFinal === "cancelar-pedido") {
      const orderId = String(
        (body as { order_id?: string }).order_id || "",
      ).trim();
      const cancellationCode = String(
        (body as { cancellationCode?: string }).cancellationCode || "",
      ).trim();
      const reason = String((body as { reason?: string }).reason || "").trim();
      if (!orderId || !cancellationCode) {
        return json({ erro: "order_id e cancellationCode obrigatórios" }, 400, req);
      }

      await solicitarCancelamento(token, orderId, {
        cancellationCode,
        reason: reason || undefined,
      });

      const { data: pedido } = await sb
        .from("pedidos")
        .select("id")
        .eq("ifood_order_id", orderId)
        .maybeSingle();

      if (pedido?.id) {
        const { error } = await sb.rpc("cancelar_pedido_com_estoque", {
          p_pedido_id: pedido.id,
        });
        if (error) {
          await sb.from("pedidos").update({ status: "cancelado" }).eq(
            "id",
            pedido.id,
          );
        }
      }

      return json({ ok: true }, 200, req);
    }

    return json({ erro: `Ação desconhecida: ${acaoFinal}` }, 400, req);
  } catch (e) {
    console.error("[ifood-admin]", e);
    return json(
      { erro: e instanceof Error ? e.message : String(e) },
      500,
      req,
    );
  }
});
