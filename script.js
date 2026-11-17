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
    // VERIFICA SE O USUÁRIO VEIO DA LOGO DO SUPORTE
    // =========================================
    if (window.location.search.includes('loja=true')) {
        // Se veio, abre a vitrine pulando a Hero
        headerElement.classList.remove('header-hidden');
        homeView.classList.add('hidden');
        shopView.classList.remove('hidden');

        // Limpa a URL para não bugar se der F5
        window.history.replaceState({}, document.title, window.location.pathname);
    }

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

        // loading="lazy": o navegador só baixa as imagens quando a vitrine está visível/perto da tela
        grid.innerHTML = produtosGlobais.map(prod => {
            const tamanhosHTML = prod.variacoes
                .filter(v => v.estoque > 0)
                .map(v => `<span>${v.tamanho}</span>`)
                .join('');

            return `
                <a href="#" class="product-card" data-categoria="${prod.categoria}" onclick="openProduct(event, ${prod.id})">
                    <div class="product-image-container">
                        <img src="${prod.imagem_frente}" alt="${prod.nome}" class="product-image product-image-front" loading="lazy" decoding="async">
                        <img src="${prod.imagem_verso || prod.imagem_frente}" alt="${prod.nome} Verso" class="product-image product-image-back" loading="lazy" decoding="async">
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

    document.getElementById('btn-all-products').addEventListener('click', (e) => {
        e.target.setAttribute('data-timer-iniciado', 'true'); 
        
        // Aplica a animação de saída
        homeView.classList.add('anim-slide-out-left');
        
        setTimeout(() => {
            homeView.classList.add('hidden');
            homeView.classList.remove('anim-slide-out-left');
            
            shopView.classList.remove('hidden');
            headerElement.classList.remove('header-hidden');
            
            shopView.classList.add('anim-slide-in-right');
            window.scrollTo(0, 0);
            fecharMenu();

            filtroAtual = 'TODOS';
            aplicarFiltro();

            setTimeout(() => {
                shopView.classList.remove('anim-slide-in-right');
            }, 600);

        }, 600);
    });
    
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

        // 1. Se estiver na página de um produto específico, volta para a vitrine
        if (!productView.classList.contains('hidden')) {
            goBackToShop();
            return;
        }

        // 2. Se estiver na vitrine (shop-view), volta para a Hero (Tela Inicial)
        if (!shopView.classList.contains('hidden')) {
            shopView.classList.add('hidden');
            homeView.classList.remove('hidden');
            headerElement.classList.add('header-hidden');
            window.scrollTo(0, 0);

            filtroAtual = 'TODOS';
            aplicarFiltro();
            return;
        }

        // 3. Se já estiver na Hero, apenas rola para o topo (segurança)
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
        document.body.style.overflow = 'hidden'; // Trava o scroll do fundo
    };

    window.closeCart = function() {
        cartSidebar.classList.remove('active');
        cartOverlay.classList.remove('active');
        document.body.style.overflow = ''; // Libera o scroll
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
    // Formatter criado uma única vez (criar um novo a cada segundo é caro)
    const formatoData = new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
    function updateDate() {
        dateElement.textContent = formatoData.format(new Date()).replace(',', '').toUpperCase() + ' BR';
    }
    updateDate();
    setInterval(updateDate, 1000);

    // =========================================
    // 8. INICIALIZAÇÃO DO CARRINHO (RESTAURA AO F5)
    // =========================================
    renderCart();

    // =========================================
    // 9. EFEITO DE FOGO NA HERO (WEBGL)
    // =========================================
    (function initFireEffect() {
        const canvas = document.getElementById('fire-canvas');
        if (!canvas) return;

        // Se o usuário preferir menos movimento (acessibilidade), o fogo anda mais devagar
        const calm = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.3 : 1;

        // Resolução interna do fogo. É um efeito borrado, então não precisa de mais:
        // no máximo metade da tela E no máximo ~220 mil pixels (telas grandes caem para ~1/3).
        const SCALE = 0.5;
        const MAX_PIXELS = 220000;
        const FRAME_MS = 1000 / 30; // 30 fps bastam: o fogo se move devagar

        const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
        if (!gl) return; // Fallback silencioso se não suportar WebGL

        let running = false, raf = 0, last = 0, resizeTimer = 0, uR, uT;
        const t0 = performance.now();

        // Vertex Shader (padrão para desenhar um quadrado)
        const VS = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

        // Fragment Shader (O Fogo)
        const FS = `
        #ifdef GL_FRAGMENT_PRECISION_HIGH
        precision highp float;
        #else
        precision mediump float;
        #endif
        uniform vec2 r; uniform float t;
        float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float n(vec2 p){
          vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);
        }
        float fbm(vec2 p){
          float v=0.,a=.5;
          for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}
          return v;
        }
        void main(){
          vec2 uv=gl_FragCoord.xy/r;
          vec2 p=vec2(uv.x*r.x/r.y,uv.y)*1.6;
          float T=t*.12;
          vec2 q=vec2(fbm(p+vec2(0.,-T*2.)),fbm(p+vec2(5.2,1.3-T)));
          vec2 w=vec2(fbm(p+2.5*q+vec2(1.7,9.2)+T*.5),fbm(p+2.5*q+vec2(8.3,2.8)-T*.4));
          float f=fbm(p+2.5*w);
          float k=1.-uv.y*1.15+(f-.5)*.7+.05*sin(t*.8);
          vec3 c=mix(vec3(0.),vec3(.28,.03,.14),smoothstep(.15,.55,k));
          c=mix(c,vec3(.78,.14,.42),smoothstep(.5,.95,k));
          c=mix(c,vec3(.98,.58,.82),smoothstep(.9,1.35,k)*.9);
          c=mix(c,vec3(.68,.5,.92),smoothstep(.55,1.,uv.x)*smoothstep(.3,0.,uv.y)*(.4+.6*w.x));
          c+=(h(gl_FragCoord.xy+t)-.5)/110.;
          gl_FragColor=vec4(c,1.);
        }`;

        function sh(type, src) {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
        }

        function init() {
            const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
            if (!vs || !fs) return false;
            const pg = gl.createProgram();
            gl.attachShader(pg, vs); gl.attachShader(pg, fs); gl.linkProgram(pg);
            if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) return false;
            gl.useProgram(pg);
            gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
            const a = gl.getAttribLocation(pg, 'a');
            gl.enableVertexAttribArray(a);
            gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
            uR = gl.getUniformLocation(pg, 'r');
            uT = gl.getUniformLocation(pg, 't');
            return true;
        }

        function resize() {
            const w = innerWidth, h = innerHeight;
            const s = Math.min(SCALE, Math.sqrt(MAX_PIXELS / (w * h)));
            const cw = Math.max(1, Math.floor(w * s));
            const ch = Math.max(1, Math.floor(h * s));
            if (cw === canvas.width && ch === canvas.height) return; // nada mudou, não realoca
            canvas.width = cw;
            canvas.height = ch;
            gl.viewport(0, 0, cw, ch);
            gl.uniform2f(uR, cw, ch); // só muda quando o tamanho muda, não a cada frame
            last = 0; // redesenha já no próximo frame
        }

        function frame(now) {
            if (!running) return;
            raf = requestAnimationFrame(frame);
            if (now - last < FRAME_MS - 2) return; // limita a ~30 fps
            last = now;
            gl.uniform1f(uT, (now - t0) / 1000 * calm);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        function start() {
            if (running) return;
            running = true; raf = requestAnimationFrame(frame);
        }
        function stop() { running = false; cancelAnimationFrame(raf); }

        if (init()) {
            resize();

            // Resize com "debounce": arrastar a janela não realoca o canvas dezenas de vezes
            addEventListener('resize', () => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(resize, 150);
            });

            // Só anima se a Hero estiver visível (se abriu direto na loja, não gasta GPU à toa)
            if (!homeView.classList.contains('hidden')) start();

            // Pausa/retoma conforme o usuário sai/volta da tela inicial
            new MutationObserver(() => {
                homeView.classList.contains('hidden') ? stop() : start();
            }).observe(homeView, { attributes: true, attributeFilter: ['class'] });
        }
    })();
    // =========================================
    // TIMER INTELIGENTE COM TRANSIÇÃO (EFEITO CAPCUT)
    // =========================================
    if (!window.location.search && homeView && !homeView.classList.contains('hidden')) {
        setTimeout(() => {
            const botao = document.getElementById('btn-all-products');
            const jaClicou = botao.getAttribute('data-timer-iniciado') === 'true';
            
            if (!homeView.classList.contains('hidden') && !jaClicou) {
                
                // 1. Aplica a animação de saída na Hero
                homeView.classList.add('anim-slide-out-left');
                
                // 2. Espera 600ms (tempo da animação) para trocar as telas
                setTimeout(() => {
                    // Remove as classes para resetar o estado
                    homeView.classList.add('hidden');
                    homeView.classList.remove('anim-slide-out-left');
                    
                    // Prepara a vitrine para entrar
                    shopView.classList.remove('hidden');
                    headerElement.classList.remove('header-hidden');
                    
                    // Aplica a animação de entrada na Vitrine
                    shopView.classList.add('anim-slide-in-right');
                    
                    // Limpa a classe de animação depois que ela terminar
                    setTimeout(() => {
                        shopView.classList.remove('anim-slide-in-right');
                    }, 600);

                }, 600); // Tempo igual ao da animação do CSS
                
            }
        }, 2000); // 2000 milissegundos = 2 segundos de espera
}}); // fecha o DOMContentLoaded
