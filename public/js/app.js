// Tab switching logic for the new SaaS layout
function switchDashTab(tabId) {
    // Hide all tabs
    document.querySelectorAll('.dash-tab').forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active');
    });
    // Remove active class from all nav items
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    const selectedTab = document.getElementById(`tab-${tabId}`);
    if (selectedTab) {
        selectedTab.style.display = 'block';
        setTimeout(() => selectedTab.classList.add('active'), 10);
    }
    
    // Highlight nav button
    const activeBtn = Array.from(document.querySelectorAll('.sidebar-nav .nav-item'))
        .find(btn => btn.getAttribute('onclick') === `switchDashTab('${tabId}')`);
    if (activeBtn) activeBtn.classList.add('active');
    
    // Save state so refresh keeps you on the same tab
    localStorage.setItem('active_dash_tab', tabId);
}

// View Management
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');
    
    // Hide main navbar if in dashboard to create a standalone app feel
    const navbar = document.querySelector('.navbar');
    if (viewId === 'dashboard') {
        navbar.style.display = 'none';
    } else {
        navbar.style.display = 'flex';
    }
    
    // Toggle nav buttons
    const navAuth = document.getElementById('nav-auth');
    if (viewId === 'dashboard') {
        navAuth.style.display = 'none';
    } else {
        navAuth.style.display = 'flex';
    }
}

// Modal Management
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    // Clear forms and errors
    const form = document.querySelector(`#${id} form`);
    if(form) form.reset();
    const errorMsg = document.querySelector(`#${id} .form-error`);
    if(errorMsg) errorMsg.style.display = 'none';
}

// Show Error
function showError(modalPrefix, msg) {
    const el = document.getElementById(`${modalPrefix}Error`);
    el.textContent = msg;
    el.style.display = 'block';
}

// Auth State Management
async function checkAuth() {
    // Check for verification token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const verifyToken = urlParams.get('verify');
    
    if (verifyToken) {
        try {
            const res = await fetch(`/api/auth/verify/${verifyToken}`);
            const data = await res.json();
            if (data.status === 'success') {
                localStorage.setItem('cs_user', JSON.stringify(data.data));
                window.history.replaceState({}, document.title, window.location.pathname); // clear URL
                // Show temporary success banner instead of alert
                const banner = document.createElement('div');
                banner.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#10b981;color:white;padding:1rem 2rem;border-radius:8px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-weight:600;';
                banner.textContent = 'Email verified successfully! Welcome to your dashboard.';
                document.body.appendChild(banner);
                setTimeout(() => banner.remove(), 4000);
            } else {
                const banner = document.createElement('div');
                banner.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#ef4444;color:white;padding:1rem 2rem;border-radius:8px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-weight:600;';
                banner.textContent = data.message || 'Verification failed. Token may be expired.';
                document.body.appendChild(banner);
                setTimeout(() => banner.remove(), 4000);
            }
        } catch (err) {
            console.error(err);
        }
    }

    const user = JSON.parse(localStorage.getItem('cs_user'));
    if (user && (user.api_key || (user.api_keys && user.api_keys.length > 0))) {
        showView('dashboard');
        // Always fetch fresh plan/limit data from server
        const apiKey = user.api_keys && user.api_keys.length > 0 ? user.api_keys[0].key_value : user.api_key;
        fetch('/api/auth/me', { headers: { 'Authorization': 'Bearer ' + apiKey } })
            .then(r => r.ok ? r.json() : null)
            .then(fresh => {
                if (fresh && fresh.status === 'success') {
                    const merged = Object.assign({}, user, fresh.data);
                    localStorage.setItem('cs_user', JSON.stringify(merged));
                    populateDashboard(merged);
                } else {
                    populateDashboard(user);
                }
            })
            .catch(() => populateDashboard(user));
    } else {
        showView('landing');
    }
}

