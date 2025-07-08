// Configuration
const CONFIG = {
    SHEET_ID: '1SGc80isz0VRVt447R_q-fBdZ_me52H_Z32W5HauHMWQ',
    API_KEY: 'AIzaSyC9JSD6VWXMQ7Pe8VPf-gIlNUtcwQhkG1o', // It is strongly recommended to move this to a secure backend.
    CLIENT_ID: '254093944424-mfvk48avc9n86de6jit9oai7kqrsr2f7.apps.googleusercontent.com', // IMPORTANT: REPLACE WITH YOUR CLIENT ID
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    SHEET_NAME: '2025',
    BOOKING_SHEET_NAME: 'booking' // New configuration for the booking tab
};

// Global variables
let allTickets = [];
let filteredTickets = [];
let allBookings = []; // For storing booking data
let filteredBookings = []; // For displaying sorted/filtered booking data
let charts = {};
let tokenClient;
let gapiInited = false;
let gisInited = false;
let isSubmitting = false; 
const rowsPerPage = 10;
let currentPage = 1;
let bookingCurrentPage = 1; // Pagination for booking table
let searchTimeout;


// --- DOM Elements ---
const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');
const loading = document.getElementById('loading');
const dashboardContent = document.getElementById('dashboard-content');
const detailsModal = document.getElementById('modal');
const detailsModalBody = document.getElementById('modalBody');
const modifyModal = document.getElementById('modifyModal');
const modifyModalBody = document.getElementById('modifyModalBody');
const cancelModal = document.getElementById('cancelModal');
const cancelModalBody = document.getElementById('cancelModalBody');
const toast = document.getElementById('toast');
const authorizeButton = document.getElementById('authorize_button');
const signoutButton = document.getElementById('signout_button');
// New Booking-related DOM elements
const bookingDetailModal = document.getElementById('bookingDetailModal');
const bookingDetailModalBody = document.getElementById('bookingDetailModalBody');
const bookingConfirmModal = document.getElementById('bookingConfirmModal');
const bookingConfirmModalBody = document.getElementById('bookingConfirmModalBody');


// --- INITIALIZATION ---
window.onload = async () => {
    initializeDatepickers();
    setupEventListeners();
    initializeBackgroundChanger();
    if (typeof gapi === 'undefined' || !google.accounts) { showToast('Google API scripts not loaded.', 'error'); return; }
    try {
        // These will now trigger the automatic sign-in check upon completion
        await Promise.all([loadGapiClient(), loadGisClient()]);
    } catch (error) {
        showToast('Failed to load Google APIs. Please refresh.', 'error');
        authorizeButton.style.display = 'block';
        loading.style.display = 'none';
    }
};

function initializeDatepickers() {
    const options = { format: 'mm/dd/yyyy', autohide: true, todayHighlight: true };
    ['searchTravelDate', 'issued_date', 'departing_on', 'paid_date', 'booking_departing_on'].forEach(id => {
        const el = document.getElementById(id);
        if (el) new Datepicker(el, options);
    });
}

async function loadGapiClient() {
    return new Promise((resolve, reject) => {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({ apiKey: CONFIG.API_KEY, discoveryDocs: [CONFIG.DISCOVERY_DOC] });
                gapiInited = true;
                tryAutoSignIn(); // Attempt to sign in once GAPI is ready
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
                callback: async (tokenResponse) => {
                    // This single callback handles all token responses
                    if (tokenResponse.error) {
                        // This can happen if silent sign-in fails, which is expected
                        // if the user isn't logged in. We just show the sign-in button.
                        console.log('Token request failed:', tokenResponse.error);
                        authorizeButton.style.display = 'block';
                        loading.style.display = 'none';
                        return;
                    }
                    // On success, set the token and initialize the app
                    gapi.client.setToken(tokenResponse);
                    authorizeButton.style.display = 'none';
                    signoutButton.style.display = 'block';
                    await initializeApp();
                },
            });
            gisInited = true;
            tryAutoSignIn(); // Attempt to sign in once GIS is ready
            resolve();
        } catch (error) { reject(error); }
    });
}

// --- AUTHENTICATION ---

