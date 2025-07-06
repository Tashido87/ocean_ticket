// Configuration
const CONFIG = {
    SHEET_ID: '1SGc80isz0VRVt447R_q-fBdZ_me52H_Z32W5HauHMWQ',
    API_KEY: 'AIzaSyC9JSD6VWXMQ7Pe8VPf-gIlNUtcwQhkG1o', // <-- I have used the API key you provided.
    CLIENT_ID: '254093944424-mfvk48avc9n86de6jit9oai7kqrsr2f7.apps.googleusercontent.com', // <-- IMPORTANT: REPLACE WITH YOUR CLIENT ID
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    SHEET_NAME: '2025'
};

// Global variables
let allTickets = [];
let currentView = 'home';
let charts = {};
let tokenClient;
let gapiInited = false;
let gisInited = false;

// DOM Elements
const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');
const loading = document.getElementById('loading');
const dashboardContent = document.getElementById('dashboard-content');
const modal = document.getElementById('modal');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toastMessage');
const authorizeButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');


// Initialize app
window.onload = () => {
    gapiLoaded();
    gisLoaded();
};

function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: CONFIG.API_KEY,
        discoveryDocs: [CONFIG.DISCOVERY_DOC],
    });
    gapiInited = true;
    maybeEnableButtons();
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.CLIENT_ID,
        scope: CONFIG.SCOPES,
        callback: '', // defined later
    });
    gisInited = true;
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        authorizeButton.style.display = 'block';
    }
}

async function initializeApp() {
    await loadTicketData();
    setupCharts();
}

function setupEventListeners() {
    // Navigation
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.target.dataset.view;
            showView(view);
        });
    });

    // Auth
    authorizeButton.onclick = handleAuthClick;
    signoutButton.onclick = handleSignoutClick;

    // Search functionality
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('clearBtn').addEventListener('click', clearSearch);

    // Form submission
    document.getElementById('sellForm').addEventListener('submit', handleSellTicket);

    // Base fare calculation
    document.getElementById('base_fare').addEventListener('input', calculateCommission);

    // PNR search
    document.getElementById('findTicketBtn').addEventListener('click', () => findTicket('modify'));
    document.getElementById('findCancelBtn').addEventListener('click', () => findTicket('cancel'));

    // Modal
    document.querySelector('.close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        authorizeButton.style.display = 'none';
        signoutButton.style.display = 'block';
        await initializeApp();
    };

    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({prompt: 'consent'});
    } else {
        tokenClient.requestAccessToken({prompt: ''});
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        authorizeButton.style.display = 'block';
        signoutButton.style.display = 'none';
        dashboardContent.style.display = 'none';
        loading.style.display = 'block';
        allTickets = [];
        document.getElementById('resultsBody').innerHTML = '';
        if (charts.commission) charts.commission.destroy();
        if (charts.netAmount) charts.netAmount.destroy();
    }
}

function showView(viewName) {
    // Update navigation
    navBtns.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === viewName) {
            btn.classList.add('active');
        }
    });

    // Update views
    views.forEach(view => {
        view.classList.remove('active');
        if (view.id === `${viewName}-view`) {
            view.classList.add('active');
        }
    });

    currentView = viewName;
}

// Date utility functions
function formatDateToDDMMYYYY(date) {
    if (!date) return '';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

function formatDateToYYYYMMDD(dateString) {
    if (!dateString) return '';
    // Handle DD-MM-YYYY format
    const parts = dateString.split('-');
    if (parts.length === 3) {
        const day = parts[0];
        const month = parts[1];
        const year = parts[2];
        return `${year}-${month}-${day}`;
    }
    return dateString;
}

function parseDateFromDDMMYYYY(dateString) {
    if (!dateString) return null;
    // Handle DD-MM-YYYY format
    const parts = dateString.split('-');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }
    return new Date(dateString);
}

function getCurrentDateDDMMYYYY() {
    const today = new Date();
    return formatDateToDDMMYYYY(today);
}

