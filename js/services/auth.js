import { iptvCacheDB } from './cache.js';

const DEFAULT_SERVER = 'https://iptvmais.one';

const IPTV_CONFIG = {
    paths: {
        extinf: 'get.php',
        api: 'player_api'
    }
};

function normalizeServer(server) {
    const value = String(server || DEFAULT_SERVER).trim();
    const url = new URL(value);

    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('O servidor precisa usar HTTP ou HTTPS.');
    }

    if (url.username || url.password || url.search || url.hash) {
        throw new Error('Informe somente o endereço do servidor, sem credenciais ou parâmetros.');
    }

    return url.href.replace(/\/+$/, '');
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

export function buildIptvEndpoint(path, params = {}) {
    const session = iptvSession.data;
    const server = normalizeServer(session?.server || DEFAULT_SERVER);
    const endpointPath = IPTV_CONFIG.paths[path];

    if (!endpointPath) {
        throw new Error(`Caminho de API desconhecido: ${path}`);
    }

    const searchParams = new URLSearchParams(params);

    return `${server}/${endpointPath}?${searchParams.toString()}`;
}

export async function login(server, username, password) {
    let normalizedServer;

    try {
        normalizedServer = normalizeServer(server);
    } catch (error) {
        return {
            success: false,
            error: error.message || 'Endereço do servidor inválido.'
        };
    }

    const endpointPath = `${normalizedServer}/${IPTV_CONFIG.paths.api}`;
    const params = new URLSearchParams({
        username,
        password,
        action: 'get_account_info'
    });

    try {
        const response = await fetch(`${endpointPath}?${params.toString()}`);

        if (!response.ok) {
            return {
                success: false,
                error: `Falha ao conectar ao servidor: HTTP ${response.status}.`
            };
        }

        const data = await response.json();

        if (
            data.user_info &&
            Number(data.user_info.auth) === 0
        ) {
            return {
                success: false,
                error: 'Usuário ou senha inválidos no servidor IPTV.'
            };
        }

        if (!data.user_info) {
            return {
                success: false,
                error: 'Resposta inesperada do servidor IPTV. Verifique o endereço.'
            };
        }

        // Evita mostrar conteúdo em cache de outro servidor.
        const previousSession = iptvSession.data;

        if (
            previousSession?.server &&
            previousSession.server !== normalizedServer
        ) {
            await iptvCacheDB.clearAll();
        }

        iptvSession.data = {
            server: normalizedServer,
            username,
            password
        };

        return { success: true };
    } catch (error) {
        console.error('Erro no login IPTV:', error);

        return {
            success: false,
            error: 'Não foi possível conectar. Verifique o endereço, a conexão e se o servidor permite requisições do navegador.'
        };
    }
}

export async function logout() {
    iptvSession.clear();

    try {
        await iptvCacheDB.clearAll();
    } catch (error) {
        console.error('Erro ao limpar IndexedDB no logout:', error);
    }

    location.reload();
}