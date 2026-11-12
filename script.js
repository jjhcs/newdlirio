document.addEventListener('DOMContentLoaded', () => {
    
    // =========================================
    // 1. CONEXÃO COM O SUPABASE
    // =========================================
    const SUPABASE_URL = 'https://brwcyaczsgdcmxotvbeo.supabase.co';
    // COLE SUA CHAVE AQUI EMBAIXO (Mantenha as aspas)
    const SUPABASE_KEY = 'sb_publishable_Z8vt2f38fT8x9V3B_A7_GQ_WUv98mDH'; 

    // Inicializa o cliente do Supabase
    const { createClient } = supabase;
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Variáveis de Estado
    let cart = [];
    let produtosGlobais = []; 

    // Elementos Globais
    const homeShopView = document.getElementById('home-shop-view');
    const productView = document.getElementById('product-view');
    const menuBtn = document.getElementById('menu-btn');
    const backBtn = document.getElementById('back-btn');
    const logoHomeBtn = document.getElementById('logo-home-btn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const headerElement = document.querySelector('.header');

    // Elementos do Carrinho
    const cartSidebar = document.getElementById('cart-sidebar');
    const cartOverlay = document.getElementById('cart-overlay');
    const closeCartBtn = document.getElementById('close-cart-btn');

    // =========================================
    // 2. BUSCAR PRODUTOS DO SUPABASE
    // =========================================
    async function carregarProdutos() {
        try {
            const { data, error } = await supabaseClient
                .from('produtos')
                .select(`
                    id, nome, preco, categoria, imagem_frente, imagem_verso, galeria,
                    variacoes ( id, tamanho, estoque )
                `)
                .eq('ativo', true); // Filtra para trazer apenas produtos visíveis

            if (error) throw error;

            produtosGlobais = data;
            renderizarVitrine(produtosGlobais);

        } catch (error) {
            console.error('Erro ao buscar produtos:', error.message);
        }
    }
    function renderizarVitrine(produtos) {
        const grid = document.querySelector('.product-grid');
        if (!grid) return;
        grid.innerHTML = ''; 

        produtos.forEach(prod => {
            const tamanhosHTML = prod.variacoes
                .filter(v => v.estoque > 0) // Só mostra tamanho se tiver estoque
                .map(v => `<span>${v.tamanho}</span>`)
                .join('');

            const cardHTML = `
                <a href="#" class="product-card" onclick="openProduct(event, ${prod.id})">
                    <div class="product-image-container">
                        <img src="${prod.imagem_frente}" alt="${prod.nome}" class="product-image product-image-front">
                        <img src="${prod.imagem_verso || prod.imagem_frente}" alt="${prod.nome} Verso" class="product-image product-image-back">
                    </div>
                    <div class="product-info">
                        <h3 class="product-title">${prod.nome}</h3>
                        <p class="product-price">R$ ${prod.preco.toFixed(2).replace('.', ',')}</p>
                        <div class="product-sizes">${tamanhosHTML}</div>
                    </div>
                </a>
            `;
            grid.innerHTML += cardHTML;
        });
    }

    // Chama a função ao carregar a página
    carregarProdutos();

    // =========================================
    // 3. NAVEGAÇÃO E MENUS
    // =========================================
    if(headerElement) headerElement.classList.add('header-hidden'); 

    function toggleMenu() {
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }
    if(menuBtn) menuBtn.addEventListener('click', toggleMenu);
    if(document.getElementById('close-btn')) document.getElementById('close-btn').addEventListener('click', toggleMenu);
    if(overlay) overlay.addEventListener('click', toggleMenu); 

    function showShop(e) {
        if(e) e.preventDefault();
        if(headerElement) headerElement.classList.remove('header-hidden');
        document.getElementById('home-view').classList.add('hidden'); 
        document.getElementById('shop-view').classList.remove('hidden'); 
        window.scrollTo(0, 0); 
        if(sidebar) sidebar.classList.remove('active');
        if(overlay) overlay.classList.remove('active');
    }
    
    if(document.getElementById('btn-all-products')) document.getElementById('btn-all-products').addEventListener('click', showShop);
    document.querySelectorAll('.btn-shop').forEach(link => link.addEventListener('click', showShop));

    // Abrir Página de Produto Dinâmica
    window.openProduct = function(e, id) {
        e.preventDefault();
        
        const produto = produtosGlobais.find(p => p.id === id);
        if(!produto) return;

        // Preenche os textos e preços
        document.querySelector('.product-name').textContent = produto.nome;
        document.querySelector('.product-price-large').textContent = `R$ ${produto.preco.toFixed(2).replace('.', ',')}`;
        document.getElementById('main-image').src = produto.imagem_frente;
        
        // ----------------------------------------------------
        // NOVA LÓGICA DA GALERIA DE MINIATURAS (Frente + Verso + Extras)
        // ----------------------------------------------------
        const thumbnailList = document.querySelector('.thumbnail-list');
        if (thumbnailList) {
            thumbnailList.innerHTML = ''; // Limpa as miniaturas antigas
            
            // Monta uma lista única com todas as fotos do produto
            let todasAsFotos = [produto.imagem_frente];
            if (produto.imagem_verso && produto.imagem_verso !== produto.imagem_frente) {
                todasAsFotos.push(produto.imagem_verso);
            }
            if (produto.galeria && produto.galeria.length > 0) {
                todasAsFotos = todasAsFotos.concat(produto.galeria);
            }

            // Cria as miniaturas dinamicamente
            todasAsFotos.forEach((fotoUrl, index) => {
                const img = document.createElement('img');
                img.src = fotoUrl;
                img.className = 'thumbnail';
                if (index === 0) img.classList.add('active'); // A primeira começa ativa
                
                // Quando clicar na miniatura, troca a imagem principal
                img.onclick = function() {
                    document.getElementById('main-image').src = this.src;
                    document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
                    this.classList.add('active');
                };
                
                thumbnailList.appendChild(img);
            });
        }

        // ----------------------------------------------------
        // LÓGICA DOS TAMANHOS (Mantida)
        // ----------------------------------------------------
        const sizeOptionsContainer = document.querySelector('.size-options');
        if(sizeOptionsContainer) {
            sizeOptionsContainer.innerHTML = ''; 
            produto.variacoes.forEach(v => {
                const btn = document.createElement('button');
                btn.className = 'size-btn';
                btn.textContent = v.tamanho;
                
                if(v.estoque <= 0) {
                    btn.disabled = true;
                    btn.style.opacity = '0.3';
                    btn.style.textDecoration = 'line-through';
                } else {
                    btn.addEventListener('click', () => {
                        sizeOptionsContainer.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        
                        const addBtn = document.querySelector('.btn-add-to-cart');
                        addBtn.dataset.variacaoId = v.id;
                        addBtn.dataset.tamanho = v.tamanho;
                        
                        addBtn.textContent = "ADICIONAR AO CARRINHO";
                        addBtn.style.backgroundColor = "var(--pink-accent)";
                        addBtn.style.color = "#fff";
                        addBtn.style.borderColor = "var(--pink-accent)";
                    });
                }
                sizeOptionsContainer.appendChild(btn);
            });
        }

        const addToCartBtn = document.querySelector('.btn-add-to-cart');
        if(addToCartBtn) {
            addToCartBtn.textContent = "SELECIONE O TAMANHO";
            addToCartBtn.style.backgroundColor = "transparent";
            addToCartBtn.style.color = "var(--pink-accent)";
            addToCartBtn.style.borderColor = "var(--pink-accent)";
            delete addToCartBtn.dataset.variacaoId;
        }

        // Troca as telas
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
    if(backBtn) backBtn.addEventListener('click', goBackToShop);

    if(logoHomeBtn) {
        logoHomeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if(!productView.classList.contains('hidden')) goBackToShop(); 
            document.getElementById('shop-view').classList.add('hidden');
            document.getElementById('home-view').classList.remove('hidden');
            if(headerElement) headerElement.classList.add('header-hidden');
            window.scrollTo(0, 0);
        });
    }

    // =========================================
    // 4. CARRINHO
    // =========================================
    window.openCart = function() {
        cartSidebar.classList.add('active');
        cartOverlay.classList.add('active');
    }
    window.closeCart = function() {
        cartSidebar.classList.remove('active');
        cartOverlay.classList.remove('active');
    }
    if(closeCartBtn) closeCartBtn.addEventListener('click', closeCart);
    if(cartOverlay) cartOverlay.addEventListener('click', closeCart);

    const addToCartBtn = document.querySelector('.btn-add-to-cart');
    if (addToCartBtn) {
        addToCartBtn.addEventListener('click', () => {
            const variacaoId = addToCartBtn.dataset.variacaoId;
            if (!variacaoId) return; 

            const nomeProduto = document.querySelector('.product-name').textContent;
            const precoTexto = document.querySelector('.product-price-large').textContent;
            const precoNumerico = parseFloat(precoTexto.replace('R$ ', '').replace(',', '.'));
            const imagem = document.getElementById('main-image').src;
            const tamanho = addToCartBtn.dataset.tamanho;

            const itemExistente = cart.find(item => item.variacaoId === variacaoId);

            if (itemExistente) {
                itemExistente.qty += 1;
            } else {
                cart.push({
                    variacaoId: variacaoId,
                    nome: nomeProduto,
                    preco: precoNumerico,
                    tamanho: tamanho,
                    imagem: imagem,
                    qty: 1
                });
            }

            renderCart();
            openCart();
        });
    }

    function renderCart() {
        const container = document.getElementById('cart-items-container');
        const totalPriceEl = document.getElementById('cart-total-price');
        const countEl = document.getElementById('cart-count');
        const checkoutBtn = document.getElementById('checkout-btn');
        const cartBadge = document.getElementById('cart-badge');
        
        if(!container) return;
        container.innerHTML = '';
        
        if (cart.length === 0) {
            container.innerHTML = '<p class="empty-cart-msg">Seu carrinho está vazio.</p>';
            if(totalPriceEl) totalPriceEl.textContent = 'R$ 0,00';
            if(countEl) countEl.textContent = '0 ITENS';
            if(checkoutBtn) checkoutBtn.disabled = true;
            if(cartBadge) cartBadge.classList.add('hidden');
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
                    <p class="cart-item-price">R$ ${item.preco.toFixed(2).replace('.', ',')}</p>
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

        if(totalPriceEl) totalPriceEl.textContent = `R$ ${total.toFixed(2).replace('.', ',')}`;
        if(countEl) countEl.textContent = `${totalItems} ${totalItems === 1 ? 'ITEM' : 'ITENS'}`;
        if(checkoutBtn) checkoutBtn.disabled = false;
        
        if(cartBadge) {
            cartBadge.textContent = totalItems;
            cartBadge.classList.remove('hidden');
        }
    }

    window.updateQty = function(index, change) {
        cart[index].qty += change;
        if (cart[index].qty <= 0) cart.splice(index, 1);
        renderCart();
    };

    const termsCheckbox = document.getElementById('terms-checkbox');
    if(termsCheckbox) {
        termsCheckbox.addEventListener('change', (e) => {
            document.getElementById('checkout-btn').disabled = !e.target.checked || cart.length === 0;
        });
    }

    // =========================================
    // 5. DATA E HORA
    // =========================================
    const dateElement = document.getElementById('current-date');
    function updateDate() {
        if(!dateElement) return;
        const now = new Date();
        const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
        let dateStr = now.toLocaleString('pt-BR', options).replace(',', '');
        dateElement.textContent = dateStr.toUpperCase() + ' BR';
    }
    updateDate();
    setInterval(updateDate, 60000); 
});