// New function to attempt a silent sign-in on page load
function tryAutoSignIn() {
    // We can only attempt this if both Google libraries are fully loaded
    if (gapiInited && gisInited) {
        // The prompt: '' option attempts to get a token without showing a popup.
        // It will succeed if the user is signed in and has previously given consent.
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

// This function is now only for the manual "Sign In" button click
function handleAuthClick() {
    // If the user clicks, it means silent sign-in failed.
    // We use prompt: 'consent' to force the Google sign-in popup.
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token) {
        google.accounts.oauth2.revoke(token.access_token, () => {
            console.log('Token revoked.');
        });
        gapi.client.setToken('');
        // Reset the UI to the signed-out state
        authorizeButton.style.display = 'block';
        signoutButton.style.display = 'none';
        dashboardContent.style.display = 'none';
        loading.style.display = 'block';
        allTickets = [];
        allBookings = []; // Clear booking data on signout
        document.getElementById('resultsBody').innerHTML = '';
        document.getElementById('bookingTableBody').innerHTML = '';
    }
}

async function initializeApp() {
    try {
        await Promise.all([
            loadTicketData(),
            loadBookingData()
        ]);
    } catch (error) {
        console.error("Initialization failed:", error);
        showToast('A critical error occurred during data initialization. Please check the console (F12) for details.', 'error');
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
    document.getElementById('clearModifyBtn').addEventListener('click', clearModifyResults);
    document.getElementById('findCancelBtn').addEventListener('click', findTicketForCancel);
    document.getElementById('clearCancelBtn').addEventListener('click', clearCancelResults);
    
    // New Booking Event Listeners
    document.getElementById('newBookingBtn').addEventListener('click', showNewBookingForm);
    document.getElementById('cancelNewBookingBtn').addEventListener('click', hideNewBookingForm);
    document.getElementById('newBookingForm').addEventListener('submit', handleNewBookingSubmit);
    document.getElementById('bookingSearchBtn').addEventListener('click', performBookingSearch);
    document.getElementById('bookingClearBtn').addEventListener('click', clearBookingSearch);
    bookingDetailModal.querySelector('.close').addEventListener('click', () => bookingDetailModal.style.display = "none");

    ['departure', 'destination', 'searchDeparture', 'searchDestination', 'booking_departure', 'booking_destination'].forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            const tempInput = document.createElement('input');
            tempInput.setAttribute('type', 'text');
            tempInput.setAttribute('style', 'position:absolute;opacity:0;height:0;width:0;');
            select.parentNode.insertBefore(tempInput, select);

            select.addEventListener('focus', () => {
                tempInput.focus();
            });

            tempInput.addEventListener('keyup', (e) => handleShortcutTyping(e, id));
        }
    });

    modifyModal.querySelector('.close').addEventListener('click', () => modifyModal.style.display = "none");
    cancelModal.querySelector('.close').addEventListener('click', () => cancelModal.style.display = "none");
    window.addEventListener('click', (event) => {
        if (event.target == detailsModal) detailsModal.style.display = "none";
        if (event.target == modifyModal) modifyModal.style.display = "none";
        if (event.target == cancelModal) cancelModal.style.display = "none";
        if (event.target == bookingDetailModal) bookingDetailModal.style.display = "none";
        if (event.target == bookingConfirmModal) bookingConfirmModal.style.display = "none";
    });
}

// --- CORE APP LOGIC (TICKETS) ---
async function loadTicketData() {
    try {
        loading.style.display = 'block';
        dashboardContent.style.display = 'none';
        const response = await gapi.client.sheets.spreadsheets.values.get({ 
            spreadsheetId: CONFIG.SHEET_ID, 
            range: `${CONFIG.SHEET_NAME}!A:T` 
        });
        
        if (response.result.values && response.result.values.length > 1) {
            allTickets = parseTicketData(response.result.values);
            updateDashboardData();
            displayAllTickets();
        }
        loading.style.display = 'none';
        dashboardContent.style.display = 'flex';
    } catch (error) {
        showToast(`Error loading ticket data: ${error.result?.error?.message || error}`, 'error');
        loading.style.display = 'none';
    }
}

