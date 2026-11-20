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
            p_pedido_id: Number(pedidoId)
        })
    });
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
        throw new Error("Não foi possível consultar o pagamento existente.");
    }

    return data;
}

async function buscarPagamentoPorPedido(pedidoId) {
    const url = new URL("https://api.mercadopago.com/v1/payments/search");
    url.searchParams.set("external_reference", String(pedidoId));
    url.searchParams.set("sort", "date_created");
    url.searchParams.set("criteria", "desc");
    url.searchParams.set("limit", "10");

    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error("Não foi possível verificar cobranças anteriores.");
    }

    return (data.results || []).find(
        pagamento =>
            String(pagamento.external_reference) === String(pedidoId) &&
            pagamento.payment_method_id !== "pix"
    ) || null;
}

function enviarErro(res, status, mensagem) {
    return res.status(status).json({
        erro: true,
        mensagem
    });
}

async function registrarPagamento(pedidoId, pagamento) {
    await supabaseRequest(
        `pedidos?id=eq.${encodeURIComponent(pedidoId)}`,
        {
            method: "PATCH",
            body: JSON.stringify({
                metodo_pagamento: "cartao",
                mercadopago_payment_id: String(pagamento.id),
                status_pagamento: pagamento.status || "pending"
            })
        }
    );

    if (
        pagamento.status === "rejected" ||
        pagamento.status === "cancelled"
    ) {
        await liberarReserva(pedidoId);
    }

    return {
        sucesso: true,
        pedidoId,
        paymentId: pagamento.id,
        status: pagamento.status,
        statusDetail: pagamento.status_detail || null,
        total: Number(pagamento.transaction_amount)
    };
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
        return enviarErro(res, 500, "Configuração do servidor incompleta.");
    }

    let pedidoId = null;
    let pagamentoCriado = false;

    try {
        const body = req.body || {};
        const email = String(body.email || "").trim().toLowerCase();
        const checkoutKey = String(body.checkoutKey || "").trim().toLowerCase();
        const token = String(body.token || "").trim();
        const paymentMethodId = String(body.payment_method_id || "").trim();
        const identificationType = String(
            body.identification_type || ""
        ).trim().toUpperCase();
        const identificationNumber = String(
            body.identification_number || ""
        ).replace(/\D/g, "");
        const installments = Number(body.installments);
        const clientTotal = Number(body.transaction_amount);
        const issuerId = body.issuer_id
            ? Number(body.issuer_id)
            : undefined;
        const itensRecebidos = body.itens;

        if (
            !email ||
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            return enviarErro(res, 400, "Informe um e-mail válido.");
        }

        if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutKey)
        ) {
            return enviarErro(res, 400, "Identificador do checkout inválido.");
        }

        if (!token || token.length > 500) {
            return enviarErro(res, 400, "Token do cartão inválido.");
        }

        if (
            !paymentMethodId ||
            !/^[a-zA-Z0-9_-]{1,50}$/.test(paymentMethodId)
        ) {
            return enviarErro(res, 400, "Bandeira do cartão inválida.");
        }

        if (
            !Number.isSafeInteger(installments) ||
            installments < 1 ||
            installments > 24
        ) {
            return enviarErro(res, 400, "Número de parcelas inválido.");
        }

        if (!Number.isFinite(clientTotal) || clientTotal <= 0) {
            return enviarErro(res, 400, "Valor da compra inválido.");
        }

        if (
            !["CPF", "CNPJ"].includes(identificationType) ||
            !/^\d{11}$|^\d{14}$/.test(identificationNumber)
        ) {
            return enviarErro(res, 400, "Informe um CPF ou CNPJ válido.");
        }

        if (
            issuerId !== undefined &&
            (!Number.isSafeInteger(issuerId) || issuerId <= 0)
        ) {
            return enviarErro(res, 400, "Emissor do cartão inválido.");
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

        const itensParaReserva = [...quantidades.entries()]
            .sort(([a], [b]) => a - b)
            .map(([variacaoId, quantidade]) => ({
                variacao_id: variacaoId,
                quantidade
            }));

        const pedidoCriado = await supabaseRequest(
            "rpc/criar_pedido_com_reserva",
            {
                method: "POST",
                body: JSON.stringify({
                    p_checkout_key: checkoutKey,
                    p_email: email,
                    p_itens: itensParaReserva
                })
            }
        );

        pedidoId = pedidoCriado?.pedidoId;

        if (!pedidoId) {
            throw new Error("Não foi possível criar o pedido com reserva.");
        }

        if (!pedidoCriado.existente) {
            await supabaseRequest(
                `pedidos?id=eq.${encodeURIComponent(pedidoId)}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        metodo_pagamento: "cartao"
                    })
                }
            );
        }

        const pedidos = await supabaseRequest(
            `pedidos?id=eq.${encodeURIComponent(pedidoId)}&select=id,total,mercadopago_payment_id,metodo_pagamento`
        );

        const pedido = pedidos?.[0];

        if (!pedido) {
            throw new Error("Pedido não encontrado após a reserva.");
        }

        if (pedido.metodo_pagamento !== "cartao") {
            return enviarErro(
                res,
                409,
                "Este checkout já foi iniciado com outro método de pagamento."
            );
        }

        const totalServidor = Number(pedido.total);

        if (
            !Number.isSafeInteger(Math.round(clientTotal * 100)) ||
            Math.round(clientTotal * 100) !== Math.round(totalServidor * 100)
        ) {
            if (!pedidoCriado.existente) {
                await liberarReserva(pedidoId);
            }

            return enviarErro(
                res,
                409,
                "O valor do carrinho mudou. Atualize a página e tente novamente."
            );
        }

        if (pedido.mercadopago_payment_id) {
            const pagamentoExistente = await consultarPagamento(
                pedido.mercadopago_payment_id
            );

            if (
                String(pagamentoExistente.external_reference) !== String(pedidoId) ||
                pagamentoExistente.payment_method_id === "pix" ||
                Math.round(Number(pagamentoExistente.transaction_amount) * 100) !==
                    Math.round(totalServidor * 100) ||
                pagamentoExistente.currency_id !== "BRL"
            ) {
                return enviarErro(
                    res,
                    409,
                    "O pagamento existente não corresponde a este pedido."
                );
            }

            return res.status(200).json({
                sucesso: true,
                pedidoId,
                paymentId: pagamentoExistente.id,
                status: pagamentoExistente.status,
                statusDetail: pagamentoExistente.status_detail || null,
                total: totalServidor
            });
        }

        const pagamentoAnterior = await buscarPagamentoPorPedido(pedidoId);

        if (pagamentoAnterior) {
            if (
                Math.round(Number(pagamentoAnterior.transaction_amount) * 100) !==
                    Math.round(totalServidor * 100) ||
                pagamentoAnterior.currency_id !== "BRL"
            ) {
                return enviarErro(
                    res,
                    409,
                    "A cobrança anterior não corresponde ao valor do pedido."
                );
            }

            pagamentoCriado = true;

            return res.status(200).json(
                await registrarPagamento(pedidoId, pagamentoAnterior)
            );
        }

        if (pedidoCriado.existente) {
            return enviarErro(
                res,
                409,
                "Estamos confirmando a tentativa de pagamento anterior. Aguarde alguns instantes antes de tentar novamente."
            );
        }

        const dadosPagamento = {
            transaction_amount: totalServidor,
            token,
            description: `Pedido D Lírio #${pedidoId}`,
            installments,
            payment_method_id: paymentMethodId,
            external_reference: String(pedidoId),
            notification_url:
                "https://www.dlirio.com.br/api/webhook-mercadopago",
            payer: {
                email,
                identification: {
                    type: identificationType,
                    number: identificationNumber
                }
            }
        };

        if (issuerId !== undefined) {
            dadosPagamento.issuer_id = issuerId;
        }

        const pagamentoResponse = await fetch(
            "https://api.mercadopago.com/v1/payments",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${MERCADOPAGO_ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                    "X-Idempotency-Key": checkoutKey
                },
                body: JSON.stringify(dadosPagamento)
            }
        );

        const pagamento = await pagamentoResponse.json();

        if (!pagamentoResponse.ok) {
            console.error("Erro Mercado Pago cartão:", pagamento);

            if (
                pagamentoResponse.status >= 400 &&
                pagamentoResponse.status < 500
            ) {
                await liberarReserva(pedidoId);
            }

            return enviarErro(
                res,
                502,
                "Não foi possível processar o pagamento com cartão."
            );
        }

        if (!pagamento.id) {
            throw new Error(
                "O Mercado Pago não retornou o ID do pagamento."
            );
        }

        pagamentoCriado = true;

        const resultado = await registrarPagamento(pedidoId, pagamento);

        return res.status(201).json(resultado);

    } catch (error) {
        console.error("Erro ao criar pagamento com cartão:", error);

        if (pedidoId && !pagamentoCriado) {
            console.error(
                "A reserva foi mantida para evitar liberar estoque de uma possível cobrança."
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