// Populate Dashboard with User Data
function populateDashboard(user) {
    if (!user) return;

    const fullName = user.full_name || (user.email ? user.email.split('@')[0] : 'User');
    const userPlan = user.plan || 'free';
    const planName = userPlan.charAt(0).toUpperCase() + userPlan.slice(1);
    const currentKey = user.api_keys && user.api_keys.length > 0 ? user.api_keys[0].key_value : user.api_key;

    // Sidebar
    document.getElementById('dash-name').textContent = fullName;
    document.getElementById('plan-display').textContent = planName;

    // Admin Button
    const adminBtn = document.getElementById('nav-adhikari');
    if (adminBtn) {
        adminBtn.style.display = user.role === 'admin' ? 'block' : 'none';
    }
    
    // Fetch and display active promos for this user
    fetch('/api/auth/promos', {
        headers: {
            'Authorization': 'Bearer ' + currentKey
        }
    })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success' && data.data.length > 0) {
                const banner = document.getElementById('broadcast-banner');
                const msg = document.getElementById('broadcast-message');
                if (banner && msg) {
                    msg.textContent = data.data[0].message; // show the most recent active promo
                    banner.style.display = 'flex';
                    
                    // Style differently based on type if needed
                    if(data.data[0].type === 'promo') {
                        banner.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                        banner.style.boxShadow = '0 4px 15px rgba(16, 185, 129, 0.3)';
                    }
                }
            }
        })
        .catch(err => console.error('Failed to load promos', err));
    
    // Set sticky tab or default to overview
    const savedTab = localStorage.getItem('active_dash_tab') || 'overview';
    switchDashTab(savedTab);
    
    const welcomeName = document.getElementById('dash-welcome-name');
    if (welcomeName) welcomeName.textContent = fullName;
    
    // Populate Settings
    const settingsNameInput = document.getElementById('settings-input-name');
    if (settingsNameInput) settingsNameInput.value = user.full_name || '';
    const settingsEmailInput = document.getElementById('settings-input-email');
    if (settingsEmailInput) settingsEmailInput.value = user.email || '';
    
    const emailUpdatesToggle = document.getElementById('settings-email-updates');
    if (emailUpdatesToggle) emailUpdatesToggle.checked = !user.email_unsubscribed;

    document.getElementById('settings-initial').textContent = fullName.charAt(0).toUpperCase();
    document.getElementById('settings-name').textContent = fullName;
    document.getElementById('settings-email').textContent = user.email;
    document.getElementById('settings-plan-badge').textContent = planName + ' Plan';
    
    document.getElementById('settings-alert-usage').checked = user.alert_usage !== false;
    document.getElementById('settings-alert-updates').checked = user.alert_updates !== false;  
    // API Key handling
    const apiKeyDisplay = document.getElementById('api-key-display');
    if(apiKeyDisplay) apiKeyDisplay.textContent = currentKey || 'No active keys';
    
    const keysTabDisplay = document.getElementById('keys-tab-display');
    if(keysTabDisplay) keysTabDisplay.textContent = currentKey || 'No active keys';
    
    const dailyLimit = user.api_keys && user.api_keys.length > 0 ? user.api_keys[0].daily_limit : '100';
    const limitDisplay = document.getElementById('daily-limit');
    if(limitDisplay) limitDisplay.textContent = dailyLimit;

    // Removed duplicate Settings tab updates since they are done above

    // Fetch live API usage dynamically
    if (currentKey) {
        fetchUsage(currentKey);
    }

    // Load dynamic plans into subscription tab (pass current user plan to highlight it)
    loadDynamicPlans(userPlan);
}

function logout() {
    localStorage.removeItem('cs_user');
    localStorage.removeItem('active_dash_tab');
    window.location.reload();
}

