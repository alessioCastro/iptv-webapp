import { formatMinutes } from '../utils/helpers.js';

const domain = "iptvmais.live";
const iptvSession = JSON.parse(localStorage.getItem('iptv_session'));

export function createChannelCard(stream) {
    const button = document.createElement('button');
    button.className = 'channel-card';

    const videoExt = stream.type === 'live' ? 'm3u8' : 'mp4';
    // https://[DOMÍNIO]/[TIPO]/[USER]/[PASS]/[ID].[FORMATO]
    const videoSrc = `https://${domain}/${stream.type}/${iptvSession.username}/${iptvSession.password}/${stream.id}.${videoExt}`;

    // Anexa os metadados diretamente no elemento para o IntersectionObserver ler depois
    button._mediaData = {
        posterUrl: stream.posterUrl,
        bgUrl: stream.bannerUrl,
        name: stream.name,
        channelDesc: stream.description,
        duration: stream.duration,
        videoSrc: videoSrc
    };

    const tagsHTML = stream.categories
        .map(c => `<span class="bg-gray-200">${c}</span>`)
        .join('');

    button.innerHTML = `
        <img class="content-cover" src="${stream.posterUrl}" loading="lazy" alt="${stream.name}">
        <div class="flex flex-col items-start">
            <p class="movie-title text-[18px] font-bold text-start">${stream.name}</p>
            <p class="text-[12px] text-gray-500">${formatMinutes(stream.duration)}</p>
            <div class="tags">${tagsHTML}</div>
        </div>
        <div class="selector bg-white"></div>
    `;

    return button;
}