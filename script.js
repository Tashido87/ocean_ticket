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
let isSubmitting = false; // Add submission flag

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

window.onload = async () => {
    console.log('Window loaded, initializing...');
    setupEventListeners();
    
    // Check if gapi is available
    if (typeof gapi === 'undefined') {
        console.error('Google API (gapi) not loaded. Make sure you have included the Google API script.');
        showToast('Google API not loaded. Please check your internet connection and refresh the page.', 'error');
        return;
    }
    
    // Check if google.accounts is available
    if (typeof google === 'undefined' || !google.accounts) {
        console.error('Google Identity Services not loaded. Make sure you have included the Google Identity script.');
        showToast('Google Identity Services not loaded. Please check your internet connection and refresh the page.', 'error');
        return;
    }
    
    // Improved async loading of Google APIs
    try {
        await Promise.all([
            loadGapiClient(),
            loadGisClient()
        ]);
        console.log('Google APIs loaded successfully');
    } catch (error) {
        console.error('Error loading Google APIs:', error);
        showToast('Failed to load Google APIs. Please refresh the page and try again.', 'error');
    }
};

async function loadGapiClient() {
    return new Promise((resolve, reject) => {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({
                    apiKey: CONFIG.API_KEY,
                    discoveryDocs: [CONFIG.DISCOVERY_DOC],
                });
                console.log('GAPI client initialized');
                gapiInited = true;
                maybeEnableButtons();
                resolve();
            } catch (error) {
                console.error('Error initializing GAPI client:', error);
                reject(error);
            }
        });
    });
}

async function loadGisClient() {
    return new Promise((resolve, reject) => {
        try {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID,
                scope: CONFIG.SCOPES,
                callback: '', // Will be defined in handleAuthClick
            });
            console.log('GIS client initialized');
            gisInited = true;
            maybeEnableButtons();
            resolve();
        } catch (error) {
            console.error('Error initializing GIS client:', error);
            reject(error);
        }
    });
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        console.log('Both APIs initialized, enabling buttons');
        authorizeButton.style.display = 'block';
        // Hide the loading/error state
        if (loading) {
            loading.style.display = 'none';
        }
    }
}

async function initializeApp() {
    console.log('Initializing app...');
    setupCharts(); // Setup charts before loading data
    await loadTicketData(); // Load data which will then update the charts
}

// --- AUTHENTICATION ---

function handleAuthClick() {
    console.log('Auth button clicked');
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            console.error('Auth error:', resp);
            showToast('Authentication failed. Please try again.', 'error');
            return;
        }
        
        console.log('Auth successful, setting token');
        gapi.client.setToken(resp); 

        authorizeButton.style.display = 'none';
        signoutButton.style.display = 'block';
        await initializeApp();
    };

    if (gapi.client.getToken() === null) {
        console.log('Requesting new token with consent');
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        console.log('Requesting token refresh');
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

function handleSignoutClick() {
    console.log('Signout clicked');
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        authorizeButton.style.display = 'block';
        signoutButton.style.display = 'none';
        if (dashboardContent) dashboardContent.style.display = 'none';
        if (loading) loading.style.display = 'block';
        allTickets = [];
        const resultsBody = document.getElementById('resultsBody');
        if (resultsBody) resultsBody.innerHTML = '';
        if (charts.commission) charts.commission.destroy();
        if (charts.netAmount) charts.netAmount.destroy();
    }
}

// --- EVENT LISTENERS ---

function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', (e) => showView(e.target.dataset.view));
    });

    if (authorizeButton) {
        authorizeButton.addEventListener('click', handleAuthClick);
    }
    
    if (signoutButton) {
        signoutButton.addEventListener('click', handleSignoutClick);
    }
    
    const searchBtn = document.getElementById('searchBtn');
    if (searchBtn) {
        searchBtn.addEventListener('click', performSearch);
    }
    
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearSearch);
    }
    
    const sellForm = document.getElementById('sellForm');
    if (sellForm) {
        sellForm.addEventListener('submit', handleSellTicket);
        console.log('Sell form event listener added');
    } else {
        console.error('Sell form not found! Make sure the form has id="sellForm"');
    }
    
    const baseFareInput = document.getElementById('base_fare');
    if (baseFareInput) {
        baseFareInput.addEventListener('input', calculateCommission);
    }
    
    const findTicketBtn = document.getElementById('findTicketBtn');
    if (findTicketBtn) {
        findTicketBtn.addEventListener('click', () => findTicket('modify'));
    }
    
    const findCancelBtn = document.getElementById('findCancelBtn');
    if (findCancelBtn) {
        findCancelBtn.addEventListener('click', () => findTicket('cancel'));
    }
    
    const closeBtn = document.querySelector('.close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
    }
}

