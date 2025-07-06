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
    setupEventListeners();
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
    setupCharts(); // Setup charts before loading data
    await loadTicketData(); // Load data which will then update the charts
}

// --- AUTHENTICATION ---

function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            throw (resp);
        }
        
        // This sets the token for the API client, allowing it to be remembered.
        gapi.client.setToken(resp); 

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
        loading.style.display = 'block';
        dashboardContent.style.display = 'none';
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.SHEET_NAME}!A:S`,
        });
        
        const data = response.result;
        
        if (data.values && data.values.length > 1) {
            allTickets = parseTicketData(data.values);
            updateCharts(); // This will now process all data for the year
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
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');

    // Disable button and show loading text to prevent multiple submissions
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
    
    // ADDED: Check if API is initialized
    if (!gapiInited || !gisInited) {
        showToast('Google API not initialized. Please try signing in again.', 'error');
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Ticket';
        return;
    }

    const formData = new FormData(form);
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
        // MODIFIED: Only show success toast after successful save
        await saveTicket(ticketData);
        showToast('Ticket saved successfully!', 'success');
        form.reset();
        document.getElementById('commission').value = '';
        await loadTicketData(); // Refresh data after saving
        showView('home'); // Go back to home view after successful submission
    } catch (error) {
        console.error('Error in handleSellTicket:', error);
        const errorMessage = error.result?.error?.message || 'Could not save the ticket. Check console for details.';
        showToast(`Error: ${errorMessage}`, 'error');
    } finally {
        // Re-enable button and restore original text
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Ticket';
    }
}

async function saveTicket(ticketData) {
    // ADDED: Validate required fields
    const requiredFields = ['name', 'nrc_no', 'phone', 'account_name', 'account_type', 'departure', 'destination', 'departing_on', 'airline', 'base_fare', 'booking_reference', 'net_amount'];
    for (const field of requiredFields) {
        if (!ticketData[field]) {
            throw new Error(`Missing required field: ${field}`);
        }
    }

    // ADDED: Check for valid token
    const token = gapi.client.getToken();
    if (!token || !token.access_token) {
        showToast('Authentication required. Please sign in again.', 'error');
        tokenClient.requestAccessToken({ prompt: 'consent' });
        throw new Error('No valid access token');
    }

    const values = [
        ticketData.issued_date || '', ticketData.name || '',
        ticketData.nrc_no || '', ticketData.phone || '',
        ticketData.account_name || '', ticketData.account_type || '',
        ticketData.account_link || '', ticketData.departure || '',
        ticketData.destination || '', ticketData.departing_on || '',
        ticketData.airline || '', ticketData.base_fare || 0,
        ticketData.booking_reference || '', ticketData.net_amount || 0,
        ticketData.paid, ticketData.payment_method || '',
        ticketData.paid_date || '', ticketData.commission || 0,
        ticketData.remark || ''
    ];

    try {
        const response = await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.SHEET_NAME}!A:S`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [values] },
        });
        console.log('API Response:', response);
    } catch (err) {
        console.error("API Error saving ticket:", err);
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
            <td>${(parseFloat(ticket.base_fare) || 0).toLocaleString()}</td>
            <td>${(parseFloat(ticket.net_amount) || 0).toLocaleString()}</td>
            <td><span class="status-badge ${ticket.canceled ? 'canceled' : 'confirmed'}">${ticket.canceled ? 'Canceled' : 'Active'}</span></td>
        `;
        
        tbody.appendChild(row);
    });
}

function showToast(message, type = 'success') {
    toastMessage.textContent = message;
    
    // The CSS in styles.css uses '.notification', but the HTML has class="toast".
    // This mismatch is why notifications were not showing.
    // This corrected function directly manipulates the style to ensure it's visible.
    toast.style.position = 'fixed';
    toast.style.top = '100px';
    toast.style.right = '2rem';
    toast.style.padding = '1rem 1.5rem';
    toast.style.borderRadius = '10px';
    toast.style.fontWeight = '500';
    toast.style.zIndex = '1001';
    toast.style.color = 'white';
    toast.style.transition = 'transform 0.5s ease-in-out';
    toast.style.transform = 'translateX(120%)'; // Start off-screen
    
    if (type === 'success') {
        toast.style.backgroundColor = 'rgba(72, 187, 120, 0.9)';
    } else if (type === 'error') {
        toast.style.backgroundColor = 'rgba(229, 62, 62, 0.9)';
    } else {
        toast.style.backgroundColor = 'rgba(74, 144, 226, 0.9)';
    }

    // Slide in
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 100);

    // Slide out
    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
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

function parseDateFromDDMMYYYY(dateString) {
    if (!dateString) return null;
    const parts = dateString.split('-');
    if (parts.length === 3) {
        return new Date(parts[2], parseInt(parts[1], 10) - 1, parts[0]);
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
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const initialData = Array(12).fill(0);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(74, 144, 226, 0.1)' } },
            x: { grid: { color: 'rgba(74, 144, 226, 0.1)' } }
        },
        interaction: {
            intersect: false,
            mode: 'index',
        }
    };

    // Destroy existing charts if they exist
    if (charts.commission) charts.commission.destroy();
    if (charts.netAmount) charts.netAmount.destroy();

    const commissionCtx = document.getElementById('commissionChart').getContext('2d');
    charts.commission = new Chart(commissionCtx, {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Commission',
                data: [...initialData],
                backgroundColor: 'rgba(74, 144, 226, 0.2)',
                borderColor: 'rgba(74, 144, 226, 1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: chartOptions
    });

    const netAmountCtx = document.getElementById('netAmountChart').getContext('2d');
    charts.netAmount = new Chart(netAmountCtx, {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Net Amount',
                data: [...initialData],
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
    const currentYear = 2025;
    
    // Initialize monthly totals
    const monthlyCommissions = Array(12).fill(0);
    const monthlyNetAmounts = Array(12).fill(0);
    
    const yearlyData = allTickets.filter(ticket => {
        const ticketDate = parseDateFromDDMMYYYY(ticket.issued_date);
        return ticketDate && ticketDate.getFullYear() === currentYear && !ticket.canceled;
    });

    yearlyData.forEach(ticket => {
        const ticketDate = parseDateFromDDMMYYYY(ticket.issued_date);
        const monthIndex = ticketDate.getMonth(); // 0 = January, 11 = December
        
        monthlyCommissions[monthIndex] += ticket.commission;
        monthlyNetAmounts[monthIndex] += ticket.net_amount;
    });

    // Update Commission Chart
    if (charts.commission) {
        charts.commission.data.datasets[0].data = monthlyCommissions;
        charts.commission.update();
    }

    // Update Net Amount Chart
    if (charts.netAmount) {
        charts.netAmount.data.datasets[0].data = monthlyNetAmounts;
        charts.netAmount.update();
    }
}

// --- MODAL & SEARCH ---

function performSearch() {
    const searchName = document.getElementById('searchName').value.toLowerCase();
    const searchBooking = document.getElementById('searchBooking').value.toLowerCase();
    const searchDateInput = document.getElementById('searchDate').value;
    
    const filteredTickets = allTickets.filter(ticket => {
        const nameMatch = !searchName || (ticket.name && ticket.name.toLowerCase().includes(searchName));
        const bookingMatch = !searchBooking || (ticket.booking_reference && ticket.booking_reference.toLowerCase().includes(searchBooking));
        
        let dateMatch = true;
        if (searchDateInput) {
            // Convert HTML date input (YYYY-MM-DD) to DD-MM-YYYY for comparison
            const searchDateFormatted = formatDateToDDMMYYYY(new Date(searchDateInput));
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
    const pnrInputId = action === 'modify' ? 'modifyPnr' : 'cancelPnr';
    const pnr = document.getElementById(pnrInputId).value;
    if (!pnr) {
        showToast('Please enter a PNR code.', 'error');
        return;
    }
    // Placeholder for future functionality
    showToast(`Find ticket functionality for PNR: ${pnr} is not yet implemented.`, 'info');
}

function closeModal() {
    modal.style.display = 'none';
}