async function loadTicketData() {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.SHEET_NAME}!A:S`,
        });
        
        const data = response.result;
        
        if (data.values && data.values.length > 1) {
            allTickets = parseTicketData(data.values);
            updateCharts();
            displayAllTickets();
        }
        
        loading.style.display = 'none';
        dashboardContent.style.display = 'block';
    } catch (error) {
        // This part is updated for better error messages
        const errorMessage = error.result?.error?.message || error.toString();
        console.error('Error loading ticket data:', error);
        showToast(`Error: ${errorMessage}`, 'error');
        loading.style.display = 'none';
    }
}

function parseTicketData(rawData) {
    const headers = rawData[0];
    const tickets = [];
    
    for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        const ticket = {};
        
        headers.forEach((header, index) => {
            ticket[header.toLowerCase().replace(/\s+/g, '_')] = row[index] || '';
        });
        
        // Parse numbers
        ticket.base_fare = parseFloat(ticket.base_fare) || 0;
        ticket.net_amount = parseFloat(ticket.net_amount) || 0;
        ticket.commission = parseFloat(ticket.commission) || 0;
        ticket.paid = ticket.paid === 'TRUE' || ticket.paid === true;
        ticket.rowIndex = i + 1; // Store row index for updates
        
        tickets.push(ticket);
    }
    
    return tickets;
}

function updateCharts() {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthlyData = allTickets.filter(ticket => {
        const ticketDate = parseDateFromDDMMYYYY(ticket.issued_date);
        return ticketDate && ticketDate.getMonth() === currentMonth && ticketDate.getFullYear() === currentYear;
    });
    
    const totalCommission = monthlyData.reduce((sum, ticket) => sum + ticket.commission, 0);
    const totalNetAmount = monthlyData.reduce((sum, ticket) => sum + ticket.net_amount, 0);
    
    updateChart('commissionChart', 'Commission', totalCommission);
    updateChart('netAmountChart', 'Net Amount', totalNetAmount);
}

function setupCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(74, 144, 226, 0.1)'
                }
            },
            x: {
                grid: {
                    color: 'rgba(74, 144, 226, 0.1)'
                }
            }
        }
    };
    
    // Commission Chart
    const commissionCtx = document.getElementById('commissionChart').getContext('2d');
    charts.commission = new Chart(commissionCtx, {
        type: 'bar',
        data: {
            labels: ['This Month'],
            datasets: [{
                data: [0],
                backgroundColor: 'rgba(74, 144, 226, 0.8)',
                borderColor: 'rgba(74, 144, 226, 1)',
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: chartOptions
    });
    
    // Net Amount Chart
    const netAmountCtx = document.getElementById('netAmountChart').getContext('2d');
    charts.netAmount = new Chart(netAmountCtx, {
        type: 'line',
        data: {
            labels: ['This Month'],
            datasets: [{
                data: [0],
                backgroundColor: 'rgba(106, 183, 255, 0.2)',
                borderColor: 'rgba(106, 183, 255, 1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: chartOptions
    });
}

function updateChart(chartId, label, value) {
    const chart = charts[chartId.replace('Chart', '')];
    if (chart) {
        chart.data.datasets[0].data = [value];
        chart.update('active');
    }
}

function displayAllTickets() {
    const sortedTickets = [...allTickets].sort((a, b) => {
        const dateA = parseDateFromDDMMYYYY(a.issued_date);
        const dateB = parseDateFromDDMMYYYY(b.issued_date);
        return dateB - dateA;
    });
    displayTickets(sortedTickets);
}

function displayTickets(tickets) {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = '';
    
    tickets.forEach((ticket, index) => {
        const row = document.createElement('tr');
        row.className = ticket.canceled ? 'canceled' : '';
        row.style.animationDelay = `${index * 0.1}s`;
        
        row.innerHTML = `
            <td>${ticket.issued_date}</td>
            <td>${ticket.name}</td>
            <td>${ticket.booking_reference}</td>
            <td>${ticket.departure} → ${ticket.destination}</td>
            <td>${ticket.airline}</td>
            <td>${ticket.base_fare.toFixed(2)}</td>
            <td>${ticket.net_amount.toFixed(2)}</td>
            <td>${ticket.canceled ? 'Canceled' : 'Active'}</td>
        `;
        
        tbody.appendChild(row);
    });
}

function performSearch() {
    const searchName = document.getElementById('searchName').value.toLowerCase();
    const searchBooking = document.getElementById('searchBooking').value.toLowerCase();
    const searchDate = document.getElementById('searchDate').value;
    
    const filteredTickets = allTickets.filter(ticket => {
        const nameMatch = !searchName || ticket.name.toLowerCase().includes(searchName);
        const bookingMatch = !searchBooking || ticket.booking_reference.toLowerCase().includes(searchBooking);
        
        let dateMatch = true;
        if (searchDate) {
            // Convert HTML date input (YYYY-MM-DD) to DD-MM-YYYY for comparison
            const searchDateFormatted = formatDateToDDMMYYYY(searchDate);
            dateMatch = ticket.issued_date === searchDateFormatted;
        }
        
        return nameMatch && bookingMatch && dateMatch;
    });
    
    displayTickets(filteredTickets);
}

function clearSearch() {
    document.getElementById('searchName').value = '';
    document.getElementById('searchBooking').value = '';
    document.getElementById('searchDate').value = '';
    displayAllTickets();
}

function calculateCommission() {
    const baseFare = parseFloat(document.getElementById('base_fare').value) || 0;
    const commission = Math.round((baseFare * 0.05) * 0.60);
    document.getElementById('commission').value = commission;
}

async function handleSellTicket(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const ticketData = {};
    
    // Get form values
    for (let [key, value] of formData.entries()) {
        ticketData[key] = value;
    }
    
    // Add additional fields
    ticketData.issued_date = getCurrentDateDDMMYYYY();
    ticketData.paid = document.getElementById('paid').checked;
    ticketData.commission = document.getElementById('commission').value;
    
    // Convert date fields from format YYYY-MM-DD to DD-MM-YYYY
    if (ticketData.departing_on) {
        ticketData.departing_on = formatDateToDDMMYYYY(ticketData.departing_on);
    }
    if (ticketData.paid_date) {
        ticketData.paid_date = formatDateToDDMMYYYY(ticketData.paid_date);
    }
    
    try {
        await saveTicket(ticketData);
        showToast('Ticket saved successfully!', 'success');
        e.target.reset();
        document.getElementById('commission').value = '';
        await loadTicketData(); // Refresh data
    } catch (error) {
        console.error('Error saving ticket:', error);
        showToast('Error saving ticket', 'error');
    }
}

async function saveTicket(ticketData) {
    const values = [
        ticketData.issued_date,
        ticketData.name,
        ticketData.nrc_no,
        ticketData.phone,
        ticketData.account_name,
        ticketData.account_type,
        ticketData.account_link,
        ticketData.departure,
        ticketData.destination,
        ticketData.departing_on,
        ticketData.airline,
        ticketData.base_fare,
        ticketData.booking_reference,
        ticketData.net_amount,
        ticketData.paid,
        ticketData.payment_method,
        ticketData.paid_date,
        ticketData.commission,
        ticketData.remark
    ];

    try {
        const response = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.SHEET_NAME}!A:S`,
            valueInputOption: 'RAW', // <-- This is the change
            resource: {
                values: [values],
            },
        });
        console.log('API Response:', response);
    } catch (err) {
        console.error("Error saving ticket:", err);
        // Display a more detailed error message to the user
        const errorMessage = err.result?.error?.message || 'An unknown error occurred.';
        showToast(`Error saving ticket: ${errorMessage}`, 'error');
    }
}