// --- CORE APP LOGIC ---

async function loadTicketData() {
    try {
        if (loading) loading.style.display = 'block';
        if (dashboardContent) dashboardContent.style.display = 'none';
        
        console.log('Loading ticket data...');
        
        // Add retry logic for API calls
        const response = await retryApiCall(async () => {
            return await gapi.client.sheets.spreadsheets.values.get({
                spreadsheetId: CONFIG.SHEET_ID,
                range: `${CONFIG.SHEET_NAME}!A:S`,
            });
        });
        
        const data = response.result;
        console.log('Raw data from sheets:', data);
        
        if (data.values && data.values.length > 1) {
            allTickets = parseTicketData(data.values);
            console.log('Parsed tickets:', allTickets);
            updateCharts();
            displayAllTickets();
        }
        
        if (loading) loading.style.display = 'none';
        if (dashboardContent) dashboardContent.style.display = 'block';
    } catch (error) {
        const errorMessage = error.result?.error?.message || error.toString();
        console.error('Error loading ticket data:', error);
        showToast(`Error loading data: ${errorMessage}`, 'error');
        if (loading) loading.style.display = 'none';
    }
}

// Add retry logic for API calls
async function retryApiCall(apiCall, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await apiCall();
        } catch (error) {
            console.warn(`API call failed, attempt ${i + 1}/${maxRetries}:`, error);
            
            if (i === maxRetries - 1) {
                throw error;
            }
            
            // Exponential backoff
            await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
        }
    }
}

async function handleSellTicket(e) {
    e.preventDefault();
    console.log('Sell ticket form submitted');
    
    // Prevent multiple submissions
    if (isSubmitting) {
        console.log('Already submitting, ignoring duplicate submission');
        return;
    }
    
    isSubmitting = true;
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';
    }
    
    try {
        if (!gapiInited || !gisInited) {
            throw new Error('Google API not initialized. Please try signing in again.');
        }

        // Check if user is authenticated
        const token = gapi.client.getToken();
        if (!token || !token.access_token) {
            throw new Error('Please sign in to Google Sheets first.');
        }

        // Enhanced form data collection with better error handling
        const ticketData = collectFormData(form);
        console.log('Form data collected:', ticketData);
        
        // Validate required fields
        validateTicketData(ticketData);
        
        // Format dates
        if (ticketData.issued_date) {
            ticketData.issued_date = formatDateToDDMMYYYY(ticketData.issued_date);
        }
        if (ticketData.departing_on) {
            ticketData.departing_on = formatDateToDDMMYYYY(ticketData.departing_on);
        }
        if (ticketData.paid_date) {
            ticketData.paid_date = formatDateToDDMMYYYY(ticketData.paid_date);
        }
        
        console.log('Ticket data to save:', ticketData);
        
        await saveTicket(ticketData);
        showToast('Ticket saved successfully!', 'success');
        form.reset();
        const commissionField = document.getElementById('commission');
        if (commissionField) commissionField.value = '';
        await loadTicketData(); 
        showView('home');
        
    } catch (error) {
        console.error('Error in handleSellTicket:', error);
        const errorMessage = error.result?.error?.message || error.message || 'Could not save the ticket. Check console for details.';
        showToast(`Error: ${errorMessage}`, 'error');
    } finally {
        isSubmitting = false;
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Submit Ticket';
        }
    }
}

