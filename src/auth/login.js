const { ipcRenderer } = require('electron');

const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const errorMessage = document.getElementById('errorMessage');
const loginBtn = document.querySelector('.login-btn');

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Reset UI
    errorMessage.classList.remove('show');
    errorMessage.innerText = "";
    loginBtn.classList.add('loading');
    loginBtn.disabled = true;

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        showError("Please enter both username and password.");
        resetBtn();
        return;
    }

    try {
        // Send login request to main process
        const response = await ipcRenderer.invoke('login-attempt', { username, password });

        if (response.success) {
            // Success - Redirect logic is handled by main process usually, 
            // or we can redirect here if main just returns success.
            // For this app, main process will likely load the new window or we redirect.
            // Let's assume main process handles the window switch or we redirect.
            // For now, let's ask main to switch views.
            console.log("Login Successful", response.user);
            // We can store user info in localStorage if needed here
            localStorage.setItem('user', JSON.stringify(response.user));

            // Tell main to switch to dashboard
            ipcRenderer.send('login-success', response.user);

        } else {
            showError(response.message || "Invalid credentials");
            resetBtn();
        }

    } catch (err) {
        console.error("Login Error:", err);
        showError("An unexpected error occurred.");
        resetBtn();
    }
});

function showError(msg) {
    errorMessage.innerText = msg;
    errorMessage.classList.add('show');
}

function resetBtn() {
    loginBtn.classList.remove('loading');
    loginBtn.disabled = false;
}
