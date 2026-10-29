import { $, $all, formatMinutes } from './utils/helpers.js';
import { initClock } from './utils/date.js';
import { iptvCacheDB } from './services/cache.js';
import { createChannelCard } from './components/channelCard.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- ESTADO GLOBAL DO MÓDULO ---
    let allStreams = [];
    let categoryMap = {}; // Guardará a tradução de ID -> Nome da Categoria (Ex: {"1885": "CANAIS | GLOBO"})

    const paramsMap = {
        'live': { en: 'Live Channels', 'pt-br': 'Canais ao vivo', streamFile: 'get_live_streams.json', catFile: 'get_live_categories.json' },
        'vod': { en: 'Movies', 'pt-br': 'Filmes', streamFile: 'get_vod_streams.json', catFile: 'get_vod_categories.json' },
        'series': { en: 'Series', 'pt-br': 'Séries', streamFile: 'get_series.json', catFile: 'get_series_categories.json' }
    };

    const urlParams = new URLSearchParams(location.search);
    const firstParam = urlParams.keys().next().value;
    const language = document.documentElement.lang || 'pt-br';

    // Cache de Elementos do DOM
    const el = {
        bgImg: $('background-image'),
        movieName: $('movie-name'),
        movieDesc: $('movie-desc'),
        endTime: $('end-time'),
        container: document.querySelector('.tv-container'),
        categoryList: $('category-list'),
        channelList: $('channel-list')
    };

    // --- PROTEÇÃO DE ROTA & VALIDAÇÃO ---
    const session = JSON.parse(localStorage.getItem('iptv_session'));
    if (!session || !firstParam || !paramsMap[firstParam]) {
        location.href = './index.html';
        return;
    }

    const currentConfig = paramsMap[firstParam];

    // Define Título da Página
    const pageTitle = currentConfig[language] || currentConfig['en'];
    $('content-name').textContent = pageTitle;

    // Inicializa Relógio
    initClock();

    // --- INTERSECTION OBSERVER (FOCO) ---
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const card = entry.target;
                const mediaData = card._mediaData;

                requestAnimationFrame(() => {
                    $all('.channel-card.active').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    el.bgImg.src = mediaData.bgUrl;
                    el.movieName.textContent = mediaData.name;
                    el.movieDesc.textContent = mediaData.channelDesc;
                    el.endTime.textContent = formatMinutes(mediaData.duration);
                });
            }
        });
    }, { root: el.container, threshold: 0.01, rootMargin: "-30% 0px -65% 0px" });

    // --- TRADUTOR / MAPEADOR DE DADOS ---
    function mapStreamItem(item, type) {
        const name = item.name || item.title || "Sem nome";

        // Trata os diferentes formatos de imagem que a API envia (stream_icon para canais/filmes, cover para séries)
        const rawIcon = item.stream_icon || item.cover || "";
        const posterUrl = rawIcon !== "" ? rawIcon : "https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=2670&auto=format&fit=crop";

        // Trata o array de backdrops das séries, ou usa o ícone/poster como fallback de fundo
        const hasBackdrop = Array.isArray(item.backdrop_path) && item.backdrop_path.length > 0;
        const bannerUrl = hasBackdrop ? item.backdrop_path[0] : posterUrl;

        const description = item.plot || item.description || "Sem descrição disponível.";

        // Traduz o ID numérico da categoria para o Nome Legível usando o mapa de categorias
        let categories = [];
        if (item.category_id && categoryMap[item.category_id]) {
            categories.push(categoryMap[item.category_id]);
        }

        // Se o item tiver múltiplos IDs de categorias, traduz todos eles também
        if (Array.isArray(item.category_ids)) {
            item.category_ids.forEach(id => {
                if (categoryMap[id] && !categories.includes(categoryMap[id])) {
                    categories.push(categoryMap[id]);
                }
            });
        }

        // Se mesmo assim ficar sem categoria, joga um padrão baseado no tipo
        if (categories.length === 0) {
            categories.push(type === 'live' ? 'TV Ao Vivo' : (type === 'vod' ? 'Filmes' : 'Séries'));
        }

        // Duração (Canais ao vivo não têm duração definida, fixamos em 0 ou 120 para filmes)
        let duration = type === 'live' ? 0 : 120;
        const rawDuration = item.duration || item.episode_run_time;
        if (rawDuration) {
            if (typeof rawDuration === 'string' && rawDuration.includes(':')) {
                const parts = rawDuration.split(':');
                duration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
            } else {
                duration = parseInt(rawDuration) || 120;
            }
        }

        // Monta a URL final de streaming baseada na estrutura padrão do Xtream Codes se necessário
        // (Adaptado para ler .videoSrc, .url ou deixar em branco para você injetar seu padrão DNS se preferir)
        const videoSrc = item.videoSrc || item.url || "";

        return {
            id: item.id || item.stream_id || item.series_id,
            type: item.stream_type,
            name,
            posterUrl,
            bannerUrl,
            videoSrc,
            categories,
            description,
            duration
        };
    }

    // --- RENDERIZADORES ---
    function renderCategories(streams) {
        const allCategories = new Set(["Todas"]);
        streams.forEach(s => s.categories.forEach(cat => cat && allCategories.add(cat)));

        el.categoryList.innerHTML = "";
        const catFragment = document.createDocumentFragment();

        allCategories.forEach(cat => {
            const li = document.createElement('li');
            const isTodas = cat === 'Todas';
            li.innerHTML = `
                <button class="category-btn p-2 lg:p-3 rounded-xl lg:rounded-2xl transition shrink-0 w-fit cursor-pointer 
                ${isTodas ? 'bg-white/10 text-white border border-white/20' : 'opacity-60 hover:opacity-100'}" data-category="${cat}">
                    ${cat}
                </button>`;
            catFragment.appendChild(li);
        });
        el.categoryList.appendChild(catFragment);
    }

    function filterAndRenderStreams(category) {
        observer.disconnect();
        const filtered = category === "Todas" ? allStreams : allStreams.filter(s => s.categories.includes(category));

        el.channelList.innerHTML = "";
        if (filtered.length === 0) {
            el.channelList.innerHTML = `<p class="text-center text-gray-500 py-10 w-full">Nenhum conteúdo encontrado.</p>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        filtered.forEach(stream => {
            const card = createChannelCard(stream);
            fragment.appendChild(card);
            observer.observe(card);
        });
        el.channelList.appendChild(fragment);

        const firstCard = el.channelList.querySelector('.channel-card');
        if (firstCard) firstCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // --- ESCUTAS DE EVENTOS (INTERAÇÃO) ---
    el.categoryList.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-btn');
        if (!btn) return;

        $all('.category-btn').forEach(b => {
            b.classList.remove('bg-white/10', 'text-white', 'border', 'border-white/20');
            b.classList.add('opacity-60', 'hover:opacity-100');
        });
        btn.classList.add('bg-white/10', 'text-white', 'border', 'border-white/20');
        btn.classList.remove('opacity-60', 'hover:opacity-100');

        filterAndRenderStreams(btn.getAttribute('data-category'));
    });

    el.channelList.addEventListener('click', (e) => {
        const card = e.target.closest('.channel-card');
        if (!card || !card._mediaData) return;

        if (card.classList.contains('active')) {
            if (card._mediaData.videoSrc) {
                window.location.href = `./video-player.html?url=${encodeURIComponent(card._mediaData.videoSrc)}&name=${encodeURIComponent(card._mediaData.name)}`;
            } else {
                alert("Este conteúdo não possui link de reprodução válido.");
            }
        } else {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });

    // --- CARGA DOS DADOS (CACHE FIRST) ---
    async function loadContent() {
        try {
            let rawStreams = null;
            let rawCategories = null;

            // 1. Tenta buscar dados unificados do cache local do IndexedDB primeiro
            try {
                rawStreams = await iptvCacheDB.get(firstParam);
                rawCategories = await iptvCacheDB.get(`${firstParam}_categories`);
            } catch (dbErr) {
                console.warn("Erro ao ler IndexedDB:", dbErr);
            }

            // 2. Se falhar o cache, busca os arquivos JSON correspondentes via Rede/Local
            if (!rawStreams || !rawCategories) {
                console.log(`[Cache Miss] Buscando dados remotos para: ${firstParam}`);

                // Faz as duas requisições em paralelo para carregar muito mais rápido
                const [streamRes, catRes] = await Promise.all([
                    fetch(currentConfig.streamFile),
                    fetch(currentConfig.catFile)
                ]);

                rawStreams = await streamRes.json();
                rawCategories = await catRes.json();

                // Nota: Aqui você poderia salvar rawStreams e rawCategories de volta no IndexedDB se desejar.
            }

            // 3. Converte a lista de categorias em um objeto de busca rápida (Map)
            categoryMap = {};
            rawCategories.forEach(cat => {
                if (cat.category_id && cat.category_name) {
                    categoryMap[cat.category_id] = cat.category_name;
                }
            });

            // 4. Processa e normaliza os streams cruzando com as categorias recém-mapeadas
            allStreams = rawStreams.map(item => mapStreamItem(item, firstParam));

            // 5. Renderiza tudo na tela
            renderCategories(allStreams);
            filterAndRenderStreams("Todas");

        } catch (err) {
            console.error("Erro fundamental ao carregar conteúdo:", err);
            el.channelList.innerHTML = `<p class="text-center text-red-500 py-10 w-full">Erro ao carregar canais: ${err.message || err}</p>`;
        }
    }

    await loadContent();
});