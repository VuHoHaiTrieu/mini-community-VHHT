const sidebar = document.querySelector('.admin-sidebar-container');
const topbar = document.querySelector('.admin-main-topbar');

if (sidebar && topbar) {
    let toggle = document.querySelector('.admin-mobile-menu-button');
    if (!toggle) {
        toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'admin-mobile-menu-button';
        toggle.setAttribute('aria-label', 'Mở menu quản trị');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
        topbar.prepend(toggle);
    }

    const closeSidebar = document.createElement('button');
    closeSidebar.type = 'button';
    closeSidebar.className = 'admin-sidebar-close-button';
    closeSidebar.setAttribute('aria-label', 'Đóng menu quản trị');
    closeSidebar.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';
    sidebar.prepend(closeSidebar);

    const overlay = document.createElement('button');
    overlay.type = 'button';
    overlay.className = 'admin-sidebar-overlay';
    overlay.setAttribute('aria-label', 'Đóng menu quản trị');
    document.body.appendChild(overlay);

    const setOpen = open => {
        document.body.classList.toggle('admin-menu-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Đóng menu quản trị' : 'Mở menu quản trị');
        toggle.innerHTML = `<i class="fa-solid ${open ? 'fa-xmark' : 'fa-bars'}" aria-hidden="true"></i>`;
    };

    toggle.addEventListener('click', () => setOpen(!document.body.classList.contains('admin-menu-open')));
    closeSidebar.addEventListener('click', () => setOpen(false));
    overlay.addEventListener('click', () => setOpen(false));
    sidebar.addEventListener('click', event => {
        if (event.target.closest('a, .admin-navigation-button, .admin-logout-button') && innerWidth <= 760) setOpen(false);
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') setOpen(false); });
    addEventListener('resize', () => { if (innerWidth > 760) setOpen(false); }, { passive: true });
}

const labelIconButtons = root => {
    root.querySelectorAll?.('button:not([aria-label])').forEach(button => {
        if (!button.textContent.trim() && button.title) button.setAttribute('aria-label', button.title);
    });
};
const enhanceAdminTables = root => {
    root.querySelectorAll?.('.admin-table').forEach(table => {
        const labels=[...table.querySelectorAll('thead th')].map(cell=>cell.textContent.trim());
        table.querySelectorAll('tbody tr').forEach(row=>[...row.children].forEach((cell,index)=>cell.dataset.label=labels[index]||'Thông tin'));
    });
};
labelIconButtons(document);
enhanceAdminTables(document);
new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
        labelIconButtons(node);
        const owningTable=node.matches?.('.admin-table') ? node : node.closest?.('.admin-table');
        if (owningTable) enhanceAdminTables(owningTable.parentElement);
        else enhanceAdminTables(node);
    }
}))).observe(document.body, { childList: true, subtree: true });
