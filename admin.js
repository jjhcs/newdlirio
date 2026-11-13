document.addEventListener('DOMContentLoaded', () => {

    // =========================================
    // 1. CONEXÃO (cliente criado no script.js)
    // =========================================
    const supabaseClient = window.supabaseClient;

    // Elementos do Admin
    const adminOverlay = document.getElementById('admin-overlay');
    const closeAdminBtn = document.getElementById('close-admin-btn');
    const productForm = document.getElementById('product-form');
    const productList = document.getElementById('product-list');
    const formTitle = document.getElementById('form-title');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const previewContainer = document.getElementById('current-images-preview');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('prod-images-input');

    let produtosGlobais = [];
    let ordemImagensTela = [];
    let sortableInstance = null;

    // Recarrega a vitrine do site que está por baixo do painel
    function atualizarVitrine() {
        window.carregarProdutos();
    }

    // =========================================
    // 2. LOGIN E ATALHO SECRETO (CTRL + SHIFT + L)
    // =========================================
    const loginScreen = document.getElementById('admin-login-screen');
    const adminContent = document.getElementById('admin-content');
    const loginForm = document.getElementById('admin-login-form');
    const loginError = document.getElementById('admin-login-error');

    // Só libera o conteúdo se houver sessão E o painel estiver aberto.
    // (uma sessão salva de antes no navegador não pula mais o login)
    supabaseClient.auth.onAuthStateChange((_event, session) => {
        const liberado = !!session && !adminOverlay.classList.contains('hidden');
        loginScreen.style.display = liberado ? 'none' : 'block';
        adminContent.style.display = liberado ? 'block' : 'none';
        if (liberado) carregarProdutosAdmin();
    });

    function abrirAdmin() {
        // Sempre começa na tela de login, mesmo se já existir sessão salva
        loginScreen.style.display = 'block';
        adminContent.style.display = 'none';
        adminOverlay.classList.remove('hidden');
        supabaseClient.auth.signOut({ scope: 'local' }); // descarta a sessão salva neste navegador
    }

    function fecharAdmin() {
        adminOverlay.classList.add('hidden');
        supabaseClient.auth.signOut({ scope: 'local' }); // Logout ao fechar, por segurança
    }

    // Atalho Ctrl + Shift + L
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
            e.preventDefault();
            if (adminOverlay.classList.contains('hidden')) {
                abrirAdmin();
            } else {
                fecharAdmin();
            }
        }
    });

    closeAdminBtn.addEventListener('click', fecharAdmin);

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('admin-email').value;
        const password = document.getElementById('admin-password').value;

        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            loginError.style.display = 'block';
            setTimeout(() => loginError.style.display = 'none', 3000);
        } else {
            loginError.style.display = 'none';
            loginForm.reset();
        }
    });

    // =========================================
    // 3. LISTAR PRODUTOS NO ADMIN
    // =========================================
    async function carregarProdutosAdmin() {
        const { data, error } = await supabaseClient
            .from('produtos')
            .select(`*, variacoes ( id, tamanho, estoque )`)
            .order('id', { ascending: false });

        if (error) return console.error(error);

        produtosGlobais = data;
        renderizarListaAdmin(data);
    }

    function renderizarListaAdmin(produtos) {
        productList.innerHTML = '';
        produtos.forEach(prod => {
            const status = prod.ativo ? 'Visível' : 'Oculto';
            const color = prod.ativo ? '#4dff88' : '#ff4d4d';

            const div = document.createElement('div');
            div.className = 'admin-item';
            div.innerHTML = `
                <div class="admin-item-info">
                    <img src="${prod.imagem_frente}" class="admin-item-img">
                    <div>
                        <div class="admin-item-title">${prod.nome} (R$ ${prod.preco.toFixed(2)})</div>
                        <div class="admin-item-status" style="color: ${color}">Status: ${status} | SKU: ${prod.sku || 'N/A'}</div>
                    </div>
                </div>
                <div class="admin-item-actions">
                    <button class="btn-action" onclick="toggleVisibilidade(${prod.id}, ${prod.ativo})">${prod.ativo ? 'Ocultar' : 'Mostrar'}</button>
                    <button class="btn-action" onclick="prepararEdicao(${prod.id})">Editar</button>
                    <button class="btn-action btn-delete" onclick="deletarProduto(${prod.id})">Excluir</button>
                </div>
            `;
            productList.appendChild(div);
        });
    }

    // =========================================
    // 4. AÇÕES (OCULTAR, DELETAR, EDITAR)
    // =========================================
    window.toggleVisibilidade = async (id, statusAtual) => {
        await supabaseClient.from('produtos').update({ ativo: !statusAtual }).eq('id', id);
        carregarProdutosAdmin();
        atualizarVitrine();
    };

    window.deletarProduto = async (id) => {
        if (!confirm("Tem certeza que deseja apagar este produto?")) return;
        await supabaseClient.from('produtos').delete().eq('id', id);
        carregarProdutosAdmin();
        atualizarVitrine();
    };

    window.prepararEdicao = (id) => {
        const prod = produtosGlobais.find(p => p.id === id);
        if (!prod) return;

        document.getElementById('prod-id').value = prod.id;
        document.getElementById('prod-name').value = prod.nome;
        document.getElementById('prod-sku').value = prod.sku || '';
        document.getElementById('prod-category').value = prod.categoria;
        document.getElementById('prod-price').value = prod.preco;
        document.getElementById('prod-desc').value = prod.descricao || '';

        ordemImagensTela = [];
        if (prod.imagem_frente) ordemImagensTela.push({ tipo: 'url', dados: prod.imagem_frente });
        if (prod.imagem_verso && prod.imagem_verso !== prod.imagem_frente) ordemImagensTela.push({ tipo: 'url', dados: prod.imagem_verso });
        if (prod.galeria && prod.galeria.length > 0) {
            prod.galeria.forEach(url => ordemImagensTela.push({ tipo: 'url', dados: url }));
        }

        renderizarPreviewImagens();

        document.getElementById('prod-sizes').value = prod.variacoes.map(v => `${v.tamanho}:${v.estoque}`).join(', ');

        formTitle.textContent = "EDITANDO PRODUTO";
        cancelEditBtn.classList.remove('hidden');
        adminOverlay.scrollTo(0, 0); // quem rola é o overlay, não a janela
    };

    // =========================================
    // 5. LÓGICA DE IMAGENS E DRAG & DROP
    // =========================================
    function renderizarPreviewImagens() {
        previewContainer.innerHTML = '';

        ordemImagensTela.forEach((item, index) => {
            const urlVisual = item.tipo === 'url' ? item.dados : URL.createObjectURL(item.dados);

            const div = document.createElement('div');
            div.className = 'preview-item';
            div.dataset.index = index;

            div.innerHTML = `
                <img src="${urlVisual}">
                <button class="btn-remove-img" type="button" onclick="removerImagem(this)">X</button>
            `;
            previewContainer.appendChild(div);
        });

        if (sortableInstance) sortableInstance.destroy();
        sortableInstance = new Sortable(previewContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function () {
                ordemImagensTela = Array.from(previewContainer.children)
                    .map(itemDom => ordemImagensTela[parseInt(itemDom.dataset.index)]);
                renderizarPreviewImagens();
            }
        });
    }

    window.removerImagem = (btn) => {
        const index = parseInt(btn.parentElement.dataset.index);
        ordemImagensTela.splice(index, 1);
        renderizarPreviewImagens();
    };

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        adicionarNovasImagens(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => {
        adicionarNovasImagens(e.target.files);
        fileInput.value = '';
    });

    function adicionarNovasImagens(files) {
        for (let i = 0; i < files.length; i++) {
            if (files[i].type.startsWith('image/')) {
                ordemImagensTela.push({ tipo: 'file', dados: files[i] });
            }
        }
        renderizarPreviewImagens();
    }

    cancelEditBtn.addEventListener('click', resetarFormulario);

    function resetarFormulario() {
        productForm.reset();
        document.getElementById('prod-id').value = '';
        ordemImagensTela = [];
        renderizarPreviewImagens();
        formTitle.textContent = "CADASTRAR NOVO PRODUTO";
        cancelEditBtn.classList.add('hidden');
    }

    // =========================================
    // 6. SALVAR PRODUTO (UPLOAD E BANCO)
    // =========================================
    async function uploadImagem(file) {
        const fileName = `${Date.now()}-${file.name.replace(/\s/g, '')}`;
        const { data, error } = await supabaseClient.storage.from('produtos').upload(fileName, file);
        if (error) throw error;
        const { data: urlData } = supabaseClient.storage.from('produtos').getPublicUrl(data.path);
        return urlData.publicUrl;
    }

    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById('submit-btn');
        submitBtn.disabled = true;
        submitBtn.textContent = "SALVANDO...";

        try {
            const id = document.getElementById('prod-id').value;
            const isEditing = id !== '';

            const nome = document.getElementById('prod-name').value;
            const sku = document.getElementById('prod-sku').value;
            const categoria = document.getElementById('prod-category').value;
            const preco = parseFloat(document.getElementById('prod-price').value);
            const descricao = document.getElementById('prod-desc').value;
            const sizesString = document.getElementById('prod-sizes').value;

            const urlsFinais = [];
            for (const item of ordemImagensTela) {
                if (item.tipo === 'url') urlsFinais.push(item.dados);
                else urlsFinais.push(await uploadImagem(item.dados));
            }

            const produtoData = {
                nome, sku, categoria, preco, descricao,
                imagem_frente: urlsFinais[0] || '',
                imagem_verso: urlsFinais[1] || '',
                galeria: urlsFinais.slice(2)
            };

            let produtoId = id;

            if (isEditing) {
                const { error } = await supabaseClient.from('produtos').update(produtoData).eq('id', id);
                if (error) throw error;
                await supabaseClient.from('variacoes').delete().eq('produto_id', id);
            } else {
                const { data, error } = await supabaseClient.from('produtos').insert([produtoData]).select().single();
                if (error) throw error;
                produtoId = data.id;
            }

            const sizesArray = sizesString.split(',').map(item => {
                const [tamanho, estoque] = item.split(':');
                return { produto_id: produtoId, tamanho: tamanho.trim().toUpperCase(), estoque: parseInt(estoque.trim()) || 0 };
            });

            const { error: sizeError } = await supabaseClient.from('variacoes').insert(sizesArray);
            if (sizeError) throw sizeError;

            const successMsg = document.getElementById('success-msg');
            successMsg.classList.remove('hidden');
            setTimeout(() => successMsg.classList.add('hidden'), 3000);

            resetarFormulario();
            carregarProdutosAdmin();
            atualizarVitrine();

        } catch (error) {
            console.error(error);
            alert("Erro ao salvar: " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "SALVAR PRODUTO";
        }
    });
});