function parseTicketData(values) {
    const headers = values[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    return values.slice(1).map((row, i) => {
        const ticket = {};
        headers.forEach((h, j) => {
            const value = row[j] || '';
            ticket[h] = typeof value === 'string' ? value.trim() : value;
        });
        const safeParse = (val) => parseFloat(String(val).replace(/,/g, '')) || 0;
        ['base_fare', 'net_amount', 'commission', 'extra_fare'].forEach(key => ticket[key] = safeParse(ticket[key]));
        ticket.paid = ticket.paid === 'TRUE';
        ticket.rowIndex = i + 2;
        return ticket;
    });
}


// --- BOOKING LOGIC ---
async function loadBookingData() {
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.BOOKING_SHEET_NAME}!A:K`
        });

        if (response.result.values) {
            allBookings = parseBookingData(response.result.values);
        } else {
            allBookings = [];
        }
        populateBookingSearchOptions();
        displayBookings();
    } catch (error) {
        showToast(`Error loading booking data: ${error.result?.error?.message || error}`, 'error');
        document.getElementById('bookingTableBody').innerHTML = `<tr><td colspan="7" style="text-align:center; color: #F85149;">Failed to load data.</td></tr>`;
    }
}

function parseBookingData(values) {
    if (values.length < 1) return [];
    const headers = values[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    return values.slice(1).map((row, i) => {
        const booking = {};
        headers.forEach((h, j) => {
            const value = row[j] || '';
            booking[h] = typeof value === 'string' ? value.trim() : value;
        });
        booking.rowIndex = i + 2; // Sheet rows are 1-indexed, and we have a header
        return booking;
    });
}

function displayBookings(bookingsToDisplay) {
    const tbody = document.getElementById('bookingTableBody');
    tbody.innerHTML = '';
    
    let bookings;
    if (bookingsToDisplay) {
        // If a specific set of bookings is provided (e.g., from search), use it
        bookings = bookingsToDisplay;
    } else {
        // Otherwise, show the default view (current, non-actioned bookings)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        bookings = allBookings.filter(b => {
            const hasNoAction = !b.remark || String(b.remark).trim() === '';
            const travelDate = parseSheetDate(b.departing_on);
            return hasNoAction && travelDate >= today;
        });
    }

    // Sort whatever list of bookings we're displaying
    bookings.sort((a, b) => {
        const dateA = parseSheetDate(a.departing_on);
        const dateB = parseSheetDate(b.departing_on);
        return dateA - dateB;
    });

    filteredBookings = bookings; // Store the currently displayed set for pagination

    if (filteredBookings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No bookings found.</td></tr>`;
        setupBookingPagination([]);
        return;
    }
    
    // Paginate and Render
    bookingCurrentPage = 1;
    renderBookingPage(1);
}

function renderBookingPage(page) {
    bookingCurrentPage = page;
    const tbody = document.getElementById('bookingTableBody');
    tbody.innerHTML = '';

    const paginated = filteredBookings.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    paginated.forEach(booking => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${booking.departing_on || ''}</td>
            <td>${booking.name || ''}</td>
            <td>${(booking.departure || '').split(' ')[0]}→${(booking.destination || '').split(' ')[0]}</td>
            <td>${booking.pax_no || ''}</td>
            <td><input type="checkbox" class="action-checkbox" onclick="handleGetTicket(${booking.rowIndex})"></td>
            <td><input type="checkbox" class="action-checkbox" onclick="handleCancelBooking(${booking.rowIndex})"></td>
            <td><button class="btn btn-secondary" style="padding:0.5rem 1rem;" onclick="showBookingDetails(${booking.rowIndex})">Details</button></td>
        `;
    });
    
    setupBookingPagination(filteredBookings);
}

function handleGetTicket(rowIndex) {
    const booking = allBookings.find(b => b.rowIndex === rowIndex);
    const message = `Are you sure you want to mark booking for <strong>${booking.name}</strong> as "Get Ticket"? This will remove it from the list.`;
    showBookingConfirmModal(message, () => updateBookingStatus(rowIndex, 'Get Ticket'));
}

function handleCancelBooking(rowIndex) {
    const booking = allBookings.find(b => b.rowIndex === rowIndex);
    const message = `Are you sure you want to <strong>CANCEL</strong> the booking for <strong>${booking.name}</strong>? This will remove it from the list.`;
    showBookingConfirmModal(message, () => updateBookingStatus(rowIndex, 'Canceled'));
}

async function updateBookingStatus(rowIndex, remark) {
    try {
        isSubmitting = true;
        showToast('Updating booking status...', 'info');
        const range = `${CONFIG.BOOKING_SHEET_NAME}!K${rowIndex}`;
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[remark]]
            }
        });
        showToast('Booking updated successfully!', 'success');
        await loadBookingData();
    } catch (error) {
        showToast(`Update Error: ${error.result?.error?.message || 'Could not update.'}`, 'error');
        await loadBookingData();
    } finally {
        isSubmitting = false;
        bookingConfirmModal.style.display = 'none';
    }
}

function showBookingDetails(rowIndex) {
    const booking = allBookings.find(b => b.rowIndex === rowIndex);
    if (booking) {
        bookingDetailModalBody.innerHTML = `
            <h3>Booking Request Details</h3>
            <p><strong>Name:</strong> ${booking.name || 'N/A'}</p>
            <p><strong>NRC No:</strong> ${booking.nrc_no || 'N/A'}</p>
            <p><strong>Phone:</strong> ${makeClickable(booking.phone)}</p>
            <p><strong>Pax No:</strong> ${booking.pax_no || 'N/A'}</p>
            <hr style="border-color: rgba(255,255,255,0.2); margin: 1rem 0;">
            <p><strong>Account Name:</strong> ${booking.account_name || 'N/A'}</p>
            <p><strong>Account Type:</strong> ${booking.account_type || 'N/A'}</p>
            <p><strong>Account Link:</strong> ${makeClickable(booking.account_link) || 'N/A'}</p>
            <hr style="border-color: rgba(255,255,255,0.2); margin: 1rem 0;">
            <p><strong>Route:</strong> ${booking.departure || 'N/A'} → ${booking.destination || 'N/A'}</p>
            <p><strong>Travel Date:</strong> ${booking.departing_on || 'N/A'}</p>
            <p><strong>Remark:</strong> ${booking.remark || 'N/A'}</p>
            <div style="text-align: center; margin-top: 1.5rem;">
                <button class="btn btn-secondary" onclick="bookingDetailModal.style.display='none'">Close</button>
            </div>
        `;
        bookingDetailModal.style.display = 'block';
    }
}

function showNewBookingForm() {
    document.getElementById('booking-display-container').style.display = 'none';
    document.getElementById('booking-form-container').style.display = 'block';
}

function hideNewBookingForm() {
    document.getElementById('booking-form-container').style.display = 'none';
    document.getElementById('booking-display-container').style.display = 'block';
    document.getElementById('newBookingForm').reset();
}

async function handleNewBookingSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;
    isSubmitting = true;
    const submitButton = e.target.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
        const bookingData = {
            name: document.getElementById('booking_name').value.toUpperCase(),
            nrc_no: document.getElementById('booking_nrc_no').value.toUpperCase(),
            phone: document.getElementById('booking_phone').value,
            account_name: document.getElementById('booking_account_name').value.toUpperCase(),
            account_type: document.getElementById('booking_account_type').value.toUpperCase(),
            account_link: document.getElementById('booking_account_link').value,
            departure: document.getElementById('booking_departure').value.toUpperCase(),
            destination: document.getElementById('booking_destination').value.toUpperCase(),
            departing_on: document.getElementById('booking_departing_on').value,
            pax_no: document.getElementById('booking_pax_no').value,
        };

        if (!bookingData.name || !bookingData.departing_on) {
            throw new Error('Client Name and Travel Date are required.');
        }

        const values = [[
            bookingData.name, bookingData.nrc_no, bookingData.phone,
            bookingData.account_name, bookingData.account_type, bookingData.account_link,
            bookingData.departure, bookingData.destination, 
            formatDateForSheet(bookingData.departing_on),
            bookingData.pax_no, 
            '' 
        ]];

        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.BOOKING_SHEET_NAME}!A:K`,
            valueInputOption: 'USER_ENTERED',
            resource: { values },
        });

        showToast('Booking saved successfully!', 'success');
        hideNewBookingForm();
        await loadBookingData();
    } catch (error) {
        showToast(`Error: ${error.message || 'Could not save booking.'}`, 'error');
    } finally {
        isSubmitting = false;
        if (submitButton) submitButton.disabled = false;
    }
}

