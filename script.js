// Configuration
const CONFIG = {
    SHEET_ID: '1SGc80isz0VRVt447R_q-fBdZ_me52H_Z32W5HauHMWQ',
    API_KEY: 'AIzaSyC9JSD6VWXMQ7Pe8VPf-gIlNUtcwQhkG1o', // It is strongly recommended to move this to a secure backend.
    CLIENT_ID: '254093944424-mfvk48avc9n86de6jit9oai7kqrsr2f7.apps.googleusercontent.com', // IMPORTANT: REPLACE WITH YOUR CLIENT ID
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    SHEET_NAME: '2025'
};

// Global variables
let allTickets = [];
let filteredTickets = [];
let charts = {};
let tokenClient;
let gapiInited = false;
let gisInited = false;
let isSubmitting = false; 
const rowsPerPage = 10;
let currentPage = 1;

// --- DOM Elements ---
const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');
const loading = document.getElementById('loading');
const dashboardContent = document.getElementById('dashboard-content');
const detailsModal = document.getElementById('modal');
const detailsModalBody = document.getElementById('modalBody');
const modifyModal = document.getElementById('modifyModal');
const modifyModalBody = document.getElementById('modifyModalBody');
const toast = document.getElementById('toast');
const authorizeButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');

// --- INITIALIZATION ---
window.onload = async () => {
    initializeDatepickers();
    setupEventListeners();
    initializeBackgroundChanger();
    if (typeof gapi === 'undefined' || !google.accounts) { showToast('Google API scripts not loaded.', 'error'); return; }
    try {
        await Promise.all([loadGapiClient(), loadGisClient()]);
    } catch (error) {
        showToast('Failed to load Google APIs. Please refresh.', 'error');
    }
};

function initializeDatepickers() {
    const options = { format: 'mm/dd/yyyy', autohide: true, todayHighlight: true };
    ['searchDate', 'issued_date', 'departing_on', 'paid_date'].forEach(id => {
        const el = document.getElementById(id);
        if (el) new Datepicker(el, options);
    });
}

async function loadGapiClient() {
    return new Promise((resolve, reject) => {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({ apiKey: CONFIG.API_KEY, discoveryDocs: [CONFIG.DISCOVERY_DOC] });
                gapiInited = true; maybeEnableButtons(); resolve();
            } catch (error) { reject(error); }
        });
    });
}

async function loadGisClient() {
    return new Promise((resolve, reject) => {
        try {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID, scope: CONFIG.SCOPES, callback: '', 
            });
            gisInited = true; maybeEnableButtons(); resolve();
        } catch (error) { reject(error); }
    });
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        authorizeButton.style.display = 'block';
        loading.style.display = 'none';
    }
}

async function initializeApp() {
    await loadTicketData();
}

// --- AUTHENTICATION ---
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error) { showToast('Authentication failed.', 'error'); throw (resp); }
        gapi.client.setToken(resp); 
        authorizeButton.style.display = 'none';
        signoutButton.style.display = 'block';
        await initializeApp();
    };
    if (gapi.client.getToken() === null) tokenClient.requestAccessToken({ prompt: 'consent' });
    else tokenClient.requestAccessToken({ prompt: '' });
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        authorizeButton.style.display = 'block';
        signoutButton.style.display = 'none';
        dashboardContent.style.display = 'none';
        loading.style.display = 'block';
        allTickets = [];
        document.getElementById('resultsBody').innerHTML = '';
    }
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    navBtns.forEach(btn => btn.addEventListener('click', (e) => showView(e.currentTarget.dataset.view)));
    authorizeButton.addEventListener('click', handleAuthClick);
    signoutButton.addEventListener('click', handleSignoutClick);
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('clearBtn').addEventListener('click', clearSearch);
    document.getElementById('sellForm').addEventListener('submit', handleSellTicket);
    document.getElementById('base_fare').addEventListener('input', calculateCommission);
    document.getElementById('extra_fare').addEventListener('input', calculateCommission);
    document.getElementById('findTicketBtn').addEventListener('click', findTicketForModify);
    document.getElementById('findCancelBtn').addEventListener('click', () => showToast('Cancel functionality not yet implemented.', 'info'));
    
    modifyModal.querySelector('.close').addEventListener('click', () => modifyModal.style.display = "none");
    window.addEventListener('click', (event) => {
        if (event.target == detailsModal) detailsModal.style.display = "none";
        if (event.target == modifyModal) modifyModal.style.display = "none";
    });
}

