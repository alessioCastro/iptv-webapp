import { formatMinutes } from '../utils/helpers.js';
import { iptvSession } from '../services/auth.js';

const DEFAULT_SERVER = 'https://iptvmais.one';

export function createChannelCard(stream) {
    const button = document.createElement('button');
    button.className = 'channel-card';

    const session = iptvSession.data;

    if (!session) {
        throw new Error('Sessão IPTV não encontrada.');
    }

    const server = String(session.server || DEFAULT_SERVER)
        .trim()
        .replace(/\/+$/, '');

    const videoExt = stream.type === 'live' ? 'm3u8' : 'mp4';

    const videoSrc =
        `${server}/${stream.type}/` +
        `${encodeURIComponent(session.username)}/` +
        `${encodeURIComponent(session.password)}/` +
        `${encodeURIComponent(stream.id)}.${videoExt}`;

    button._mediaData = {
        posterUrl: stream.posterUrl,
        bgUrl: stream.bannerUrl,
        name: stream.name,
        channelDesc: stream.description,
        duration: stream.duration,
        videoSrc
    };

    const tagsHTML = stream.categories
        .map(category => `<span class="bg-gray-200">${category}</span>`)
        .join('');

    button.innerHTML = `
        <img
            class="content-cover"
            src="${stream.posterUrl}"
            loading="lazy"
            alt="${stream.name}"
        >
        <div class="flex flex-col items-start">
            <p class="movie-title text-[18px] font-bold text-start">
                ${stream.name}
            </p>
            <p class="text-[12px] text-gray-500">
                ${formatMinutes(stream.duration)}
            </p>
            <div class="tags">${tagsHTML}</div>
        </div>
        <div class="selector bg-white"></div>
    `;

    return button;
}