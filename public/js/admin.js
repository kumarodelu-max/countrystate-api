// ═══════════════════════════════════════════════════════
//  CountryState Admin JS
// ═══════════════════════════════════════════════════════

const adminUser = JSON.parse(localStorage.getItem('cs_user'));
const currentApiKey = adminUser
    ? (adminUser.api_keys && adminUser.api_keys.length > 0
        ? adminUser.api_keys[0].key_value
        : adminUser.api_key)
    : null;

if (!adminUser || !currentApiKey) {
    alert('Please log in from the main app first.');
    window.location.href = '/';
    throw new Error('Not authenticated'); // Stop ALL further script execution
}

// Show admin name in nav
const nameEl = document.getElementById('admin-name-display');
if (nameEl) nameEl.textContent = (adminUser && adminUser.full_name) ? adminUser.full_name : (adminUser ? adminUser.email : '');

const authHeaders = {
    'Authorization': `Bearer ${currentApiKey}`,
    'Content-Type': 'application/json'
};

// ─── State ────────────────────────────────────────────
let usersPage   = 1;
const usersLimit = 15;
let usersSearch = '';
let usersSearchTimer = null;

let allPlans = [];
let dynamicPlanLimits = {};

// ─── Init ─────────────────────────────────────────────
window.onload = async () => {
    await fetchPlans();
    await fetchUsers();

    // ── Auto-calc: Edit Plan modal (daily × 30 → monthly) ──
    const epDaily   = document.getElementById('edit-plan-daily');
    const epMonthly = document.getElementById('edit-plan-monthly');
    if (epDaily && epMonthly) {
        epDaily.addEventListener('input', () => {
            const d = parseInt(epDaily.value);
            if (!isNaN(d) && d >= 0) epMonthly.value = d * 30;
        });
    }

    // ── Auto-calc: New Plan modal (daily × 30 → monthly) ──
    const npDaily   = document.getElementById('np-daily');
    const npMonthly = document.getElementById('np-monthly');
    if (npDaily && npMonthly) {
        npDaily.addEventListener('input', () => {
            const d = parseInt(npDaily.value);
            if (!isNaN(d) && d >= 0) npMonthly.value = d * 30;
        });
    }
};

// ═══════════════════════════════════════════════════════
//  TABS
// ═══════════════════════════════════════════════════════
function switchTab(id) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelector(`.tab-btn[onclick="switchTab('${id}')"]`).classList.add('active');
    document.getElementById('tab-' + id).classList.add('active');
}

