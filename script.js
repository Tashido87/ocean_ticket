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

// --- INITIALIZATION ---

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
        callback: '', // Will be defined in handleAuthClick
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

// --- AUTHENTICATION ---

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        // User has authorized, now fully initialize the app
        authorizeButton.style.display = 'none';
        signoutButton.style.display = 'block';
        await initializeApp();
    };

    if (gapi.client.getToken() === null) {
        // Prompt the user to select a Google Account and ask for consent to share their data
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        // Skip display of account chooser and consent dialog for an existing session.
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
        dashboardContent.style.display = 'none';
        loading.style.display = 'block';
        allTickets = [];
        document.getElementById('resultsBody').innerHTML = '';
        if (charts.commission) charts.commission.destroy();
        if (charts.netAmount) charts.netAmount.destroy();
    }
}


// --- EVENT LISTENERS ---

function setupEventListeners() {
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => showView(e.target.dataset.view));
    });

    authorizeButton.addEventListener('click', handleAuthClick);
    signoutButton.addEventListener('click', handleSignoutClick);
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('clearBtn').addEventListener('click', clearSearch);
    document.getElementById('sellForm').addEventListener('submit', handleSellTicket);
    document.getElementById('base_fare').addEventListener('input', calculateCommission);
    document.getElementById('findTicketBtn').addEventListener('click', () => findTicket('modify'));
    document.getElementById('findCancelBtn').addEventListener('click', () => findTicket('cancel'));
    document.querySelector('.close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}


// --- CORE APP LOGIC ---

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
        const errorMessage = error.result?.error?.message || error.toString();
        console.error('Error loading ticket data:', error);
        showToast(`Error loading data: ${errorMessage}`, 'error');
        loading.style.display = 'none';
    }
}

async function handleSellTicket(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const ticketData = {};
    
    for (let [key, value] of formData.entries()) {
        ticketData[key] = value;
    }
    
    ticketData.issued_date = getCurrentDateDDMMYYYY();
    ticketData.paid = document.getElementById('paid').checked;
    ticketData.commission = document.getElementById('commission').value;
    
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
        await loadTicketData(); // Refresh data after saving
    } catch (error) {
        console.error('Error in handleSellTicket:', error);
        const errorMessage = error.result?.error?.message || 'Could not save the ticket.';
        showToast(`Error: ${errorMessage}`, 'error');
    }
}

