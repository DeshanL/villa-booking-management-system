const { ipcRenderer } = require('electron');

// 1. Grab all elements carefully
const nameEl = document.getElementById('pName');
const barEl = document.getElementById('pBarcode');
const categoryEl = document.getElementById('pCategory');
const priceEl = document.getElementById('pPrice');
const qtyEl = document.getElementById('pQty');
const saveBtn = document.getElementById('saveBtn');
const tableEl = document.getElementById('adminTable');

// Edit modal elements
const editModal = document.getElementById('editModal');
const editId = document.getElementById('editId');
const editName = document.getElementById('editName');
const editBarcode = document.getElementById('editBarcode');
const editCategory = document.getElementById('editCategory');
const editPrice = document.getElementById('editPrice');
const editQty = document.getElementById('editQty');
const updateBtn = document.getElementById('updateBtn');
const cancelBtn = document.getElementById('cancelBtn');
const closeBtn = document.querySelector('.close');

// 2. Add Event Listeners
if (saveBtn) {
    saveBtn.addEventListener('click', addNewProduct);
} else {
    console.error("CRITICAL ERROR: Save button not found!");
}

// Modal event listeners
closeBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);
updateBtn.addEventListener('click', updateProduct);

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    if (event.target === editModal) {
        closeModal();
    }
});

// Load data immediately
loadData();

async function loadData() {
    try {
        const products = await ipcRenderer.invoke('get-products');
        renderTable(products);
    } catch (err) {
        console.error("Failed to load products:", err);
    }
}

async function addNewProduct() {
    console.log("Button Clicked! Gathering data...");

    // Create the product object with category
    const product = {
        name: nameEl.value,
        barcode: barEl.value,
        category: categoryEl.value || 'Uncategorized',
        price: priceEl.value,
        quantity: qtyEl.value
    };

    console.log("Sending to backend:", product);

    // Validation
    if (!product.name || !product.price) {
        alert("Please fill in Name and Price");
        return;
    }

    // Send to Main Process
    const result = await ipcRenderer.invoke('add-product', product);

    if (result.success) {
        alert("Product Saved!");
        loadData(); // Refresh table
        // Clear inputs
        nameEl.value = '';
        barEl.value = '';
        categoryEl.value = '';
        priceEl.value = '';
        qtyEl.value = '';
    } else {
        alert("Error: " + result.error);
    }
}

// Open edit modal with product data
window.editItem = async (id, name, barcode, category, price, quantity) => {
    editId.value = id;
    editName.value = name;
    editBarcode.value = barcode || '';
    editCategory.value = category || 'Uncategorized';
    editPrice.value = price;
    editQty.value = quantity;
    
    editModal.style.display = 'block';
};

// Close modal
function closeModal() {
    editModal.style.display = 'none';
}

// Update product
async function updateProduct() {
    const product = {
        id: editId.value,
        name: editName.value,
        barcode: editBarcode.value,
        category: editCategory.value || 'Uncategorized',
        price: editPrice.value,
        quantity: editQty.value
    };

    // Validation
    if (!product.name || !product.price) {
        alert("Please fill in Name and Price");
        return;
    }

    try {
        // We'll need to create a new IPC handler for update
        const result = await ipcRenderer.invoke('update-product', product);
        
        if (result.success) {
            alert("Product Updated!");
            closeModal();
            loadData(); // Refresh table
        } else {
            alert("Error: " + result.error);
        }
    } catch (err) {
        console.error("Update error:", err);
        alert("Failed to update product");
    }
}

window.deleteItem = async (id) => {
    if (confirm("Delete this item permanently?")) {
        const updated = await ipcRenderer.invoke('delete-product', id.toString());
        renderTable(updated);
    }
};

function renderTable(data) {
    if (!data) return;
    tableEl.innerHTML = data.map(p => `
        <tr>
            <td>${p.name}</td>
            <td>${p.barcode || '-'}</td>
            <td>${p.category || 'Uncategorized'}</td>
            <td>$${p.price}</td>
            <td>${p.quantity}</td>
            <td>
                <div class="action-buttons">
                    <button class="edit-btn" onclick="editItem('${p.id}', '${p.name.replace(/'/g, "\\'")}', '${p.barcode || ''}', '${p.category || ''}', '${p.price}', '${p.quantity}')">Edit</button>
                    <button class="delete-btn" onclick="deleteItem('${p.id}')">Remove</button>
                </div>
            </td>
        </tr>
    `).join('');
}