// ─── Dynamic Plans ────────────────────────────────────────────────
async function loadDynamicPlans(currentUserPlan) {
    const grid = document.getElementById('pricing-grid');
    if (!grid) return;

    try {
        const res  = await fetch('/api/auth/plans');
        const data = await res.json();
        if (data.status !== 'success' || !data.data.length) {
            grid.innerHTML = '<div style="text-align:center;padding:3rem;color:#94a3b8;">No plans available.</div>';
            return;
        }

        const plans = data.data;
        const midIdx = Math.floor(plans.length / 2);
        grid.style.gridTemplateColumns = `repeat(${Math.min(plans.length, 3)}, 1fr)`;

        grid.innerHTML = plans.map((p, i) => {
            const isFree    = parseFloat(p.price_monthly) === 0;
            const isPopular = i === midIdx && plans.length > 2;
            const isCurrent = p.code === currentUserPlan;
            const priceHtml = isFree
                ? 'Free'
                : `\$${parseFloat(p.price_monthly).toFixed(0)}<span class="interval">/mo</span>`;
            const yearlySaving = parseFloat(p.price_yearly) > 0
                ? Math.round((1 - (parseFloat(p.price_yearly) / (parseFloat(p.price_monthly) * 12))) * 100)
                : 0;

            return `
            <div class="pricing-card${isPopular ? ' popular' : ''}" style="padding:1.5rem;position:relative;${isCurrent ? 'border-color:var(--accent-color);' : ''}">
                ${isPopular ? '<div class="popular-badge" style="font-size:0.7rem;top:-10px;">Popular</div>' : ''}
                ${isCurrent ? '<div style="position:absolute;top:10px;right:12px;background:#10b981;color:white;font-size:0.65rem;font-weight:700;padding:0.2rem 0.5rem;border-radius:1rem;">Your Plan</div>' : ''}
                <h3 style="font-size:1.15rem;margin:0 0 0.5rem;">${p.name}</h3>
                <div class="price" style="font-size:2rem;font-weight:800;margin-bottom:1rem;">${priceHtml}</div>
                <div style="display:flex;flex-direction:column;gap:0.4rem;">
                    <p class="text-sm" style="margin:0;">\uD83D\uDCC5 Monthly: <strong>${parseInt(p.monthly_limit).toLocaleString()}</strong></p>
                    <p class="text-sm" style="margin:0;">\u26A1 Daily: <strong>${parseInt(p.daily_limit).toLocaleString()}</strong></p>
                    ${parseFloat(p.price_yearly) > 0 && yearlySaving > 0 ? `<p class="text-sm" style="margin:0;color:#10b981;">\uD83D\uDCB0 \$${parseFloat(p.price_yearly).toFixed(0)}/yr (save ${yearlySaving}%)</p>` : ''}
                </div>
                <div style="margin-top:1.25rem;">
                    ${isCurrent
                        ? '<div style="text-align:center;font-size:0.8rem;color:#10b981;font-weight:700;">\u2713 Active Plan</div>'
                        : `<button class="btn btn-${isFree ? 'outline' : 'primary'} w-100" style="font-size:0.85rem;" onclick="alert('Upgrade to ${p.name} — payment coming soon!')">Upgrade</button>`
                    }
                </div>
            </div>`;
        }).join('');

    } catch (err) {
        console.error('Failed to load plans:', err);
        if (grid) grid.innerHTML = '<div style="text-align:center;padding:3rem;color:#ef4444;">Could not load plans. Please refresh.</div>';
    }
}

function copyApiKey() {
    const key = document.getElementById('keys-tab-display').textContent;
    navigator.clipboard.writeText(key).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.background = '#10b981';
        btn.style.color = 'white';
        btn.style.borderColor = '#10b981';
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
            btn.style.color = '';
            btn.style.borderColor = '';
        }, 2000);
    });
}

