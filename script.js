document.addEventListener('DOMContentLoaded', () => {

    // =========================================
    // 1. CONEXÃO COM O SUPABASE
    // =========================================
    const SUPABASE_URL = 'https://brwcyaczsgdcmxotvbeo.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_Z8vt2f38fT8x9V3B_A7_GQ_WUv98mDH';

    const { createClient } = supabase;
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);
    window.supabaseClient = supabaseClient; // Reaproveitado pelo admin.js

    // Estado (Carregando do localStorage se existir)
    let cart = JSON.parse(localStorage.getItem('dlirio_cart')) || [];
    let produtosGlobais = [];
    let filtroAtual = 'TODOS';
    let produtoAtual = null;

    // Elementos
    const homeShopView = document.getElementById('home-shop-view');
    const homeView = document.getElementById('home-view');
    const shopView = document.getElementById('shop-view');
    const productView = document.getElementById('product-view');
    const grid = document.querySelector('.product-grid');
    const mainImage = document.getElementById('main-image');
    const menuBtn = document.getElementById('menu-btn');
    const backBtn = document.getElementById('back-btn');
    const logoHomeBtn = document.getElementById('logo-home-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const headerElement = document.querySelector('.header');
    const cartSidebar = document.getElementById('cart-sidebar');
    const cartOverlay = document.getElementById('cart-overlay');
    const closeCartBtn = document.getElementById('close-cart-btn');
    const addToCartBtn = document.querySelector('.btn-add-to-cart');
    const checkoutBtn = document.getElementById('checkout-btn');
    const termsCheckbox = document.getElementById('terms-checkbox');

    const formatarPreco = (valor) => `R$ ${valor.toFixed(2).replace('.', ',')}`;

    // =========================================
    // 2. BUSCAR PRODUTOS DO SUPABASE
    // =========================================
    window.carregarProdutos = async function() {
        try {
            const { data, error } = await supabaseClient
                .from('produtos')
                .select(`
                    id, nome, preco, categoria, imagem_frente, imagem_verso, galeria,
                    variacoes ( id, tamanho, estoque )
                `)
                .eq('ativo', true);

            if (error) throw error;

            produtosGlobais = data;
            renderizarVitrine();

        } catch (error) {
            console.error('Erro ao buscar produtos:', error.message);
        }
    };

    // =========================================
    // 3. RENDERIZAR VITRINE
    // =========================================
    function renderizarVitrine() {
        if (produtosGlobais.length === 0) {
            grid.innerHTML = '<p style="color: #888; width: 100%; text-align: center; grid-column: 1/-1;">Nenhum produto cadastrado ainda.</p>';
            return;
        }

        grid.innerHTML = produtosGlobais.map(prod => {
            const tamanhosHTML = prod.variacoes
                .filter(v => v.estoque > 0)
                .map(v => `<span>${v.tamanho}</span>`)
                .join('');

            return `
                <a href="#" class="product-card" data-categoria="${prod.categoria}" onclick="openProduct(event, ${prod.id})">
                    <div class="product-image-container">
                        <img src="${prod.imagem_frente}" alt="${prod.nome}" class="product-image product-image-front">
                        <img src="${prod.imagem_verso || prod.imagem_frente}" alt="${prod.nome} Verso" class="product-image product-image-back">
                    </div>
                    <div class="product-info">
                        <h3 class="product-title">${prod.nome}</h3>
                        <p class="product-price">${formatarPreco(prod.preco)}</p>
                        <div class="product-sizes">${tamanhosHTML}</div>
                    </div>
                </a>
            `;
        }).join('');

        aplicarFiltro();
    }

    function aplicarFiltro() {
        grid.querySelectorAll('.product-card').forEach(card => {
            const visivel = filtroAtual.toUpperCase() === 'TODOS' || card.dataset.categoria === filtroAtual;
            card.classList.toggle('hidden', !visivel);
        });
    }

    window.carregarProdutos();

    // =========================================
    // 4. NAVEGAÇÃO E MENUS
    // =========================================
    // headerElement.classList.add('header-hidden');

    function fecharMenu() {
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }

    menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    });
    document.getElementById('close-btn').addEventListener('click', fecharMenu);
    overlay.addEventListener('click', fecharMenu);

    function showShop(e, categoria = 'TODOS') {
        e.preventDefault();
        headerElement.classList.remove('header-hidden');

        // Esconde apenas a tela de entrada (hero), não o container todo
        homeView.classList.add('hidden');
        shopView.classList.remove('hidden');

        window.scrollTo(0, 0);
        fecharMenu();

        filtroAtual = categoria;
        aplicarFiltro();
    }

    document.getElementById('btn-all-products').addEventListener('click', (e) => showShop(e, 'TODOS'));

    document.querySelectorAll('.btn-shop').forEach(link => {
        link.addEventListener('click', (e) => showShop(e, link.textContent.trim()));
    });

    // =========================================
    // 5. PÁGINA DE PRODUTO
    // =========================================
    function setBotaoCarrinho(pronto) {
        addToCartBtn.textContent = pronto ? 'ADICIONAR AO CARRINHO' : 'SELECIONE O TAMANHO';
        addToCartBtn.style.backgroundColor = pronto ? 'var(--pink-accent)' : 'transparent';
        addToCartBtn.style.color = pronto ? '#fff' : 'var(--pink-accent)';
        addToCartBtn.style.borderColor = 'var(--pink-accent)';
    }

    window.openProduct = function(e, id) {
        e.preventDefault();

        const produto = produtosGlobais.find(p => p.id === id);
        if (!produto) return;
        produtoAtual = produto;

        document.querySelector('.product-name').textContent = produto.nome;
        document.querySelector('.product-price-large').textContent = formatarPreco(produto.preco);
        mainImage.src = produto.imagem_frente;

        // Miniaturas
        const thumbnailList = document.querySelector('.thumbnail-list');
        thumbnailList.innerHTML = '';
        let todasAsFotos = [produto.imagem_frente];
        if (produto.imagem_verso && produto.imagem_verso !== produto.imagem_frente) todasAsFotos.push(produto.imagem_verso);
        if (produto.galeria && produto.galeria.length > 0) todasAsFotos = todasAsFotos.concat(produto.galeria);

        todasAsFotos.forEach((fotoUrl, index) => {
            const img = document.createElement('img');
            img.src = fotoUrl;
            img.className = 'thumbnail';
            if (index === 0) img.classList.add('active');
            img.onclick = function() {
                mainImage.src = this.src;
                document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
                this.classList.add('active');
            };
            thumbnailList.appendChild(img);
        });

        // Tamanhos
        const sizeOptionsContainer = document.querySelector('.size-options');
        sizeOptionsContainer.innerHTML = '';
        produto.variacoes.forEach(v => {
            const btn = document.createElement('button');
            btn.className = 'size-btn';
            btn.textContent = v.tamanho;
            if (v.estoque <= 0) {
                btn.disabled = true;
                btn.style.opacity = '0.3';
                btn.style.textDecoration = 'line-through';
            } else {
                btn.addEventListener('click', () => {
                    sizeOptionsContainer.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    addToCartBtn.dataset.variacaoId = v.id;
                    addToCartBtn.dataset.tamanho = v.tamanho;
                    setBotaoCarrinho(true);
                });
            }
            sizeOptionsContainer.appendChild(btn);
        });

        setBotaoCarrinho(false);
        delete addToCartBtn.dataset.variacaoId;

        homeShopView.classList.add('hidden');
        productView.classList.remove('hidden');
        menuBtn.classList.add('hidden');
        backBtn.classList.remove('hidden');
        window.scrollTo(0, 0);
    };

    function goBackToShop() {
        productView.classList.add('hidden');
        homeShopView.classList.remove('hidden');
        backBtn.classList.add('hidden');
        menuBtn.classList.remove('hidden');
    }
    backBtn.addEventListener('click', goBackToShop);

    logoHomeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!productView.classList.contains('hidden')) goBackToShop();

        shopView.classList.add('hidden');
        homeView.classList.remove('hidden');

        headerElement.classList.add('header-hidden');
        window.scrollTo(0, 0);

        filtroAtual = 'TODOS';
        aplicarFiltro();
    });

    window.toggleAccordion = function(btn) {
        const content = btn.nextElementSibling;
        const icon = btn.querySelector('.accordion-icon');
        const aberto = content.style.maxHeight;
        content.style.maxHeight = aberto ? null : content.scrollHeight + 'px';
        icon.textContent = aberto ? '+' : '−';
    };

    // =========================================
    // 6. CARRINHO
    // =========================================
    window.openCart = function() {
        cartSidebar.classList.add('active');
        cartOverlay.classList.add('active');
    };
    window.closeCart = function() {
        cartSidebar.classList.remove('active');
        cartOverlay.classList.remove('active');
    };
    closeCartBtn.addEventListener('click', closeCart);
    cartOverlay.addEventListener('click', closeCart);

    addToCartBtn.addEventListener('click', () => {
        const variacaoId = addToCartBtn.dataset.variacaoId;
        if (!variacaoId) return;

        const itemExistente = cart.find(item => item.variacaoId === variacaoId);

        if (itemExistente) {
            itemExistente.qty += 1;
        } else {
            cart.push({
                variacaoId: variacaoId,
                nome: produtoAtual.nome,
                preco: produtoAtual.preco,
                tamanho: addToCartBtn.dataset.tamanho,
                imagem: mainImage.src,
                qty: 1
            });
        }

        renderCart();
        openCart();
    });

    function atualizarBotaoFinalizar() {
        checkoutBtn.disabled = !termsCheckbox.checked || cart.length === 0;
    }
    termsCheckbox.addEventListener('change', atualizarBotaoFinalizar);

    function renderCart() {
        const container = document.getElementById('cart-items-container');
        const totalPriceEl = document.getElementById('cart-total-price');
        const countEl = document.getElementById('cart-count');
        const cartBadge = document.getElementById('cart-badge');

        container.innerHTML = '';

        if (cart.length === 0) {
            container.innerHTML = '<p class="empty-cart-msg">Seu carrinho está vazio.</p>';
            totalPriceEl.textContent = 'R$ 0,00';
            countEl.textContent = '0 ITENS';
            cartBadge.classList.add('hidden');
            atualizarBotaoFinalizar();
            
            // Salva o carrinho vazio
            localStorage.setItem('dlirio_cart', JSON.stringify(cart));
            return;
        }

        let total = 0;
        let totalItems = 0;

        cart.forEach((item, index) => {
            total += item.preco * item.qty;
            totalItems += item.qty;

            const itemEl = document.createElement('div');
            itemEl.classList.add('cart-item');
            itemEl.innerHTML = `
                <img src="${item.imagem}" class="cart-item-img">
                <div class="cart-item-details">
                    <h4 class="cart-item-title">${item.nome}</h4>
                    <p class="cart-item-price">${formatarPreco(item.preco)}</p>
                    <p class="cart-item-size">Tamanho: <strong>${item.tamanho}</strong></p>
                    <div class="cart-item-qty">
                        <button class="qty-btn" onclick="updateQty(${index}, -1)">−</button>
                        <span class="qty-val">${item.qty}</span>
                        <button class="qty-btn" onclick="updateQty(${index}, 1)">+</button>
                    </div>
                </div>
            `;
            container.appendChild(itemEl);
        });

        totalPriceEl.textContent = formatarPreco(total);
        countEl.textContent = `${totalItems} ${totalItems === 1 ? 'ITEM' : 'ITENS'}`;
        cartBadge.textContent = totalItems;
        cartBadge.classList.remove('hidden');
        atualizarBotaoFinalizar();

        // Salva o carrinho atualizado no localStorage
        localStorage.setItem('dlirio_cart', JSON.stringify(cart));
    }

    window.updateQty = function(index, change) {
        cart[index].qty += change;
        if (cart[index].qty <= 0) cart.splice(index, 1);
        renderCart();
    };

    // =========================================
    // 7. DATA E HORA
    // =========================================
    const dateElement = document.getElementById('current-date');
    function updateDate() {
        const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
        const dateStr = new Date().toLocaleString('pt-BR', options).replace(',', '');
        dateElement.textContent = dateStr.toUpperCase() + ' BR';
    }
    updateDate();
    setInterval(updateDate, 1000);

    // =========================================
    // 8. INICIALIZAÇÃO DO CARRINHO (RESTAURA AO F5)
    // =========================================
    renderCart();
});