async function saveTicket(ticketData) {
    const values = [
        ticketData.issued_date || '',
        ticketData.name || '',
        ticketData.nrc_no || '',
        ticketData.phone || '',
        ticketData.account_name || '',
        ticketData.account_type || '',
        ticketData.account_link || '',
        ticketData.departure || '',
        ticketData.destination || '',
        ticketData.departing_on || '',
        ticketData.airline || '',
        ticketData.base_fare || 0,
        ticketData.booking_reference || '',
        ticketData.net_amount || 0,
        ticketData.paid,
        ticketData.payment_method || '',
        ticketData.paid_date || '',
        ticketData.commission || 0,
        ticketData.remark || ''
    ];

    try {
        const response = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.SHEET_NAME}!A:S`,
            valueInputOption: 'USER_ENTERED', // Correctly parse data types
            resource: {
                values: [values],
            },
        });
        console.log('API Response:', response);
    } catch (err) {
        console.error("API Error saving ticket:", err);
        // Re-throw the error so it can be caught by the calling function
        throw err;
    }
}


// --- UI & DISPLAY ---

function showView(viewName) {
    navBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    views.forEach(view => {
        view.classList.toggle('active', view.id === `${viewName}-view`);
    });
    currentView = viewName;
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
        row.style.animationDelay = `${index * 0.05}s`;
        
        row.innerHTML = `
            <td>${ticket.issued_date || ''}</td>
            <td>${ticket.name || ''}</td>
            <td>${ticket.booking_reference || ''}</td>
            <td>${ticket.departure || ''} → ${ticket.destination || ''}</td>
            <td>${ticket.airline || ''}</td>
            <td>${(parseFloat(ticket.base_fare) || 0).toFixed(2)}</td>
            <td>${(parseFloat(ticket.net_amount) || 0).toFixed(2)}</td>
            <td><span class="status-badge ${ticket.canceled ? 'canceled' : 'confirmed'}">${ticket.canceled ? 'Canceled' : 'Active'}</span></td>
        `;
        
        tbody.appendChild(row);
    });
}

function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    toast.className = 'toast show'; // Always add show
    toast.classList.add(type); // Add type class
    
    setTimeout(() => {
        toast.classList.remove('show', 'success', 'error', 'info');
    }, 5000);
}


// --- UTILITY & HELPER FUNCTIONS ---

function parseTicketData(rawData) {
    const headers = rawData[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    const tickets = [];
    
    for (let i = 1; i < rawData.length; i++) {
        const row = rawData[i];
        const ticket = {};
        
        headers.forEach((header, index) => {
            ticket[header] = row[index] || '';
        });
        
        ticket.base_fare = parseFloat(ticket.base_fare) || 0;
        ticket.net_amount = parseFloat(ticket.net_amount) || 0;
        ticket.commission = parseFloat(ticket.commission) || 0;
        ticket.paid = ticket.paid === 'TRUE' || ticket.paid === true;
        ticket.rowIndex = i + 1;
        
        tickets.push(ticket);
    }
    
    return tickets;
}

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
    const parts = dateString.split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateString;
}

function parseDateFromDDMMYYYY(dateString) {
    if (!dateString) return null;
    const parts = dateString.split('-');
    if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    return new Date(dateString);
}

function getCurrentDateDDMMYYYY() {
    return formatDateToDDMMYYYY(new Date());
}

function calculateCommission() {
    const baseFare = parseFloat(document.getElementById('base_fare').value) || 0;
    const commission = Math.round((baseFare * 0.05) * 0.60);
    document.getElementById('commission').value = commission;
}


// --- CHARTS ---

function setupCharts() {
    // Chart options can be defined once
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(74, 144, 226, 0.1)' } },
            x: { grid: { color: 'rgba(74, 144, 226, 0.1)' } }
        }
    };

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

function updateCharts() {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    const monthlyData = allTickets.filter(ticket => {
        const ticketDate = parseDateFromDDMMYYYY(ticket.issued_date);
        return ticketDate && ticketDate.getMonth() === currentMonth && ticketDate.getFullYear() === currentYear && !ticket.canceled;
    });
    
    const totalCommission = monthlyData.reduce((sum, ticket) => sum + ticket.commission, 0);
    const totalNetAmount = monthlyData.reduce((sum, ticket) => sum + ticket.net_amount, 0);

    if (charts.commission) {
        charts.commission.data.datasets[0].data = [totalCommission];
        charts.commission.update();
    }
    if (charts.netAmount) {
        charts.netAmount.data.datasets[0].data = [totalNetAmount];
        charts.netAmount.update();
    }
}


// --- MODAL & SEARCH (Placeholder functions, can be expanded) ---

function performSearch() {
    const searchName = document.getElementById('searchName').value.toLowerCase();
    const searchBooking = document.getElementById('searchBooking').value.toLowerCase();
    const searchDate = document.getElementById('searchDate').value;
    
    const filteredTickets = allTickets.filter(ticket => {
        const nameMatch = !searchName || (ticket.name && ticket.name.toLowerCase().includes(searchName));
        const bookingMatch = !searchBooking || (ticket.booking_reference && ticket.booking_reference.toLowerCase().includes(searchBooking));
        
        let dateMatch = true;
        if (searchDate) {
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

function findTicket(action) {
    // Implementation for finding a ticket can be added here
    console.log(`Finding ticket for action: ${action}`);
}

function closeModal() {
    modal.style.display = 'none';
}

// Initialize the app
setupEventListeners();