async function fetchUsage(apiKey) {
    try {
        const res = await fetch('/api/v1/usage', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const data = await res.json();
        if (data.status === 'success') {
            document.getElementById('usage-today').textContent = data.data.used_today;
            document.getElementById('usage-limit-today').textContent = data.data.daily_limit;
            document.getElementById('usage-month').textContent = data.data.used_this_month;
            document.getElementById('usage-limit-month').textContent = data.data.monthly_limit === 'unlimited' ? '∞' : data.data.monthly_limit;
            
            // New dynamic stats
            document.getElementById('usage-latency').textContent = data.data.avg_latency || '0.00';
            document.getElementById('usage-errors').textContent = data.data.error_count || '0';
            
            // Quota Check Banner
            const usageTab = document.getElementById('tab-usage');
            const existingBanner = document.getElementById('quota-banner');
            if (existingBanner) existingBanner.remove();
            
            if (data.data.used_today >= data.data.daily_limit) {
                const banner = document.createElement('div');
                banner.id = 'quota-banner';
                banner.className = 'alert';
                banner.style.cssText = 'background: #fef2f2; color: #991b1b; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; border: 1px solid #fecaca; font-weight: 600; display: flex; justify-content: space-between; align-items: center;';
                banner.innerHTML = `
                    <span>🚨 Today's quota is finished. Your API will return errors until you upgrade or until tomorrow.</span>
                    <button onclick="switchDashTab('pricing')" class="btn btn-primary" style="padding: 0.5rem 1rem;">Upgrade Now</button>
                `;
                usageTab.insertBefore(banner, usageTab.children[1]); // Insert after header
            }
        }
    } catch (err) {
        console.error('Failed to fetch usage data', err);
    }
    
    // Also fetch history
    fetchUsageHistory(apiKey);
}

// Global state for history filtering
window.usageHistoryData = [];
window.showingErrorsOnly = false;

async function fetchUsageHistory(apiKey) {
    try {
        const res = await fetch('/api/v1/usage/history', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const data = await res.json();
        
        if (data.status === 'success') {
            window.usageHistoryData = data.data || [];
            renderUsageHistoryTable();
        }
    } catch (err) {
        console.error('Failed to fetch usage history', err);
    }
}

function renderUsageHistoryTable() {
    const tbody = document.getElementById('usage-history-body');
    if (!tbody) return;

    let displayData = window.usageHistoryData;
    
    // Filter if errors only is active
    if (window.showingErrorsOnly) {
        displayData = displayData.filter(log => log.status_code >= 400);
    }

    if (displayData.length === 0) {
        if (window.showingErrorsOnly) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 1rem; text-align: center; color: var(--text-secondary);">No errors found! You have a perfect record.</td></tr>';
        } else {
            tbody.innerHTML = '<tr><td colspan="4" style="padding: 1rem; text-align: center; color: var(--text-secondary);">No requests found. Start making API calls!</td></tr>';
        }
        return;
    }
    
    let html = '';
    displayData.forEach(log => {
        const date = new Date(log.created_at).toLocaleString();
        
        let statusBadge = '<span style="color: #94a3b8;">N/A</span>';
        if (log.status_code) {
            if (log.status_code >= 400) {
                statusBadge = `<span style="color: #ef4444; font-weight: 600;">${log.status_code}</span>`;
            } else {
                statusBadge = `<span style="color: #10b981; font-weight: 600;">${log.status_code}</span>`;
            }
        }
        
        html += `<tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 0.75rem; font-size: 0.875rem;">${date}</td>
                    <td style="padding: 0.75rem; font-family: monospace; font-size: 0.875rem; color: var(--accent-color);">${log.endpoint}</td>
                    <td style="padding: 0.75rem; font-size: 0.875rem;">${statusBadge}</td>
                    <td style="padding: 0.75rem; font-size: 0.875rem; color: var(--text-secondary);">${log.ip_address || 'Unknown'}</td>
                 </tr>`;
    });
    tbody.innerHTML = html;
}

function toggleErrorFilter() {
    window.showingErrorsOnly = !window.showingErrorsOnly;
    
    const errorsCard = document.getElementById('errors-card');
    if (window.showingErrorsOnly) {
        errorsCard.style.background = '#fef2f2';
        errorsCard.style.borderColor = '#fecaca';
    } else {
        errorsCard.style.background = '';
        errorsCard.style.borderColor = '';
    }
    
    renderUsageHistoryTable();
}

// API Calls
async function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('regBtn');
    btn.textContent = 'Creating...';
    btn.disabled = true;

    try {
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;
        const fullName = document.getElementById('regName').value;

        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email, 
                password, 
                full_name: fullName, 
                cf_token: document.querySelector('#registerModal [name="cf-turnstile-response"]')?.value || '' 
            })
        });

        const data = await res.json();
        if (data.status === 'success') {
            const errDiv = document.getElementById('regError');
            errDiv.style.color = '#065f46';
            errDiv.style.background = '#d1fae5';
            errDiv.style.borderColor = '#a7f3d0';
            errDiv.textContent = data.message || 'Account created successfully! Please check your email to verify.';
            errDiv.style.display = 'block';
            
            setTimeout(() => {
                closeModal('registerModal');
                openModal('loginModal');
                document.getElementById('loginEmail').value = email;
            }, 5000);
        } else {
            showError('reg', data.message || 'Registration failed');
        }
    } catch (err) {
        showError('reg', 'Network error. Please try again.');
    } finally {
        btn.textContent = 'Get API Key';
        btn.disabled = false;
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    btn.textContent = 'Signing in...';
    btn.disabled = true;

    const turnstileToken = document.querySelector('#loginModal [name="cf-turnstile-response"]')?.value || '';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('loginEmail').value,
                password: document.getElementById('loginPassword').value,
                cf_token: turnstileToken
            })
        });

        const data = await res.json();
        if (data.status === 'success') {
            localStorage.setItem('cs_user', JSON.stringify(data.data));
            localStorage.setItem('active_dash_tab', 'overview');
            closeModal('loginModal');
            
            // Auto-redirect admins to the secure portal
            if (data.data.role === 'admin') {
                window.location.href = '/adhikari.html';
                return;
            }
            
            checkAuth();
        } else {
            showError('login', data.message || 'Login failed');
        }
    } catch (err) {
        showError('login', 'Network error. Please try again.');
    } finally {
        btn.textContent = 'Sign In';
        btn.disabled = false;
    }
}

// Init
window.onload = checkAuth;