// Enhanced form data collection
function collectFormData(form) {
    const formData = new FormData(form);
    const ticketData = {};
    
    // List of expected fields - make sure these match your HTML form IDs
    const expectedFields = [
        'issued_date', 'name', 'nrc_no', 'phone', 'account_name', 'account_type', 
        'account_link', 'departure', 'destination', 'departing_on', 'airline', 
        'base_fare', 'booking_reference', 'net_amount', 'paid', 'payment_method', 
        'paid_date', 'commission', 'remark'
    ];
    
    expectedFields.forEach(field => {
        const element = form.querySelector(`#${field}`);
        if (element) {
            if (element.type === 'checkbox') {
                ticketData[field] = element.checked;
            } else {
                ticketData[field] = element.value || '';
            }
        } else {
            console.warn(`Form field not found: ${field}`);
            ticketData[field] = '';
        }
    });
    
    return ticketData;
}

// Enhanced validation
function validateTicketData(ticketData) {
    const requiredFields = [
        'issued_date', 'name', 'nrc_no', 'phone', 'account_name', 'account_type', 
        'departure', 'destination', 'departing_on', 'airline', 'base_fare', 
        'booking_reference', 'net_amount'
    ];
    
    const missingFields = [];
    
    for (const field of requiredFields) {
        if (!ticketData[field] || ticketData[field].toString().trim() === '') {
            missingFields.push(field.replace('_', ' '));
        }
    }
    
    if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    // Validate numeric fields
    const numericFields = ['base_fare', 'net_amount', 'commission'];
    for (const field of numericFields) {
        if (ticketData[field] && isNaN(parseFloat(ticketData[field]))) {
            throw new Error(`Invalid number format for field: ${field.replace('_', ' ')}`);
        }
    }
}

async function saveTicket(ticketData) {
    console.log('Saving ticket:', ticketData);
    
    const token = gapi.client.getToken();
    if (!token || !token.access_token) {
        throw new Error('No valid access token');
    }

    // The order of values matches your Google Sheet columns exactly
    const values = [
        [
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
            parseFloat(ticketData.base_fare) || 0,
            ticketData.booking_reference || '',
            parseFloat(ticketData.net_amount) || 0,
            ticketData.paid || false,
            ticketData.payment_method || '',
            ticketData.paid_date || '',
            parseFloat(ticketData.commission) || 0,
            ticketData.remark || ''
        ]
    ];

    console.log('Values to append:', values);

    try {
        const response = await retryApiCall(async () => {
            return await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: CONFIG.SHEET_ID,
                range: `${CONFIG.SHEET_NAME}!A:S`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: values },
            });
        });
        
        console.log('API Response:', response);
        return response;
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

    if (viewName === 'sell') {
        const issuedDateInput = document.getElementById('issued_date');
        if (issuedDateInput) {
            // Set the default value to today's date
            issuedDateInput.valueAsDate = new Date();
        }
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
    if (!tbody) return;
    
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
    console.log(`Toast: ${type} - ${message}`);
    if (toastMessage) {
        toastMessage.textContent = message;
    }
    if (toast) {
        toast.className = `notification ${type} show`;
        setTimeout(() => {
            toast.className = toast.className.replace('show', '');
        }, 5000);
    }
}

// --- UTILITY & HELPER FUNCTIONS ---