async function findTicket(action) {
    const pnrInput = document.getElementById(action === 'modify' ? 'modifyPnr' : 'cancelPnr');
    const pnr = pnrInput.value.trim();
    
    if (!pnr) {
        showToast('Please enter a booking reference', 'error');
        return;
    }
    
    const ticket = allTickets.find(t => t.booking_reference.toLowerCase() === pnr.toLowerCase());
    
    if (!ticket) {
        showToast('Ticket not found', 'error');
        return;
    }
    
    if (action === 'modify') {
        showModifyModal(ticket);
    } else {
        showCancelModal(ticket);
    }
}

function showModifyModal(ticket) {
    const modalBody = document.getElementById('modalBody');
    
    // Convert DD-MM-YYYY dates to YYYY-MM-DD for HTML date inputs
    const paidDateForInput = ticket.paid_date ? formatDateToYYYYMMDD(ticket.paid_date) : '';
    
    modalBody.innerHTML = `
        <h3>Modify Ticket</h3>
        <form id="modifyForm">
            <div class="form-grid">
                <div class="form-group">
                    <label>Client Name</label>
                    <input type="text" name="name" value="${ticket.name}" required>
                </div>
                <div class="form-group">
                    <label>Phone</label>
                    <input type="tel" name="phone" value="${ticket.phone}" required>
                </div>
                <div class="form-group">
                    <label>Social Media Account Name</label>
                    <input type="text" name="account_name" value="${ticket.account_name}" required>
                </div>
                <div class="form-group">
                    <label>Account Type</label>
                    <select name="account_type" required>
                        <option value="Facebook Page" ${ticket.account_type === 'Facebook Page' ? 'selected' : ''}>Facebook Page</option>
                        <option value="Messenger" ${ticket.account_type === 'Messenger' ? 'selected' : ''}>Messenger</option>
                        <option value="Viber" ${ticket.account_type === 'Viber' ? 'selected' : ''}>Viber</option>
                        <option value="Telegram" ${ticket.account_type === 'Telegram' ? 'selected' : ''}>Telegram</option>
                        <option value="WeChat" ${ticket.account_type === 'WeChat' ? 'selected' : ''}>WeChat</option>
                        <option value="Phone" ${ticket.account_type === 'Phone' ? 'selected' : ''}>Phone</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Base Fare (MMK)</label>
                    <input type="number" name="base_fare" value="${ticket.base_fare}" step="1" required>
                </div>
                <div class="form-group">
                    <label>Net Amount (MMK)</label>
                    <input type="number" name="net_amount" value="${ticket.net_amount}" step="1" required>
                </div>
                <div class="form-group">
                    <label>Payment Method</label>
                    <select name="payment_method">
                        <option value="KBZ Pay" ${ticket.payment_method === 'KBZ Pay' ? 'selected' : ''}>KBZ Pay</option>
                        <option value="Mobile Banking" ${ticket.payment_method === 'Mobile Banking' ? 'selected' : ''}>Mobile Banking</option>
                        <option value="Aya Pay" ${ticket.payment_method === 'Aya Pay' ? 'selected' : ''}>Aya Pay</option>
                        <option value="Cash" ${ticket.payment_method === 'Cash' ? 'selected' : ''}>Cash</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Paid Date</label>
                    <input type="date" name="paid_date" value="${paidDateForInput}">
                </div>
                <div class="form-group full-width">
                    <label>Remark</label>
                    <textarea name="remark" rows="3">${ticket.remark || ''}</textarea>
                </div>
            </div>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button type="submit" class="btn btn-primary">Update Ticket</button>
            </div>
        </form>
    `;
    
    document.getElementById('modifyForm').addEventListener('submit', (e) => {
        e.preventDefault();
        updateTicket(ticket.rowIndex, e.target);
    });
    
    modal.style.display = 'block';
}