// --- CORE APP LOGIC ---
async function loadTicketData() {
    try {
        loading.style.display = 'block';
        dashboardContent.style.display = 'none';
        const response = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: CONFIG.SHEET_ID, range: `${CONFIG.SHEET_NAME}!A:S` });
        
        if (response.result.values && response.result.values.length > 1) {
            allTickets = parseTicketData(response.result.values);
            updateDashboardData();
            displayAllTickets();
        }
        loading.style.display = 'none';
        dashboardContent.style.display = 'flex';
    } catch (error) {
        showToast(`Error loading data: ${error.result?.error?.message || error}`, 'error');
        loading.style.display = 'none';
    }
}

function parseTicketData(values) {
    const headers = values[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    return values.slice(1).map((row, i) => {
        const ticket = {};
        headers.forEach((h, j) => ticket[h] = row[j] || '');
        const safeParse = (val) => parseFloat(String(val).replace(/,/g, '')) || 0;
        ['base_fare', 'net_amount', 'commission'].forEach(key => ticket[key] = safeParse(ticket[key]));
        ticket.paid = ticket.paid === 'TRUE';
        ticket.rowIndex = i + 2;
        return ticket;
    });
}

// --- BACKGROUND CHANGER ---
function initializeBackgroundChanger() {
    const uploader = document.getElementById('background-uploader');
    const uploadBtn = document.getElementById('background-upload-btn');
    const resetBtn = document.getElementById('background-reset-btn');
    uploadBtn.addEventListener('click', () => uploader.click());
    uploader.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageUrl = e.target.result;
                document.body.style.backgroundImage = `url(${imageUrl})`;
                localStorage.setItem('customBackground', imageUrl);
                showToast('Background updated!', 'success');
            };
            reader.readAsDataURL(file);
        }
    });
    resetBtn.addEventListener('click', () => {
        localStorage.removeItem('customBackground');
        document.body.style.backgroundImage = `url('https://images.unsplash.com/photo-1550684376-efcbd6e3f031?q=80&w=2970&auto=format&fit=crop')`;
        showToast('Background reset.', 'info');
    });
    const savedBg = localStorage.getItem('customBackground');
    if (savedBg) document.body.style.backgroundImage = `url(${savedBg})`;
}

// --- UI & DISPLAY ---
function showView(viewName) {
    navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
    views.forEach(view => view.classList.toggle('active', view.id === `${viewName}-view`));
    if (viewName === 'sell') document.getElementById('sellForm').reset();
}

function displayAllTickets() {
    const sorted = [...allTickets].sort((a, b) => parseSheetDate(b.issued_date) - parseSheetDate(a.issued_date) || b.rowIndex - a.rowIndex);
    filteredTickets = sorted;
    displayTickets(filteredTickets, 1);
}

function displayTickets(tickets, page = 1) {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = ''; currentPage = page;
    const paginated = tickets.slice((page - 1) * rowsPerPage, page * rowsPerPage);
    paginated.forEach((ticket) => {
        const row = tbody.insertRow();
        row.innerHTML = `<td>${ticket.issued_date||''}</td><td>${ticket.name||''}</td><td>${ticket.booking_reference||''}</td><td>${(ticket.departure||'').split(' ')[0]}→${(ticket.destination||'').split(' ')[0]}</td><td>${ticket.airline||''}</td><td><button class="btn btn-secondary" style="padding:0.5rem 1rem;" onclick="showDetails(${ticket.rowIndex})">Details</button></td>`;
    });
    setupPagination(tickets);
}

