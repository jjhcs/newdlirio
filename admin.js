document.addEventListener('DOMContentLoaded', () => {
    const SUPABASE_URL = 'https://brwcyaczsgdcmxotvbeo.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_Z8vt2f38fT8x9V3B_A7_GQ_WUv98mDH'; 

    const { createClient } = supabase;
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

    const loginScreen = document.getElementById('login-screen');
    const adminPanel = document.getElementById('admin-panel');
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');
    const productForm = document.getElementById('product-form');
    const productList = document.getElementById('product-list');
    const formTitle = document.getElementById('form-title');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const previewContainer = document.getElementById('current-images-preview');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('prod-images-input');

    let produtosGlobais = [];
    let imagensAtuais = { frente: '', verso: '', galeria: [] };
    let novasImagensUpload = []; // Guarda os arquivos que o usuário arrastar antes de salvar
    let sortableInstance = null;

    // --- 1. LOGIN ---
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            loginScreen.classList.add('hidden');
            adminPanel.classList.remove('hidden');
            carregarProdutosAdmin();
        } else {
            loginScreen.classList.remove('hidden');
            adminPanel.classList.add('hidden');
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) document.getElementById('login-error').classList.remove('hidden');
    });

    logoutBtn.addEventListener('click', () => supabaseClient.auth.signOut());

    // --- 2. LISTAR PRODUTOS ---
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

    // --- 3. AÇÕES ---
    window.toggleVisibilidade = async (id, statusAtual) => {
        await supabaseClient.from('produtos').update({ ativo: !statusAtual }).eq('id', id);
        carregarProdutosAdmin();
    };

    window.deletarProduto = async (id) => {
        if (!confirm("Tem certeza que deseja apagar este produto?")) return;
        await supabaseClient.from('produtos').delete().eq('id', id);
        carregarProdutosAdmin();
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
        
        imagensAtuais = {
            frente: prod.imagem_frente,
            verso: prod.imagem_verso || '',
            galeria: prod.galeria || []
        };
        novasImagensUpload = []; // Limpa novos uploads pendentes

        renderizarPreviewImagens();

        const tamanhos = prod.variacoes.map(v => `${v.tamanho}:${v.estoque}`).join(', ');
        document.getElementById('prod-sizes').value = tamanhos;

        formTitle.textContent = "EDITANDO PRODUTO";
        cancelEditBtn.classList.remove('hidden');
        window.scrollTo(0, document.body.scrollHeight);
    };

    // --- 4. LÓGICA DO DRAG & DROP E MINIATURAS ---
    
    // Função que desenha as fotos atuais + os novos uploads pendentes
    function renderizarPreviewImagens() {
        previewContainer.innerHTML = '';
        
        let todasAsImagens = [];
        
        // Adiciona as imagens que já estão no banco
        if (imagensAtuais.frente) todasAsImagens.push({ tipo: 'banco', url: imagensAtuais.frente });
        if (imagensAtuais.verso && imagensAtuais.verso !== imagensAtuais.frente) todasAsImagens.push({ tipo: 'banco', url: imagensAtuais.verso });
        imagensAtuais.galeria.forEach(url => todasAsImagens.push({ tipo: 'banco', url }));

        // Adiciona os arquivos novos que ainda não foram salvos
        novasImagensUpload.forEach((file, index) => {
            const urlTemporaria = URL.createObjectURL(file);
            todasAsImagens.push({ tipo: 'upload', url: urlTemporaria, fileIndex: index });
        });

        // Renderiza na tela
        todasAsImagens.forEach((imgObj) => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.dataset.tipo = imgObj.tipo;
            div.dataset.fileIndex = imgObj.fileIndex !== undefined ? imgObj.fileIndex : '';
            div.dataset.url = imgObj.url;
            
            div.innerHTML = `
                <img src="${imgObj.url}">
                <button class="btn-remove-img" onclick="removerImagem(this)">X</button>
            `;
            previewContainer.appendChild(div);
        });

        // Ativa o Sortable (Arrastar e Soltar)
        if (sortableInstance) sortableInstance.destroy();
        sortableInstance = new Sortable(previewContainer, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function (evt) {
                // Atualiza a ordem visual. A regra é: 1º é Frente, 2º é Verso, o resto é Galeria.
                const itens = Array.from(previewContainer.children);
                let novaFrente = '';
                let novoVerso = '';
                let novaGaleria = [];
                let novosUploadsReordenados = [];

                itens.forEach((item, posicao) => {
                    const tipo = item.dataset.tipo;
                    const url = item.dataset.url;
                    const fileIndex = item.dataset.fileIndex;

                    if (tipo === 'banco') {
                        if (posicao === 0) novaFrente = url;
                        else if (posicao === 1) novoVerso = url;
                        else novaGaleria.push(url);
                    } else if (tipo === 'upload') {
                        const file = novasImagensUpload[fileIndex];
                        // Se o arquivo novo for movido para a 1ª ou 2ª posição, ele assume como frente/verso
                        if (posicao === 0) novaFrente = URL.createObjectURL(file); 
                        else if (posicao === 1) novoVerso = URL.createObjectURL(file);
                        else novaGaleria.push(URL.createObjectURL(file));
                        
                        novosUploadsReordenados.push(file);
                    }
                });

                imagensAtuais.frente = novaFrente;
                imagensAtuais.verso = novoVerso;
                imagensAtuais.galeria = novaGaleria;
                // Aqui ocorre um pequeno detalhe técnico: os arquivos novos que viraram frente/verso
                // serão tratados no upload final.

                renderizarPreviewImagens();
            }
        });
    }

    // Remove uma imagem da lista
    window.removerImagem = (btn) => {
        const div = btn.parentElement;
        const tipo = div.dataset.tipo;
        const url = div.dataset.url;
        const fileIndex = div.dataset.fileIndex;

        if (tipo === 'upload') {
            novasImagensUpload.splice(fileIndex, 1);
        } else {
            if (imagensAtuais.frente === url) imagensAtuais.frente = '';
            else if (imagensAtuais.verso === url) imagensAtuais.verso = '';
            else imagensAtuais.galeria = imagensAtuais.galeria.filter(g => g !== url);
        }
        renderizarPreviewImagens();
    };

    // Eventos do Dropzone (Clique e Arrastar)
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        adicionarNovasImagens(files);
    });

    fileInput.addEventListener('change', (e) => {
        adicionarNovasImagens(e.target.files);
        fileInput.value = ''; // Limpa o input para permitir selecionar o mesmo arquivo de novo
    });

    function adicionarNovasImagens(files) {
        for (let i = 0; i < files.length; i++) {
            if (files[i].type.startsWith('image/')) {
                novasImagensUpload.push(files[i]);
            }
        }
        renderizarPreviewImagens();
    }

    cancelEditBtn.addEventListener('click', resetarFormulario);

    function resetarFormulario() {
        productForm.reset();
        document.getElementById('prod-id').value = '';
        imagensAtuais = { frente: '', verso: '', galeria: [] };
        novasImagensUpload = [];
        renderizarPreviewImagens();
        formTitle.textContent = "CADASTRAR NOVO PRODUTO";
        cancelEditBtn.classList.add('hidden');
    }

    // --- 5. SALVAR ---
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

            async function uploadImagem(file) {
                const fileName = `${Date.now()}-${file.name.replace(/\s/g, '')}`;
                const { data, error } = await supabaseClient.storage.from('produtos').upload(fileName, file);
                if (error) throw error;
                const { data: urlData } = supabaseClient.storage.from('produtos').getPublicUrl(data.path);
                return urlData.publicUrl;
            }

            // Variáveis que vão para o banco
            let urlFront = imagensAtuais.frente;
            let urlBack = imagensAtuais.verso;
            let arrayGaleria = [...imagensAtuais.galeria];

            // Faz o upload de todos os arquivos novos que estão na lista de "novasImagensUpload"
            // Nota: A ordem visual foi mantida, mas simplificamos o upload para garantir que todos subam.
            let todasNovasUrls = [];
            for (let i = 0; i < novasImagensUpload.length; i++) {
                const url = await uploadImagem(novasImagensUpload[i]);
                todasNovasUrls.push(url);
            }

            // Como o usuário pode ter arrastado arquivos novos para a posição de Frente/Verso,
            // vamos verificar se as URLs atuais são na verdade "blobs" temporários.
            // Se o front/back estiverem vazios, pegamos do upload.
            if (!urlFront && todasNovasUrls.length > 0) urlFront = todasNovasUrls.shift();
            if (!urlBack && todasNovasUrls.length > 0) urlBack = todasNovasUrls.shift();
            
            // O restante entra na galeria
            arrayGaleria = arrayGaleria.concat(todasNovasUrls);

            const produtoData = { 
                nome, sku, categoria, preco, descricao, 
                imagem_frente: urlFront || '', 
                imagem_verso: urlBack || urlFront || '',
                galeria: arrayGaleria
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

            document.getElementById('success-msg').classList.remove('hidden');
            setTimeout(() => document.getElementById('success-msg').classList.add('hidden'), 3000);
            
            resetarFormulario();
            carregarProdutosAdmin();

        } catch (error) {
            console.error(error);
            alert("Erro ao salvar: " + error.message);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = "SALVAR PRODUTO";
        }
    });
});