function setupBookingPagination(items) {
    const container = document.getElementById('bookingPagination');
    container.innerHTML = '';
    const pageCount = Math.ceil(items.length / rowsPerPage);
    if (pageCount <= 1) return;

    const createBtn = (txt, pg, enabled = true) => {
        const btn = document.createElement('button');
        btn.className = 'pagination-btn';
        btn.innerHTML = txt;
        btn.disabled = !enabled;
        if (enabled) {
            btn.onclick = () => renderBookingPage(pg);
        }
        if (pg === bookingCurrentPage) {
            btn.classList.add('active');
        }
        return btn;
    };

    container.append(createBtn('&laquo;', bookingCurrentPage - 1, bookingCurrentPage > 1));
    for (let i = 1; i <= pageCount; i++) {
        container.append(createBtn(i, i));
    }
    container.append(createBtn('&raquo;', bookingCurrentPage + 1, bookingCurrentPage < pageCount));
}

function showBookingConfirmModal(message, onConfirm) {
    bookingConfirmModalBody.innerHTML = `
        <p style="margin-bottom: 1.5rem; line-height: 1.5;">${message}</p>
        <div class="form-actions">
            <button id="confirmCancelBtn" type="button" class="btn btn-secondary">Back</button>
            <button id="confirmActionBtn" type="button" class="btn btn-primary">Confirm</button>
        </div>
    `;
    bookingConfirmModal.style.display = 'block';

    document.getElementById('confirmActionBtn').onclick = onConfirm;
    document.getElementById('confirmCancelBtn').onclick = async () => {
        bookingConfirmModal.style.display = 'none';
        await loadBookingData();
    };
}

// --- NEW BOOKING SEARCH FUNCTIONS ---
function populateBookingSearchOptions() {
    const select = document.getElementById('bookingSearchRoute');
    select.innerHTML = '<option value="">-- SEARCH BY ROUTE --</option>'; // Reset

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeBookings = allBookings.filter(b => {
        const hasNoAction = !b.remark || String(b.remark).trim() === '';
        const travelDate = parseSheetDate(b.departing_on);
        return hasNoAction && travelDate >= today;
    });

    const routes = [...new Set(activeBookings.map(b => `${b.departure || ''}→${b.destination || ''}`))];
    
    routes.sort().forEach(route => {
        const option = document.createElement('option');
        option.value = route;
        option.textContent = route.replace(/ \([^)]*\)/g, ''); // Clean display like RGN→MDL
        select.appendChild(option);
    });
}