function closeDetailsModal() { document.getElementById('modal').style.display = 'none'; }

// THE FIX: Restored detailed view from original script
function showDetails(rowIndex) {
    const ticket = allTickets.find(t => t.rowIndex === rowIndex);
    if (ticket) {
        const statusHtml = ticket.canceled ? `<p><strong>Status:</strong> <span class="status-badge canceled">Canceled</span></p>` : '';
        detailsModalBody.innerHTML = `
            <h3>Client & Booking Details</h3>
            <p><strong>Name:</strong> ${ticket.name || 'N/A'}</p>
            <p><strong>Phone:</strong> ${makeClickable(ticket.phone)}</p>
            <p><strong>Account Name:</strong> ${ticket.account_name || 'N/A'}</p>
            <p><strong>Account Type:</strong> ${ticket.account_type || 'N/A'}</p>
            <p><strong>Account Link:</strong> ${makeClickable(ticket.account_link) || 'N/A'}</p>
            <hr style="border-color: rgba(255,255,255,0.2); margin: 1rem 0;">
            <p><strong>PNR:</strong> ${ticket.booking_reference || 'N/A'}</p>
            <p><strong>Route:</strong> ${ticket.departure || 'N/A'} → ${ticket.destination || 'N/A'}</p>
            <p><strong>Airline:</strong> ${ticket.airline || 'N/A'}</p>
            <p><strong>Travel Date:</strong> ${ticket.departing_on || 'N/A'}</p>
            <p><strong>Net Amount:</strong> ${(ticket.net_amount || 0).toLocaleString()} MMK</p>
            <p><strong>Commission:</strong> ${(ticket.commission || 0).toLocaleString()} MMK</p>
            ${statusHtml}
            <div style="text-align: center; margin-top: 1.5rem;">
                <button class="btn btn-secondary" onclick="closeDetailsModal()">Close</button>
            </div>
        `;
        detailsModal.style.display = 'block';
    }
}

// --- DASHBOARD DATA & CHARTS ---
function updateDashboardData() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthName = now.toLocaleString('default', { month: 'long' });

    const ticketsThisMonth = allTickets.filter(t => {
        const ticketDate = parseSheetDate(t.issued_date);
        return ticketDate.getMonth() === currentMonth && ticketDate.getFullYear() === currentYear && !t.canceled;
    });

    const totalTicketsBox = document.getElementById('total-tickets-box');
    totalTicketsBox.innerHTML = `<h3>Tickets (${monthName})</h3><div class="main-value">${ticketsThisMonth.length}</div><i class="icon fa-solid fa-ticket-simple"></i>`;

    const totalRevenue = ticketsThisMonth.reduce((sum, t) => sum + t.net_amount, 0);
    const revenueBox = document.getElementById('monthly-revenue-box');
    revenueBox.innerHTML = `<h3>Revenue (${monthName})</h3><div class="main-value">${(totalRevenue/1000).toFixed(1)}k</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-sack-dollar"></i>`;

    const totalCommission = ticketsThisMonth.reduce((sum, t) => sum + t.commission, 0);
    const commissionBox = document.getElementById('monthly-commission-box');
    commissionBox.innerHTML = `<h3>Commission (${monthName})</h3><div class="main-value">${(totalCommission/1000).toFixed(1)}k</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-hand-holding-dollar"></i>`;
    
    const getTopItem = (data, key) => {
        if (data.length === 0) return 'N/A';
        const counts = data.reduce((acc, t) => {
            const value = t[key] || 'Unknown';
            acc[value] = (acc[value] || 0) + 1;
            return acc;
        }, {});
        return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
    };

    const topAirline = getTopItem(ticketsThisMonth, 'airline');
    const topAirlineBox = document.getElementById('top-airline-box');
    topAirlineBox.innerHTML = `<h3>Top Airline</h3><div class="main-value long-text">${topAirline}</div><i class="icon fa-solid fa-plane"></i>`;
    
    const routeCounts = ticketsThisMonth.reduce((acc, t) => {
        const route = t.departure && t.destination ? `${t.departure.split(' ')[0]}→${t.destination.split(' ')[0]}` : 'Unknown';
        acc[route] = (acc[route] || 0) + 1;
        return acc;
    }, {});
    const topRoute = Object.keys(routeCounts).reduce((a, b) => routeCounts[a] > routeCounts[b] ? a : b, 'N/A');
    const topRouteBox = document.getElementById('top-route-box');
    topRouteBox.innerHTML = `<h3>Top Route</h3><div class="main-value long-text">${topRoute}</div><i class="icon fa-solid fa-route"></i>`;
}


