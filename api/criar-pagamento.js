
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
            typeof data === "string" ? data : JSON.stringify(data)
        );
    }

    return data;
}

async function liberarReserva(pedidoId) {
    return supabaseRequest("rpc/liberar_estoque_pedido", {
        method: "POST",
        body: JSON.stringify({
            p_pedido_id: pedidoId
        })
    });
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

    let pedidoId = null;
    let pagamentoCriado = false;

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

        for (const quantidade of quantidades.values()) {
            if (quantidade > 20) {
                return enviarErro(
                    res,
                    400,
                    "Quantidade máxima por variação excedida."
                );
            }
        }

        const itensParaReserva = [...quantidades.entries()].map(
            ([variacaoId, quantidade]) => ({
                variacao_id: variacaoId,
                quantidade
            })
        );

        const pedidoCriado = await supabaseRequest(
            "rpc/criar_pedido_com_reserva",
            {
                method: "POST",
                body: JSON.stringify({
                    p_email: email,
                    p_itens: itensParaReserva
                })
            }
        );

        pedidoId = pedidoCriado?.pedidoId;

        if (!pedidoId) {
            throw new Error("Não foi possível criar o pedido com reserva.");
        }

        const expiracao = new Date(
            Date.now() + 30 * 60 * 1000
        ).toISOString();

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
                    transaction_amount: Number(pedidoCriado.total),
                    description: `Pedido D Lírio #${pedidoId}`,
                    payment_method_id: "pix",
                    external_reference: String(pedidoId),
                    date_of_expiration: expiracao,
                    payer: {
                        email
                    }
                })
            }
        );

        const pagamento = await pagamentoResponse.json();

        if (!pagamentoResponse.ok) {
            if (pagamentoResponse.status >= 400 &&
                pagamentoResponse.status < 500) {
                await liberarReserva(pedidoId);
            }

            console.error("Erro Mercado Pago:", pagamento);

            return enviarErro(
                res,
                502,
                "Não foi possível gerar o pagamento PIX."
            );
        }

        if (!pagamento.id) {
            throw new Error("O Mercado Pago não retornou o ID do pagamento.");
        }

        pagamentoCriado = true;

        const dadosPix =
            pagamento.point_of_interaction?.transaction_data;

        await supabaseRequest(
            `pedidos?id=eq.${pedidoId}`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    mercadopago_payment_id: String(pagamento.id),
                    pix_qr_code: dadosPix?.qr_code || null,
                    pix_qr_code_base64: dadosPix?.qr_code_base64 || null,
                    pix_expira_em: pagamento.date_of_expiration || expiracao,
                    status_pagamento: pagamento.status || "pending"
                })
            }
        );

        if (
            !dadosPix?.qr_code ||
            !dadosPix?.qr_code_base64
        ) {
            throw new Error(
                "Pagamento criado, mas os dados do QR Code não foram retornados."
            );
        }

        return res.status(201).json({
            sucesso: true,
            pedidoId,
            paymentId: pagamento.id,
            status: pagamento.status,
            total: Number(pedidoCriado.total),
            qrCode: dadosPix.qr_code,
            qrCodeBase64: dadosPix.qr_code_base64,
            ticketUrl: dadosPix.ticket_url || null,
            expiraEm: pagamento.date_of_expiration || expiracao
        });

    } catch (error) {
        console.error("Erro ao criar pagamento:", error);

        if (pedidoId && !pagamentoCriado) {
            console.error(
                "A reserva do pedido foi mantida para evitar liberar estoque de uma possível cobrança."
            );
        }

        return enviarErro(
            res,
            500,
            pagamentoCriado
                ? "O pagamento foi criado, mas houve um erro ao finalizar o registro. Entre em contato com a loja."
                : "Ocorreu um erro ao processar seu pedido."
        );
    }
};