// ═══════════════════════════════════════════════════════
//  MODALS
// ═══════════════════════════════════════════════════════
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ═══════════════════════════════════════════════════════
//  USERS – Fetch & Render
// ═══════════════════════════════════════════════════════
async function fetchUsers() {
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = `<tr><td colspan="8" class="empty">Loading…</td></tr>`;

    const params = new URLSearchParams({ page: usersPage, limit: usersLimit });
    if (usersSearch) params.set('search', usersSearch);

    try {
        const res  = await fetch(`/api/admin/users?${params}`, { headers: authHeaders });
        const data = await res.json();

        if (res.status === 403) { alert('Access Denied.'); window.location.href = '/'; return; }
        if (data.status !== 'success') { tbody.innerHTML = `<tr><td colspan="8" class="empty">Error loading users.</td></tr>`; return; }

        renderUsers(data.data);
        renderUserPagination(data.pagination);
        updateStats(data.data, data.pagination.total);
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty">Network error. Check server.</td></tr>`;
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('users-tbody');
    if (!users.length) { tbody.innerHTML = `<tr><td colspan="8" class="empty">No users found.</td></tr>`; return; }

    tbody.innerHTML = users.map(u => {
        const plan  = u.plan || 'free';
        const usage = parseInt(u.used_today) || 0;
        const lim   = parseInt(u.daily_limit) || 100;
        const pct   = Math.min(100, Math.round((usage / lim) * 100));
        const usageColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#4ade80';
        const joined = u.created_at ? new Date(u.created_at).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' }) : '–';

        return `<tr>
            <td>
                <strong style="color:#0f172a;">${escHtml(u.full_name || '–')}</strong><br>
                <span class="badge ${u.role === 'admin' ? 'adm' : ''}" style="margin-top:2px;">${u.role === 'admin' ? 'Admin' : 'User'}</span>
            </td>
            <td style="color:#475569;">${escHtml(u.email)}</td>
            <td><span class="badge ${plan}">${plan}</span></td>
            <td>
                <span style="color:${usageColor}; font-weight:700;">${usage}</span>
                <span style="color:#475569;"> / ${lim}</span>
            </td>
            <td style="color:#334155;">${lim.toLocaleString()}</td>
            <td><span class="badge ${u.user_active ? 'active' : 'inactive'}">${u.user_active ? 'Active' : 'Suspended'}</span></td>
            <td style="color:#475569; font-size:0.78rem;">${joined}</td>
            <td>
                <button class="btn-outline-sm" onclick="openLogsModal('${u.id}')">History</button>
                <button class="btn-outline-sm" onclick="openEditModal('${u.id}','${plan}',${lim},${u.user_active},'${u.role}')">Edit</button>
            </td>
        </tr>`;
    }).join('');
}

function renderUserPagination({ page, totalPages, total, limit }) {
    const container = document.getElementById('users-pagination');
    if (!container) return;

    const start = ((page - 1) * limit) + 1;
    const end   = Math.min(page * limit, total);

    let btns = '';
    // Prev
    btns += `<button class="page-btn" onclick="goUsersPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹ Prev</button>`;

    // Smart page window
    const delta = 2;
    const pages = [];
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) pages.push(i);
    if (pages[0] > 1)             { btns += `<button class="page-btn" onclick="goUsersPage(1)">1</button>`; if (pages[0] > 2) btns += `<span style="color:#475569; padding:0 0.25rem;">…</span>`; }
    pages.forEach(p => { btns += `<button class="page-btn ${p === page ? 'cur' : ''}" onclick="goUsersPage(${p})">${p}</button>`; });
    if (pages[pages.length-1] < totalPages) { if (pages[pages.length-1] < totalPages - 1) btns += `<span style="color:#475569; padding:0 0.25rem;">…</span>`; btns += `<button class="page-btn" onclick="goUsersPage(${totalPages})">${totalPages}</button>`; }

    // Next
    btns += `<button class="page-btn" onclick="goUsersPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>Next ›</button>`;

    container.innerHTML = `
        <span class="page-info">Showing ${start}–${end} of ${total} users</span>
        <div class="page-btns">${btns}</div>
    `;
}

function goUsersPage(p) { usersPage = p; fetchUsers(); }

function onUserSearch(val) {
    clearTimeout(usersSearchTimer);
    usersSearchTimer = setTimeout(() => {
        usersSearch = val.trim();
        usersPage   = 1;
        fetchUsers();
    }, 350);
}

function updateStats(users, total) {
    document.getElementById('stat-users').textContent = total || users.length;
    let calls = 0, paid = 0;
    users.forEach(u => { calls += parseInt(u.used_today) || 0; if (u.plan && u.plan !== 'free') paid++; });
    document.getElementById('stat-calls').textContent = calls;
    document.getElementById('stat-paid').textContent  = paid;
}

// ═══════════════════════════════════════════════════════
//  EDIT USER
// ═══════════════════════════════════════════════════════
let editingUserId = null;

function openEditModal(userId, plan, limit, isActive, role) {
    editingUserId = userId;
    document.getElementById('edit-userId').value  = userId;
    document.getElementById('edit-limit').value   = limit;
    document.getElementById('edit-role').value    = role || 'user';
    document.getElementById('edit-active').value  = isActive.toString();

    // Repopulate plan dropdown then set value
    populatePlanDropdown('edit-plan', plan);

    document.getElementById('edit-promo-message').value = '';
    document.getElementById('edit-promo-type').value    = 'promo';
    openModal('editModal');
}

