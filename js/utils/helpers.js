export const $ = (id) => document.getElementById(id);
export const $all = (sel) => document.querySelectorAll(sel);

export const formatMinutes = (totalMin) => {
    const h = Math.floor(totalMin / 60).toString().padStart(2, '0');
    const m = (totalMin % 60).toString().padStart(2, '0');
    return `${h}:${m}:00`;
};

export function showModal(message) {
    const modal = $('modal');
    const modalText = $('modal-text');
    if (!modal || !modalText) return;

    modalText.innerText = message;
    modal.showModal();
}

export function addModalListener() {
    const modal = $('modal');
    if (!modal) return;
    modal.addEventListener('click', (event) => {
        if (event.target === modal) modal.close();
    });
}