if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register(
                './sw.js'
            );

            console.log(
                '[PWA] Service Worker registrado:',
                registration.scope
            );
        } catch (error) {
            console.error(
                '[PWA] Falha ao registrar Service Worker:',
                error
            );
        }
    });
}