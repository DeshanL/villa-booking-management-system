const { ipcRenderer } = require('electron');

const tableEl = document.getElementById('userTable');
const searchInput = document.getElementById('searchInput');
const noResultsEl = document.getElementById('noResults');

// Listen for typing
searchInput.addEventListener('keyup', (e) => {
    const query = e.target.value;
    doSearch(query);
});

loadData();

async function loadData() {
    const products = await ipcRenderer.invoke('get-products');
    renderTable(products);
}

async function doSearch(query) {
    if (!query || query.trim() === '') {
        loadData();
        return;
    }
    const results = await ipcRenderer.invoke('search-products', query);
    renderTable(results);
}

function renderTable(products) {
    tableEl.innerHTML = '';

    if (products.length === 0) {
        noResultsEl.style.display = 'block';
    } else {
        noResultsEl.style.display = 'none';
    }

    products.forEach(p => {
        // Logic for Badges
        const isLow = p.quantity < 5;
        const badgeClass = isLow ? 'status-low' : 'status-ok';
        const badgeText = isLow ? 'LOW STOCK' : 'IN STOCK';

        const row = `
            <tr>
                <td><strong>${p.name}</strong></td>
                <td>${p.barcode || '-'}</td>
                <td>${p.category || 'Uncategorized'}</td>
                <td>$${parseFloat(p.price).toFixed(2)}</td>
                <td>${p.quantity}</td>
                <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
            </tr>
        `;
        tableEl.innerHTML += row;
    });
}