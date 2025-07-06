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
let currentView = 'home';
let charts = {};
let tokenClient;
let gapiInited = false;
let gisInited = false;
let isSubmitting = false; 
const rowsPerPage = 10;
let currentPage = 1;


// DOM Elements
const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');
const loading = document.getElementById('loading');
const dashboardContent = document.getElementById('dashboard-content');
const detailsModal = document.getElementById('modal');
const detailsModalBody = document.getElementById('modalBody');
const modifyModal = document.getElementById('modifyModal');
const modifyModalBody = document.getElementById('modifyModalBody');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
const authorizeButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');
const totalTicketsMonth = document.getElementById('total-tickets-month');
const totalTicketsCount = document.getElementById('total-tickets-count');

// --- INITIALIZATION ---

window.onload = async () => {
    console.log('Window loaded, initializing...');
    initializeDatepickers();
    setupEventListeners();
    
    if (typeof gapi === 'undefined' || typeof google === 'undefined' || !google.accounts) {
        showToast('Google API scripts not loaded. Please check your internet connection.', 'error');
        return;
    }
    
    try {
        await Promise.all([loadGapiClient(), loadGisClient()]);
    } catch (error) {
        showToast('Failed to load Google APIs. Please refresh the page.', 'error');
    }
};

function initializeDatepickers() {
    const options = {
        format: 'mm/dd/yyyy',
        autohide: true,
        todayHighlight: true,
    };
    new Datepicker(document.getElementById('searchDate'), options);
    new Datepicker(document.getElementById('issued_date'), options);
    new Datepicker(document.getElementById('departing_on'), options);
    new Datepicker(document.getElementById('paid_date'), options);
}

async function loadGapiClient() {
    return new Promise((resolve, reject) => {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({ apiKey: CONFIG.API_KEY, discoveryDocs: [CONFIG.DISCOVERY_DOC] });
                gapiInited = true;
                maybeEnableButtons();
                resolve();
            } catch (error) { reject(error); }
        });
    });
}

async function loadGisClient() {
    return new Promise((resolve, reject) => {
        try {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID,
                scope: CONFIG.SCOPES,
                callback: '', 
            });
            gisInited = true;
            maybeEnableButtons();
            resolve();
        } catch (error) { reject(error); }
    });
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        authorizeButton.style.display = 'block';
        if (loading) loading.style.display = 'none';
    }
}

async function initializeApp() {
    setupCharts();
    await loadTicketData();
}

// --- AUTHENTICATION ---

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            showToast('Authentication failed. Please try again.', 'error');
            throw (resp);
        }
        gapi.client.setToken(resp); 
        authorizeButton.style.display = 'none';
        signoutButton.style.display = 'block';
        await initializeApp();
    };
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        authorizeButton.style.display = 'block';
        signoutButton.style.display = 'none';
        if (dashboardContent) dashboardContent.style.display = 'none';
        if (loading) loading.style.display = 'block';
        allTickets = [];
        document.getElementById('resultsBody').innerHTML = '';
        if (charts.commission) charts.commission.destroy();
        if (charts.netAmount) charts.netAmount.destroy();
    }
}

// --- EVENT LISTENERS ---

function setupEventListeners() {
    navBtns.forEach(btn => btn.addEventListener('click', (e) => showView(e.target.dataset.view)));
    authorizeButton.addEventListener('click', handleAuthClick);
    signoutButton.addEventListener('click', handleSignoutClick);
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('clearBtn').addEventListener('click', clearSearch);
    document.getElementById('sellForm').addEventListener('submit', handleSellTicket);
    document.getElementById('base_fare').addEventListener('input', calculateCommission);
    document.getElementById('extra_fare').addEventListener('input', calculateCommission);
    document.getElementById('findTicketBtn').addEventListener('click', findTicketForModify);
    document.getElementById('findCancelBtn').addEventListener('click', () => showToast('Cancel functionality not yet implemented.', 'info'));
    
    // Modal close listeners
    modifyModal.querySelector('.close').addEventListener('click', () => modifyModal.style.display = "none");
    
    window.addEventListener('click', (event) => {
        if (event.target == detailsModal) {
            detailsModal.style.display = "none";
        }
        if (event.target == modifyModal) {
            modifyModal.style.display = "none";
        }
    });
}

// --- CORE APP LOGIC ---

