module.exports = async function handler(req, res) {
    if (req.method !== "GET") {
        return res.status(405).json({
            erro: true,
            mensagem: "Método não permitido."
        });
    }

    const publicKey = process.env.MERCADOPAGO_PUBLIC_KEY;

    if (!publicKey) {
        return res.status(500).json({
            erro: true,
            mensagem: "Chave pública do Mercado Pago não configurada."
        });
    }

    return res.status(200).json({
        publicKey
    });
};