// --- UTILITY FUNCTIONS ---
function makeClickable(text) { if (!text) return 'N/A'; if (text.toLowerCase().startsWith('http')) return `<a href="${text}" target="_blank" style="color:var(--primary-accent);">${text}</a>`; if (/^[\d\s\-+()]+$/.test(text)) return `<a href="tel:${text.replace(/[^\d+]/g, '')}" style="color:var(--primary-accent);">${text}</a>`; if (text.startsWith('@')) return `<a href="https://t.me/${text.substring(1)}" target="_blank" style="color:var(--primary-accent);">${text}</a>`; return text; }
function showToast(message, type = 'info') { document.getElementById('toastMessage').textContent = message; const toastEl = document.getElementById('toast'); toastEl.className = `show ${type}`; setTimeout(() => toastEl.className = toastEl.className.replace('show', ''), 4000); }
function formatDateForSheet(dateString) { if (!dateString) return ''; const date = new Date(dateString); return isNaN(date.getTime()) ? dateString : `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`; }
function parseSheetDate(dateString) { if (!dateString) return new Date(0); const monthMap = { 'JAN':0,'FEB':1,'MAR':2,'APR':3,'MAY':4,'JUN':5,'JUL':6,'AUG':7,'SEP':8,'OCT':9,'NOV':10,'DEC':11 }; const parts = dateString.split('-'); if (parts.length === 3 && isNaN(parseInt(parts[1], 10))) { return new Date(parseInt(parts[2], 10), monthMap[parts[1].toUpperCase()], parseInt(parts[0], 10)); } return new Date(dateString); }
function calculateCommission() { const baseFare = parseFloat(document.getElementById('base_fare').value) || 0; const extraFare = parseFloat(document.getElementById('extra_fare').value) || 0; document.getElementById('commission').value = Math.round((baseFare * 0.05) * 0.60) + extraFare; }

// --- SEARCH & PAGINATION ---
function performSearch() {
    const name = (document.getElementById('searchName')?.value || '').toUpperCase();
    const bookRef = (document.getElementById('searchBooking')?.value || '').toUpperCase();
    const dateVal = document.getElementById('searchDate')?.value || '';
    let searchDate = dateVal ? new Date(dateVal) : null;
    const results = allTickets.filter(t => {
        const issuedDate = parseSheetDate(t.issued_date);
        const isDateMatch = !searchDate || (issuedDate.getDate() === searchDate.getDate() && issuedDate.getMonth() === searchDate.getMonth() && issuedDate.getFullYear() === searchDate.getFullYear());
        return (!name || t.name.toUpperCase().includes(name)) && (!bookRef || t.booking_reference.toUpperCase().includes(bookRef)) && isDateMatch;
    }).sort((a,b) => parseSheetDate(b.issued_date) - parseSheetDate(a.issued_date) || b.rowIndex - a.rowIndex);
    filteredTickets = results;
    displayTickets(filteredTickets, 1);
}
function clearSearch() { document.getElementById('searchName').value = ''; document.getElementById('searchBooking').value = ''; document.getElementById('searchDate').value = ''; displayAllTickets(); }
function setupPagination(items) { const container = document.getElementById('pagination'); container.innerHTML = ''; const pageCount = Math.ceil(items.length / rowsPerPage); if (pageCount <= 1) return; const btn = (txt, pg, en=true) => {const b = document.createElement('button'); b.className = 'pagination-btn'; b.innerHTML=txt; b.disabled=!en; if(en) b.onclick=()=>displayTickets(items,pg); if(pg===currentPage)b.classList.add('active'); return b;}; container.append(btn('&laquo;', currentPage - 1, currentPage > 1)); for (let i = 1; i <= pageCount; i++) container.append(btn(i,i)); container.append(btn('&raquo;', currentPage + 1, currentPage < pageCount));}

