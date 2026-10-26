const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');

// Database File Path
const { app } = require('electron');

// Database File Path
const isPackaged = app.isPackaged;
const dbPath = isPackaged
    ? path.join(process.resourcesPath, 'villa.db')
    : path.join(__dirname, '../../villa.db');

const db = new Database(dbPath, { verbose: console.log });

// --- INITIALIZATION ---
function initDB() {
    console.log("--- INITIALIZING SQLITE DATABASE ---");

    // 1. Users Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT,
            createdAt TEXT
        )
    `);

    // 2. Rooms Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            number TEXT,
            name TEXT,
            status TEXT,
            createdAt TEXT
        )
    `);

    // 3. Bookings Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            roomId INTEGER,
            guestName TEXT,
            checkIn TEXT,
            checkOut TEXT,
            status TEXT,
            pricePerDay REAL,
            totalDays INTEGER,
            totalCost REAL,
            voucherNumber TEXT,
            roomType TEXT,
            roomPrice REAL,
            currency TEXT,
            calculatedAt TEXT,
            createdAt TEXT,
            FOREIGN KEY(roomId) REFERENCES rooms(id)
        )
    `);

    // Schema Migration for existing databases
    try { db.prepare('ALTER TABLE bookings ADD COLUMN voucherNumber TEXT').run(); } catch (e) { }
    try { db.prepare('ALTER TABLE bookings ADD COLUMN roomType TEXT').run(); } catch (e) { }
    try { db.prepare('ALTER TABLE bookings ADD COLUMN roomPrice REAL').run(); } catch (e) { }
    try { db.prepare('ALTER TABLE bookings ADD COLUMN currency TEXT').run(); } catch (e) { }

    // 4. Products Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            barcode TEXT,
            category TEXT,
            price REAL,
            quantity INTEGER
        )
    `);

    // 5. Employees Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS employees (
            id TEXT PRIMARY KEY,
            name TEXT,
            phone TEXT,
            baseSalary REAL,
            leaves TEXT, -- JSON Array
            transactions TEXT, -- JSON Array
            createdAt TEXT
        )
    `);

    // 6. Expenses Table
    db.exec(`
        CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY,
            reason TEXT,
            date TEXT,
            amount REAL,
            createdAt TEXT
        )
    `);

    seedUsers();
}

function seedUsers() {
    const stmt = db.prepare('SELECT count(*) as count FROM users');
    const row = stmt.get();

    if (row.count === 0) {
        console.log("⚠️ No users found. Seeding default users...");
        const insert = db.prepare('INSERT INTO users (name, username, password, role, createdAt) VALUES (?, ?, ?, ?, ?)');

        insert.run('System Admin', 'admin', 'admin123', 'admin', new Date().toISOString());
        insert.run('Staff Member', 'user', 'user123', 'user', new Date().toISOString());

        console.log("✅ Default users created.");
    }
}

// Run init
try {
    initDB();
} catch (err) {
    console.error("❌ DATABASE INITIALIZATION FAILED:", err);
}

module.exports = {
    // --- USER AUTHENTICATION ---
    loginUser: async (username, password) => {
        try {
            const stmt = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?');
            const user = stmt.get(username, password);

            if (user) {
                return { success: true, user: { username: user.username, role: user.role, name: user.name } };
            } else {
                return { success: false, message: "Invalid credentials" };
            }
        } catch (err) {
            console.error(err);
            return { success: false, message: "Database Error" };
        }
    },

    // --- ROOM MANAGEMENT ---
    getAllRooms: async () => {
        try {
            const stmt = db.prepare('SELECT * FROM rooms ORDER BY id DESC');
            const rows = stmt.all();
            return rows.map(r => ({ ...r, id: r.id.toString() })); // Convert ID to string for consistency
        } catch (err) {
            console.error(err);
            return [];
        }
    },

    addRoom: async (room) => {
        if (!room.number || !room.name) throw new Error("Room Number and Name are required");

        const stmt = db.prepare('INSERT INTO rooms (number, name, status, createdAt) VALUES (?, ?, ?, ?)');
        const info = stmt.run(room.number, room.name, 'available', new Date().toISOString());
        return { success: true, id: info.lastInsertRowid.toString() };
    },

    updateRoom: async (room) => {
        if (!room.id || !room.number || !room.name) throw new Error("ID, Number and Name are required");

        const stmt = db.prepare('UPDATE rooms SET number = ?, name = ? WHERE id = ?');
        stmt.run(room.number, room.name, room.id);
        return { success: true };
    },

    deleteRoom: async (id) => {
        // 1. Delete associated bookings first to satisfy Foreign Key constraints
        // Ensure ID is treated as the correct type (Integer) for the query to match
        const deleteBookings = db.prepare('DELETE FROM bookings WHERE roomId = ?');
        deleteBookings.run(id);

        // 2. Delete the room
        const stmt = db.prepare('DELETE FROM rooms WHERE id = ?');
        stmt.run(id);
        return { success: true };
    },

    // --- BOOKING MANAGEMENT ---
    addBooking: async (booking) => {
        if (!booking.roomId || !booking.guestName || !booking.checkIn || !booking.checkOut) {
            throw new Error("Missing required booking fields");
        }

        const stmt = db.prepare(`
            INSERT INTO bookings (roomId, guestName, checkIn, checkOut, status, voucherNumber, roomType, roomPrice, currency, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const info = stmt.run(
            booking.roomId,
            booking.guestName,
            booking.checkIn,
            booking.checkOut,
            'pending',
            booking.voucherNumber || '',
            booking.roomType || '',
            parseFloat(booking.roomPrice) || 0,
            booking.currency || '$',
            new Date().toISOString()
        );
        return { success: true, id: info.lastInsertRowid.toString() };
    },

    getAllBookings: async () => {
        const stmt = db.prepare(`
            SELECT bookings.*, rooms.number as roomNumber, rooms.name as roomName 
            FROM bookings 
            LEFT JOIN rooms ON bookings.roomId = rooms.id 
            ORDER BY bookings.createdAt DESC
        `);
        const rows = stmt.all();
        return rows.map(b => ({ ...b, id: b.id.toString() }));
    },

    updateBookingCalculation: async (id, data) => {
        const stmt = db.prepare(`
            UPDATE bookings 
            SET status = 'calculated', pricePerDay = ?, totalDays = ?, totalCost = ?, calculatedAt = ?
            WHERE id = ?
        `);
        stmt.run(data.pricePerDay, data.totalDays, data.totalCost, new Date().toISOString(), id);
        return { success: true };
    },

    // Update Booking (for edit functionality)
    updateBooking: async (bookingData) => {
        const stmt = db.prepare(`
            UPDATE bookings 
            SET guestName = ?, voucherNumber = ?, checkIn = ?, checkOut = ?, 
                roomType = ?, roomPrice = ?, currency = ?
            WHERE id = ?
        `);
        stmt.run(
            bookingData.guestName,
            bookingData.voucherNumber,
            bookingData.checkIn,
            bookingData.checkOut,
            bookingData.roomType,
            bookingData.roomPrice,
            bookingData.currency,
            bookingData.id
        );
        return { success: true };
    },

    // Delete Booking
    deleteBooking: async (bookingId) => {
        const stmt = db.prepare('DELETE FROM bookings WHERE id = ?');
        stmt.run(bookingId);
        return { success: true };
    },

    getAvailableRooms: async (checkIn, checkOut, searchText) => {
        const today = new Date().toISOString().split('T')[0];
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrow = tomorrowDate.toISOString().split('T')[0];

        const finalCheckIn = checkIn || today;
        const finalCheckOut = checkOut || tomorrow;

        // Find Booked Room IDs
        // SQLite doesn't have arrays, so we query bookings
        const bookingStmt = db.prepare(`
            SELECT roomId FROM bookings 
            WHERE checkIn < ? AND checkOut > ? AND status != 'cancelled'
        `);
        const bookedRows = bookingStmt.all(finalCheckOut, finalCheckIn);
        const bookedRoomIds = bookedRows.map(b => b.roomId);

        // Get Rooms
        let query = 'SELECT * FROM rooms';
        let params = [];

        if (searchText) {
            query += ' WHERE name LIKE ? OR number LIKE ?';
            params.push(`%${searchText}%`, `%${searchText}%`);
        }

        const roomStmt = db.prepare(query);
        const allRooms = roomStmt.all(...params);

        return allRooms.map(room => {
            const isBooked = bookedRoomIds.includes(room.id);
            return {
                ...room,
                id: room.id.toString(),
                status: isBooked ? 'Booked' : 'Available'
            };
        });
    },

    // --- USER MANAGEMENT ---
    getAllUsers: async () => {
        const stmt = db.prepare('SELECT * FROM users');
        const rows = stmt.all();
        return rows.map(u => ({ ...u, id: u.id.toString() }));
    },

    addUser: async (user) => {
        const check = db.prepare('SELECT id FROM users WHERE username = ?');
        if (check.get(user.username)) throw new Error("Username already exists");

        const stmt = db.prepare('INSERT INTO users (name, username, password, role, createdAt) VALUES (?, ?, ?, ?, ?)');
        const info = stmt.run(user.name, user.username, user.password, user.role, new Date().toISOString());
        return { success: true, id: info.lastInsertRowid.toString() };
    },

    updateUser: async (user) => {
        let query = 'UPDATE users SET name = ?, username = ?, role = ?';
        let params = [user.name, user.username, user.role];

        if (user.password && user.password.trim() !== "") {
            query += ', password = ?';
            params.push(user.password);
        }

        query += ' WHERE id = ?';
        params.push(user.id);

        const stmt = db.prepare(query);
        stmt.run(...params);
        return { success: true };
    },

    deleteUser: async (id) => {
        const stmt = db.prepare('DELETE FROM users WHERE id = ?');
        stmt.run(id);
        return { success: true };
    },

    // --- PRODUCT FUNCTIONS ---
    getAllProducts: async () => {
        const stmt = db.prepare('SELECT * FROM products ORDER BY id DESC');
        const rows = stmt.all();
        return rows.map(p => ({ ...p, id: p.id.toString() }));
    },

    addProduct: async (product) => {
        const category = (!product.category || product.category.trim() === "") ? "Uncategorized" : product.category;

        const stmt = db.prepare('INSERT INTO products (name, barcode, category, price, quantity) VALUES (?, ?, ?, ?, ?)');
        const info = stmt.run(
            product.name,
            product.barcode,
            category,
            parseFloat(product.price),
            parseInt(product.quantity)
        );
        return { acknowledged: true, insertedId: info.lastInsertRowid.toString() }; // Maintain Return Shape
    },

    updateProduct: async (product) => {
        const category = (!product.category || product.category.trim() === "") ? "Uncategorized" : product.category;

        const stmt = db.prepare('UPDATE products SET name=?, barcode=?, category=?, price=?, quantity=? WHERE id=?');
        const info = stmt.run(
            product.name,
            product.barcode,
            category,
            parseFloat(product.price),
            parseInt(product.quantity),
            product.id
        );
        return { modifiedCount: info.changes };
    },

    deleteProduct: async (id) => {
        const stmt = db.prepare('DELETE FROM products WHERE id = ?');
        stmt.run(id);
        return { deletedCount: 1 };
    },

    searchProducts: async (query) => {
        const stmt = db.prepare('SELECT * FROM products WHERE name LIKE ? OR barcode LIKE ? OR category LIKE ?');
        const search = `%${query}%`;
        const rows = stmt.all(search, search, search);
        return rows.map(p => ({ ...p, id: p.id.toString() }));
    },

    // --- EMPLOYEE MANAGEMENT ---
    getEmployees: async () => {
        const stmt = db.prepare('SELECT * FROM employees');
        const rows = stmt.all();
        // Parse JSON fields
        return rows.map(e => ({
            ...e,
            leaves: JSON.parse(e.leaves || '[]'),
            transactions: JSON.parse(e.transactions || '[]'),
            mongoId: e.id // Maintain compatibility
        }));
    },

    addEmployee: async (employee) => {
        const id = crypto.randomUUID();
        const stmt = db.prepare(`
            INSERT INTO employees (id, name, phone, baseSalary, leaves, transactions, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            id,
            employee.name,
            employee.phone,
            parseFloat(employee.baseSalary),
            JSON.stringify([]),
            JSON.stringify([]),
            new Date().toISOString()
        );
        return { success: true, id: id };
    },

    addEmployeeLeave: async (id, date) => {
        // SQLite doesn't have $addToSet, need to read-modify-write
        const stmt = db.prepare('SELECT leaves FROM employees WHERE id = ?');
        const row = stmt.get(id);
        if (!row) throw new Error("Employee not found");

        let leaves = JSON.parse(row.leaves || '[]');
        if (!leaves.includes(date)) {
            leaves.push(date);
            const update = db.prepare('UPDATE employees SET leaves = ? WHERE id = ?');
            update.run(JSON.stringify(leaves), id);
        }
        return { success: true };
    },

    removeEmployeeLeave: async (id, date) => {
        const stmt = db.prepare('SELECT leaves FROM employees WHERE id = ?');
        const row = stmt.get(id);
        if (!row) throw new Error("Employee not found");

        let leaves = JSON.parse(row.leaves || '[]');
        leaves = leaves.filter(d => d !== date);

        const update = db.prepare('UPDATE employees SET leaves = ? WHERE id = ?');
        update.run(JSON.stringify(leaves), id);
        return { success: true };
    },

    addEmployeeTransaction: async (id, transaction) => {
        const stmt = db.prepare('SELECT transactions FROM employees WHERE id = ?');
        const row = stmt.get(id);
        if (!row) throw new Error("Employee not found");

        let transactions = JSON.parse(row.transactions || '[]');
        const record = {
            txId: crypto.randomUUID(),
            type: transaction.type,
            amount: parseFloat(transaction.amount),
            date: transaction.date,
            note: transaction.note || ''
        };
        transactions.push(record);

        const update = db.prepare('UPDATE employees SET transactions = ? WHERE id = ?');
        update.run(JSON.stringify(transactions), id);
        return { success: true };
    },

    updateEmployeeTransaction: async (id, txId, amount) => {
        const stmt = db.prepare('SELECT transactions FROM employees WHERE id = ?');
        const row = stmt.get(id);
        if (!row) throw new Error("Employee not found");

        let transactions = JSON.parse(row.transactions || '[]');
        const txIndex = transactions.findIndex(t => t.txId === txId);
        if (txIndex === -1) throw new Error("Transaction not found");

        transactions[txIndex].amount = parseFloat(amount);

        const update = db.prepare('UPDATE employees SET transactions = ? WHERE id = ?');
        update.run(JSON.stringify(transactions), id);
        return { success: true };
    },

    deleteEmployeeTransaction: async (id, txId) => {
        const stmt = db.prepare('SELECT transactions FROM employees WHERE id = ?');
        const row = stmt.get(id);
        if (!row) throw new Error("Employee not found");

        let transactions = JSON.parse(row.transactions || '[]');
        transactions = transactions.filter(t => t.txId !== txId);

        const update = db.prepare('UPDATE employees SET transactions = ? WHERE id = ?');
        update.run(JSON.stringify(transactions), id);
        return { success: true };
    },

    deleteEmployee: async (id) => {
        const stmt = db.prepare('DELETE FROM employees WHERE id = ?');
        stmt.run(id);
        return { success: true };
    },

    updateEmployeeBaseSalary: (id, baseSalary) => {
        const stmt = db.prepare('UPDATE employees SET baseSalary = ? WHERE id = ?');
        stmt.run(baseSalary, id);
        console.log(`Updated base salary for employee ${id} to ${baseSalary}`);
    },

    // --- EXPENSE MANAGEMENT ---
    getExpenses: async () => {
        const stmt = db.prepare('SELECT * FROM expenses ORDER BY date DESC');
        const rows = stmt.all();
        return rows.map(e => ({ ...e, mongoId: e.id })); // Compatibility
    },

    addExpense: async (expense) => {
        const id = crypto.randomUUID();
        const stmt = db.prepare('INSERT INTO expenses (id, reason, date, amount, createdAt) VALUES (?, ?, ?, ?, ?)');
        stmt.run(
            id,
            expense.reason,
            expense.date,
            parseFloat(expense.amount),
            new Date().toISOString()
        );
        return { success: true, id: id };
    },

    deleteExpense: async (id) => {
        const stmt = db.prepare('DELETE FROM expenses WHERE id = ?');
        stmt.run(id);
        return { success: true };
    },

    // --- SYSTEM BACKUP & RESTORE ---
    getFullBackup: async () => {
        try {
            return {
                timestamp: new Date().toISOString(),
                users: db.prepare('SELECT * FROM users').all(),
                rooms: db.prepare('SELECT * FROM rooms').all(),
                bookings: db.prepare('SELECT * FROM bookings').all(),
                products: db.prepare('SELECT * FROM products').all(),
                employees: db.prepare('SELECT * FROM employees').all(),
                expenses: db.prepare('SELECT * FROM expenses').all()
            };
        } catch (err) {
            console.error('❌ Error creating backup:', err);
            throw err;
        }
    },

    restoreFullBackup: async (backupData) => {
        db.pragma('foreign_keys = OFF');
        const restoreTx = db.transaction((data) => {
            // ... existing logic ...
            // Users
            if (data.users && data.users.length > 0) {
                db.prepare('DELETE FROM users').run();
                const insert = db.prepare('INSERT INTO users (id, name, username, password, role, createdAt) VALUES (@id, @name, @username, @password, @role, @createdAt)');
                for (const user of data.users) try { insert.run(user); } catch (e) { }
            }

            // Rooms
            if (data.rooms && data.rooms.length > 0) {
                db.prepare('DELETE FROM rooms').run();
                const insert = db.prepare('INSERT INTO rooms (id, number, name, status, createdAt) VALUES (@id, @number, @name, @status, @createdAt)');
                for (const room of data.rooms) insert.run(room);
            }

            // Bookings
            if (data.bookings && data.bookings.length > 0) {
                db.prepare('DELETE FROM bookings').run();
                const insert = db.prepare(`
                    INSERT INTO bookings (id, roomId, guestName, checkIn, checkOut, status, pricePerDay, totalDays, totalCost, calculatedAt, createdAt) 
                    VALUES (@id, @roomId, @guestName, @checkIn, @checkOut, @status, @pricePerDay, @totalDays, @totalCost, @calculatedAt, @createdAt)
                `);
                for (const booking of data.bookings) insert.run(booking);
            }

            // Products
            if (data.products && data.products.length > 0) {
                db.prepare('DELETE FROM products').run();
                const insert = db.prepare(`INSERT INTO products (id, name, barcode, category, price, quantity) VALUES (@id, @name, @barcode, @category, @price, @quantity)`);
                for (const prod of data.products) insert.run(prod);
            }

            // Employees
            if (data.employees && data.employees.length > 0) {
                db.prepare('DELETE FROM employees').run();
                const insert = db.prepare('INSERT INTO employees (id, name, phone, baseSalary, leaves, transactions, createdAt) VALUES (@id, @name, @phone, @baseSalary, @leaves, @transactions, @createdAt)');
                for (const emp of data.employees) insert.run(emp);
            }

            // Expenses
            if (data.expenses && data.expenses.length > 0) {
                db.prepare('DELETE FROM expenses').run();
                const insert = db.prepare('INSERT INTO expenses (id, reason, date, amount, createdAt) VALUES (@id, @reason, @date, @amount, @createdAt)');
                for (const exp of data.expenses) insert.run(exp);
            }
        });

        try {
            restoreTx(backupData);
            db.pragma('foreign_keys = ON');
            return { success: true };
        } catch (err) {
            db.pragma('foreign_keys = ON');
            console.error(err);
            throw err;
        }
    },

    // --- FINANCIAL REPORTS ---
    getMonthlyStats: async () => {
        try {
            console.log("👉 DB: getMonthlyStats called");
            const stats = {};

            // 1. Calculate Booking Revenue
            const bookings = db.prepare("SELECT checkIn, totalCost FROM bookings WHERE status = 'calculated'").all();
            console.log(`👉 DB: Found ${bookings.length} calculated bookings`);
            bookings.forEach(b => {
                if (!b.checkIn) return;
                const month = b.checkIn.substring(0, 7); // YYYY-MM
                if (!stats[month]) stats[month] = { revenue: 0, expenses: 0, salary: 0 };
                stats[month].revenue += (b.totalCost || 0);
            });

            // 2. Calculate Expenses
            const expenses = db.prepare("SELECT date, amount FROM expenses").all();
            expenses.forEach(e => {
                if (!e.date) return;
                const month = e.date.substring(0, 7); // YYYY-MM
                if (!stats[month]) stats[month] = { revenue: 0, expenses: 0, salary: 0 };
                stats[month].expenses += (e.amount || 0);
            });

            // 3. Calculate Employee Salaries/Advances
            const employees = db.prepare("SELECT transactions FROM employees").all();
            employees.forEach(emp => {
                const transactions = JSON.parse(emp.transactions || '[]');
                transactions.forEach(tx => {
                    if (!tx.date) return;
                    const month = tx.date.substring(0, 7); // YYYY-MM
                    if (!stats[month]) stats[month] = { revenue: 0, expenses: 0, salary: 0 };
                    stats[month].salary += (tx.amount || 0);
                });
            });

            // 4. Format Result
            return Object.keys(stats).sort().reverse().map(month => {
                const data = stats[month];
                const totalExpenses = data.expenses + data.salary;
                return {
                    month,
                    revenue: parseFloat(data.revenue.toFixed(2)),
                    expenses: parseFloat(data.expenses.toFixed(2)),
                    salary: parseFloat(data.salary.toFixed(2)),
                    totalExpenses: parseFloat(totalExpenses.toFixed(2)),
                    profit: parseFloat((data.revenue - totalExpenses).toFixed(2))
                };
            });

        } catch (err) {
            console.error("Error generating monthly stats:", err);
            return [];
        }
    }
};