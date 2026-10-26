const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./database/database'); // FIXED: Correct relative path

let win; // Keep a global reference

function createWindow() {
    win = new BrowserWindow({
        width: 400, // Small window for login
        height: 600,
        resizable: false, // Optional: prevent resizing on login
        autoHideMenuBar: true,
        backgroundColor: '#f4f7f6', // Match login background to prevent white flash
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // Load Login Page by default
    win.loadFile('src/auth/login.html');

    // --- COMPREHENSIVE INPUT FOCUS FIX ---
    // Fixes persistent issue where input fields randomly stop working

    // Aggressive focus restoration on blur/focus


    win.on('focus', () => {
        if (win && !win.isDestroyed()) {
            win.webContents.focus();
        }
    });

    // Periodic focus check (less intrusive, only if focused but maybe context lost)


    // Immediate focus fix when window is ready
    win.webContents.on('did-finish-load', () => {
        if (win && !win.isDestroyed()) {
            win.webContents.focus();
        }
    });

    // Force focus on window show
    win.on('show', () => {
        if (win && !win.isDestroyed()) {
            win.webContents.focus();
        }
    });
}

app.whenReady().then(createWindow);

// --- IPC HANDLERS ---

// Debug Handler
ipcMain.handle('console-log', async (event, message) => {
    console.log("🖥️ RENDERER:", message);
});

// 0. Login Handler
ipcMain.handle('login-attempt', async (event, { username, password }) => {
    try {
        const result = await db.loginUser(username, password);
        return result;
    } catch (err) {
        console.error("Login Handler Error:", err);
        return { success: false, message: "Server Error" };
    }
});

// 0.1 Login Success -> Switch View & Resize
// 0.1 Login Success -> Switch View & Resize
ipcMain.on('login-success', (event, user) => {
    if (win) {
        // Resize to full dashboard size
        win.setResizable(true);
        win.maximize(); // Set to full screen/maximize
        win.show(); // Ensure window is shown

        // Route based on Role
        try {
            if (user.role === 'admin') {
                win.loadFile('src/dashboard/admin_dashboard.html');
            } else {
                win.loadFile('src/dashboard/user_homepage.html');
            }

            // Hack: Force window focus by minimizing and restoring
            // This fixes the issue where inputs are unresponsive until manually minimized/restored


        } catch (err) {
            console.error("Navigation Error:", err);
        }
    }
});

// --- ROOM MANAGEMENT HANDLERS (NEW) ---

ipcMain.handle('add-room', async (event, room) => {
    try {
        console.log("Adding Room:", room);
        return await db.addRoom(room);
    } catch (err) {
        console.error("Add Room Error:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('update-room', async (event, room) => {
    try {
        console.log("Updating Room:", room);
        return await db.updateRoom(room);
    } catch (err) {
        console.error("Update Room Error:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-rooms', async () => {
    try {
        return await db.getAllRooms();
    } catch (err) {
        console.error("Get Rooms Error:", err);
        return [];
    }
});

ipcMain.handle('delete-room', async (event, id) => {
    try {
        await db.deleteRoom(id);
        return { success: true };
    } catch (err) {
        console.error("Delete Room Error:", err);
        return { success: false, error: err.message };
    }
});

// --- BOOKING HANDLERS (NEW) ---

ipcMain.handle('add-booking', async (event, booking) => {
    try {
        console.log("Processing Booking:", booking);
        return await db.addBooking(booking);
    } catch (err) {
        console.error("Booking Error:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('get-bookings', async () => {
    try {
        return await db.getAllBookings();
    } catch (err) {
        console.error("Get Bookings Error:", err);
        return [];
    }
});

// Update Booking Handler
ipcMain.handle('update-booking', async (event, bookingData) => {
    try {
        console.log("Updating Booking:", bookingData);
        return await db.updateBooking(bookingData);
    } catch (err) {
        console.error("Error updating booking:", err);
        return { success: false, error: err.message };
    }
});

// Delete Booking Handler
ipcMain.handle('delete-booking', async (event, bookingId) => {
    try {
        console.log("Deleting Booking ID:", bookingId);
        return await db.deleteBooking(bookingId);
    } catch (err) {
        console.error("Error deleting booking:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('calculate-booking', async (event, { id, pricePerDay, totalDays, totalCost }) => {
    try {
        return await db.updateBookingCalculation(id, { pricePerDay, totalDays, totalCost });
    } catch (err) {
        console.error("Calculate Booking Error:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('check-availability', async (event, { checkIn, checkOut, searchText }) => {
    try {
        return await db.getAvailableRooms(checkIn, checkOut, searchText);
    } catch (err) {
        console.error("Availability Check Error:", err);
        return [];
    }
});

// Logout Listener
ipcMain.on('logout', async () => {
    if (win) {
        try {
            // First show a clean state
            win.unmaximize();
            win.setResizable(true); // Temporarily allow resizing to set size
            win.setSize(400, 600);
            win.setResizable(false);
            win.center();

            await win.loadFile('src/auth/login.html');

            // Re-apply focus fix after load


        } catch (err) {
            console.error("Logout Error:", err);
        }
    }
});

// --- USER MANAGEMENT HANDLERS ---
ipcMain.handle('get-users', async () => {
    try { return await db.getAllUsers(); }
    catch (err) { console.error(err); return []; }
});

ipcMain.handle('add-user', async (event, user) => {
    try { return await db.addUser(user); }
    catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('update-user', async (event, user) => {
    try { return await db.updateUser(user); }
    catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('delete-user', async (event, id) => {
    try { return await db.deleteUser(id); }
    catch (err) { return { success: false, error: err.message }; }
});

// --- EMPLOYEE MANAGEMENT HANDLERS ---
ipcMain.handle('get-employees', async () => {
    try { return await db.getEmployees(); }
    catch (err) { console.error(err); return []; }
});

ipcMain.handle('add-employee', async (event, emp) => {
    console.log("👉 MAIN: 'add-employee' received", emp);
    try {
        const result = await db.addEmployee(emp);
        console.log("✅ MAIN: db.addEmployee success", result);
        return result;
    }
    catch (err) {
        console.error("❌ MAIN: add-employee error", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('delete-employee', async (event, id) => {
    try { return await db.deleteEmployee(id); }
    catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('add-employee-leave', async (event, { id, date }) => {
    try { return await db.addEmployeeLeave(id, date); }
    catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('remove-employee-leave', async (event, { id, date }) => {
    try { return await db.removeEmployeeLeave(id, date); }
    catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('add-employee-transaction', async (event, { id, transaction }) => {
    try { return await db.addEmployeeTransaction(id, transaction); }
    catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('update-employee-transaction', async (event, { id, txId, amount }) => {
    try { return await db.updateEmployeeTransaction(id, txId, amount); }
    catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('delete-employee-transaction', async (event, { id, txId }) => {
    try { return await db.deleteEmployeeTransaction(id, txId); }
    catch (err) { return { success: false, error: err.message }; }
});

// Save PDF Handler
ipcMain.handle('save-pdf', async (event, { html, filename }) => {
    const { dialog, BrowserWindow } = require('electron');
    const fs = require('fs');
    const path = require('path');

    try {
        // Show save dialog
        const result = await dialog.showSaveDialog({
            title: 'Save PDF Report',
            defaultPath: path.join(require('os').homedir(), 'Downloads', filename || 'report.pdf'),
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (result.canceled) {
            return { success: false, message: 'Cancelled' };
        }

        const savePath = result.filePath;

        // Create a hidden window to render HTML
        const pdfWindow = new BrowserWindow({
            width: 1200,
            height: 800,
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        // Load the HTML content
        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

        // Generate PDF
        const pdfData = await pdfWindow.webContents.printToPDF({
            marginType: 1,
            pageSize: 'A4',
            printBackground: true,
            landscape: false
        });

        // Save the PDF
        fs.writeFileSync(savePath, pdfData);

        // Close the hidden window
        pdfWindow.close();

        return { success: true, path: savePath };
    } catch (err) {
        console.error('PDF Generation Error:', err);
        return { success: false, error: err.message };
    }
});

// 1. Get All Products
ipcMain.handle('get-products', async () => {
    try {
        const products = await db.getAllProducts();
        return products;
    } catch (err) {
        console.error("Error getting products:", err);
        return [];
    }
});

// 2. Search Products
ipcMain.handle('search-products', async (event, query) => {
    try {
        return await db.searchProducts(query);
    } catch (err) {
        console.error("Error searching:", err);
        return [];
    }
});

// 3. Add Product
ipcMain.handle('add-product', async (event, product) => {
    console.log("👉 MAIN PROCESS: Received 'add-product' request");

    try {
        if (!product.name || product.name.trim() === "") {
            throw new Error("Product Name is empty!");
        }

        const result = await db.addProduct(product);
        console.log("👉 MAIN PROCESS: Success sending back to frontend");
        return { success: true };

    } catch (err) {
        console.error("❌ MAIN PROCESS ERROR:", err.message);
        return { success: false, error: err.message };
    }
});

// 4. Update Product (NEW)
ipcMain.handle('update-product', async (event, product) => {
    console.log("👉 MAIN PROCESS: Received 'update-product' request");

    try {
        if (!product.name || product.name.trim() === "") {
            throw new Error("Product Name is empty!");
        }

        const result = await db.updateProduct(product);
        console.log("👉 MAIN PROCESS: Update success");
        return { success: true };

    } catch (err) {
        console.error("❌ MAIN PROCESS UPDATE ERROR:", err.message);
        return { success: false, error: err.message };
    }
});

// 5. Delete Product
ipcMain.handle('delete-product', async (event, id) => {
    try {
        await db.deleteProduct(id);
        return await db.getAllProducts();
    } catch (err) {
        console.error("Failed to delete:", err);
        return [];
    }
});

// --- EXPENSE MANAGEMENT HANDLERS ---

ipcMain.handle('get-expenses', async () => {
    try { return await db.getExpenses(); }
    catch (err) { console.error(err); return []; }
});

ipcMain.handle('add-expense', async (event, expense) => {
    try { return await db.addExpense(expense); }
    catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('delete-expense', async (event, id) => {
    try { return await db.deleteExpense(id); }
    catch (err) { return { success: false, error: err.message }; }
});

// --- BACKUP & RESTORE HANDLERS ---

ipcMain.handle('create-backup', async (event) => {
    try {
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
        const defaultPath = `freedom_villa_backup_${timestamp}.json`;

        const { filePath, canceled } = await dialog.showSaveDialog(win, {
            title: 'Save System Backup',
            defaultPath: defaultPath,
            filters: [{ name: 'JSON Files', extensions: ['json'] }]
        });

        if (canceled || !filePath) return { success: false, message: 'Canceled' };

        const data = await db.getFullBackup();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

        return { success: true, path: filePath };
    } catch (err) {
        console.error("Backup Error:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle('restore-backup', async (event) => {
    try {
        const { filePaths, canceled } = await dialog.showOpenDialog(win, {
            title: 'Select Backup File',
            filters: [{ name: 'JSON Files', extensions: ['json'] }],
            properties: ['openFile']
        });

        if (canceled || filePaths.length === 0) return { success: false, message: 'Canceled' };

        const filePath = filePaths[0];
        const rawData = fs.readFileSync(filePath, 'utf8');
        const backupData = JSON.parse(rawData);

        const result = await db.restoreFullBackup(backupData);
        return result;
    } catch (err) {
        console.error("Restore Error:", err);
        return { success: false, error: err.message };
    }
});

// Update Employee Base Salary
ipcMain.handle('update-employee-base-salary', async (event, { id, baseSalary }) => {
    try {
        await db.updateEmployeeBaseSalary(id, baseSalary);
        return { success: true };
    } catch (err) {
        console.error("Error updating base salary:", err);
        return { success: false, error: err.message };
    }
});

// --- FINANCIAL REPORTS ---
ipcMain.handle('get-monthly-stats', async () => {
    try {
        return await db.getMonthlyStats();
    } catch (err) {
        console.error("Error getting monthly stats:", err);
    }
});