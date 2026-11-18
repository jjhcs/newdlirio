
const { randomUUID } = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;

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
            typeof data === "string"
                ? data
                : JSON.stringify(data)
        );
    }

    return data;
}

function enviarErro(res, status, mensagem) {
    return res.status(status).json({
        erro: true,
        mensagem
    });
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return enviarErro(res, 405, "Método não permitido.");
    }

    if (
        !SUPABASE_URL ||
        !SUPABASE_SERVICE_ROLE_KEY ||
        !MERCADOPAGO_ACCESS_TOKEN
    ) {
        return enviarErro(
            res,
            500,
            "Configuração do servidor incompleta."
        );
    }

    try {
        const body = req.body || {};
        const email = String(body.email || "").trim().toLowerCase();
        const itensRecebidos = body.itens;

        if (
            !email ||
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            return enviarErro(res, 400, "Informe um e-mail válido.");
        }

        if (
            !Array.isArray(itensRecebidos) ||
            itensRecebidos.length === 0 ||
            itensRecebidos.length > 30
        ) {
            return enviarErro(res, 400, "Carrinho inválido.");
        }

        const quantidades = new Map();

        for (const item of itensRecebidos) {
            const variacaoId = Number(item.variacaoId);
            const quantidade = Number(item.quantidade);

            if (
                !Number.isSafeInteger(variacaoId) ||
                variacaoId <= 0 ||
                !Number.isSafeInteger(quantidade) ||
                quantidade <= 0 ||
                quantidade > 20
            ) {
                return enviarErro(res, 400, "Item do carrinho inválido.");
            }

            quantidades.set(
                variacaoId,
                (quantidades.get(variacaoId) || 0) + quantidade
            );
        }

        const variacaoIds = [...quantidades.keys()];

        const filtroVariacoes = encodeURIComponent(
            `in.(${variacaoIds.join(",")})`
        );

        const variacoes = await supabaseRequest(
            `variacoes?select=id,produto_id,tamanho,estoque&id=${filtroVariacoes}`
        );

        if (variacoes.length !== variacaoIds.length) {
            return enviarErro(
                res,
                400,
                "Um ou mais tamanhos não estão disponíveis."
            );
        }

        const produtoIds = [
            ...new Set(variacoes.map(item => Number(item.produto_id)))
        ];

        const filtroProdutos = encodeURIComponent(
            `in.(${produtoIds.join(",")})`
        );

        const produtos = await supabaseRequest(
            `produtos?select=id,nome,preco,ativo&id=${filtroProdutos}`
        );

        const produtosPorId = new Map(
            produtos.map(produto => [Number(produto.id), produto])
        );

        let totalCentavos = 0;

        const itensPedido = [];

        for (const variacao of variacoes) {
            const produto = produtosPorId.get(
                Number(variacao.produto_id)
            );

            const quantidade = quantidades.get(Number(variacao.id));

            if (!produto || produto.ativo !== true) {
                return enviarErro(
                    res,
                    400,
                    "Um dos produtos não está mais disponível."
                );
            }

            if (
                !Number.isInteger(Number(variacao.estoque)) ||
                Number(variacao.estoque) < quantidade
            ) {
                return enviarErro(
                    res,
                    400,
                    `Estoque insuficiente para ${produto.nome}, tamanho ${variacao.tamanho}.`
                );
            }

            const precoCentavos = Math.round(
                Number(produto.preco) * 100
            );

            if (
                !Number.isSafeInteger(precoCentavos) ||
                precoCentavos <= 0
            ) {
                return enviarErro(
                    res,
                    400,
                    "Preço inválido em um dos produtos."
                );
            }

            totalCentavos += precoCentavos * quantidade;

            itensPedido.push({
                produto_id: produto.id,
                variacao_id: variacao.id,
                nome_produto: produto.nome,
                tamanho: variacao.tamanho,
                quantidade,
                preco_unitario: precoCentavos / 100
            });
        }

        if (
            !Number.isSafeInteger(totalCentavos) ||
            totalCentavos <= 0 ||
            totalCentavos > 100000000
        ) {
            return enviarErro(res, 400, "Valor total inválido.");
        }

        const pedidoCriado = await supabaseRequest(
            "pedidos?select=id",
            {
                method: "POST",
                headers: {
                    Prefer: "return=representation"
                },
                body: JSON.stringify({
                    total: totalCentavos / 100,
                    metodo_pagamento: "pix",
                    status: "pendente",
                    status_pagamento: "pendente",
                    email_cliente: email
                })
            }
        );

        const pedidoId = pedidoCriado?.[0]?.id;

        if (!pedidoId) {
            throw new Error("Não foi possível registrar o pedido.");
        }

        try {
            await supabaseRequest("itens_pedido", {
                method: "POST",
                headers: {
                    Prefer: "return=minimal"
                },
                body: JSON.stringify(
                    itensPedido.map(item => ({
                        ...item,
                        pedido_id: pedidoId
                    }))
                )
            });
        } catch (error) {
            await supabaseRequest(
                `pedidos?id=eq.${pedidoId}`,
                { method: "DELETE" }
            ).catch(() => {});

            throw error;
        }

        const pagamentoResponse = await fetch(
            "https://api.mercadopago.com/v1/payments",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                    "X-Idempotency-Key": randomUUID()
                },
                body: JSON.stringify({
                    transaction_amount: totalCentavos / 100,
                    description: `Pedido D Lírio #${pedidoId}`,
                    payment_method_id: "pix",
                    external_reference: String(pedidoId),
                    payer: {
                        email
                    }
                })
            }
        );

        const pagamento = await pagamentoResponse.json();

        if (!pagamentoResponse.ok) {
            await supabaseRequest(
                `pedidos?id=eq.${pedidoId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        status_pagamento: "erro"
                    })
                }
            ).catch(() => {});

            console.error("Erro Mercado Pago:", pagamento);

            return enviarErro(
                res,
                502,
                "Não foi possível gerar o pagamento PIX. Nenhuma cobrança foi confirmada."
            );
        }

        const dadosPix =
            pagamento.point_of_interaction?.transaction_data;

        if (
            !pagamento.id ||
            !dadosPix?.qr_code ||
            !dadosPix?.qr_code_base64
        ) {
            throw new Error("Resposta PIX incompleta do Mercado Pago.");
        }

        await supabaseRequest(
            `pedidos?id=eq.${pedidoId}`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    mercadopago_payment_id: String(pagamento.id),
                    pix_qr_code: dadosPix.qr_code,
                    pix_qr_code_base64: dadosPix.qr_code_base64,
                    pix_expira_em: pagamento.date_of_expiration || null,
                    status_pagamento: pagamento.status || "pendente"
                })
            }
        );

        return res.status(201).json({
            sucesso: true,
            pedidoId,
            paymentId: pagamento.id,
            status: pagamento.status,
            total: totalCentavos / 100,
            qrCode: dadosPix.qr_code,
            qrCodeBase64: dadosPix.qr_code_base64,
            ticketUrl: dadosPix.ticket_url || null,
            expiraEm: pagamento.date_of_expiration || null
        });

    } catch (error) {
        console.error("Erro ao criar pagamento:", error);

        return enviarErro(
            res,
            500,
            "Ocorreu um erro ao processar seu pedido."
        );
    }
};
