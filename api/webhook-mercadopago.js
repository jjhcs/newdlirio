
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MERCADOPAGO_ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN;
const MERCADOPAGO_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET;

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

function obterValorUnico(valor) {
    if (Array.isArray(valor)) {
        return valor[0];
    }

    return valor;
}

function validarAssinatura(req, dataId) {
    const assinatura = req.headers["x-signature"];
    const requestId = req.headers["x-request-id"];

    if (
        typeof assinatura !== "string" ||
        typeof requestId !== "string" ||
        !dataId ||
        !MERCADOPAGO_WEBHOOK_SECRET
    ) {
        return false;
    }

    const partes = {};

    for (const parte of assinatura.split(",")) {
        const [chave, ...valor] = parte.trim().split("=");

        if (chave && valor.length) {
            partes[chave] = valor.join("=");
        }
    }

    const timestamp = partes.ts;
    const hashRecebido = partes.v1;

    if (!timestamp || !hashRecebido) {
        return false;
    }

    let timestampSegundos = Number(timestamp);

    if (!Number.isFinite(timestampSegundos)) {
        return false;
    }

    if (timestampSegundos > 1000000000000) {
        timestampSegundos = Math.floor(timestampSegundos / 1000);
    }

    const diferencaTempo = Math.abs(
        Math.floor(Date.now() / 1000) - timestampSegundos
    );

    if (diferencaTempo > 300) {
        return false;
    }

    const manifesto =
        `id:${String(dataId).toLowerCase()};` +
        `request-id:${requestId};` +
        `ts:${timestamp};`;

    const hashCalculado = crypto
        .createHmac("sha256", MERCADOPAGO_WEBHOOK_SECRET)
        .update(manifesto)
        .digest("hex");

    const hashBuffer = Buffer.from(hashRecebido, "hex");
    const calculadoBuffer = Buffer.from(hashCalculado, "hex");

    if (
        hashBuffer.length !== calculadoBuffer.length ||
        hashBuffer.length === 0
    ) {
        return false;
    }

    return crypto.timingSafeEqual(hashBuffer, calculadoBuffer);
}

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            erro: true,
            mensagem: "Método não permitido."
        });
    }

    if (
        !SUPABASE_URL ||
        !SUPABASE_SERVICE_ROLE_KEY ||
        !MERCADOPAGO_ACCESS_TOKEN ||
        !MERCADOPAGO_WEBHOOK_SECRET
    ) {
        return res.status(500).json({
            erro: true,
            mensagem: "Configuração do servidor incompleta."
        });
    }

    try {
        const tipo = obterValorUnico(req.query?.type);
        const dataId = obterValorUnico(req.query?.["data.id"]);

        if (!dataId) {
            return res.status(400).json({
                erro: true,
                mensagem: "Identificador do pagamento ausente."
            });
        }

        if (!validarAssinatura(req, dataId)) {
            return res.status(401).json({
                erro: true,
                mensagem: "Assinatura inválida."
            });
        }

        if (tipo && tipo !== "payment") {
            return res.status(200).json({
                recebido: true,
                ignorado: true
            });
        }

        if (!/^\d+$/.test(String(dataId))) {
            return res.status(400).json({
                erro: true,
                mensagem: "Identificador de pagamento inválido."
            });
        }

        const pagamentoResponse = await fetch(
            `https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
                }
            }
        );

        const pagamento = await pagamentoResponse.json();

        if (!pagamentoResponse.ok) {
            throw new Error(
                `Falha ao consultar pagamento: ${pagamentoResponse.status}`
            );
        }

        if (String(pagamento.id) !== String(dataId)) {
            return res.status(400).json({
                erro: true,
                mensagem: "Pagamento não corresponde à notificação."
            });
        }

        const pedidoId = pagamento.external_reference;

        if (!pedidoId || !/^\d+$/.test(String(pedidoId))) {
            return res.status(400).json({
                erro: true,
                mensagem: "Referência do pedido inválida."
            });
        }

        const pedidos = await supabaseRequest(
            `pedidos?id=eq.${encodeURIComponent(pedidoId)}&select=id,total,status,status_pagamento,mercadopago_payment_id`
        );

        const pedido = pedidos?.[0];

        if (!pedido) {
            return res.status(404).json({
                erro: true,
                mensagem: "Pedido não encontrado."
            });
        }

        if (
            String(pedido.mercadopago_payment_id) !== String(pagamento.id)
        ) {
            return res.status(409).json({
                erro: true,
                mensagem: "Pagamento não corresponde ao pedido."
            });
        }

        const valorPedido = Math.round(Number(pedido.total) * 100);
        const valorPagamento = Math.round(
            Number(pagamento.transaction_amount) * 100
        );

        if (
            !Number.isSafeInteger(valorPedido) ||
            !Number.isSafeInteger(valorPagamento) ||
            valorPedido !== valorPagamento ||
            pagamento.currency_id !== "BRL"
        ) {
            return res.status(409).json({
                erro: true,
                mensagem: "Valor ou moeda do pagamento não corresponde ao pedido."
            });
        }

        const statusPagamento = pagamento.status;

        const statusPermitidos = [
            "approved",
            "pending",
            "in_process",
            "authorized",
            "rejected",
            "cancelled",
            "refunded",
            "charged_back"
        ];

        if (!statusPermitidos.includes(statusPagamento)) {
            return res.status(200).json({
                recebido: true,
                status: statusPagamento || "desconhecido"
            });
        }

        const jaPago = pedido.status_pagamento === "approved";

        if (
            jaPago &&
            !["approved", "refunded", "charged_back"].includes(statusPagamento)
        ) {
            return res.status(200).json({
                recebido: true,
                status: pedido.status_pagamento
            });
        }

        let statusPedido = "pendente";

        if (statusPagamento === "approved") {
            statusPedido = "pago";
        } else if (statusPagamento === "cancelled" || statusPagamento === "rejected") {
            statusPedido = "cancelado";
        } else if (statusPagamento === "refunded") {
            statusPedido = "reembolsado";
        } else if (statusPagamento === "charged_back") {
            statusPedido = "contestado";
        }

        await supabaseRequest(
            `pedidos?id=eq.${encodeURIComponent(pedidoId)}`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    status_pagamento: statusPagamento,
                    status: statusPedido
                })
            }
        );

        return res.status(200).json({
            recebido: true,
            pedidoId: pedido.id,
            statusPagamento,
            statusPedido
        });

    } catch (error) {
        console.error("Erro no webhook Mercado Pago:", error);

        return res.status(500).json({
            erro: true,
            mensagem: "Não foi possível processar a notificação."
        });
    }
};