async function saveUser(e) {
    e.preventDefault();
    const userId  = document.getElementById('edit-userId').value;
    const plan    = document.getElementById('edit-plan').value;
    const limit   = parseInt(document.getElementById('edit-limit').value);
    const isActive= document.getElementById('edit-active').value === 'true';
    const role    = document.getElementById('edit-role').value;

    try {
        const res  = await fetch(`/api/admin/users/${userId}/limit`, {
            method: 'PUT', headers: authHeaders,
            body: JSON.stringify({ plan, daily_limit: limit, is_active: isActive, role })
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            closeModal('editModal');
            fetchUsers();
        } else {
            alert('Failed: ' + (data.message || 'Unknown error'));
        }
    } catch (err) { alert('Network error.'); }
}

// ═══════════════════════════════════════════════════════
//  CREATE USER
// ═══════════════════════════════════════════════════════
async function createUser(e) {
    e.preventDefault();
    const btn = e.submitter;
    if (btn) { btn.textContent = 'Creating…'; btn.disabled = true; }

    const body = {
        full_name  : document.getElementById('nu-name').value,
        email      : document.getElementById('nu-email').value,
        password   : document.getElementById('nu-password').value,
        plan       : document.getElementById('nu-plan').value,
        role       : document.getElementById('nu-role').value,
        daily_limit: parseInt(document.getElementById('nu-limit').value) || undefined
    };

    try {
        const res  = await fetch('/api/admin/users', {
            method: 'POST', headers: authHeaders, body: JSON.stringify(body)
        });
        const data = await res.json();

        if (res.ok && data.status === 'success') {
            alert(`✅ User created!\nEmail: ${data.data.email}\nAPI Key: ${data.data.api_key}`);
            closeModal('newUserModal');
            e.target.reset();
            usersPage = 1;
            fetchUsers();
        } else {
            alert('Failed: ' + (data.message || 'Unknown error'));
        }
    } catch (err) { alert('Network error.'); }
    finally { if (btn) { btn.textContent = 'Create User'; btn.disabled = false; } }
}

function autoFillNewUserLimit(planCode) {
    if (dynamicPlanLimits[planCode] !== undefined) {
        document.getElementById('nu-limit').value = dynamicPlanLimits[planCode];
    }
}

// ═══════════════════════════════════════════════════════
//  PLANS – Fetch & Render
// ═══════════════════════════════════════════════════════
async function fetchPlans() {
    try {
        const res  = await fetch('/api/admin/plans', { headers: authHeaders });
        const data = await res.json();

        if (data.status === 'success') {
            allPlans = data.data;
            dynamicPlanLimits = {};
            data.data.forEach(p => { dynamicPlanLimits[p.code] = p.daily_limit; });

            // Populate dropdowns
            populatePlanDropdown('edit-plan');
            populatePlanDropdown('nu-plan');

            renderPlans(data.data);

            const activeCnt = data.data.filter(p => p.is_active).length;
            document.getElementById('stat-plans').textContent = activeCnt;
        }
    } catch (err) { console.error('Failed to fetch plans', err); }
}

function populatePlanDropdown(selectId, selectedValue) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = allPlans
        .filter(p => p.is_active)
        .map(p => `<option value="${p.code}" ${p.code === selectedValue ? 'selected' : ''}>${p.name}</option>`)
        .join('');
}

function renderPlans(plans) {
    const tbody = document.getElementById('plans-tbody');
    if (!tbody) return;
    if (!plans.length) { tbody.innerHTML = `<tr><td colspan="8" class="empty">No plans found.</td></tr>`; return; }

    tbody.innerHTML = plans.map(p => `
        <tr>
            <td><strong style="color:#0f172a;">${escHtml(p.name)}</strong></td>
            <td><code style="background:#f8fafc; padding:0.15rem 0.5rem; border-radius:0.3rem; font-size:0.78rem; border:1px solid rgba(0,0,0,0.1); color:#475569;">${p.code}</code></td>
            <td style="color:#2563eb; font-weight:700;">${parseInt(p.daily_limit).toLocaleString()}</td>
            <td style="color:#475569;">${parseInt(p.monthly_limit).toLocaleString()}</td>
            <td style="color:#16a34a;">${parseFloat(p.price_monthly) === 0 ? 'Free' : '$' + parseFloat(p.price_monthly).toFixed(2)}</td>
            <td style="color:#475569;">${parseFloat(p.price_yearly) === 0 ? '–' : '$' + parseFloat(p.price_yearly).toFixed(2)}</td>
            <td><span class="badge ${p.is_active ? 'active' : 'inactive'}">${p.is_active ? 'Active' : 'Disabled'}</span></td>
            <td><button class="btn-outline-sm" onclick="openPlanModal('${p.id}')">Edit</button></td>
        </tr>
    `).join('');
}

// ═══════════════════════════════════════════════════════
//  EDIT PLAN
// ═══════════════════════════════════════════════════════
function openPlanModal(planId) {
    const p = allPlans.find(x => x.id == planId);
    if (!p) return;
    document.getElementById('edit-plan-id').value      = p.id;
    document.getElementById('edit-plan-daily').value   = p.daily_limit;
    document.getElementById('edit-plan-monthly').value = p.monthly_limit;
    document.getElementById('edit-plan-pm').value      = p.price_monthly;
    document.getElementById('edit-plan-py').value      = p.price_yearly;
    document.getElementById('edit-plan-active').value  = p.is_active.toString();
    openModal('editPlanModal');
}