async function loadTicketData() {
    try {
        if (loading) loading.style.display = 'block';
        if (dashboardContent) dashboardContent.style.display = 'none';
        
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.SHEET_NAME}!A:S`,
        });
        
        if (response.result.values && response.result.values.length > 1) {
            allTickets = parseTicketData(response.result.values);
            updateCharts();
            updateTotalTickets();
            displayAllTickets();
        }
        
        if (loading) loading.style.display = 'none';
        if (dashboardContent) dashboardContent.style.display = 'block';
    } catch (error) {
        showToast(`Error loading data: ${error.result?.error?.message || error}`, 'error');
        if (loading) loading.style.display = 'none';
    }
}

async function handleSellTicket(e) {
    e.preventDefault();
    if (isSubmitting) return;
    
    isSubmitting = true;
    const submitButton = e.target.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    
    try {
        const ticketData = collectFormData(e.target);
        validateTicketData(ticketData);

        if (ticketData.issued_date) ticketData.issued_date = formatDateForSheet(ticketData.issued_date);
        if (ticketData.departing_on) ticketData.departing_on = formatDateForSheet(ticketData.departing_on);
        if (ticketData.paid_date) ticketData.paid_date = formatDateForSheet(ticketData.paid_date);

        await saveTicket(ticketData);
        showToast('Ticket saved successfully!', 'success');
        e.target.reset();
        await loadTicketData(); 
        showView('home');
    } catch (error) {
        showToast(`Error: ${error.message || 'Could not save ticket.'}`, 'error');
    } finally {
        isSubmitting = false;
        if (submitButton) submitButton.disabled = false;
    }
}

function collectFormData(form) {
    const data = {};
    const fields = ['issued_date', 'name', 'nrc_no', 'phone', 'account_name', 'account_type', 'account_link', 'departure', 'destination', 'departing_on', 'airline', 'base_fare', 'booking_reference', 'net_amount', 'paid', 'payment_method', 'paid_date', 'commission', 'remark'];
    fields.forEach(field => {
        const el = form.querySelector(`#${field}`);
        if(el) data[field] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return data;
}

function validateTicketData(data) {
    const required = ['issued_date', 'name', 'nrc_no', 'phone', 'account_name', 'account_type', 'departure', 'destination', 'departing_on', 'airline', 'base_fare', 'booking_reference', 'net_amount'];
    const missing = required.filter(f => !data[f]);
    if (missing.length > 0) throw new Error(`Missing required fields: ${missing.join(', ')}`);
}

async function saveTicket(data) {
    const values = [[
        data.issued_date, data.name, data.nrc_no.toUpperCase(), data.phone,
        data.account_name.toUpperCase(), data.account_type.toUpperCase(), data.account_link,
        data.departure, data.destination, data.departing_on, data.airline,
        parseFloat(data.base_fare) || 0, data.booking_reference.toUpperCase(), parseFloat(data.net_amount) || 0,
        data.paid, data.payment_method, data.paid_date,
        parseFloat(data.commission) || 0, data.remark
    ]];
    await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: CONFIG.SHEET_ID, range: `${CONFIG.SHEET_NAME}!A:S`,
        valueInputOption: 'USER_ENTERED', resource: { values },
    });
}

// --- UI & DISPLAY ---

function showView(viewName) {
    navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
    views.forEach(view => view.classList.toggle('active', view.id === `${viewName}-view`));
    if (viewName === 'sell') document.getElementById('sellForm').reset();
}

function displayAllTickets() {
    const sorted = [...allTickets].sort((a, b) => {
        const dateDiff = parseSheetDate(b.issued_date) - parseSheetDate(a.issued_date);
        return dateDiff !== 0 ? dateDiff : b.rowIndex - a.rowIndex;
    });
    filteredTickets = sorted;
    displayTickets(filteredTickets, 1);
}

