import { $, showModal, addModalListener } from './utils/helpers.js';
import { initClock } from './utils/date.js';
import { iptvSession, login, logout } from './services/auth.js';
import { iptvCacheDB } from './services/cache.js';

document.addEventListener('DOMContentLoaded', () => {
    let estaCarregando = false;

    // Elementos da Interface mapeados
    const UI = {
        profileBar: $('profile-bar'),
        loginContainer: $('login-container'),
        loggedInContainer: $('logged-in-container'),
        logoutBtn: $('logout-btn'),
        loginForm: $('loginForm')
    };

    function updateInterface() {
        if (iptvSession.isLoggedIn()) {
            UI.profileBar?.classList.remove('hidden');
            UI.loginContainer?.classList.add('hidden');
            UI.loggedInContainer?.classList.remove('hidden');
        } else {
            UI.profileBar?.classList.add('hidden');
            UI.loginContainer?.classList.remove('hidden');
            UI.loggedInContainer?.classList.add('hidden');
        }
    }

    async function obterDadosConteudo(type) {
        // 1. Tenta recuperar do cache local do IndexedDB
        const cachedData = await iptvCacheDB.get(type);
        if (cachedData) {
            console.log(`[Cache Hit] Carregando ${type} do IndexedDB local.`);
            return cachedData;
        }

        // 2. Fallback de Rede se o cache não existir ou passar de 24h
        console.log(`[Cache Miss/Expired] Buscando dados de ${type} via rede.`);
        const session = iptvSession.data;
        if (!session) throw new Error("Sessão não encontrada. Faça login novamente.");

        const actionMap = { live: 'get_live_streams', vod: 'get_vod_streams', series: 'get_series' };
        const endpoint = `${actionMap[type]}.json`;

        const response = await fetch(endpoint);
        if (!response.ok) throw new Error("Falha ao buscar dados do servidor de IPTV.");

        const data = await response.json();

        // 3. Salva no banco assincronamente
        await iptvCacheDB.set(type, data);
        data.fromNetwork = true;
        return data;
    }

    function setupMainAppListeners() {
        updateInterface();

        if (UI.logoutBtn) {
            UI.logoutBtn.onclick = logout;
        }

        // Delegação de eventos inteligente para os Cards de seleção de tipo (Live, VOD, Séries)
        document.addEventListener('click', async (event) => {
            const card = event.target.closest('.card');
            if (!card) return;

            event.preventDefault();
            if (estaCarregando) return;

            const targetUrl = card.href;
            const type = targetUrl.split('?')[1]; // Captura 'live', 'vod' ou 'series'

            try {
                estaCarregando = true;
                card.style.opacity = '0.5';

                // Pré-carrega ou valida os dados antes de mudar de página
                await obterDadosConteudo(type);

                // Redireciona com segurança
                location.href = targetUrl;

            } catch (error) {
                showModal(error.message || "Ocorreu um erro ao processar os dados.");
            } finally {
                estaCarregando = false;
                card.style.opacity = '1';
            }
        });
    }

    // --- EXECUÇÃO INICIAL ---
    if (iptvSession.isLoggedIn()) {
        setupMainAppListeners();
    } else {
        updateInterface();
        if (UI.loginForm) {
            UI.loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = $('username').value;
                const password = $('password').value;

                const response = await login(username, password);
                if (response.success) {
                    setupMainAppListeners();
                } else {
                    showModal(response.error);
                }
            });
        }
    }

    // Inicializadores globais
    addModalListener();
    initClock();
});