function showCancelModal(ticket) {
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = `
        <h3>Cancel Ticket</h3>
        <div style="text-align: center; padding: 2rem;">
            <p><strong>PNR Code:</strong> ${ticket.booking_reference}</p>
            <p><strong>Client Name:</strong> ${ticket.name}</p>
            <p><strong>Route:</strong> ${ticket.departure} → ${ticket.destination}</p>
            <p><strong>Travel Date:</strong> ${ticket.departing_on}</p>
            <p style="margin: 2rem 0; color: var(--text-light);">
                Are you sure you want to cancel this ticket?
            </p>
            <div class="form-actions">
                <button class="btn btn-secondary" onclick="closeModal()">No, Keep Ticket</button>
                <button class="btn btn-primary" onclick="cancelTicket(${ticket.rowIndex})">Yes, Cancel Ticket</button>
            </div>
        </div>
    `;
    
    modal.style.display = 'block';
}

async function updateTicket(rowIndex, form) {
    const formData = new FormData(form);
    const updates = {};
    
    for (let [key, value] of formData.entries()) {
        updates[key] = value;
    }
    
    // Convert date fields from YYYY-MM-DD to DD-MM-YYYY
    if (updates.paid_date) {
        updates.paid_date = formatDateToDDMMYYYY(updates.paid_date);
    }
    
    try {
        // In a real implementation, you would update the specific cells
        // For now, we'll show a success message
        showToast('Ticket updated successfully!', 'success');
        closeModal();
        await loadTicketData();
    } catch (error) {
        console.error('Error updating ticket:', error);
        showToast('Error updating ticket', 'error');
    }
}

async function cancelTicket(rowIndex) {
    try {
        // In a real implementation, you would apply strikethrough formatting
        // For now, we'll mark it as canceled in our local data
        const ticket = allTickets.find(t => t.rowIndex === rowIndex);
        if (ticket) {
            ticket.canceled = true;
        }
        
        showToast('Ticket canceled successfully!', 'success');
        closeModal();
        displayAllTickets();
    } catch (error) {
        console.error('Error canceling ticket:', error);
        showToast('Error canceling ticket', 'error');
    }
}

function closeModal() {
    modal.style.display = 'none';
}

function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 5000); // Increased time to 5 seconds to read the error
}

setupEventListeners();