function displayTickets(tickets, page = 1) {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';
    currentPage = page;
    const paginated = tickets.slice((page - 1) * rowsPerPage, page * rowsPerPage);
    paginated.forEach((ticket) => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${ticket.issued_date || ''}</td><td>${ticket.name || ''}</td>
            <td>${ticket.booking_reference || ''}</td><td>${ticket.departure || ''} → ${ticket.destination || ''}</td>
            <td>${ticket.airline || ''}</td>
            <td><button class="btn btn-secondary" style="padding: 0.5rem 1rem;" onclick="showDetails(${ticket.rowIndex})">Details</button></td>`;
    });
    setupPagination(tickets);
}

function closeDetailsModal() {
    detailsModal.style.display = 'none';
}

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

// --- UTILITY & HELPER FUNCTIONS ---

function parseTicketData(values) {
    const headers = values[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    return values.slice(1).map((row, i) => {
        const ticket = {};
        headers.forEach((h, j) => ticket[h] = row[j] || '');
        const safeParse = (val) => parseFloat(String(val).replace(/,/g, '')) || 0;
        ticket.base_fare = safeParse(ticket.base_fare);
        ticket.net_amount = safeParse(ticket.net_amount);
        ticket.commission = safeParse(ticket.commission);
        ticket.paid = ticket.paid === 'TRUE';
        ticket.rowIndex = i + 2;
        return ticket;
    });
}

function calculateCommission() {
    const baseFare = parseFloat(document.getElementById('base_fare').value) || 0;
    const extraFare = parseFloat(document.getElementById('extra_fare').value) || 0;
    const commissionInput = document.getElementById('commission');
    commissionInput.value = Math.round((baseFare * 0.05) * 0.60) + extraFare;
}

function makeClickable(text) {
    if (!text) return 'N/A';
    if (text.toLowerCase().startsWith('http')) return `<a href="${text}" target="_blank">${text}</a>`;
    if (/^[\d\s\-+()]+$/.test(text)) return `<a href="tel:${text.replace(/[^\d+]/g, '')}">${text}</a>`;
    if (text.startsWith('@')) return `<a href="https://t.me/${text.substring(1)}" target="_blank">${text}</a>`;
    return text;
}

function showToast(message, type = 'success') { if(toastMessage) toastMessage.textContent = message; if(toast) { toast.className = `notification ${type} show`; setTimeout(() => toast.className = toast.className.replace('show', ''), 5000); } }

function formatDateForSheet(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Return original if invalid
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
}

function parseSheetDate(dateString) {
    if (!dateString) return new Date(0);
    // Handles "DD-MMM-YYYY" from sheets
    const monthMap = { 'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5, 'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11 };
    const parts = dateString.split('-');
    if (parts.length === 3 && isNaN(parseInt(parts[1], 10))) {
        const day = parseInt(parts[0], 10);
        const month = monthMap[parts[1].toUpperCase()];
        const year = parseInt(parts[2], 10);
        if (!isNaN(day) && month !== undefined && !isNaN(year)) {
            return new Date(year, month, day);
        }
    }
    // Handles "MM/DD/YYYY" or other standard formats
    return new Date(dateString);
}

// --- CHARTS ---

function setupCharts() {
    const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return `${c.dataset.label}: ${c.parsed.y.toLocaleString()} MMK`}}}}, scales: { y: { beginAtZero: true, ticks: { callback: function(v) { if (v >= 1e6) return v/1e6+'M'; if (v >= 1e3) return v/1e3+'K'; return v; }}}, x: {}}, interaction: { intersect: false, mode: 'index' }};
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (charts.commission) charts.commission.destroy();
    if (charts.netAmount) charts.netAmount.destroy();
    if (document.getElementById('commissionChart')) {
        charts.commission = new Chart(document.getElementById('commissionChart').getContext('2d'), { type: 'line', data: { labels: monthLabels, datasets: [{ label: 'Commission', data: [], backgroundColor: 'rgba(74, 144, 226, 0.2)', borderColor: 'rgba(74, 144, 226, 1)', borderWidth: 3, fill: true, tension: 0.4 }] }, options: chartOptions });
    }
    if (document.getElementById('netAmountChart')) {
        charts.netAmount = new Chart(document.getElementById('netAmountChart').getContext('2d'), { type: 'line', data: { labels: monthLabels, datasets: [{ label: 'Net Amount', data: [], backgroundColor: 'rgba(106, 183, 255, 0.2)', borderColor: 'rgba(106, 183, 255, 1)', borderWidth: 3, fill: true, tension: 0.4 }] }, options: chartOptions });
    }
}

function updateCharts() {
    const comms = Array(12).fill(0);
    const nets = Array(12).fill(0);
    const currentYear = new Date().getFullYear();

    allTickets.forEach(t => {
        const d = parseSheetDate(t.issued_date);
        if (d.getFullYear() === currentYear && !t.canceled) {
            const m = d.getMonth();
            if (m >= 0 && m < 12) {
                comms[m] += t.commission;
                nets[m] += t.net_amount;
            }
        }
    });
    
    if (charts.commission) {
        charts.commission.data.datasets[0].data = comms;
        charts.commission.update();
    }
    if (charts.netAmount) {
        charts.netAmount.data.datasets[0].data = nets;
        charts.netAmount.update();
    }
}

function updateTotalTickets() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const ticketsThisMonth = allTickets.filter(ticket => {
        const ticketDate = parseSheetDate(ticket.issued_date);
        return ticketDate.getMonth() === currentMonth && ticketDate.getFullYear() === currentYear && !ticket.canceled;
    }).length;

    totalTicketsMonth.textContent = `Total Tickets for ${now.toLocaleString('default', { month: 'long' })}`;
    totalTicketsCount.textContent = ticketsThisMonth;
}


// --- SEARCH & PAGINATION ---

function performSearch() {
    const name = (document.getElementById('searchName')?.value || '').toUpperCase();
    const bookRef = (document.getElementById('searchBooking')?.value || '').toUpperCase();
    const dateVal = document.getElementById('searchDate')?.value || '';
    
    let searchDate = null;
    if (dateVal) {
        searchDate = new Date(dateVal);
    }

    const results = allTickets.filter(t => {
        const issuedDate = parseSheetDate(t.issued_date);
        const isDateMatch = !searchDate || (
            issuedDate.getDate() === searchDate.getDate() &&
            issuedDate.getMonth() === searchDate.getMonth() &&
            issuedDate.getFullYear() === searchDate.getFullYear()
        );

        return (!name || t.name.includes(name)) &&
               (!bookRef || t.booking_reference.includes(bookRef)) &&
               isDateMatch;
    }).sort((a,b) => parseSheetDate(b.issued_date) - parseSheetDate(a.issued_date) || b.rowIndex - a.rowIndex);
    
    filteredTickets = results;
    displayTickets(filteredTickets, 1);
}

function clearSearch() { document.getElementById('searchName').value = ''; document.getElementById('searchBooking').value = ''; document.getElementById('searchDate').value = ''; displayAllTickets(); }
function setupPagination(items) { const container = document.getElementById('pagination'); container.innerHTML = ''; const pageCount = Math.ceil(items.length / rowsPerPage); if (pageCount <= 1) return; const btn = (txt, pg, en=true) => {const b = document.createElement('button'); b.className = 'pagination-btn'; b.innerText=txt; b.disabled=!en; if(en) b.onclick=()=>displayTickets(items,pg); if(pg===currentPage)b.classList.add('active'); return b;}; container.append(btn('Prev', currentPage - 1, currentPage > 1)); for (let i = 1; i <= pageCount; i++) container.append(btn(i,i)); container.append(btn('Next', currentPage + 1, currentPage < pageCount));}

// --- MODIFY & UPDATE ---

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
        html += `<tr><td>${t.name}</td><td>${t.departure}→${t.destination}</td><td>${actionButton}</td></tr>`;
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
    
    new Datepicker(document.getElementById('update_departing_on'), {
        format: 'mm/dd/yyyy',
        autohide: true,
        todayHighlight: true,
    });

    modifyModal.style.display = 'block';
    document.getElementById('updateForm').addEventListener('submit', handleUpdateTicket);
}

async function handleUpdateTicket(e) {
    e.preventDefault();
    const form = e.target;
    const pnr = form.dataset.pnr;
    const masterRowIndex = form.dataset.masterRowIndex;
    const masterTicket = allTickets.find(t => t.rowIndex == masterRowIndex);
    if (!masterTicket) return showToast('Error: Original ticket not found.', 'error');

    const ticketsToUpdate = allTickets.filter(t => t.booking_reference === pnr);
    
    let newTravelDate = document.getElementById('update_departing_on').value;
    const newBaseFare = parseFloat(document.getElementById('update_base_fare').value);
    const newNetAmount = parseFloat(document.getElementById('update_net_amount').value);
    const fees = parseFloat(document.getElementById('date_change_fees').value) || 0;
    
    if (newTravelDate) {
        newTravelDate = formatDateForSheet(newTravelDate);
    }


    const dataForBatchUpdate = ticketsToUpdate.map(ticket => {
        const isMaster = ticket.rowIndex == masterRowIndex;
        let finalBaseFare = ticket.base_fare;
        let finalNetAmount = ticket.net_amount;
        let finalCommission = ticket.commission;

        if (isMaster) {
            finalBaseFare = isNaN(newBaseFare) ? ticket.base_fare : newBaseFare;
            finalCommission = isNaN(newBaseFare) ? ticket.commission : Math.round((newBaseFare * 0.05) * 0.60);
            finalNetAmount = (isNaN(newNetAmount) ? ticket.net_amount : newNetAmount) + fees;
        }

        const finalTravelDate = newTravelDate || ticket.departing_on;

        return {
            range: `${CONFIG.SHEET_NAME}!A${ticket.rowIndex}:S${ticket.rowIndex}`,
            values: [[
                ticket.issued_date, ticket.name, ticket.nrc_no, ticket.phone,
                ticket.account_name, ticket.account_type, ticket.account_link,
                ticket.departure, ticket.destination, finalTravelDate, ticket.airline,
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
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: dataForBatchUpdate
            }
        });
        showToast('Tickets updated successfully!', 'success');
        modifyModal.style.display = 'none';
        document.getElementById('modifyResultsContainer').innerHTML = '';
        document.getElementById('modifyPnr').value = '';
        await loadTicketData();
    } catch (error) {
        showToast(`Error: ${error.result?.error?.message || 'Could not update.'}`, 'error');
    }
}
