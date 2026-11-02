import { $, showModal, addModalListener } from './utils/helpers.js';
import { initClock } from './utils/date.js';
import { iptvSession, buildIptvEndpoint, login, logout } from './services/auth.js';
import { iptvCacheDB } from './services/cache.js';

document.addEventListener('DOMContentLoaded', () => {
    let estaCarregando = false;

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
        const cachedData = await iptvCacheDB.get(type);

        if (cachedData) {
            console.log(`[Cache Hit] Carregando ${type} do IndexedDB local.`);
            return cachedData;
        }

        console.log(`[Cache Miss/Expired] Buscando dados de ${type} via rede.`);

        const session = iptvSession.data;

        if (!session) {
            throw new Error('Sessão não encontrada. Faça login novamente.');
        }

        const actionMap = {
            live: 'get_live_streams',
            vod: 'get_vod_streams',
            series: 'get_series'
        };

        const action = actionMap[type];

        if (!action) {
            throw new Error('Tipo de conteúdo inválido.');
        }

        const endpoint = buildIptvEndpoint('api', {
            username: session.username,
            password: session.password,
            action
        });

        const response = await fetch(endpoint);

        if (!response.ok) {
            throw new Error(
                `Falha ao buscar dados do servidor IPTV: HTTP ${response.status}`
            );
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error('Resposta inválida do servidor IPTV.');
        }

        await iptvCacheDB.set(type, data);

        return data;
    }

    function setupMainAppListeners() {
        updateInterface();

        if (UI.logoutBtn) {
            UI.logoutBtn.onclick = logout;
        }

        document.addEventListener('click', async (event) => {
            const card = event.target.closest('.card');

            if (!card) return;

            event.preventDefault();

            if (estaCarregando) return;

            const targetUrl = card.href;
            const type = targetUrl.split('?')[1];

            try {
                estaCarregando = true;
                card.style.opacity = '0.5';

                await obterDadosConteudo(type);

                location.href = targetUrl;
            } catch (error) {
                showModal(error.message || 'Ocorreu um erro ao processar os dados.');
            } finally {
                estaCarregando = false;
                card.style.opacity = '1';
            }
        });
    }

    if (iptvSession.isLoggedIn()) {
        setupMainAppListeners();
    } else {
        updateInterface();

        if (UI.loginForm) {
            UI.loginForm.addEventListener('submit', async (event) => {
                event.preventDefault();

                const server = $('server').value.trim();
                const username = $('username').value.trim();
                const password = $('password').value;

                const submitButton = UI.loginForm.querySelector(
                    'button[type="submit"]'
                );

                if (submitButton) {
                    submitButton.disabled = true;
                    submitButton.textContent = 'Conectando...';
                }

                try {
                    const response = await login(server, username, password);

                    if (response.success) {
                        setupMainAppListeners();
                    } else {
                        showModal(response.error);
                    }
                } catch (error) {
                    showModal(error.message || 'Erro ao realizar login.');
                } finally {
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.textContent = 'Login';
                    }
                }
            });
        }
    }

    addModalListener();
    initClock();
});