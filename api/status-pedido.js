const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({
            erro: true,
            mensagem: "Método não permitido."
        });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return res.status(500).json({
            erro: true,
            mensagem: "Configuração do servidor incompleta."
        });
    }

    try {
        const pedidoId = String(req.body?.pedidoId || "");
        const checkoutKey = String(req.body?.checkoutKey || "").toLowerCase();

        if (
            !/^\d+$/.test(pedidoId) ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutKey)
        ) {
            return res.status(400).json({
                erro: true,
                mensagem: "Dados do pedido inválidos."
            });
        }

        const response = await fetch(
            `${SUPABASE_URL}/rest/v1/pedidos?id=eq.${encodeURIComponent(pedidoId)}&checkout_key=eq.${encodeURIComponent(checkoutKey)}&select=id,status,status_pagamento,estoque_liberado`,
            {
                headers: {
                    apikey: SUPABASE_SERVICE_ROLE_KEY,
                    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
                }
            }
        );

        if (!response.ok) {
            throw new Error("Não foi possível consultar o pedido.");
        }

        const pedidos = await response.json();
        const pedido = pedidos?.[0];

        if (!pedido) {
            return res.status(404).json({
                erro: true,
                mensagem: "Pedido não encontrado."
            });
        }

        return res.status(200).json({
            sucesso: true,
            pedidoId: pedido.id,
            status: pedido.status,
            statusPagamento: pedido.status_pagamento,
            estoqueLiberado: pedido.estoque_liberado
        });

    } catch (error) {
        console.error("Erro ao consultar pedido:", error);

        return res.status(500).json({
            erro: true,
            mensagem: "Não foi possível consultar o pedido."
        });
    }
};