function parseTicketData(rawData) {
    const headers = rawData[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    const tickets = [];
    
    console.log('Headers:', headers);
    
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
    if (isNaN(d.getTime())) return '';
    // Adjust for timezone offset by working with UTC dates
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}-${month}-${year}`;
}

function parseDateFromDDMMYYYY(dateString) {
    if (!dateString) return null;
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
    return formatDateToDDMMYYYY(new Date());
}

function calculateCommission() {
    const baseFareInput = document.getElementById('base_fare');
    const commissionInput = document.getElementById('commission');
    
    if (baseFareInput && commissionInput) {
        const baseFare = parseFloat(baseFareInput.value) || 0;
        const commission = Math.round((baseFare * 0.05) * 0.60);
        commissionInput.value = commission;
    }
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

    if (charts.commission) charts.commission.destroy();
    if (charts.netAmount) charts.netAmount.destroy();

    const commissionChart = document.getElementById('commissionChart');
    const netAmountChart = document.getElementById('netAmountChart');

    if (commissionChart) {
        const commissionCtx = commissionChart.getContext('2d');
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
    }

    if (netAmountChart) {
        const netAmountCtx = netAmountChart.getContext('2d');
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
}

function updateCharts() {
    const currentYear = 2025;
    
    const monthlyCommissions = Array(12).fill(0);
    const monthlyNetAmounts = Array(12).fill(0);
    
    const yearlyData = allTickets.filter(ticket => {
        const ticketDate = parseDateFromDDMMYYYY(ticket.issued_date);
        return ticketDate && ticketDate.getFullYear() === currentYear && !ticket.canceled;
    });

    yearlyData.forEach(ticket => {
        const ticketDate = parseDateFromDDMMYYYY(ticket.issued_date);
        if (ticketDate) {
            const monthIndex = ticketDate.getMonth();
            monthlyCommissions[monthIndex] += ticket.commission;
            monthlyNetAmounts[monthIndex] += ticket.net_amount;
        }
    });

    if (charts.commission) {
        charts.commission.data.datasets[0].data = monthlyCommissions;
        charts.commission.update();
    }

    if (charts.netAmount) {
        charts.netAmount.data.datasets[0].data = monthlyNetAmounts;
        charts.netAmount.update();
    }
}

// --- MODAL & SEARCH ---

function performSearch() {
    const searchNameInput = document.getElementById('searchName');
    const searchBookingInput = document.getElementById('searchBooking');
    const searchDateInput = document.getElementById('searchDate');
    
    const searchName = searchNameInput ? searchNameInput.value.toLowerCase() : '';
    const searchBooking = searchBookingInput ? searchBookingInput.value.toLowerCase() : '';
    const searchDateInputValue = searchDateInput ? searchDateInput.value : '';
    
    const filteredTickets = allTickets.filter(ticket => {
        const nameMatch = !searchName || (ticket.name && ticket.name.toLowerCase().includes(searchName));
        const bookingMatch = !searchBooking || (ticket.booking_reference && ticket.booking_reference.toLowerCase().includes(searchBooking));
        
        let dateMatch = true;
        if (searchDateInputValue) {
            const searchDateFormatted = formatDateToDDMMYYYY(new Date(searchDateInputValue));
            dateMatch = ticket.issued_date === searchDateFormatted;
        }
        
        return nameMatch && bookingMatch && dateMatch;
    });
    
    displayTickets(filteredTickets);
}

function clearSearch() {
    const searchNameInput = document.getElementById('searchName');
    const searchBookingInput = document.getElementById('searchBooking');
    const searchDateInput = document.getElementById('searchDate');
    
    if (searchNameInput) searchNameInput.value = '';
    if (searchBookingInput) searchBookingInput.value = '';
    if (searchDateInput) searchDateInput.value = '';
    
    displayAllTickets();
}

function findTicket(action) {
    const pnrInputId = action === 'modify' ? 'modifyPnr' : 'cancelPnr';
    const pnrInput = document.getElementById(pnrInputId);
    const pnr = pnrInput ? pnrInput.value : '';
    
    if (!pnr) {
        showToast('Please enter a PNR code.', 'error');
        return;
    }
    showToast(`Find ticket functionality for PNR: ${pnr} is not yet implemented.`, 'info');
}

function closeModal() {
    if (modal) {
        modal.style.display = 'none';
    }
}

// Add debugging function to check form elements
function debugForm() {
    console.log('=== FORM DEBUG ===');
    const form = document.getElementById('sellForm');
    if (!form) {
        console.error('Form with id="sellForm" not found!');
        return;
    }
    
    console.log('Form found:', form);
    
    const expectedFields = [
        'issued_date', 'name', 'nrc_no', 'phone', 'account_name', 'account_type', 
        'account_link', 'departure', 'destination', 'departing_on', 'airline', 
        'base_fare', 'booking_reference', 'net_amount', 'paid', 'payment_method', 
        'paid_date', 'commission', 'remark'
    ];
    
    expectedFields.forEach(field => {
        const element = form.querySelector(`#${field}`);
        if (element) {
            console.log(`✓ Found field: ${field}`, element);
        } else {
            console.error(`✗ Missing field: ${field}`);
        }
    });
    
    console.log('=== END DEBUG ===');
}

// Call this function from browser console to debug form issues
window.debugForm = debugForm;
