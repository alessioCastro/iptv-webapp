import { $ } from './helpers.js';

const formatter = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function initClock() {
    const clockEl = $('clock');
    if (!clockEl) return;

    function updateClock() {
        const now = new Date();
        clockEl.textContent = formatter.format(now);
        setTimeout(updateClock, (60 - now.getSeconds()) * 1000 - now.getMilliseconds() + 100);
    }

    updateClock();
}