// --- FORM SUBMISSIONS ---
async function handleSellTicket(e) { e.preventDefault(); if (isSubmitting) return; isSubmitting = true; const submitButton = e.target.querySelector('button[type="submit"]'); if (submitButton) submitButton.disabled = true; try { const ticketData = collectFormData(e.target); if (!ticketData.name || !ticketData.booking_reference) throw new Error('Missing required fields.'); await saveTicket(ticketData); showToast('Ticket saved successfully!', 'success'); e.target.reset(); await loadTicketData(); showView('home'); } catch (error) { showToast(`Error: ${error.message || 'Could not save ticket.'}`, 'error'); } finally { isSubmitting = false; if (submitButton) submitButton.disabled = false; } }
function collectFormData(form) { const data = {}; const fields = ['issued_date', 'name', 'nrc_no', 'phone', 'account_name', 'account_type', 'account_link', 'departure', 'destination', 'departing_on', 'airline', 'base_fare', 'booking_reference', 'net_amount', 'paid', 'payment_method', 'paid_date', 'commission', 'remark', 'extra_fare']; fields.forEach(field => { const el = form.querySelector(`#${field}`); if(el) data[field] = el.type === 'checkbox' ? el.checked : el.value; }); return data; }
async function saveTicket(data) { const values = [[ formatDateForSheet(data.issued_date), data.name, data.nrc_no.toUpperCase(), data.phone, data.account_name.toUpperCase(), data.account_type.toUpperCase(), data.account_link, data.departure, data.destination, formatDateForSheet(data.departing_on), data.airline, parseFloat(data.base_fare) || 0, data.booking_reference.toUpperCase(), parseFloat(data.net_amount) || 0, data.paid, data.payment_method, formatDateForSheet(data.paid_date), parseFloat(data.commission) || 0, data.remark ]]; await gapi.client.sheets.spreadsheets.values.append({ spreadsheetId: CONFIG.SHEET_ID, range: `${CONFIG.SHEET_NAME}!A:S`, valueInputOption: 'USER_ENTERED', resource: { values }, }); }

// --- MODIFY & UPDATE TICKET (THE FIX) ---
function findTicketForModify() {
    const pnr = document.getElementById('modifyPnr').value.toUpperCase();
    if (!pnr) return showToast('Please enter a PNR code.', 'error');
    const found = allTickets.filter(t => t.booking_reference === pnr);
    displayModifyResults(found);
}

function displayModifyResults(tickets) {
    const container = document.getElementById('modifyResultsContainer');
    if (tickets.length === 0) {
        container.innerHTML = '<p style="text-align: center; margin-top: 1rem;">No tickets found for this PNR.</p>';
        return;
    }
    let html = `<div class="table-container"><table><thead><tr><th>Name</th><th>Route</th><th>Action</th></tr></thead><tbody>`;
    tickets.forEach(t => {
        const actionButton = t.base_fare > 0 ? `<button class="btn btn-primary" onclick="openModifyModal(${t.rowIndex})">Modify</button>` : '';
        html += `<tr><td>${t.name}</td><td>${t.departure.split(' ')[0]}→${t.destination.split(' ')[0]}</td><td>${actionButton}</td></tr>`;
    });
    container.innerHTML = html + '</tbody></table></div>';
}