function performBookingSearch() {
    const routeQuery = document.getElementById('bookingSearchRoute').value;
    if (!routeQuery) {
        showToast('Please select a route to search.', 'info');
        return;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const searchResults = allBookings.filter(b => {
        const route = `${b.departure || ''}→${b.destination || ''}`;
        const hasNoAction = !b.remark || String(b.remark).trim() === '';
        const travelDate = parseSheetDate(b.departing_on);

        return hasNoAction && travelDate >= today && route === routeQuery;
    });

    displayBookings(searchResults);
}

function clearBookingSearch() {
    document.getElementById('bookingSearchRoute').value = '';
    displayBookings(); // Display default list of current bookings
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
    if (viewName === 'sell') {
        document.getElementById('sellForm').reset();
    }
    if (viewName === 'booking') {
        hideNewBookingForm();
    }
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
            <p><strong>Extra Fare:</strong> ${(ticket.extra_fare || 0).toLocaleString()} MMK</p>
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

    const totalRevenue = ticketsThisMonth.reduce((sum, t) => sum + (t.net_amount || 0), 0);
    const revenueBox = document.getElementById('monthly-revenue-box');
    revenueBox.innerHTML = `<h3>Revenue (${monthName})</h3><div class="main-value">${totalRevenue.toLocaleString()}</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-sack-dollar"></i>`;

    const totalCommission = ticketsThisMonth.reduce((sum, t) => sum + (t.commission || 0), 0);
    const commissionBox = document.getElementById('monthly-commission-box');
    commissionBox.innerHTML = `<h3>Commission (${monthName})</h3><div class="main-value">${totalCommission.toLocaleString()}</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-hand-holding-dollar"></i>`;
    
    const totalExtraFare = ticketsThisMonth.reduce((sum, t) => sum + (t.extra_fare || 0), 0);
    const extraFareBox = document.getElementById('monthly-extra-fare-box');
    extraFareBox.innerHTML = `<h3>Extra Fare (${monthName})</h3><div class="main-value">${totalExtraFare.toLocaleString()}</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-dollar-sign"></i>`;

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

function parseSheetDate(dateString) {
    if (!dateString) return new Date(0);
    const safeDateString = String(dateString); 
    const monthMap = { 'JAN':0,'FEB':1,'MAR':2,'APR':3,'MAY':4,'JUN':5,'JUL':6,'AUG':7,'SEP':8,'OCT':9,'NOV':10,'DEC':11 };
    const parts = safeDateString.split('-');
    if (parts.length === 3 && isNaN(parseInt(parts[1], 10))) {
        return new Date(parseInt(parts[2], 10), monthMap[parts[1].toUpperCase()], parseInt(parts[0], 10));
    }
    const date = new Date(safeDateString);
    if (!isNaN(date.getTime())) {
        return date;
    }
    return new Date(0); 
}


function calculateCommission() { 
    const baseFare = parseFloat(document.getElementById('base_fare').value) || 0;
    document.getElementById('commission').value = Math.round((baseFare * 0.05) * 0.60); 
}

// --- SEARCH & PAGINATION ---
function performSearch() {
    const name = (document.getElementById('searchName')?.value || '').toUpperCase();
    const bookRef = (document.getElementById('searchBooking')?.value || '').toUpperCase();
    const travelDateVal = document.getElementById('searchTravelDate')?.value || '';
    const departure = document.getElementById('searchDeparture')?.value.toUpperCase();
    const destination = document.getElementById('searchDestination')?.value.toUpperCase();
    const airline = document.getElementById('searchAirline')?.value.toUpperCase();

    let searchTravelDate = travelDateVal ? new Date(travelDateVal) : null;

    const results = allTickets.filter(t => {
        const travelDate = parseSheetDate(t.departing_on);
        const isTravelDateMatch = !searchTravelDate || (travelDate.getDate() === searchTravelDate.getDate() && travelDate.getMonth() === searchTravelDate.getMonth() && travelDate.getFullYear() === searchTravelDate.getFullYear());

        const isDepartureMatch = !departure || (t.departure && t.departure.toUpperCase() === departure);
        const isDestinationMatch = !destination || (t.destination && t.destination.toUpperCase() === destination);
        const isAirlineMatch = !airline || (t.airline && t.airline.toUpperCase() === airline);

        return (!name || t.name.toUpperCase().includes(name)) &&
            (!bookRef || t.booking_reference.toUpperCase().includes(bookRef)) &&
            isTravelDateMatch &&
            isDepartureMatch &&
            isDestinationMatch &&
            isAirlineMatch;
    }).sort((a, b) => parseSheetDate(b.issued_date) - parseSheetDate(a.rowIndex - b.rowIndex) || b.rowIndex - a.rowIndex);

    filteredTickets = results;
    displayTickets(filteredTickets, 1);
}

function clearSearch() {
    document.getElementById('searchName').value = '';
    document.getElementById('searchBooking').value = '';
    document.getElementById('searchTravelDate').value = '';
    document.getElementById('searchDeparture').selectedIndex = 0;
    document.getElementById('searchDestination').selectedIndex = 0;
    document.getElementById('searchAirline').selectedIndex = 0;
    displayAllTickets();
}

function setupPagination(items) { 
    const container = document.getElementById('pagination'); 
    container.innerHTML = ''; 
    const pageCount = Math.ceil(items.length / rowsPerPage); 
    if (pageCount <= 1) return; 
    const btn = (txt, pg, en=true) => {
        const b = document.createElement('button'); 
        b.className = 'pagination-btn'; 
        b.innerHTML=txt; 
        b.disabled=!en; 
        if(en) b.onclick=()=>displayTickets(items,pg); 
        if(pg===currentPage)b.classList.add('active'); 
        return b;
    }; 
    container.append(btn('&laquo;', currentPage - 1, currentPage > 1)); 
    for (let i = 1; i <= pageCount; i++) container.append(btn(i,i)); 
    container.append(btn('&raquo;', currentPage + 1, currentPage < pageCount));
}

// --- FORM SUBMISSIONS ---
async function handleSellTicket(e) { e.preventDefault(); if (isSubmitting) return; isSubmitting = true; const submitButton = e.target.querySelector('button[type="submit"]'); if (submitButton) submitButton.disabled = true; try { const ticketData = collectFormData(e.target); if (!ticketData.name || !ticketData.booking_reference) throw new Error('Missing required fields.'); await saveTicket(ticketData); showToast('Ticket saved successfully!', 'success'); e.target.reset(); await loadTicketData(); showView('home'); } catch (error) { showToast(`Error: ${error.message || 'Could not save ticket.'}`, 'error'); } finally { isSubmitting = false; if (submitButton) submitButton.disabled = false; } }

function collectFormData(form) {
    const data = {};
    const fields = ['issued_date', 'name', 'nrc_no', 'phone', 'account_name', 'account_type', 'account_link', 'departure', 'destination', 'departing_on', 'airline', 'base_fare', 'booking_reference', 'net_amount', 'paid', 'payment_method', 'paid_date', 'commission', 'remark', 'extra_fare'];
    
    fields.forEach(field => {
        const el = form.querySelector(`#${field}`);
        if (el) {
            let value = el.type === 'checkbox' ? el.checked : el.value;
            if (typeof value === 'string') {
                value = value.toUpperCase();
            }
            data[field] = value;
        }
    });
    return data;
}

async function saveTicket(data) { 
    const values = [[ 
        formatDateForSheet(data.issued_date), data.name, data.nrc_no, 
        data.phone, data.account_name, data.account_type, 
        data.account_link, data.departure, data.destination, 
        formatDateForSheet(data.departing_on), data.airline, parseFloat(data.base_fare) || 0, 
        data.booking_reference, parseFloat(data.net_amount) || 0, data.paid, 
        data.payment_method, formatDateForSheet(data.paid_date), parseFloat(data.commission) || 0, 
        data.remark, parseFloat(data.extra_fare) || 0 
    ]]; 
    await gapi.client.sheets.spreadsheets.values.append({ 
        spreadsheetId: CONFIG.SHEET_ID, 
        range: `${CONFIG.SHEET_NAME}!A:T`, 
        valueInputOption: 'USER_ENTERED', 
        resource: { values }, 
    }); 
}

// --- MODIFY & UPDATE TICKET ---
function findTicketForModify() {
    const pnr = document.getElementById('modifyPnr').value.toUpperCase();
    if (!pnr) return showToast('Please enter a PNR code.', 'error');
    const found = allTickets.filter(t => t.booking_reference === pnr);
    displayModifyResults(found);
}

function clearModifyResults() {
    document.getElementById('modifyPnr').value = '';
    document.getElementById('modifyResultsContainer').innerHTML = '';
}

function displayModifyResults(tickets) {
    const container = document.getElementById('modifyResultsContainer');
    if (tickets.length === 0) {
        container.innerHTML = '<p style="text-align: center; margin-top: 1rem;">No tickets found for this PNR.</p>';
        return;
    }
    let html = `<div class="table-container"><table><thead><tr><th>Name</th><th>Route</th><th>Travel Date</th><th>Action</th></tr></thead><tbody>`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    tickets.forEach(t => {
        const travelDate = parseSheetDate(t.departing_on);
        const isPast = travelDate < today;
        const actionButton = isPast ? 
            `<button class="btn btn-primary" disabled>Date Passed</button>` :
            (t.base_fare > 0 ? `<button class="btn btn-primary" onclick="openModifyModal(${t.rowIndex})">Modify</button>` : '');
        html += `<tr><td>${t.name}</td><td>${t.departure.split(' ')[0]}→${t.destination.split(' ')[0]}</td><td>${t.departing_on}</td><td>${actionButton}</td></tr>`;
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
                <div class="form-group"><label>Extra Fare (Optional)</label><input type="number" id="update_extra_fare" placeholder="Adds to existing extra fare"></div>
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
    const extraFare = parseFloat(document.getElementById('update_extra_fare').value) || 0;
    
    if (newTravelDate) newTravelDate = formatDateForSheet(newTravelDate);

    const dataForBatchUpdate = ticketsToUpdate.map(ticket => {
        const isMaster = ticket.rowIndex == masterRowIndex;
        let finalBaseFare = ticket.base_fare, 
            finalNetAmount = ticket.net_amount, 
            finalCommission = ticket.commission,
            finalExtraFare = ticket.extra_fare;

        if (isMaster) {
            finalBaseFare = isNaN(newBaseFare) ? ticket.base_fare : newBaseFare;
            let commissionBase = isNaN(newBaseFare) ? ticket.commission : Math.round((newBaseFare * 0.05) * 0.60);
            finalCommission = commissionBase;
            finalExtraFare = (ticket.extra_fare || 0) + extraFare;
            finalNetAmount = (isNaN(newNetAmount) ? ticket.net_amount : newNetAmount) + fees;
        }

        return {
            range: `${CONFIG.SHEET_NAME}!A${ticket.rowIndex}:T${ticket.rowIndex}`,
            values: [[
                ticket.issued_date, ticket.name, ticket.nrc_no, ticket.phone,
                ticket.account_name, ticket.account_type, ticket.account_link,
                ticket.departure, ticket.destination, newTravelDate || ticket.departing_on, 
                ticket.airline, finalBaseFare, ticket.booking_reference, finalNetAmount,
                ticket.paid, ticket.payment_method, ticket.paid_date,
                finalCommission, ticket.remark, finalExtraFare
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

// --- CANCEL TICKET ---
function findTicketForCancel() {
    const pnr = document.getElementById('cancelPnr').value.toUpperCase();
    if (!pnr) {
        showToast('Please enter a PNR code.', 'error');
        return;
    }
    const found = allTickets.filter(t => t.booking_reference === pnr);
    displayCancelResults(found);
}

function clearCancelResults() {
    document.getElementById('cancelPnr').value = '';
    document.getElementById('cancelResultsContainer').innerHTML = '';
}

function displayCancelResults(tickets) {
    const container = document.getElementById('cancelResultsContainer');
    if (tickets.length === 0) {
        container.innerHTML = '<p style="text-align: center; margin-top: 1rem;">No tickets found for this PNR.</p>';
        return;
    }
    let html = `<div class="table-container"><table><thead><tr><th>Name</th><th>Route</th><th>Travel Date</th><th>Actions</th></tr></thead><tbody>`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    tickets.forEach(t => {
        const travelDate = parseSheetDate(t.departing_on);
        const isPast = travelDate < today;
        const actionsHtml = isPast ?
            `<button class="btn btn-primary" disabled>Date Passed</button>` :
            `<button class="btn btn-primary" onclick="openCancelModal(${t.rowIndex}, 'refund')">Full Refund</button>
             <button class="btn btn-secondary" onclick="openCancelModal(${t.rowIndex}, 'cancel')">Cancel</button>`;

        html += `
            <tr>
                <td>${t.name}</td>
                <td>${t.departure.split(' ')[0]}→${t.destination.split(' ')[0]}</td>
                <td>${t.departing_on}</td>
                <td>${actionsHtml}</td>
            </tr>`;
    });
    container.innerHTML = html + '</tbody></table></div>';
}

function openCancelModal(rowIndex, type) {
    const ticket = allTickets.find(t => t.rowIndex === rowIndex);
    if (!ticket) {
        showToast('Ticket not found.', 'error');
        return;
    }

    if (type === 'refund') {
        cancelModalBody.innerHTML = `
            <h2>Confirm Full Refund</h2>
            <p>Are you sure you want to process a full refund for <strong>${ticket.name}</strong> (PNR: ${ticket.booking_reference})?</p>
            <p>This will reset Base Fare, Net Amount, Commission, and Extra Fare to 0, and update the remark.</p>
            <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="cancelModal.style.display='none'">Back</button>
                <button type="button" class="btn btn-primary" onclick="handleCancelTicket(${rowIndex}, 'refund')">Confirm Refund</button>
            </div>`;
    } else { // type === 'cancel'
        cancelModalBody.innerHTML = `
            <h2>Cancel Ticket</h2>
            <p>For <strong>${ticket.name}</strong> (PNR: ${ticket.booking_reference})</p>
            <p>Current Net Amount: <strong>${(ticket.net_amount || 0).toLocaleString()} MMK</strong></p>
            <form id="cancelForm">
                <div class="form-group">
                    <label for="refund_amount">Refund Amount (MMK)</label>
                    <input type="number" id="refund_amount" required>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="cancelModal.style.display='none'">Back</button>
                    <button type="submit" class="btn btn-primary">Process Cancellation</button>
                </div>
            </form>`;
        document.getElementById('cancelForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const refundAmount = parseFloat(document.getElementById('refund_amount').value);
            if (isNaN(refundAmount) || refundAmount < 0) {
                showToast('Please enter a valid refund amount.', 'error');
                return;
            }
            handleCancelTicket(rowIndex, 'cancel', refundAmount);
        });
    }

    cancelModal.style.display = 'block';
}

async function handleCancelTicket(rowIndex, type, refundAmount = 0) {
    const ticket = allTickets.find(t => t.rowIndex === rowIndex);
    if (!ticket) {
        showToast('Ticket not found for cancellation.', 'error');
        return;
    }

    let updatedValues = [];
    if (type === 'refund') {
        updatedValues = [
            ticket.issued_date, ticket.name, ticket.nrc_no, ticket.phone,
            ticket.account_name, ticket.account_type, ticket.account_link,
            ticket.departure, ticket.destination, ticket.departing_on, 
            ticket.airline, 0, ticket.booking_reference, 0,
            ticket.paid, ticket.payment_method, ticket.paid_date,
            0, "Full Refund", 0
        ];
    } else { // type === 'cancel'
        const newNetAmount = (ticket.net_amount || 0) - refundAmount;
        updatedValues = [
            ticket.issued_date, ticket.name, ticket.nrc_no, ticket.phone,
            ticket.account_name, ticket.account_type, ticket.account_link,
            ticket.departure, ticket.destination, ticket.departing_on, 
            ticket.airline, ticket.base_fare, ticket.booking_reference, newNetAmount,
            ticket.paid, ticket.payment_method, ticket.paid_date,
            ticket.commission, `Canceled with ${refundAmount.toLocaleString()} refund`, ticket.extra_fare
        ];
    }
    
    try {
        showToast('Processing cancellation...', 'info');
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.SHEET_NAME}!A${rowIndex}:T${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [updatedValues] }
        });
        showToast('Ticket updated successfully!', 'success');
        cancelModal.style.display = 'none';
        document.getElementById('cancelResultsContainer').innerHTML = '';
        document.getElementById('cancelPnr').value = '';
        await loadTicketData();
    } catch (error) {
        showToast(`Cancellation Error: ${error.result?.error?.message || 'Could not update.'}`, 'error');
    }
}

// --- SHORTCUT TYPING FUNCTION ---
function handleShortcutTyping(event, elementId) {
    const selectElement = document.getElementById(elementId);
    const tempInput = event.target;

    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
        tempInput.value = '';
    }, 1500);

    // Handle input keys
    if (event.key === 'Backspace') {
        event.preventDefault();
        tempInput.value = tempInput.value.slice(0, -1);
    } else if (event.key.length === 1 && /[a-zA-Z]/.test(event.key)) {
        event.preventDefault();
        tempInput.value += event.key.toUpperCase();
    } else {
        // Ignore other keys like Shift, Enter, etc.
        return;
    }

    const currentSearch = tempInput.value;
    if (!currentSearch) {
        // Do nothing if the search string is empty
        return;
    }

    let exactMatchFound = false;

    // First, prioritize finding an exact match for the typed code
    for (let i = 0; i < selectElement.options.length; i++) {
        const option = selectElement.options[i];
        const shortcutMatch = option.value.match(/\((.*?)\)/);
        if (shortcutMatch && shortcutMatch[1].toUpperCase() === currentSearch) {
            selectElement.value = option.value;
            exactMatchFound = true;
            break;
        }
    }

    // If no exact match was found, fall back to a partial "startsWith" search
    if (!exactMatchFound) {
        for (let i = 0; i < selectElement.options.length; i++) {
            const option = selectElement.options[i];
            const shortcutMatch = option.value.match(/\((.*?)\)/);
            if (shortcutMatch && shortcutMatch[1].toUpperCase().startsWith(currentSearch)) {
                selectElement.value = option.value;
                break;
            }
        }
    }
}
