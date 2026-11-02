import { $, $all, formatMinutes } from './utils/helpers.js';
import { initClock } from './utils/date.js';
import { iptvCacheDB } from './services/cache.js';
import { buildIptvEndpoint, iptvSession } from './services/auth.js';
import { createChannelCard } from './components/channelCard.js';

document.addEventListener('DOMContentLoaded', async () => {
    // --- ESTADO GLOBAL DO MÓDULO ---
    let allStreams = [];
    let categoryMap = {};

    // Paginação da renderização no frontend.
    // Isso não limita a quantidade de dados recebidos da API.
    const BATCH_SIZE = 30;
    let filteredStreams = [];
    let renderedCount = 0;
    let paginationSentinel = null;

    const paramsMap = {
        live: {
            en: 'Live Channels',
            'pt-br': 'Canais ao vivo',
            streamsAction: 'get_live_streams',
            categoriesAction: 'get_live_categories'
        },
        vod: {
            en: 'Movies',
            'pt-br': 'Filmes',
            streamsAction: 'get_vod_streams',
            categoriesAction: 'get_vod_categories'
        },
        series: {
            en: 'Series',
            'pt-br': 'Séries',
            streamsAction: 'get_series',
            categoriesAction: 'get_series_categories'
        }
    };

    const urlParams = new URLSearchParams(location.search);
    const firstParam = urlParams.keys().next().value;
    const language = document.documentElement.lang || 'pt-br';

    // --- ELEMENTOS DO DOM ---
    const el = {
        bgImg: $('background-image'),
        movieName: $('movie-name'),
        movieDesc: $('movie-desc'),
        endTime: $('end-time'),
        container: document.querySelector('.tv-container'),
        categoryList: $('category-list'),
        channelList: $('channel-list')
    };

    // --- PROTEÇÃO DE ROTA ---
    const session = JSON.parse(localStorage.getItem('iptv_session'));

    if (!session || !firstParam || !paramsMap[firstParam]) {
        location.href = './index.html';
        return;
    }

    const currentConfig = paramsMap[firstParam];

    const pageTitle = currentConfig[language] || currentConfig.en;
    $('content-name').textContent = pageTitle;

    initClock();

    // --- OBSERVER DO CARD ATIVO ---
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;

            const card = entry.target;
            const mediaData = card._mediaData;

            requestAnimationFrame(() => {
                $all('.channel-card.active').forEach(c => {
                    c.classList.remove('active');
                });

                card.classList.add('active');

                el.bgImg.src = mediaData.bgUrl;
                el.movieName.textContent = mediaData.name;
                el.movieDesc.textContent = mediaData.channelDesc;
                el.endTime.textContent = formatMinutes(mediaData.duration);
            });
        });
    }, {
        root: el.container,
        threshold: 0.01,
        rootMargin: '-30% 0px -65% 0px'
    });

    // --- OBSERVER DA PAGINAÇÃO ---
    // Carrega o próximo lote quando o marcador se aproxima da área visível.
    const paginationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                renderNextBatch();
            }
        });
    }, {
        root: el.container,
        rootMargin: '400px 0px',
        threshold: 0
    });

    // --- MAPEADOR DE DADOS ---
    function mapStreamItem(item, type) {
        const name = item.name || item.title || 'Sem nome';

        const rawIcon = item.stream_icon || item.cover || '';

        const posterUrl = rawIcon !== ''
            ? rawIcon
            : 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?q=80&w=2670&auto=format&fit=crop';

        const hasBackdrop =
            Array.isArray(item.backdrop_path) &&
            item.backdrop_path.length > 0;

        const bannerUrl = hasBackdrop
            ? item.backdrop_path[0]
            : posterUrl;

        const description =
            item.plot ||
            item.description ||
            'Sem descrição disponível.';

        const categories = [];

        if (item.category_id && categoryMap[item.category_id]) {
            categories.push(categoryMap[item.category_id]);
        }

        if (Array.isArray(item.category_ids)) {
            item.category_ids.forEach(id => {
                if (
                    categoryMap[id] &&
                    !categories.includes(categoryMap[id])
                ) {
                    categories.push(categoryMap[id]);
                }
            });
        }

        if (categories.length === 0) {
            categories.push(
                type === 'live'
                    ? 'TV Ao Vivo'
                    : type === 'vod'
                        ? 'Filmes'
                        : 'Séries'
            );
        }

        let duration = type === 'live' ? 0 : 120;
        const rawDuration = item.duration || item.episode_run_time;

        if (rawDuration) {
            if (
                typeof rawDuration === 'string' &&
                rawDuration.includes(':')
            ) {
                const parts = rawDuration.split(':');

                duration =
                    (parseInt(parts[0], 10) || 0) * 60 +
                    (parseInt(parts[1], 10) || 0);
            } else {
                duration = parseInt(rawDuration, 10) || 120;
            }
        }

        const videoSrc = item.videoSrc || item.url || '';

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

    // --- RENDERIZAÇÃO DAS CATEGORIAS ---
    function renderCategories(streams) {
        const allCategories = new Set(['Todas']);

        streams.forEach(stream => {
            stream.categories.forEach(category => {
                if (category) {
                    allCategories.add(category);
                }
            });
        });

        el.categoryList.innerHTML = '';

        const fragment = document.createDocumentFragment();

        allCategories.forEach(category => {
            const li = document.createElement('li');
            const isTodas = category === 'Todas';

            li.innerHTML = `
                <button
                    class="category-btn p-2 lg:p-3 rounded-xl lg:rounded-2xl transition shrink-0 w-fit cursor-pointer
                    ${isTodas
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'opacity-60 hover:opacity-100'}"
                    data-category="${category}">
                    ${category}
                </button>
            `;

            fragment.appendChild(li);
        });

        el.categoryList.appendChild(fragment);
    }

    // --- CRIAÇÃO DE UM LOTE DE CARDS ---
    function renderNextBatch() {
        if (renderedCount >= filteredStreams.length) {
            if (paginationSentinel) {
                paginationObserver.unobserve(paginationSentinel);
                paginationSentinel.remove();
                paginationSentinel = null;
            }

            return;
        }

        // Retira o marcador antigo antes de adicionar o novo lote.
        if (paginationSentinel) {
            paginationObserver.unobserve(paginationSentinel);
            paginationSentinel.remove();
            paginationSentinel = null;
        }

        const end = Math.min(
            renderedCount + BATCH_SIZE,
            filteredStreams.length
        );

        const fragment = document.createDocumentFragment();

        for (let i = renderedCount; i < end; i++) {
            const stream = filteredStreams[i];
            const card = createChannelCard(stream);

            fragment.appendChild(card);
            observer.observe(card);
        }

        el.channelList.appendChild(fragment);
        renderedCount = end;

        // Adiciona um marcador para detectar quando carregar o próximo lote.
        if (renderedCount < filteredStreams.length) {
            paginationSentinel = document.createElement('p');

            paginationSentinel.className =
                'pagination-sentinel text-center text-gray-500 py-4 w-full';

            paginationSentinel.textContent =
                `Exibindo ${renderedCount} de ${filteredStreams.length} conteúdos`;

            el.channelList.appendChild(paginationSentinel);
            paginationObserver.observe(paginationSentinel);
        }
    }

    // --- FILTRO E PAGINAÇÃO ---
    function filterAndRenderStreams(category) {
        observer.disconnect();
        paginationObserver.disconnect();

        if (paginationSentinel) {
            paginationSentinel.remove();
            paginationSentinel = null;
        }

        filteredStreams = category === 'Todas'
            ? allStreams
            : allStreams.filter(stream =>
                stream.categories.includes(category)
            );

        renderedCount = 0;
        el.channelList.innerHTML = '';

        if (filteredStreams.length === 0) {
            el.channelList.innerHTML = `
                <p class="text-center text-gray-500 py-10 w-full">
                    Nenhum conteúdo encontrado.
                </p>
            `;

            return;
        }

        // Em vez de renderizar todo o catálogo, começa com apenas um lote.
        renderNextBatch();

        const firstCard = el.channelList.querySelector('.channel-card');

        if (firstCard) {
            firstCard.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }

    // --- CLIQUE NAS CATEGORIAS ---
    el.categoryList.addEventListener('click', (event) => {
        const btn = event.target.closest('.category-btn');

        if (!btn) return;

        $all('.category-btn').forEach(button => {
            button.classList.remove(
                'bg-white/10',
                'text-white',
                'border',
                'border-white/20'
            );

            button.classList.add(
                'opacity-60',
                'hover:opacity-100'
            );
        });

        btn.classList.add(
            'bg-white/10',
            'text-white',
            'border',
            'border-white/20'
        );

        btn.classList.remove(
            'opacity-60',
            'hover:opacity-100'
        );

        filterAndRenderStreams(
            btn.getAttribute('data-category')
        );
    });

    // --- CLIQUE NOS CARDS ---
    el.channelList.addEventListener('click', (event) => {
        const card = event.target.closest('.channel-card');

        if (!card || !card._mediaData) return;

        if (card.classList.contains('active')) {
            if (card._mediaData.videoSrc) {
                window.location.href =
                    `./video-player.html?url=${encodeURIComponent(card._mediaData.videoSrc)}` +
                    `&name=${encodeURIComponent(card._mediaData.name)}`;
            } else {
                alert('Este conteúdo não possui link de reprodução válido.');
            }
        } else {
            card.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    });

    // --- CARGA DOS DADOS (CACHE FIRST) ---
    async function loadContent() {
        try {
            const session = iptvSession.data;

            if (!session) {
                throw new Error('Sessão não encontrada.');
            }

            const streamCacheKey = firstParam;
            const categoryCacheKey = `${firstParam}_categories`;

            let [rawStreams, rawCategories] = await Promise.all([
                iptvCacheDB.get(streamCacheKey),
                iptvCacheDB.get(categoryCacheKey)
            ]);

            const requests = [];

            // Conteúdo
            if (!rawStreams) {
                const url = buildIptvEndpoint('api', {
                    username: session.username,
                    password: session.password,
                    action: currentConfig.streamsAction
                });

                requests.push(
                    fetch(url)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(
                                    `Falha ao buscar conteúdo: HTTP ${response.status}`
                                );
                            }

                            return response.json();
                        })
                        .then(async data => {
                            if (!Array.isArray(data)) {
                                throw new Error(
                                    'Resposta inválida ao carregar conteúdo.'
                                );
                            }

                            await iptvCacheDB.set(streamCacheKey, data);
                            rawStreams = data;
                        })
                );
            }

            // Categorias
            if (!rawCategories) {
                const url = buildIptvEndpoint('api', {
                    username: session.username,
                    password: session.password,
                    action: currentConfig.categoriesAction
                });

                requests.push(
                    fetch(url)
                        .then(response => {
                            if (!response.ok) {
                                throw new Error(
                                    `Falha ao buscar categorias: HTTP ${response.status}`
                                );
                            }

                            return response.json();
                        })
                        .then(async data => {
                            if (!Array.isArray(data)) {
                                throw new Error(
                                    'Resposta inválida ao carregar categorias.'
                                );
                            }

                            await iptvCacheDB.set(categoryCacheKey, data);
                            rawCategories = data;
                        })
                );
            }

            await Promise.all(requests);

            // Mapa de IDs para nomes das categorias
            categoryMap = {};

            rawCategories.forEach(category => {
                if (
                    category.category_id != null &&
                    category.category_name
                ) {
                    categoryMap[category.category_id] =
                        category.category_name;
                }
            });

            // Observação: a resposta inteira ainda é normalizada aqui.
            // A paginação reduz os cards no DOM, não o tamanho da resposta da API.
            allStreams = rawStreams.map(item =>
                mapStreamItem(item, firstParam)
            );

            renderCategories(allStreams);
            filterAndRenderStreams('Todas');

        } catch (err) {
            console.error('Erro ao carregar conteúdo:', err);

            el.channelList.innerHTML = `
                <p class="text-center text-red-500 py-10 w-full">
                    Erro ao carregar conteúdo: ${err.message || err}
                </p>
            `;
        }
    }

    await loadContent();
});