function openModifyModal(rowIndex) {
    const ticket = allTickets.find(t => t.rowIndex === rowIndex);
    if (!ticket) return showToast('Ticket not found.', 'error');

    let travelDateForInput = '';
    if (ticket.departing_on) {
        const d = parseSheetDate(ticket.departing_on);
        if (!isNaN(d.getTime())) {
            travelDateForInput = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
        }
    }

    modifyModalBody.innerHTML = `
        <h2>Modify Ticket: ${ticket.name}</h2>
        <form id="updateForm" data-pnr="${ticket.booking_reference}" data-master-row-index="${rowIndex}">
            <div class="form-grid">
                <div class="form-group"><label>New Travel Date (for all in PNR)</label><input type="text" id="update_departing_on" placeholder="MM/DD/YYYY" value="${travelDateForInput}"></div>
                <div class="form-group"><label>New Base Fare (Optional)</label><input type="number" id="update_base_fare" placeholder="${(ticket.base_fare||0).toLocaleString()}"></div>
                <div class="form-group"><label>New Net Amount (Optional)</label><input type="number" id="update_net_amount" placeholder="${(ticket.net_amount||0).toLocaleString()}"></div>
                <div class="form-group"><label>Date Change Fees (Optional)</label><input type="number" id="date_change_fees"></div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="modifyModal.style.display='none'">Cancel</button>
                <button type="submit" class="btn btn-primary">Update Ticket(s)</button>
            </div>
        </form>`;
    
    new Datepicker(document.getElementById('update_departing_on'), { format: 'mm/dd/yyyy', autohide: true, todayHighlight: true });
    modifyModal.style.display = 'block';
    document.getElementById('updateForm').addEventListener('submit', handleUpdateTicket);
}

async function handleUpdateTicket(e) {
    e.preventDefault();
    const form = e.target;
    const pnr = form.dataset.pnr;
    const masterRowIndex = form.dataset.masterRowIndex;

    const ticketsToUpdate = allTickets.filter(t => t.booking_reference === pnr);
    let newTravelDate = document.getElementById('update_departing_on').value;
    const newBaseFare = parseFloat(document.getElementById('update_base_fare').value);
    const newNetAmount = parseFloat(document.getElementById('update_net_amount').value);
    const fees = parseFloat(document.getElementById('date_change_fees').value) || 0;
    
    if (newTravelDate) newTravelDate = formatDateForSheet(newTravelDate);

    const dataForBatchUpdate = ticketsToUpdate.map(ticket => {
        const isMaster = ticket.rowIndex == masterRowIndex;
        let finalBaseFare = ticket.base_fare, finalNetAmount = ticket.net_amount, finalCommission = ticket.commission;

        if (isMaster) {
            finalBaseFare = isNaN(newBaseFare) ? ticket.base_fare : newBaseFare;
            finalCommission = isNaN(newBaseFare) ? ticket.commission : Math.round((newBaseFare * 0.05) * 0.60);
            finalNetAmount = (isNaN(newNetAmount) ? ticket.net_amount : newNetAmount) + fees;
        }

        return {
            range: `${CONFIG.SHEET_NAME}!A${ticket.rowIndex}:S${ticket.rowIndex}`,
            values: [[
                ticket.issued_date, ticket.name, ticket.nrc_no, ticket.phone,
                ticket.account_name, ticket.account_type, ticket.account_link,
                ticket.departure, ticket.destination, newTravelDate || ticket.departing_on, ticket.airline,
                finalBaseFare, ticket.booking_reference, finalNetAmount,
                ticket.paid, ticket.payment_method, ticket.paid_date,
                finalCommission, ticket.remark
            ]]
        };
    });

    try {
        showToast('Updating tickets...', 'info');
        await gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: CONFIG.SHEET_ID,
            resource: { valueInputOption: 'USER_ENTERED', data: dataForBatchUpdate }
        });
        showToast('Tickets updated successfully!', 'success');
        modifyModal.style.display = 'none';
        document.getElementById('modifyResultsContainer').innerHTML = '';
        document.getElementById('modifyPnr').value = '';
        await loadTicketData();
    } catch (error) {
        showToast(`Update Error: ${error.result?.error?.message || 'Could not update.'}`, 'error');
    }
}
