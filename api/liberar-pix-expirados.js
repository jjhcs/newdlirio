const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;

async function supabaseRequest(path, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        ...options,
        headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            ...options.headers
        }
    });

    const responseText = await response.text();
    let data = null;

    try {
        data = responseText ? JSON.parse(responseText) : null;
    } catch {
        data = responseText;
    }

    if (!response.ok) {
        throw new Error(
            typeof data === "string" ? data : JSON.stringify(data)
        );
    }

    return data;
}

async function consultarPagamento(paymentId) {
    const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
        {
            headers: {
                Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
            }
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Falha ao consultar pagamento ${paymentId}.`);
    }

    return data;
}

async function buscarPagamento(pedidoId) {
    const url = new URL("https://api.mercadopago.com/v1/payments/search");
    url.searchParams.set("external_reference", String(pedidoId));
    url.searchParams.set("sort", "date_created");
    url.searchParams.set("criteria", "desc");
    url.searchParams.set("limit", "20");

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            `Falha ao pesquisar pagamento do pedido ${pedidoId}.`
        );
    }

    return (data.results || []).find(
        pagamento =>
            String(pagamento.external_reference) === String(pedidoId) &&
            pagamento.payment_method_id === "pix"
    ) || null;
}

async function cancelarPagamento(paymentId) {
    const response = await fetch(
        `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
        {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                status: "cancelled"
            })
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            `Falha ao cancelar pagamento ${paymentId}: ${JSON.stringify(data)}`
        );
    }

    return data;
}

async function liberarEstoque(pedidoId) {
    await supabaseRequest(
        `pedidos?id=eq.${encodeURIComponent(pedidoId)}`,
        {
            method: "PATCH",
            body: JSON.stringify({
                status_pagamento: "cancelled"
            })
        }
    );

    return supabaseRequest("rpc/liberar_estoque_pedido", {
        method: "POST",
        body: JSON.stringify({
            p_pedido_id: Number(pedidoId)
        })
    });
}

module.exports = async function handler(req, res) {
    if (req.method !== "GET" && req.method !== "POST") {
        return res.status(405).json({
            erro: true,
            mensagem: "Método não permitido."
        });
    }

    if (
        !SUPABASE_URL ||
        !SUPABASE_SERVICE_ROLE_KEY ||
        !MERCADOPAGO_ACCESS_TOKEN ||
        !CRON_SECRET
    ) {
        return res.status(500).json({
            erro: true,
            mensagem: "Configuração do servidor incompleta."
        });
    }

    const authorization = req.headers.authorization || "";

    if (authorization !== `Bearer ${CRON_SECRET}`) {
        return res.status(401).json({
            erro: true,
            mensagem: "Não autorizado."
        });
    }

    try {
        const agora = new Date().toISOString();

        const pedidos = await supabaseRequest(
            "pedidos?metodo_pagamento=eq.pix&estoque_liberado=eq.false&status_pagamento=not.in.(approved,refunded,charged_back)&pix_expira_em=not.is.null&pix_expira_em=lte." +
            encodeURIComponent(agora) +
            "&select=id,total,mercadopago_payment_id,status_pagamento,pix_expira_em&limit=100"
        );

        const resultados = [];

        for (const pedido of pedidos || []) {
            try {
                let pagamento = null;

                if (pedido.mercadopago_payment_id) {
                    pagamento = await consultarPagamento(
                        pedido.mercadopago_payment_id
                    );
                } else {
                    pagamento = await buscarPagamento(pedido.id);
                }

                if (pagamento) {
                    if (String(pagamento.external_reference) !== String(pedido.id)) {
                        throw new Error("Referência do pagamento divergente.");
                    }

                    if (
                        Math.round(Number(pagamento.transaction_amount) * 100) !==
                            Math.round(Number(pedido.total) * 100) ||
                        pagamento.currency_id !== "BRL"
                    ) {
                        throw new Error("Valor ou moeda do pagamento divergente.");
                    }

                    if (pagamento.status === "approved") {
                        await supabaseRequest(
                            `pedidos?id=eq.${encodeURIComponent(pedido.id)}`,
                            {
                                method: "PATCH",
                                body: JSON.stringify({
                                    mercadopago_payment_id: String(pagamento.id),
                                    status_pagamento: "approved",
                                    status: "pago"
                                })
                            }
                        );

                        resultados.push({
                            pedidoId: pedido.id,
                            acao: "pagamento_aprovado"
                        });

                        continue;
                    }

                    if (
                        ["pending", "in_process", "authorized"].includes(
                            pagamento.status
                        )
                    ) {
                        pagamento = await cancelarPagamento(pagamento.id);
                        pagamento = await consultarPagamento(pagamento.id);
                    }

                    if (
                        !["cancelled", "rejected"].includes(pagamento.status)
                    ) {
                        resultados.push({
                            pedidoId: pedido.id,
                            acao: "aguardando_status_final",
                            status: pagamento.status
                        });

                        continue;
                    }

                    await supabaseRequest(
                        `pedidos?id=eq.${encodeURIComponent(pedido.id)}`,
                        {
                            method: "PATCH",
                            body: JSON.stringify({
                                mercadopago_payment_id: String(pagamento.id)
                            })
                        }
                    );
                }

                const resultado = await liberarEstoque(pedido.id);

                resultados.push({
                    pedidoId: pedido.id,
                    acao: resultado?.liberado
                        ? "estoque_liberado"
                        : "nenhuma_alteracao"
                });

            } catch (errorPedido) {
                console.error(
                    `Erro ao expirar pedido ${pedido.id}:`,
                    errorPedido
                );

                resultados.push({
                    pedidoId: pedido.id,
                    erro: true
                });
            }
        }

        return res.status(200).json({
            sucesso: true,
            processados: resultados.length,
            resultados
        });

    } catch (error) {
        console.error("Erro ao liberar PIX expirados:", error);

        return res.status(500).json({
            erro: true,
            mensagem: "Não foi possível processar os pedidos expirados."
        });
    }
};