async function savePlan(e) {
    e.preventDefault();
    const planId = document.getElementById('edit-plan-id').value;
    const body   = {
        daily_limit   : parseInt(document.getElementById('edit-plan-daily').value),
        monthly_limit : parseInt(document.getElementById('edit-plan-monthly').value),
        price_monthly : parseFloat(document.getElementById('edit-plan-pm').value),
        price_yearly  : parseFloat(document.getElementById('edit-plan-py').value),
        is_active     : document.getElementById('edit-plan-active').value === 'true'
    };

    const saveBtn = e.target.querySelector('[type="submit"]');
    if (saveBtn) { saveBtn.textContent = 'Saving…'; saveBtn.disabled = true; }

    try {
        const res  = await fetch(`/api/admin/plans/${planId}`, {
            method: 'PUT', headers: authHeaders, body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.status === 'success') {
            closeModal('editPlanModal');
            fetchPlans();
        } else {
            alert('Save failed: ' + (data.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('savePlan fetch error:', err);
        alert('Network error — server may be restarting. Please refresh and try again.');
    } finally {
        if (saveBtn) { saveBtn.textContent = 'Save Plan'; saveBtn.disabled = false; }
    }
}

// ═══════════════════════════════════════════════════════
//  CREATE PLAN
// ═══════════════════════════════════════════════════════
async function createPlan(e) {
    e.preventDefault();
    const btn = e.submitter;
    if (btn) { btn.textContent = 'Creating…'; btn.disabled = true; }

    const body = {
        code         : document.getElementById('np-code').value.trim().toLowerCase(),
        name         : document.getElementById('np-name').value.trim(),
        daily_limit  : parseInt(document.getElementById('np-daily').value),
        monthly_limit: parseInt(document.getElementById('np-monthly').value),
        price_monthly: parseFloat(document.getElementById('np-pm').value) || 0,
        price_yearly : parseFloat(document.getElementById('np-py').value) || 0,
    };

    try {
        const res  = await fetch('/api/admin/plans', {
            method: 'POST', headers: authHeaders, body: JSON.stringify(body)
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            alert('✅ Plan created!');
            closeModal('newPlanModal');
            e.target.reset();
            fetchPlans();
        } else {
            alert('Failed: ' + (data.message || 'Unknown error'));
        }
    } catch (err) { alert('Network error.'); }
    finally { if (btn) { btn.textContent = 'Create Plan'; btn.disabled = false; } }
}

// ═══════════════════════════════════════════════════════
//  PROMOS
// ═══════════════════════════════════════════════════════
async function sendTargetedPromo() {
    if (!editingUserId) return;
    const message = document.getElementById('edit-promo-message').value;
    const type    = document.getElementById('edit-promo-type').value;
    if (!message) return alert('Message is required!');

    try {
        const res  = await fetch(`/api/admin/users/${editingUserId}/promos`, {
            method: 'POST', headers: authHeaders, body: JSON.stringify({ message, type })
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
            alert('✅ Promo sent to user!');
            document.getElementById('edit-promo-message').value = '';
        } else {
            alert('Failed: ' + (data.message || 'Unknown error'));
        }
    } catch (err) { alert('Network error.'); }
}

// Auto-fill limit when plan changes in Edit User modal
// (Attached inside window.onload to guarantee element exists)
const _editPlanSel = document.getElementById('edit-plan');
if (_editPlanSel) {
    _editPlanSel.addEventListener('change', function () {
        const lim = dynamicPlanLimits[this.value];
        if (lim !== undefined) document.getElementById('edit-limit').value = lim;
    });
}

// ═══════════════════════════════════════════════════════
//  Util
// ═══════════════════════════════════════════════════════
function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════
//  USAGE LOGS
// ═══════════════════════════════════════════════════════
let currentLogsUserId = null;
let currentLogsPeriod = '30d';
let currentLogsPage   = 1;

function openLogsModal(userId) {
    currentLogsUserId = userId;
    currentLogsPeriod = '30d';
    currentLogsPage   = 1;
    
    // Reset UI
    const userInfoEl = document.getElementById('logs-user-info');
    if (userInfoEl) userInfoEl.textContent = 'Loading...';
    
    document.querySelectorAll('.log-period-btn').forEach(b => b.classList.remove('active'));
    const defaultPeriodBtn = document.querySelector(`.log-period-btn[onclick="setLogPeriod('30d')"]`);
    if (defaultPeriodBtn) defaultPeriodBtn.classList.add('active');
    
    const tbody = document.getElementById('logs-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty">Loading...</td></tr>';
    
    const lt = document.getElementById('logs-total-lifetime');
    const dl = document.getElementById('logs-daily-limit');
    const fc = document.getElementById('logs-first-call');
    const pg = document.getElementById('logs-pagination');
    
    if (lt) lt.textContent = '-';
    if (dl) dl.textContent = '-';
    if (fc) fc.textContent = '-';
    if (pg) pg.innerHTML = '';
    
    openModal('logsModal');
    fetchUserLogs();
}

function setLogPeriod(period) {
    currentLogsPeriod = period;
    currentLogsPage = 1;
    document.querySelectorAll('.log-period-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.log-period-btn[onclick="setLogPeriod('${period}')"]`);
    if (btn) btn.classList.add('active');
    fetchUserLogs();
}

async function fetchUserLogs(page = currentLogsPage) {
    if (!currentLogsUserId) return;
    currentLogsPage = page;
    
    const tbody = document.getElementById('logs-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty">Loading...</td></tr>';
    
    try {
        const res = await fetch(`/api/admin/users/${currentLogsUserId}/logs?period=${currentLogsPeriod}&page=${page}`, {
            headers: authHeaders
        });
        const data = await res.json();
        
        if (data.status === 'success') {
            const user = data.user;
            if (!user) {
                if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty">No active API key found for this user.</td></tr>';
                return;
            }
            
            const userInfoEl = document.getElementById('logs-user-info');
            if (userInfoEl) userInfoEl.textContent = `${user.full_name || 'No Name'} (${user.email}) — ${user.plan.toUpperCase()} Plan`;
            
            const lt = document.getElementById('logs-total-lifetime');
            if (lt) lt.textContent = (data.summary.total_calls_lifetime || 0).toLocaleString();
            
            const dl = document.getElementById('logs-daily-limit');
            if (dl) dl.textContent = (user.daily_limit || 0).toLocaleString();
            
            const fc = document.getElementById('logs-first-call');
            if (fc) {
                const firstCall = data.summary.first_call ? new Date(data.summary.first_call).toLocaleDateString() : '-';
                fc.textContent = firstCall;
            }
            
            const logs = data.data;
            if (!logs || !logs.length) {
                if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="empty">No API calls found for this period.</td></tr>';
            } else if (tbody) {
                tbody.innerHTML = logs.map(l => {
                    const dt = new Date(l.day).toLocaleDateString('en-IN', { month:'short', day:'numeric', year:'numeric', timeZone: 'UTC' });
                    const calls = parseInt(l.calls) || 0;
                    const lim = parseInt(user.daily_limit) || 100;
                    const pct = Math.min(100, Math.round((calls / lim) * 100));
                    const color = pct >= 100 ? '#ef4444' : (pct >= 80 ? '#f59e0b' : '#3b82f6');
                    
                    return `
                    <tr>
                        <td style="color:#0f172a; font-weight:500;">${dt}</td>
                        <td style="font-weight:700; color:${color};">${calls.toLocaleString()}</td>
                        <td style="color:#475569; font-size:0.8rem;">/ ${lim.toLocaleString()} (${pct}%)</td>
                        <td style="width:100px;">
                            <div style="background:#e2e8f0; height:6px; border-radius:3px; overflow:hidden;">
                                <div style="background:${color}; height:100%; width:${pct}%;"></div>
                            </div>
                        </td>
                    </tr>
                    `;
                }).join('');
            }
            
            renderLogsPagination(data.pagination);
        } else {
            if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="empty">Error: ${data.message}</td></tr>`;
        }
    } catch (err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="empty">Network error.</td></tr>`;
    }
}

function renderLogsPagination({ page, totalPages }) {
    const container = document.getElementById('logs-pagination');
    if (!container) return;
    
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    
    let html = '';
    html += `<button class="btn-sm" ${page === 1 ? 'disabled' : ''} onclick="fetchUserLogs(${page - 1})">Prev</button>`;
    html += `<span style="color:#94a3b8; font-size:0.85rem; padding:0 0.5rem;">Page ${page} of ${totalPages}</span>`;
    html += `<button class="btn-sm" ${page === totalPages ? 'disabled' : ''} onclick="fetchUserLogs(${page + 1})">Next</button>`;
    
    container.innerHTML = html;
}
