import { iptvCacheDB } from './cache.js';

const IPTV_CONFIG = {
    domain: "iptvmais.one",
    paths: {
        extinf: "get.php",
        api: "player_api.php"
    }
};

export function buildIptvEndpoint(path, params = {}) {
    const searchParams = new URLSearchParams(params);
    return `https://${IPTV_CONFIG.domain}/${IPTV_CONFIG.paths[path]}?${searchParams.toString()}`;
}

export const iptvSession = {
    get data() {
        return JSON.parse(localStorage.getItem('iptv_session'));
    },
    set data(value) {
        localStorage.setItem('iptv_session', JSON.stringify(value));
    },
    clear() {
        localStorage.removeItem('iptv_session');
    },
    isLoggedIn() {
        return !!this.data;
    }
};

export async function login(username, password) {
    const action = 'get_account_info';
    const endpoint = buildIptvEndpoint('api', { username, password, action });

    try {
        const response = await fetch(endpoint);
        if (!response.ok) return { success: false, error: "Credenciais inválidas." };

        const data = await response.json();
        if (data.user_info && data.user_info.auth === 0) {
            return { success: false, error: "Usuário ou senha inválidos no servidor IPTV." };
        }

        iptvSession.data = { username, password };
        return { success: true };
    } catch (error) {
        return { success: false, error: "Erro na conexão com o servidor de IPTV." };
    }
}

export async function logout() {
    iptvSession.clear();
    try {
        await iptvCacheDB.clearAll();
    } catch (e) {
        console.error("Erro ao limpar IndexedDB no logout", e);
    }
    location.reload();
}