// Settings Handlers
async function saveSettings(isActive = true) {
    const user = JSON.parse(localStorage.getItem('cs_user'));
    if (!user || !user.api_key) return;

    const fullName = document.getElementById('settings-input-name').value;
    const alertUsage = document.getElementById('settings-alert-usage').checked;
    const alertUpdates = document.getElementById('settings-alert-updates').checked;

    try {
        const res = await fetch('/api/v1/auth/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.api_key}`
            },
            body: JSON.stringify({
                full_name: fullName,
                alert_usage: alertUsage,
                alert_updates: alertUpdates,
                is_active: isActive
            })
        });

        const data = await res.json();
        if (res.ok && data.status === 'success') {
            // Merge updated user data into local storage
            const updatedUser = { ...user, ...data.user };
            localStorage.setItem('cs_user', JSON.stringify(updatedUser));
            
            if (isActive) {
                populateDashboard(updatedUser);
                const btn = event.target;
                const originalText = btn.textContent;
                btn.textContent = 'Saved!';
                btn.style.background = '#10b981';
                btn.style.borderColor = '#10b981';
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.style.background = '';
                    btn.style.borderColor = '';
                }, 2000);
            }
        } else {
            showError('settings', data.message || 'Failed to update settings');
        }
    } catch (err) {
        console.error(err);
    }
}

async function deactivateAccount() {
    if (confirm('Are you sure you want to deactivate your account? All API keys will stop working immediately.')) {
        await saveSettings(false); // save with is_active = false
        // Log out immediately
        localStorage.removeItem('cs_user');
        window.location.reload();
    }
}


// Dynamic Domain Replacer for Docs/Code blocks
document.addEventListener('DOMContentLoaded', () => {
    const origin = window.location.origin;
    if (origin.includes('localhost')) return; // keep localhost if testing locally
    
    document.querySelectorAll('pre code').forEach(block => {
        if (block.innerHTML.includes('http://localhost:3000')) {
            block.innerHTML = block.innerHTML.replace(/http:\/\/localhost:3000/g, origin);
        }
    });
});
// --- Password Reset ----------------------------------------------
async function handleForgotPassword(e) {
    e.preventDefault();
    const btn = document.getElementById('forgotBtn');
    const err = document.getElementById('forgotError');
    const email = document.getElementById('forgotEmail').value;
    
    btn.textContent = 'Sending...';
    btn.disabled = true;
    err.textContent = '';
    
    try {
        const res = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        
        if (data.status === 'success') {
            document.getElementById('forgotPasswordForm').innerHTML = '<div style="color:var(--success); text-align:center; padding: 20px;">' + data.message + '</div>';
        } else {
            err.textContent = data.message;
        }
    } catch (e) {
        err.textContent = 'Network error. Please try again.';
    }
}

async function toggleEmailSubscription(checkbox) {
    const user = JSON.parse(localStorage.getItem('cs_user'));
    if (!user || !user.api_key) return;

    try {
        const res = await fetch('/api/auth/toggle-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${user.api_key}`
            },
            body: JSON.stringify({ is_unsubscribed: !checkbox.checked })
        });
        const data = await res.json();
        if (data.status === 'success') {
            user.email_unsubscribed = !checkbox.checked;
            localStorage.setItem('cs_user', JSON.stringify(user));
        } else {
            checkbox.checked = !checkbox.checked; // Revert on failure
            alert(data.message || 'Failed to update preferences.');
        }
    } catch (err) {
        checkbox.checked = !checkbox.checked; // Revert on failure
        console.error('Network error', err);
    }
}

async function handleResetPassword(e) {
    e.preventDefault();
    const btn = document.getElementById('resetBtn');
    const err = document.getElementById('resetError');
    const token = document.getElementById('resetToken').value;
    const newPassword = document.getElementById('resetNewPassword').value;
    
    btn.textContent = 'Resetting...';
    btn.disabled = true;
    err.textContent = '';
    
    try {
        const res = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, newPassword })
        });
        const data = await res.json();
        
        if (data.status === 'success') {
            document.getElementById('resetPasswordForm').innerHTML = '<div style="color:var(--success); text-align:center; padding: 20px;">' + data.message + '</div>';
            setTimeout(() => {
                closeModal('resetPasswordModal');
                openModal('loginModal');
            }, 3000);
        } else {
            err.textContent = data.message;
        }
    } catch (e) {
        err.textContent = 'Network error. Please try again.';
    }
    btn.textContent = 'Reset Password';
    btn.disabled = false;
}

// --- URL Param Checking on Load --------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('reset');
    if (resetToken) {
        document.getElementById('resetToken').value = resetToken;
        openModal('resetPasswordModal');
        // Clean URL without reloading page
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});
