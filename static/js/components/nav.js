export function setupNavToggle(navbarToggler, navbarCollapse) {
    if (!navbarToggler || !navbarCollapse) return;

    navbarToggler.addEventListener('click', function() {
        const nextState = !navbarCollapse.classList.contains('show');
        navbarCollapse.classList.toggle('show', nextState);
        navbarToggler.setAttribute('aria-expanded', String(nextState));
    });

    navbarCollapse.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            navbarCollapse.classList.remove('show');
            navbarToggler.setAttribute('aria-expanded', 'false');
        });
    });
}
