// Configuration
const CONFIG = {
    SHEET_ID: '1SGc80isz0VRVt447R_q-fBdZ_me52H_Z32W5HauHMWQ',
    API_KEY: 'AIzaSyC9JSD6VWXMQ7Pe8VPf-gIlNUtcwQhkG1o', // It is strongly recommended to move this to a secure backend.
    CLIENT_ID: '254093944424-mfvk48avc9n86de6jit9oai7kqrsr2f7.apps.googleusercontent.com', // IMPORTANT: REPLACE WITH YOUR CLIENT ID
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    SHEET_NAME: '2025',
    BOOKING_SHEET_NAME: 'booking',
    MODIFICATION_HISTORY_SHEET: 'modification_history',
    CANCELLATION_HISTORY_SHEET: 'cancellation_history'
};

// --- GLOBAL STATE & CACHE ---
const state = {
    allTickets: [],
    filteredTickets: [],
    allBookings: [],
    filteredBookings: [],
    modificationHistory: [],
    cancellationHistory: [],
    charts: {},
    isSubmitting: false,
    rowsPerPage: 10,
    currentPage: 1,
    bookingCurrentPage: 1,
    modHistoryPage: 1,
    cancelHistoryPage: 1,
    searchTimeout: null,
    cache: {} // In-memory cache
};
let tokenClient;
let gapiInited = false;
let gisInited = false;

// --- City data for flight type toggle ---
const CITIES = {
    DOMESTIC: ["Bhamo (BMO)", "Bokpyin (VBP)", "Dawei (TVY)", "Heho (HEH)", "Hommalinn (HOX)", "Kalemyo (KMV)", "Kawtung (KET)", "Khamti (KHM)", "Kyaukpyu (KYP)", "Lashio (LSH)", "Loikaw (LIW)", "Mandalay (MDL)", "Mawlamyaing (MNU)", "Monywa (NYW)", "Myeik (MGZ)", "Myitkyina (MYT)", "Nay Pyi Taw (NYT)", "Nyaung U (NYU)", "Putao (PBU)", "Sittwe (AKY)", "Tachilek (THL)", "Thandwe (SNW)", "Yangon (RGN)"],
    INTERNATIONAL: ["Mandalay (MDL)", "Yangon (RGN)", "Ann (VBA)", "Anni Sakhan (VBK)", "Bangalore (BLR)", "Bangkok (BKK)", "Bassein (BSX)", "Brisbane (BNE)", "Busan (PUS)", "Chengdu (CTU)", "Chaing Mai (CNX)", "Coco Islands (VCC)", "Colombo (CMB)", "Cox's bazar (CXB)", "Denpasar (DPS)", "Dhaka (DAC)", "Fukuoka (FUK)", "Gaya (GAY)", "Haikou (HAK)", "Hanoi (HAN)", "Ho Chi Minh City (SGN)", "Hong Kong (HKG)", "Incheon (ICN)", "Jakarta (CGK)", "Kolkata (CCU)", "Krabi (KBV)", "Kuala Lumpur (KUL)", "Kumming (KMG)", "Mae Sot (MAQ)", "Manaung (MGU)", "Mangrere (AKL)", "Mangshi (LUM)", "Manila (MNL)", "Melbourne (MEL)", "Monghsat (MOG)", "Mumbai (BOM)", "Nagoya (NGO)", "Naming (NMS)", "Nanning (NNG)", "Phuket (HKT)", "Siem Reap (SAI)", "Singapore (SIN)", "Subang (SZB)", "Surbung (SRU)", "Sydney (SYD)", "Taipei (TPE)", "Tokyo - Narita (NRT)", "Vientiane (VTE)", "Xiamen (XMN)"]
};


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
const bookingDetailModal = document.getElementById('bookingDetailModal');
const bookingDetailModalBody = document.getElementById('bookingDetailModalBody');
const bookingConfirmModal = document.getElementById('bookingConfirmModal');
const bookingConfirmModalBody = document.getElementById('bookingConfirmModalBody');
const sellConfirmModal = document.getElementById('sellConfirmModal');
const sellConfirmModalBody = document.getElementById('sellConfirmModalBody');
const settingsPanel = document.getElementById('settings-panel');
const monthSelector = document.getElementById('dashboard-month');
const yearSelector = document.getElementById('dashboard-year');
const flightTypeToggle = document.getElementById('flightTypeToggle');
const searchCurrentMonthToggle = document.getElementById('searchCurrentMonthToggle');

// --- INITIALIZATION ---
window.onload = async () => {
    initializeDatepickers();
    setupEventListeners();
    initializeBackgroundChanger();
    initializeUISettings();
    populateFlightLocations();
    updateToggleLabels();
    if (typeof gapi === 'undefined' || !google.accounts) { showToast('Google API scripts not loaded.', 'error'); return; }
    try {
        await Promise.all([loadGapiClient(), loadGisClient()]);
    } catch (error) {
        showToast('Failed to load Google APIs. Please refresh.', 'error');
        authorizeButton.style.display = 'block';
        loading.style.display = 'none';
    }
};

function initializeDatepickers() {
    const defaultOptions = { 
        format: 'mm/dd/yyyy', 
        autohide: true, 
        todayHighlight: true 
    };
    const endDateOptions = {
        ...defaultOptions,
        maxDate: 'today'
    };

    ['searchStartDate', 'searchTravelDate', 'booking_departing_on'].forEach(id => new Datepicker(document.getElementById(id), defaultOptions));
    new Datepicker(document.getElementById('searchEndDate'), endDateOptions);
    ['issued_date', 'departing_on', 'paid_date'].forEach(id => new Datepicker(document.getElementById(id), defaultOptions));
}


async function loadGapiClient() {
    return new Promise((resolve, reject) => {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({ apiKey: CONFIG.API_KEY, discoveryDocs: [CONFIG.DISCOVERY_DOC] });
                gapiInited = true;
                tryAutoSignIn();
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
                    if (tokenResponse.error) {
                        console.log('Token request failed:', tokenResponse.error);
                        authorizeButton.style.display = 'block';
                        loading.style.display = 'none';
                        return;
                    }
                    gapi.client.setToken(tokenResponse);
                    authorizeButton.style.display = 'none';
                    await initializeApp();
                },
            });
            gisInited = true;
            tryAutoSignIn();
            resolve();
        } catch (error) { reject(error); }
    });
}

// --- AUTHENTICATION ---
function tryAutoSignIn() {
    if (gapiInited && gisInited) {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

function handleAuthClick() {
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

async function initializeApp() {
    try {
        await Promise.all([
            loadTicketData(),
            loadBookingData(),
            loadModificationHistory(),
            loadCancellationHistory()
        ]);
        initializeDashboardSelectors();
    } catch (error) {
        console.error("Initialization failed:", error);
        showToast('A critical error occurred during data initialization. Please check the console (F12) for details.', 'error');
    }
}

// --- API CACHING ---
async function fetchFromSheet(range, cacheKey) {
    const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    if (state.cache[cacheKey] && (Date.now() - state.cache[cacheKey].timestamp < CACHE_DURATION)) {
        console.log(`Using cached data for: ${cacheKey}`);
        return Promise.resolve(state.cache[cacheKey].data);
    }

    console.log(`Fetching fresh data for: ${cacheKey}`);
    try {
        const response = await gapi.client.sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG.SHEET_ID,
            range: range
        });

        const data = response.result;
        state.cache[cacheKey] = {
            data: data,
            timestamp: Date.now()
        };
        return data;
    } catch (error) {
        showToast(`API Error: ${error.result?.error?.message || 'Could not fetch data.'}`, 'error');
        throw error;
    }
}

// --- DEBOUNCE UTILITY ---
function debounce(func, delay = 300) {
    clearTimeout(state.searchTimeout);
    state.searchTimeout = setTimeout(() => {
        func.apply(this, arguments);
    }, delay);
}


function setupEventListeners() {
    navBtns.forEach(btn => btn.addEventListener('click', (e) => showView(e.currentTarget.dataset.view)));
    authorizeButton.addEventListener('click', handleAuthClick);
    
    // Live Search Event Listeners
    document.getElementById('searchName').addEventListener('input', () => debounce(performSearch, 300));
    document.getElementById('searchBooking').addEventListener('input', () => debounce(performSearch, 300));
    
    ['searchTravelDate', 'searchStartDate', 'searchEndDate', 'searchDeparture', 'searchDestination', 'searchAirline', 'searchNotPaidToggle', 'searchCurrentMonthToggle'].forEach(id => {
         document.getElementById(id).addEventListener('change', performSearch);
    });

    // Keep buttons for manual action if needed
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('clearBtn').addEventListener('click', clearSearch);
    document.getElementById('exportPdfBtn').addEventListener('click', exportToPdf); 
    
    monthSelector.addEventListener('change', updateDashboardData);
    yearSelector.addEventListener('change', updateDashboardData);
    
    flightTypeToggle.addEventListener('change', () => {
        populateFlightLocations();
        updateToggleLabels();
    });


    document.getElementById('sellForm').addEventListener('submit', handleSellTicket);
    document.getElementById('airline').addEventListener('change', handleAirlineChange);

    document.getElementById('passenger-forms-container').addEventListener('input', (e) => {
        if (e.target.classList.contains('passenger-base-fare')) {
            calculateCommission(e.target);
        }
    });
    
    document.getElementById('addPassengerBtn').addEventListener('click', addPassengerForm);
    document.getElementById('removePassengerBtn').addEventListener('click', removePassengerForm);

    document.getElementById('findTicketBtn').addEventListener('click', findTicketForModify);
    document.getElementById('clearModifyBtn').addEventListener('click', clearModifyResults);
    document.getElementById('findCancelBtn').addEventListener('click', findTicketForCancel);
    document.getElementById('clearCancelBtn').addEventListener('click', clearCancelResults);
    
    document.getElementById('modifyPnr').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') document.getElementById('findTicketBtn').click();
    });
    document.getElementById('cancelPnr').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') document.getElementById('findCancelBtn').click();
    });
    
    document.getElementById('newBookingBtn').addEventListener('click', showNewBookingForm);
    document.getElementById('cancelNewBookingBtn').addEventListener('click', hideNewBookingForm);
    document.getElementById('newBookingForm').addEventListener('submit', handleNewBookingSubmit);
    document.getElementById('bookingSearchBtn').addEventListener('click', performBookingSearch);
    document.getElementById('bookingClearBtn').addEventListener('click', clearBookingSearch);
    bookingDetailModal.querySelector('.close').addEventListener('click', () => bookingDetailModal.classList.remove('show'));

    ['departure', 'destination', 'searchDeparture', 'searchDestination'].forEach(id => {
        document.getElementById(id).addEventListener('change', handleRouteValidation);
    });

    window.addEventListener('click', (event) => {
        if (event.target == detailsModal) detailsModal.classList.remove('show');
        if (event.target == modifyModal) modifyModal.classList.remove('show');
        if (event.target == cancelModal) cancelModal.classList.remove('show');
        if (event.target == bookingDetailModal) bookingDetailModal.classList.remove('show');
        if (event.target == bookingConfirmModal) bookingConfirmModal.classList.remove('show');
        if (event.target == sellConfirmModal) sellConfirmModal.classList.remove('show');
        if (!settingsPanel.contains(event.target) && event.target !== document.getElementById('settings-btn') && !document.getElementById('settings-btn').contains(event.target) ) {
            settingsPanel.classList.remove('show');
        }
    });
}

// --- ROUTE & FLIGHT TYPE LOGIC ---
function populateFlightLocations() {
    const isDomestic = !flightTypeToggle.checked;
    const locations = isDomestic ? CITIES.DOMESTIC : CITIES.INTERNATIONAL;
    
    const departureSelect = document.getElementById('departure');
    const destinationSelect = document.getElementById('destination');

    departureSelect.innerHTML = '<option value="" disabled selected>Select Departure</option>';
    destinationSelect.innerHTML = '<option value="" disabled selected>Select Destination</option>';

    locations.sort().forEach(location => {
        departureSelect.add(new Option(location, location));
        destinationSelect.add(new Option(location, location));
    });
}

function updateToggleLabels() {
    const domesticLabel = document.getElementById('domestic-label');
    const internationalLabel = document.getElementById('international-label');
    if (flightTypeToggle.checked) {
        internationalLabel.classList.add('active');
        domesticLabel.classList.remove('active');
    } else {
        domesticLabel.classList.add('active');
        internationalLabel.classList.remove('active');
    }
}

function handleRouteValidation(event) {
    const changedSelect = event.target;
    const form = changedSelect.closest('form');
    if (!form) return;

    const isDeparture = changedSelect.id.includes('departure');
    const otherSelectId = isDeparture 
        ? changedSelect.id.replace('departure', 'destination')
        : changedSelect.id.replace('destination', 'departure');
    
    const otherSelect = form.querySelector(`#${otherSelectId}`);
    if (!otherSelect) return;

    const selectedValue = changedSelect.value;
    
    for (const option of otherSelect.options) {
        option.disabled = false;
    }

    if (selectedValue) {
        const optionToDisable = otherSelect.querySelector(`option[value="${selectedValue}"]`);
        if (optionToDisable) {
            optionToDisable.disabled = true;
        }
    }
}


// --- CORE APP LOGIC (TICKETS) ---
async function loadTicketData() {
    try {
        loading.style.display = 'block';
        dashboardContent.style.display = 'none';
        const response = await fetchFromSheet(`${CONFIG.SHEET_NAME}!A:U`, 'ticketData');
        
        if (response.values && response.values.length > 1) {
            state.allTickets = parseTicketData(response.values);
            populateSearchAirlines();
            updateUnpaidCount();
            displayInitialTickets();
        }
        loading.style.display = 'none';
        dashboardContent.style.display = 'flex';
    } catch (error) {
        showToast(`Error loading ticket data: ${error.result?.error?.message || error}`, 'error');
        loading.style.display = 'none';
    }
}

function parseTicketData(values) {
    const headers = values[0].map(h => h.toLowerCase().replace(/\s+/g, '_').replace('nrc', 'id'));
    return values.slice(1).map((row, i) => {
        const ticket = {};
        headers.forEach((h, j) => {
            const value = row[j] || '';
            ticket[h] = typeof value === 'string' ? value.trim() : value;
        });
        const safeParse = (val) => parseFloat(String(val).replace(/,/g, '')) || 0;
        ['base_fare', 'net_amount', 'commission', 'extra_fare', 'date_change'].forEach(key => ticket[key] = safeParse(ticket[key]));
        ticket.paid = ticket.paid === 'TRUE';
        ticket.rowIndex = i + 2;
        return ticket;
    });
}


// --- BOOKING LOGIC ---
async function loadBookingData() {
    try {
        const response = await fetchFromSheet(`${CONFIG.BOOKING_SHEET_NAME}!A:K`, 'bookingData');

        if (response.values) {
            state.allBookings = parseBookingData(response.values);
        } else {
            state.allBookings = [];
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
    const headers = values[0].map(h => h.toLowerCase().replace(/\s+/g, '_').replace('nrc', 'id'));
    return values.slice(1).map((row, i) => {
        const booking = {};
        headers.forEach((h, j) => {
            const value = row[j] || '';
            booking[h] = typeof value === 'string' ? value.trim() : value;
        });
        booking.rowIndex = i + 2;
        return booking;
    });
}

function displayBookings(bookingsToDisplay) {
    const tbody = document.getElementById('bookingTableBody');
    tbody.innerHTML = '';
    
    let bookings;
    if (bookingsToDisplay) {
        bookings = bookingsToDisplay;
    } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        bookings = state.allBookings.filter(b => {
            const hasNoAction = !b.remarks || String(b.remarks).trim() === '';
            const travelDate = parseSheetDate(b.departing_on);
            return hasNoAction && travelDate >= today;
        });
    }

    bookings.sort((a, b) => {
        const dateA = parseSheetDate(a.departing_on);
        const dateB = parseSheetDate(b.departing_on);
        return dateA - dateB;
    });

    state.filteredBookings = bookings;

    if (state.filteredBookings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">No bookings found.</td></tr>`;
        setupBookingPagination([]);
        return;
    }
    
    state.bookingCurrentPage = 1;
    renderBookingPage(1);
}

function renderBookingPage(page) {
    state.bookingCurrentPage = page;
    const tbody = document.getElementById('bookingTableBody');
    tbody.innerHTML = '';

    const paginated = state.filteredBookings.slice((page - 1) * state.rowsPerPage, page * state.rowsPerPage);

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
    
    setupBookingPagination(state.filteredBookings);
}

function handleGetTicket(rowIndex) {
    const booking = state.allBookings.find(b => b.rowIndex === rowIndex);
    const message = `Are you sure you want to mark booking for <strong>${booking.name}</strong> as "Get Ticket"? This will remove it from the list.`;
    showBookingConfirmModal(message, () => updateBookingStatus(rowIndex, 'Get Ticket'));
}

function handleCancelBooking(rowIndex) {
    const booking = state.allBookings.find(b => b.rowIndex === rowIndex);
    const message = `Are you sure you want to <strong>CANCEL</strong> the booking for <strong>${booking.name}</strong>? This will remove it from the list.`;
    showBookingConfirmModal(message, () => updateBookingStatus(rowIndex, 'Canceled'));
}

async function updateBookingStatus(rowIndex, remarks) {
    try {
        state.isSubmitting = true;
        showToast('Updating booking status...', 'info');
        const range = `${CONFIG.BOOKING_SHEET_NAME}!K${rowIndex}`;
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[remarks]]
            }
        });
        state.cache['bookingData'] = null;
        showToast('Booking updated successfully!', 'success');
        await loadBookingData();
    } catch (error) {
        showToast(`Update Error: ${error.result?.error?.message || 'Could not update.'}`, 'error');
        await loadBookingData();
    } finally {
        state.isSubmitting = false;
        bookingConfirmModal.classList.remove('show');
    }
}

function showBookingDetails(rowIndex) {
    const booking = state.allBookings.find(b => b.rowIndex === rowIndex);
    if (booking) {
        bookingDetailModalBody.innerHTML = `
            <h3>Booking Request Details</h3>
            <p><strong>Name:</strong> ${booking.name || 'N/A'}</p>
            <p><strong>ID No:</strong> ${booking.id_no || 'N/A'}</p>
            <p><strong>Phone:</strong> ${makeClickable(booking.phone)}</p>
            <p><strong>Pax No:</strong> ${booking.pax_no || 'N/A'}</p>
            <hr style="border-color: rgba(255,255,255,0.2); margin: 1rem 0;">
            <p><strong>Account Name:</strong> ${booking.account_name || 'N/A'}</p>
            <p><strong>Account Type:</strong> ${booking.account_type || 'N/A'}</p>
            <p><strong>Account Link:</strong> ${makeClickable(booking.account_link) || 'N/A'}</p>
            <hr style="border-color: rgba(255,255,255,0.2); margin: 1rem 0;">
            <p><strong>Route:</strong> ${booking.departure || 'N/A'} → ${booking.destination || 'N/A'}</p>
            <p><strong>Travel Date:</strong> ${booking.departing_on || 'N/A'}</p>
            <p><strong>Remarks:</strong> ${booking.remarks || 'N/A'}</p>
            <div style="text-align: center; margin-top: 1.5rem;">
                <button class="btn btn-secondary" onclick="document.getElementById('bookingDetailModal').classList.remove('show')">Close</button>
            </div>
        `;
        bookingDetailModal.classList.add('show');
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
    if (state.isSubmitting) return;
    state.isSubmitting = true;
    const submitButton = e.target.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
        const bookingData = {
            name: document.getElementById('booking_name').value.toUpperCase(),
            id_no: document.getElementById('booking_id_no').value.toUpperCase(),
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
            bookingData.name, bookingData.id_no, bookingData.phone,
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

        state.cache['bookingData'] = null;
        showToast('Booking saved successfully!', 'success');
        hideNewBookingForm();
        await loadBookingData();
    } catch (error) {
        showToast(`Error: ${error.message || 'Could not save booking.'}`, 'error');
    } finally {
        state.isSubmitting = false;
        if (submitButton) submitButton.disabled = false;
    }
}

function setupBookingPagination(items) {
    const container = document.getElementById('bookingPagination');
    container.innerHTML = '';
    const pageCount = Math.ceil(items.length / state.rowsPerPage);
    if (pageCount <= 1) return;

    const createBtn = (txt, pg, enabled = true) => {
        const btn = document.createElement('button');
        btn.className = 'pagination-btn';
        btn.innerHTML = txt;
        btn.disabled = !enabled;
        if (enabled) {
            btn.onclick = () => renderBookingPage(pg);
        }
        if (pg === state.bookingCurrentPage) {
            btn.classList.add('active');
        }
        return btn;
    };

    container.append(createBtn('&laquo;', state.bookingCurrentPage - 1, state.bookingCurrentPage > 1));
    for (let i = 1; i <= pageCount; i++) {
        container.append(createBtn(i, i));
    }
    container.append(createBtn('&raquo;', state.bookingCurrentPage + 1, state.bookingCurrentPage < pageCount));
}

function showBookingConfirmModal(message, onConfirm) {
    bookingConfirmModalBody.innerHTML = `
        <p style="margin-bottom: 1.5rem; line-height: 1.5;">${message}</p>
        <div class="form-actions">
            <button id="confirmCancelBtn" type="button" class="btn btn-secondary">Back</button>
            <button id="confirmActionBtn" type="button" class="btn btn-primary">Confirm</button>
        </div>
    `;
    bookingConfirmModal.classList.add('show');

    document.getElementById('confirmActionBtn').onclick = onConfirm;
    document.getElementById('confirmCancelBtn').onclick = async () => {
        bookingConfirmModal.classList.remove('show');
        await loadBookingData();
    };
}

function populateBookingSearchOptions() {
    const select = document.getElementById('bookingSearchRoute');
    select.innerHTML = '<option value="">-- SEARCH BY ROUTE --</option>';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeBookings = state.allBookings.filter(b => {
        const hasNoAction = !b.remarks || String(b.remarks).trim() === '';
        const travelDate = parseSheetDate(b.departing_on);
        return hasNoAction && travelDate >= today;
    });

    const routes = [...new Set(activeBookings.map(b => `${b.departure || ''}→${b.destination || ''}`))];
    
    routes.sort().forEach(route => {
        const option = document.createElement('option');
        option.value = route;
        option.textContent = route.replace(/ \([^)]*\)/g, '');
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

    const searchResults = state.allBookings.filter(b => {
        const route = `${b.departure || ''}→${b.destination || ''}`;
        const hasNoAction = !b.remarks || String(b.remarks).trim() === '';
        const travelDate = parseSheetDate(b.departing_on);

        return hasNoAction && travelDate >= today && route === routeQuery;
    });

    displayBookings(searchResults);
}

function clearBookingSearch() {
    document.getElementById('bookingSearchRoute').value = '';
    displayBookings();
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
    if (savedBg) {
        document.body.style.backgroundImage = `url(${savedBg})`;
    } else {
        document.body.style.backgroundImage = `url('https://images.unsplash.com/photo-1550684376-efcbd6e3f031?q=80&w=2970&auto=format&fit=crop')`;
    }
}

// --- UI & DISPLAY ---
function showView(viewName) {
    navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
    views.forEach(view => view.classList.toggle('active', view.id === `${viewName}-view`));
    if (viewName === 'sell') {
        document.getElementById('sellForm').reset();
        populateFlightLocations();
        updateToggleLabels();
    }
    if (viewName === 'booking') {
        hideNewBookingForm();
    }
}

function displayInitialTickets() {
    const sorted = [...state.allTickets].sort((a, b) => parseSheetDate(b.issued_date) - parseSheetDate(a.issued_date) || b.rowIndex - a.rowIndex);
    const initialTickets = sorted.slice(0, 50);
    state.filteredTickets = initialTickets;
    displayTickets(initialTickets, 1);
}

function displayTickets(tickets, page = 1) {
    const tbody = document.getElementById('resultsBody');
    tbody.innerHTML = ''; 
    state.currentPage = page;
    const paginated = tickets.slice((page - 1) * state.rowsPerPage, page * state.rowsPerPage);
    
    paginated.forEach((ticket) => {
        const row = tbody.insertRow();

        if (ticket.remarks) {
            const lowerRemarks = ticket.remarks.toLowerCase();
            if (lowerRemarks.includes('refund') || lowerRemarks.includes('cancel')) {
                row.classList.add('canceled-row');
            }
        }

        row.innerHTML = `<td>${ticket.issued_date||''}</td><td>${ticket.name||''}</td><td>${ticket.booking_reference||''}</td><td>${(ticket.departure||'').split(' ')[0]}→${(ticket.destination||'').split(' ')[0]}</td><td>${ticket.airline||''}</td><td><button class="btn btn-secondary" style="padding:0.5rem 1rem;" onclick="showDetails(${ticket.rowIndex})">Details</button></td>`;
    });
    setupPagination(tickets);
}

function closeDetailsModal() { document.getElementById('modal').classList.remove('show'); }

function showDetails(rowIndex) {
    const ticket = state.allTickets.find(t => t.rowIndex === rowIndex);
    if (!ticket) return;

    let statusClass = 'confirmed';
    let statusText = `Issued on ${formatDateToDMMMY(ticket.issued_date) || 'N/A'}`;

    if (ticket.remarks) {
        const lowerRemarks = ticket.remarks.toLowerCase();
        const dateRegex = /(\d{1,2}[\/-]\d{1,2}[\/-]\d{4})/;
        const match = lowerRemarks.match(dateRegex);
        const actionDate = match ? formatDateToDMMMY(match[1]) : 'an unknown date';

        if (lowerRemarks.includes('full refund')) {
            statusClass = 'canceled';
            statusText = `Full Refund on ${actionDate}`;
        } else if (lowerRemarks.includes('cancel')) {
            statusClass = 'canceled';
            statusText = `Canceled on ${actionDate}`;
        }
    }

    detailsModalBody.innerHTML = `
        <div class="details-header">
            <div>
                <div class="client-name">${ticket.name || 'N/A'}</div>
                <div class="pnr-code">PNR: ${ticket.booking_reference || 'N/A'}</div>
            </div>
            <div class="details-status-badge ${statusClass}">${statusText}</div>
        </div>

        <div class="details-section">
            <div class="details-section-title">Client Information</div>
            <div class="details-grid">
                <div class="details-item"><i class="fa-solid fa-id-card"></i><div class="details-item-content"><div class="label">ID No.</div><div class="value">${ticket.id_no || 'N/A'}</div></div></div>
                <div class="details-item"><i class="fa-solid fa-phone"></i><div class="details-item-content"><div class="label">Phone</div><div class="value">${makeClickable(ticket.phone) || 'N/A'}</div></div></div>
                <div class="details-item"><i class="fa-solid fa-hashtag"></i><div class="details-item-content"><div class="label">Social Media</div><div class="value">${ticket.account_name || 'N/A'} (${ticket.account_type || 'N/A'})</div></div></div>
                <div class="details-item"><i class="fa-solid fa-link"></i><div class="details-item-content"><div class="label">Account Link</div><div class="value">${makeClickable(ticket.account_link) || 'N/A'}</div></div></div>
            </div>
        </div>

        <div class="details-section">
            <div class="details-section-title">Flight Details</div>
            <div class="details-grid">
                <div class="details-item"><i class="fa-solid fa-plane-departure"></i><div class="details-item-content"><div class="label">From</div><div class="value">${ticket.departure || 'N/A'}</div></div></div>
                <div class="details-item"><i class="fa-solid fa-plane-arrival"></i><div class="details-item-content"><div class="label">To</div><div class="value">${ticket.destination || 'N/A'}</div></div></div>
                <div class="details-item"><i class="fa-solid fa-calendar-days"></i><div class="details-item-content"><div class="label">Travel Date</div><div class="value">${ticket.departing_on || 'N/A'}</div></div></div>
                <div class="details-item"><i class="fa-solid fa-plane"></i><div class="details-item-content"><div class="label">Airline</div><div class="value">${ticket.airline || 'N/A'}</div></div></div>
            </div>
        </div>

        <div class="details-section">
            <div class="details-section-title">Financials</div>
            <div class="details-grid">
                 <div class="details-item"><i class="fa-solid fa-receipt"></i><div class="details-item-content"><div class="label">Net Amount</div><div class="value">${(ticket.net_amount || 0).toLocaleString()} MMK</div></div></div>
                 <div class="details-item"><i class="fa-solid fa-hand-holding-dollar"></i><div class="details-item-content"><div class="label">Commission</div><div class="value">${(ticket.commission || 0).toLocaleString()} MMK</div></div></div>
                <div class="details-item"><i class="fa-solid fa-money-bill-transfer"></i><div class="details-item-content"><div class="label">Date Change / Extra</div><div class="value">${((ticket.date_change || 0) + (ticket.extra_fare || 0)).toLocaleString()} MMK</div></div></div>
                <div class="details-item"><i class="fa-solid fa-credit-card"></i><div class="details-item-content"><div class="label">Payment Status</div><div class="value">${ticket.paid ? `Paid via ${ticket.payment_method || 'N/A'}` : 'Not Paid'}</div></div></div>
            </div>
        </div>
    `;
    detailsModal.classList.add('show');
}


// --- DASHBOARD DATA & CHARTS ---
function initializeDashboardSelectors() {
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthSelector.innerHTML = months.map((m, i) => `<option value="${i}">${m}</option>`).join('');

    const years = [...new Set(state.allTickets.map(t => parseSheetDate(t.issued_date).getFullYear()))].filter(Boolean).sort((a,b) => b-a);
    if(years.length === 0) years.push(new Date().getFullYear());
    yearSelector.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
    
    const now = new Date();
    monthSelector.value = now.getMonth();
    yearSelector.value = now.getFullYear();
    
    updateDashboardData();
}

function updateDashboardData() {
    const selectedMonth = parseInt(monthSelector.value);
    const selectedYear = parseInt(yearSelector.value);

    if (isNaN(selectedMonth) || isNaN(selectedYear)) return;

    const ticketsThisPeriod = state.allTickets.filter(t => {
        const ticketDate = parseSheetDate(t.issued_date);
        const isCanceled = t.remarks?.toLowerCase().includes('cancel') || t.remarks?.toLowerCase().includes('refund');
        return ticketDate.getMonth() === selectedMonth && ticketDate.getFullYear() === selectedYear && !isCanceled;
    });

    document.getElementById('total-tickets-value').textContent = ticketsThisPeriod.length;

    const totalRevenue = ticketsThisPeriod.reduce((sum, t) => sum + (t.net_amount || 0) + (t.date_change || 0), 0);
    const revenueBox = document.getElementById('monthly-revenue-box');
    revenueBox.innerHTML = `<div class="info-card-content"><h3>Total Revenue</h3><div class="main-value">${totalRevenue.toLocaleString()}</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-sack-dollar"></i></div>`;
    
    const totalCommission = ticketsThisPeriod.reduce((sum, t) => sum + (t.commission || 0), 0);
    const commissionBox = document.getElementById('monthly-commission-box');
    commissionBox.innerHTML = `<div class="info-card-content"><h3>Total Commission</h3><div class="main-value">${totalCommission.toLocaleString()}</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-hand-holding-dollar"></i></div>`;

    const totalExtraFare = ticketsThisPeriod.reduce((sum, t) => sum + (t.extra_fare || 0), 0);
    const extraFareBox = document.getElementById('monthly-extra-fare-box');
    extraFareBox.innerHTML = `<div class="info-card-content"><h3>Total Extra Fare</h3><div class="main-value">${totalExtraFare.toLocaleString()}</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-dollar-sign"></i></div>`;
    
    if (state.charts.airlineChart) state.charts.airlineChart.destroy();
    createAirlineChart(ticketsThisPeriod);
}

function createAirlineChart(tickets) {
    const ctx = document.getElementById('airline-chart').getContext('2d');
    const airlineCounts = tickets.reduce((acc, t) => {
        const airline = t.airline || 'Unknown';
        acc[airline] = (acc[airline] || 0) + 1;
        return acc;
    }, {});

    const labels = Object.keys(airlineCounts);
    const data = Object.values(airlineCounts);

    state.charts.airlineChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    'rgba(254, 230, 190, 0.9)', 'rgba(63, 185, 80, 0.9)',
                    'rgba(88, 166, 255, 0.9)', 'rgba(255, 118, 126, 0.9)',
                    'rgba(168, 133, 255, 0.9)', 'rgba(255, 189, 89, 0.9)'
                ],
                borderColor: 'rgba(13, 17, 23, 0.5)',
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: labels.length > 0 && labels.length < 8,
                    position: 'right',
                    labels: { color: '#e6edf3', boxWidth: 12, padding: 8, font: { size: 10 } }
                }
            },
            animation: { animateScale: true, duration: 500 },
            cutout: '65%'
        }
    });
}

// --- UTILITY FUNCTIONS ---
function makeClickable(text) { if (!text) return 'N/A'; if (text.toLowerCase().startsWith('http')) return `<a href="${text}" target="_blank" style="color:var(--primary-accent);">${text}</a>`; if (/^[\d\s\-+()]+$/.test(text)) return `<a href="tel:${text.replace(/[^\d+]/g, '')}" style="color:var(--primary-accent);">${text}</a>`; if (text.startsWith('@')) return `<a href="https://t.me/${text.substring(1)}" target="_blank" style="color:var(--primary-accent);">${text}</a>`; return text; }
function showToast(message, type = 'info') { document.getElementById('toastMessage').textContent = message; const toastEl = document.getElementById('toast'); toastEl.className = `show ${type}`; setTimeout(() => toastEl.className = toastEl.className.replace('show', ''), 4000); }
function formatDateForSheet(dateString) { if (!dateString) return ''; const date = new Date(dateString); return isNaN(date.getTime()) ? dateString : `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`; }

function formatDateToDMMMY(dateString) {
    if (!dateString) return '';
    const date = parseSheetDate(dateString);
    if (isNaN(date.getTime()) || date.getTime() === 0) {
        return '';
    }
    const day = String(date.getUTCDate()).padStart(2, '0');
    const year = date.getUTCFullYear();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[date.getUTCMonth()];
    return `${day}-${month}-${year}`;
}

function parseSheetDate(dateString) {
    if (!dateString) return new Date(0);
    const safeDateString = String(dateString).trim();
    const monthMap = { 'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5, 'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11 };
    const parts = safeDateString.split(/[-\/]/);
    if (parts.length === 3) {
        let day, month, year;
        if (isNaN(parseInt(parts[1], 10))) {
            day = parseInt(parts[0], 10);
            month = monthMap[parts[1].toUpperCase()];
            year = parseInt(parts[2], 10);
        } else {
            month = parseInt(parts[0], 10) - 1;
            day = parseInt(parts[1], 10);
            year = parseInt(parts[2], 10);
        }
        if (!isNaN(day) && month !== undefined && !isNaN(year) && year > 1900 && day > 0 && day <= 31 && month >= 0 && month < 12) {
            const d = new Date(Date.UTC(year, month, day));
            if (d.getUTCFullYear() === year && d.getUTCMonth() === month && d.getUTCDate() === day) {
                return d;
            }
        }
    }
    const fallbackDate = new Date(safeDateString);
    if (!isNaN(fallbackDate.getTime())) {
        return new Date(Date.UTC(fallbackDate.getFullYear(), fallbackDate.getMonth(), fallbackDate.getDate()));
    }
    return new Date(0);
}

function calculateCommission(baseFareInput) {
    const passengerForm = baseFareInput.closest('.passenger-form');
    const commissionInput = passengerForm.querySelector('.passenger-commission');
    const baseFare = parseFloat(baseFareInput.value) || 0;
    commissionInput.value = Math.round((baseFare * 0.05) * 0.60);
}

// --- SEARCH & PAGINATION ---

function updateUnpaidCount() {
    const unpaidTickets = state.allTickets.filter(t => !t.paid);
    const count = unpaidTickets.length;
    const label = document.getElementById('unpaid-only-label');
    const numberEmojis = ["0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

    if (count > 0) {
        const countString = count > 9 ? `(${count})` : numberEmojis[count];
        label.innerHTML = `Unpaid Only <span style="color: #F85149; margin-left: 4px;">${countString}</span>`;
    } else {
        label.textContent = 'Unpaid Only';
    }
}


function performSearch() {
    const name = (document.getElementById('searchName')?.value || '').toUpperCase();
    const bookRef = (document.getElementById('searchBooking')?.value || '').toUpperCase();
    let startDateVal = document.getElementById('searchStartDate')?.value;
    let endDateVal = document.getElementById('searchEndDate')?.value;
    const travelDateVal = document.getElementById('searchTravelDate')?.value || '';
    const departure = document.getElementById('searchDeparture')?.value.toUpperCase();
    const destination = document.getElementById('searchDestination')?.value.toUpperCase();
    const airline = document.getElementById('searchAirline')?.value.toUpperCase();
    const notPaidOnly = document.getElementById('searchNotPaidToggle')?.checked;
    const currentMonthOnly = document.getElementById('searchCurrentMonthToggle')?.checked;

    let searchStartDate = startDateVal ? parseSheetDate(startDateVal) : null;
    let searchEndDate = endDateVal ? parseSheetDate(endDateVal) : null;
    
    if (currentMonthOnly) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        searchStartDate = startOfMonth;
        searchEndDate = endOfMonth;
        document.getElementById('searchStartDate').value = '';
        document.getElementById('searchEndDate').value = '';
    } else {
        if (searchStartDate) searchStartDate.setUTCHours(0, 0, 0, 0);
        if (searchEndDate) searchEndDate.setUTCHours(23, 59, 59, 999);
    }

    let searchTravelDate = travelDateVal ? parseSheetDate(travelDateVal) : null;

    const results = state.allTickets.filter(t => {
        const issuedDate = parseSheetDate(t.issued_date);
        const travelDate = parseSheetDate(t.departing_on);
        
        const nameMatch = !name || t.name.toUpperCase().includes(name);
        const bookRefMatch = !bookRef || t.booking_reference.toUpperCase().includes(bookRef);
        const issuedDateMatch = (!searchStartDate || issuedDate >= searchStartDate) && (!searchEndDate || issuedDate <= searchEndDate);
        const travelDateMatch = !searchTravelDate || (travelDate && travelDate.getTime() === searchTravelDate.getTime());
        const departureMatch = !departure || (t.departure && t.departure.toUpperCase() === departure);
        const destinationMatch = !destination || (t.destination && t.destination.toUpperCase() === destination);
        const airlineMatch = !airline || (t.airline && t.airline.toUpperCase() === airline);
        const paidMatch = !notPaidOnly || !t.paid;

        return nameMatch && bookRefMatch && issuedDateMatch && travelDateMatch && departureMatch && destinationMatch && airlineMatch && paidMatch;
    }).sort((a, b) => parseSheetDate(b.issued_date) - parseSheetDate(a.issued_date) || b.rowIndex - a.rowIndex);

    state.filteredTickets = results;
    displayTickets(state.filteredTickets, 1);
}

function clearSearch() {
    document.getElementById('searchForm').reset();
    document.querySelectorAll('#searchForm select').forEach(sel => {
        for(const opt of sel.options) { opt.disabled = false; }
    });
    performSearch(); // Re-run search to reset to initial view
}

function setupPagination(items) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';
    const pageCount = Math.ceil(items.length / state.rowsPerPage);
    if (pageCount <= 1) return;
    const btn = (txt, pg, en=true) => {
        const b = document.createElement('button');
        b.className = 'pagination-btn';
        b.innerHTML=txt;
        b.disabled=!en;
        if(en) b.onclick=()=>displayTickets(items,pg);
        if(pg===state.currentPage)b.classList.add('active');
        return b;
    };
    container.append(btn('&laquo;', state.currentPage - 1, state.currentPage > 1));
    for (let i = 1; i <= pageCount; i++) container.append(btn(i,i));
    container.append(btn('&raquo;', state.currentPage + 1, state.currentPage < pageCount));
}

// --- FORM SUBMISSIONS (SELL TICKET) ---
async function handleSellTicket(e) {
    e.preventDefault();
    if (state.isSubmitting) return;

    const form = e.target;
    const { sharedData, passengerData } = collectFormData(form);

    if (passengerData.length === 0) {
        showToast('At least one passenger is required.', 'error');
        return;
    }
    if (!sharedData.booking_reference) {
        showToast('PNR Code is required.', 'error');
        return;
    }

    // Build confirmation modal content
    let passengerHtml = '';
    let totalNet = 0;
    passengerData.forEach((p, index) => {
        totalNet += p.net_amount;
        passengerHtml += `
            <div class="passenger-summary">
                <strong>Passenger ${index + 1}: ${p.name}</strong>
                <div class="details-grid">
                    <div class="details-item"><div class="details-item-content"><div class="label">ID</div><div class="value">${p.id_no || 'N/A'}</div></div></div>
                    <div class="details-item"><div class="details-item-content"><div class="label">Net Amount</div><div class="value">${p.net_amount.toLocaleString()} MMK</div></div></div>
                    <div class="details-item"><div class="details-item-content"><div class="label">Commission</div><div class="value">${p.commission.toLocaleString()} MMK</div></div></div>
                </div>
            </div>
        `;
    });

    sellConfirmModalBody.innerHTML = `
        <h2>Confirm Ticket Sale</h2>
        <p>Please review the details below before confirming the sale.</p>
        <div class="details-section">
            <div class="details-section-title">Flight & Booking</div>
            <div class="details-grid">
                <div class="details-item"><div class="details-item-content"><div class="label">PNR</div><div class="value">${sharedData.booking_reference}</div></div></div>
                <div class="details-item"><div class="details-item-content"><div class="label">Route</div><div class="value">${sharedData.departure} → ${sharedData.destination}</div></div></div>
                <div class="details-item"><div class="details-item-content"><div class="label">Travel Date</div><div class="value">${sharedData.departing_on}</div></div></div>
                <div class="details-item"><div class="details-item-content"><div class="label">Airline</div><div class="value">${sharedData.airline}</div></div></div>
            </div>
        </div>
         <div class="details-section">
            <div class="details-section-title">Passengers (${passengerData.length}) - Total: ${totalNet.toLocaleString()} MMK</div>
            ${passengerHtml}
        </div>
        <div class="form-actions" style="margin-top: 2rem;">
            <button type="button" class="btn btn-secondary" onclick="sellConfirmModal.classList.remove('show')">Cancel</button>
            <button id="confirmSaleBtn" type="button" class="btn btn-primary">Confirm Sale</button>
        </div>
    `;

    sellConfirmModal.classList.add('show');

    // Add event listener to the confirm button inside the modal
    document.getElementById('confirmSaleBtn').onclick = () => {
        confirmAndSaveTicket(form, sharedData, passengerData);
    };
}

async function confirmAndSaveTicket(form, sharedData, passengerData) {
    state.isSubmitting = true;
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    sellConfirmModal.classList.remove('show');

    try {
        await saveTicket(sharedData, passengerData);

        showToast('Ticket(s) saved successfully!', 'success');
        form.reset();
        resetPassengerForms();
        populateFlightLocations();
        updateToggleLabels();
        state.cache['ticketData'] = null;
        await loadTicketData();
        updateDashboardData();
        showView('home');
    } catch (error) {
        showToast(`Error: ${error.message || 'Could not save ticket.'}`, 'error');
    } finally {
        state.isSubmitting = false;
        if (submitButton) submitButton.disabled = false;
    }
}


function collectFormData(form) {
    const sharedData = {
        issued_date: form.querySelector('#issued_date').value,
        phone: form.querySelector('#phone').value,
        account_name: form.querySelector('#account_name').value,
        account_type: form.querySelector('#account_type').value,
        account_link: form.querySelector('#account_link').value,
        departure: form.querySelector('#departure').value,
        destination: form.querySelector('#destination').value,
        departing_on: form.querySelector('#departing_on').value,
        airline: form.querySelector('#airline').value === 'CUSTOM' ? form.querySelector('#custom_airline').value : form.querySelector('#airline').value,
        booking_reference: form.querySelector('#booking_reference').value.toUpperCase(),
        paid: form.querySelector('#paid').checked,
        payment_method: form.querySelector('#payment_method').value,
        paid_date: form.querySelector('#paid_date').value
    };

    const passengerData = [];
    const passengerForms = form.querySelectorAll('.passenger-form');
    passengerForms.forEach(pForm => {
        const passenger = {
            name: pForm.querySelector('.passenger-name').value.toUpperCase(),
            id_no: pForm.querySelector('.passenger-id').value.toUpperCase(),
            base_fare: parseFloat(pForm.querySelector('.passenger-base-fare').value) || 0,
            net_amount: parseFloat(pForm.querySelector('.passenger-net-amount').value) || 0,
            extra_fare: parseFloat(pForm.querySelector('.passenger-extra-fare').value) || 0,
            commission: parseFloat(pForm.querySelector('.passenger-commission').value) || 0,
            remarks: pForm.querySelector('.passenger-remarks').value
        };
        if(passenger.name) { // Only add if passenger has a name
             passengerData.push(passenger);
        }
    });

    return { sharedData, passengerData };
}

async function saveTicket(sharedData, passengerData) {
    const values = passengerData.map(p => [
        formatDateForSheet(sharedData.issued_date),
        p.name,
        p.id_no,
        sharedData.phone,
        sharedData.account_name,
        sharedData.account_type,
        sharedData.account_link,
        sharedData.departure,
        sharedData.destination,
        formatDateForSheet(sharedData.departing_on),
        sharedData.airline,
        p.base_fare,
        sharedData.booking_reference,
        p.net_amount,
        sharedData.paid,
        sharedData.payment_method,
        formatDateForSheet(sharedData.paid_date),
        p.commission,
        p.remarks,
        p.extra_fare,
        0 // Date change is 0 on initial sale
    ]);

    await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: CONFIG.SHEET_ID,
        range: `${CONFIG.SHEET_NAME}!A:U`,
        valueInputOption: 'USER_ENTERED',
        resource: { values },
    });
}

function addPassengerForm() {
    const container = document.getElementById('passenger-forms-container');
    const passengerCount = container.children.length;
    
    const newForm = document.createElement('div');
    newForm.className = 'passenger-form';
    newForm.innerHTML = `
        <hr style="border-color: rgba(255,255,255,0.1); margin-bottom: 1rem;">
        <h4>Passenger ${passengerCount + 1}</h4>
        <div class="form-grid">
            <div class="form-group"><label>Client Name</label><input type="text" class="passenger-name" required></div>
            <div class="form-group"><label>ID Number</label><input type="text" class="passenger-id" required></div>
            <div class="form-group"><label>Base Fare (MMK)</label><input type="number" class="passenger-base-fare" step="1" required></div>
            <div class="form-group"><label>Net Amount (MMK)</label><input type="number" class="passenger-net-amount" step="1" required></div>
            <div class="form-group"><label>Extra Fare (Optional)</label><input type="number" class="passenger-extra-fare" step="1"></div>
            <div class="form-group"><label>Commission</label><input type="number" class="passenger-commission" step="1" readonly></div>
            <div class="form-group"><label>Remarks (Optional)</label><textarea class="passenger-remarks" rows="1"></textarea></div>
        </div>
    `;
    container.appendChild(newForm);
    updateRemovePassengerButton();
}

function removePassengerForm() {
    const container = document.getElementById('passenger-forms-container');
    if (container.children.length > 1) {
        container.removeChild(container.lastChild);
    }
    updateRemovePassengerButton();
}

function resetPassengerForms() {
    const container = document.getElementById('passenger-forms-container');
    container.innerHTML = `
        <div class="passenger-form">
            <h4>Passenger 1</h4>
            <div class="form-grid">
                <div class="form-group"><label>Client Name</label><input type="text" class="passenger-name" required></div>
                <div class="form-group"><label>ID Number</label><input type="text" class="passenger-id" required></div>
                <div class="form-group"><label>Base Fare (MMK)</label><input type="number" class="passenger-base-fare" step="1" required></div>
                <div class="form-group"><label>Net Amount (MMK)</label><input type="number" class="passenger-net-amount" step="1" required></div>
                <div class="form-group"><label>Extra Fare (Optional)</label><input type="number" class="passenger-extra-fare" step="1"></div>
                <div class="form-group"><label>Commission</label><input type="number" class="passenger-commission" step="1" readonly></div>
                <div class="form-group"><label>Remarks (Optional)</label><textarea class="passenger-remarks" rows="1"></textarea></div>
            </div>
        </div>
    `;
    updateRemovePassengerButton();
}


function updateRemovePassengerButton() {
    const container = document.getElementById('passenger-forms-container');
    const removeBtn = document.getElementById('removePassengerBtn');
    removeBtn.style.display = container.children.length > 1 ? 'inline-flex' : 'none';
}


// --- MODIFY & UPDATE TICKET ---
function findTicketForModify() {
    const pnr = document.getElementById('modifyPnr').value.toUpperCase();
    if (!pnr) return showToast('Please enter a PNR code.', 'error');
    const found = state.allTickets.filter(t => t.booking_reference === pnr);
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
    let html = `<div class="table-container"><table><thead><tr><th>Name</th><th>Route</th><th>Travel Date</th><th>Status / Action</th></tr></thead><tbody>`;
    
    const remarkCheck = (r) => {
        if (!r) return false;
        const lowerRemark = r.toLowerCase();
        return lowerRemark.includes('refund') || lowerRemark.includes('cancel');
    };

    tickets.forEach(t => {
        let actionButton = '';

        if (remarkCheck(t.remarks)) {
            const statusText = t.remarks.toLowerCase().includes('refund') ? 'Fully Refunded' : 'Canceled';
            actionButton = `<button class="btn btn-secondary" disabled>${statusText}</button>`;
        } else {
            actionButton = `<button class="btn btn-primary" onclick="openModifyModal(${t.rowIndex})">Modify</button>`;
        }
        
        html += `<tr><td>${t.name}</td><td>${t.departure.split(' ')[0]}→${t.destination.split(' ')[0]}</td><td>${t.departing_on}</td><td>${actionButton}</td></tr>`;
    });
    container.innerHTML = html + '</tbody></table></div>';
}

function openModifyModal(rowIndex) {
    const ticket = state.allTickets.find(t => t.rowIndex === rowIndex);
    if (!ticket) return showToast('Ticket not found.', 'error');

    let travelDateForInput = '';
    if (ticket.departing_on) {
        const d = parseSheetDate(ticket.departing_on);
        if (!isNaN(d.getTime()) && d.getTime() !== 0) {
            travelDateForInput = `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;
        }
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const travelDate = parseSheetDate(ticket.departing_on);
    const isPast = travelDate < today;

    let paymentUpdateHtml = '';
    if (!ticket.paid) {
        paymentUpdateHtml = `
            <hr style="border-color: rgba(255,255,255,0.2); margin: 1.5rem 0;">
            <h4>Update Payment Status</h4>
            <div class="form-grid" style="margin-top: 1rem;">
                <div class="form-group checkbox-group" style="padding-top: 1.5rem;">
                    <label for="update_paid">Mark as Paid</label>
                    <input type="checkbox" id="update_paid" name="update_paid" style="width: 20px; height: 20px; -webkit-appearance: checkbox; appearance: checkbox;">
                </div>
                <div class="form-group">
                    <label for="update_payment_method">Payment Method</label>
                    <select id="update_payment_method" name="update_payment_method">
                        <option value="">Select Payment Method</option>
                        <option value="KBZ Pay">KBZ Pay</option>
                        <option value="Mobile Banking">Mobile Banking</option>
                        <option value="Aya Pay">Aya Pay</option>
                        <option value="Cash">Cash</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="update_paid_date">Paid Date</label>
                    <input type="text" id="update_paid_date" name="update_paid_date" placeholder="MM/DD/YYYY">
                </div>
            </div>
        `;
    }

    modifyModalBody.innerHTML = `
        <h2>Modify Ticket: ${ticket.name}</h2>
        <form id="updateForm" data-pnr="${ticket.booking_reference}" data-master-row-index="${rowIndex}">
            <h4>Ticket Details</h4>
            <div class="form-grid" style="margin-top: 1rem;">
                <div class="form-group"><label>New Travel Date (for all in PNR)</label><input type="text" id="update_departing_on" placeholder="MM/DD/YYYY" value="${travelDateForInput}" ${isPast ? 'disabled' : ''}></div>
                <div class="form-group"><label>New Base Fare (Optional)</label><input type="number" id="update_base_fare" placeholder="${(ticket.base_fare||0).toLocaleString()}"></div>
                <div class="form-group"><label>New Net Amount (Optional)</label><input type="number" id="update_net_amount" placeholder="${(ticket.net_amount||0).toLocaleString()}"></div>
                <div class="form-group"><label>Date Change Fees (Optional)</label><input type="number" id="date_change_fees"></div>
                <div class="form-group"><label>Extra Fare (Optional)</label><input type="number" id="update_extra_fare" placeholder="Adds to existing extra fare"></div>
            </div>
            ${paymentUpdateHtml}
            <div class="form-actions" style="margin-top: 2rem;">
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('modifyModal').classList.remove('show')">Cancel</button>
                <button type="submit" class="btn btn-primary">Update Ticket(s)</button>
            </div>
        </form>`;
    
    new Datepicker(document.getElementById('update_departing_on'), { format: 'mm/dd/yyyy', autohide: true, todayHighlight: true });
    if (!ticket.paid) {
        new Datepicker(document.getElementById('update_paid_date'), { format: 'mm/dd/yyyy', autohide: true, todayHighlight: true });
    }
    modifyModal.classList.add('show');
    document.getElementById('updateForm').addEventListener('submit', handleUpdateTicket);
}

async function handleUpdateTicket(e) {
    e.preventDefault();
    const form = e.target;
    const pnr = form.dataset.pnr;
    let historyDetails = [];

    const ticketsToUpdate = state.allTickets.filter(t => t.booking_reference === pnr);
    const originalTicket = state.allTickets.find(t => t.booking_reference === pnr);

    let newTravelDateVal = document.getElementById('update_departing_on').value;
    const newBaseFare = parseFloat(document.getElementById('update_base_fare').value);
    const newNetAmount = parseFloat(document.getElementById('update_net_amount').value);
    const dateChangeFees = parseFloat(document.getElementById('date_change_fees').value) || 0;
    const extraFare = parseFloat(document.getElementById('update_extra_fare').value) || 0;

    const updatePaidCheckbox = document.getElementById('update_paid');
    const newPaidStatus = updatePaidCheckbox ? updatePaidCheckbox.checked : null;
    const newPaymentMethod = document.getElementById('update_payment_method')?.value.toUpperCase();
    const newPaidDate = document.getElementById('update_paid_date')?.value;
    
    const formattedNewTravelDateForSheet = newTravelDateVal ? formatDateForSheet(newTravelDateVal) : '';

    if (newTravelDateVal) {
        const d1 = parseSheetDate(newTravelDateVal);
        const d2 = parseSheetDate(originalTicket.departing_on);
        if (d1.getTime() > 0 && d2.getTime() > 0 && d1.getTime() !== d2.getTime()) {
            const newDateForHistory = formatDateToDMMMY(newTravelDateVal);
            historyDetails.push(`Travel Date: ${originalTicket.departing_on} to ${newDateForHistory}`);
        }
    }
    if (!isNaN(newBaseFare) && newBaseFare !== originalTicket.base_fare) historyDetails.push(`Base Fare: ${originalTicket.base_fare} to ${newBaseFare}`);
    if (!isNaN(newNetAmount) && newNetAmount !== originalTicket.net_amount) historyDetails.push(`Net Amount: ${originalTicket.net_amount} to ${newNetAmount}`);
    if (extraFare > 0) historyDetails.push(`Added Extra Fare: ${extraFare}`);
    if (dateChangeFees > 0) historyDetails.push(`Added Date Change Fees: ${dateChangeFees}`);
    if (newPaidStatus && !originalTicket.paid) historyDetails.push(`Payment: Not Paid to Paid`);
    if (newPaymentMethod && newPaymentMethod !== originalTicket.payment_method) historyDetails.push(`Payment Method: ${newPaymentMethod}`);
    if (newPaidDate && newPaidDate !== originalTicket.paid_date) {
        historyDetails.push(`Paid Date: ${formatDateToDMMMY(newPaidDate)}`);
    }

    const dataForBatchUpdate = ticketsToUpdate.map(ticket => {
        let finalBaseFare = isNaN(newBaseFare) ? ticket.base_fare : newBaseFare;
        let finalNetAmount = isNaN(newNetAmount) ? ticket.net_amount : newNetAmount;
        let finalCommission = isNaN(newBaseFare) ? ticket.commission : Math.round((newBaseFare * 0.05) * 0.60);
        let finalExtraFare = (ticket.extra_fare || 0) + extraFare;
        let finalDateChangeFees = (ticket.date_change || 0) + dateChangeFees;
        let finalPaid = newPaidStatus !== null ? newPaidStatus : ticket.paid;
        let finalPaymentMethod = newPaymentMethod || ticket.payment_method;
        let finalPaidDate = newPaidDate ? formatDateForSheet(newPaidDate) : ticket.paid_date;

        return {
            range: `${CONFIG.SHEET_NAME}!A${ticket.rowIndex}:U${ticket.rowIndex}`, 
            values: [[
                ticket.issued_date, ticket.name, ticket.id_no, ticket.phone,
                ticket.account_name, ticket.account_type, ticket.account_link,
                ticket.departure, ticket.destination, formattedNewTravelDateForSheet || ticket.departing_on,
                ticket.airline, finalBaseFare, ticket.booking_reference, finalNetAmount,
                finalPaid, finalPaymentMethod, finalPaidDate,
                finalCommission, ticket.remarks, finalExtraFare, finalDateChangeFees 
            ]]
        };
    });

    try {
        showToast('Updating tickets...', 'info');
        await gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: CONFIG.SHEET_ID,
            resource: { valueInputOption: 'USER_ENTERED', data: dataForBatchUpdate }
        });
        await saveHistory(CONFIG.MODIFICATION_HISTORY_SHEET, originalTicket, historyDetails.join('; '));
        state.cache['ticketData'] = null;
        state.cache['modHistoryData'] = null;
        showToast('Tickets updated successfully!', 'success');
        modifyModal.classList.remove('show');
        document.getElementById('modifyResultsContainer').innerHTML = '';
        document.getElementById('modifyPnr').value = '';
        await Promise.all([loadTicketData(), loadModificationHistory()]);
        updateDashboardData();
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
    const found = state.allTickets.filter(t => t.booking_reference === pnr);
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
    let html = `<div class="table-container"><table><thead><tr><th>Name</th><th>Route</th><th>Travel Date</th><th>Status / Actions</th></tr></thead><tbody>`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const remarkCheck = (r) => {
        if (!r) return false;
        const lowerRemark = r.toLowerCase();
        return lowerRemark.includes('refund') || lowerRemark.includes('cancel');
    };

    tickets.forEach(t => {
        const travelDate = parseSheetDate(t.departing_on);
        const isPast = travelDate < today;
        let actionsHtml = '';

        if (remarkCheck(t.remarks)) {
             const statusText = t.remarks.toLowerCase().includes('refund') ? 'Fully Refunded' : 'Canceled';
             actionsHtml = `<button class="btn btn-secondary" disabled>${statusText}</button>`;
        } else if (isPast) {
            actionsHtml = `<button class="btn btn-primary" disabled>Date Passed</button>`;
        } else {
            actionsHtml = `<button class="btn btn-primary" onclick="openCancelModal(${t.rowIndex}, 'refund')">Full Refund</button>
                         <button class="btn btn-secondary" onclick="openCancelModal(${t.rowIndex}, 'cancel')">Cancel</button>`;
        }

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
    const ticket = state.allTickets.find(t => t.rowIndex === rowIndex);
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
                <button type="button" class="btn btn-secondary" onclick="document.getElementById('cancelModal').classList.remove('show')">Back</button>
                <button type="button" class="btn btn-primary" onclick="handleCancelTicket(${rowIndex}, 'refund')">Confirm Refund</button>
            </div>`;
    } else {
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
                    <button type="button" class="btn btn-secondary" onclick="document.getElementById('cancelModal').classList.remove('show')">Back</button>
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

    cancelModal.classList.add('show');
}

async function handleCancelTicket(rowIndex, type, refundAmount = 0) {
    const ticket = state.allTickets.find(t => t.rowIndex === rowIndex);
    if (!ticket) {
        showToast('Ticket not found for cancellation.', 'error');
        return;
    }

    let updatedValues = [];
    let historyDetails = '';
    const now = new Date();
    const dateStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;

    if (type === 'refund') {
        const remark = `Full Refund on ${dateStr}`;
        updatedValues = [
            ticket.issued_date, ticket.name, ticket.id_no, ticket.phone,
            ticket.account_name, ticket.account_type, ticket.account_link,
            ticket.departure, ticket.destination, ticket.departing_on,
            ticket.airline, 0, ticket.booking_reference, 0,
            ticket.paid, ticket.payment_method, ticket.paid_date,
            0, remark, 0, 0 
        ];
        historyDetails = "Full Refund processed.";
    } else {
        const newNetAmount = (ticket.net_amount || 0) - refundAmount;
        const remark = `Canceled on ${dateStr} with ${refundAmount.toLocaleString()} refund`;
        updatedValues = [
            ticket.issued_date, ticket.name, ticket.id_no, ticket.phone,
            ticket.account_name, ticket.account_type, ticket.account_link,
            ticket.departure, ticket.destination, ticket.departing_on,
            ticket.airline, ticket.base_fare, ticket.booking_reference, newNetAmount,
            ticket.paid, ticket.payment_method, ticket.paid_date,
            ticket.commission, remark, ticket.extra_fare,
            ticket.date_change 
        ];
        historyDetails = `Partial Cancellation. Refunded: ${refundAmount.toLocaleString()} MMK.`;
    }
    
    try {
        showToast('Processing cancellation...', 'info');
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.SHEET_NAME}!A${rowIndex}:U${rowIndex}`, 
            valueInputOption: 'USER_ENTERED',
            resource: { values: [updatedValues] }
        });
        await saveHistory(CONFIG.CANCELLATION_HISTORY_SHEET, ticket, historyDetails);
        state.cache['ticketData'] = null;
        state.cache['cancelHistoryData'] = null;
        showToast('Ticket updated successfully!', 'success');
        cancelModal.classList.remove('show');
        document.getElementById('cancelResultsContainer').innerHTML = '';
        document.getElementById('cancelPnr').value = '';
        await Promise.all([loadTicketData(), loadCancellationHistory()]);
        updateDashboardData();
    } catch (error) {
        showToast(`Cancellation Error: ${error.result?.error?.message || 'Could not update.'}`, 'error');
    }
}


// --- HISTORY FUNCTIONS ---
async function loadModificationHistory() {
    try {
        const response = await fetchFromSheet(`${CONFIG.MODIFICATION_HISTORY_SHEET}!A:D`, 'modHistoryData');
        state.modificationHistory = parseHistoryData(response.values);
        displayModificationHistory(1);
    } catch (error) {
        showToast('Could not load modification history. Ensure the sheet exists.', 'error');
        console.error("Modification History Error:", error);
    }
}

async function loadCancellationHistory() {
    try {
        const response = await fetchFromSheet(`${CONFIG.CANCELLATION_HISTORY_SHEET}!A:D`, 'cancelHistoryData');
        state.cancellationHistory = parseHistoryData(response.values);
        displayCancellationHistory(1);
    } catch (error) {
        showToast('Could not load cancellation history. Ensure the sheet exists.', 'error');
        console.error("Cancellation History Error:", error);
    }
}

function parseHistoryData(values) {
    if (!values || values.length < 2) return [];
    const headers = values[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    const data = values.slice(1).map((row) => {
        const entry = {};
        headers.forEach((h, j) => {
            entry[h] = row[j] || '';
        });
        return entry;
    });
    return data.reverse();
}

async function saveHistory(sheetName, ticket, details) {
    if (!details) return;
    const now = new Date();
    const date = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
    const values = [[date, ticket.name, ticket.booking_reference, details]];
    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${sheetName}!A:D`,
            valueInputOption: 'USER_ENTERED',
            resource: { values }
        });
    } catch (error) {
        showToast(`Failed to save history: ${error.result?.error?.message}`, 'error');
    }
}

function displayModificationHistory(page) {
    state.modHistoryPage = page;
    const container = document.getElementById('modificationHistoryContainer');
    const tbody = document.getElementById('modificationHistoryBody');
    const sortedHistory = state.modificationHistory;

    if (sortedHistory.length > 0) container.style.display = 'block';

    const paginated = sortedHistory.slice((page - 1) * state.rowsPerPage, page * state.rowsPerPage);
    tbody.innerHTML = '';
    paginated.forEach(entry => {
        const row = tbody.insertRow();
        row.innerHTML = `<td>${formatDateToDMMMY(entry.date)}</td><td>${entry.name}</td><td>${entry.booking_ref}</td><td>${entry.details}</td>`;
    });
    setupHistoryPagination('modification', sortedHistory, page);
}

function displayCancellationHistory(page) {
    state.cancelHistoryPage = page;
    const container = document.getElementById('cancellationHistoryContainer');
    const tbody = document.getElementById('cancellationHistoryBody');
    const sortedHistory = state.cancellationHistory;

    if (sortedHistory.length > 0) container.style.display = 'block';

    const paginated = sortedHistory.slice((page - 1) * state.rowsPerPage, page * state.rowsPerPage);
    tbody.innerHTML = '';
    paginated.forEach(entry => {
        const row = tbody.insertRow();
        row.innerHTML = `<td>${formatDateToDMMMY(entry.date)}</td><td>${entry.name}</td><td>${entry.booking_ref}</td><td>${entry.details}</td>`;
    });
    setupHistoryPagination('cancellation', sortedHistory, page);
}

function setupHistoryPagination(type, items, currentPage) {
    const containerId = type === 'modification' ? 'modificationHistoryPagination' : 'cancellationHistoryPagination';
    const renderFn = type === 'modification' ? displayModificationHistory : displayCancellationHistory;
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    const pageCount = Math.ceil(items.length / state.rowsPerPage);
    if (pageCount <= 1) return;

    const createBtn = (txt, pg, enabled = true) => {
        const btn = document.createElement('button');
        btn.className = 'pagination-btn';
        btn.innerHTML = txt;
        btn.disabled = !enabled;
        if (enabled) {
            btn.onclick = () => renderFn(pg);
        }
        if (pg === currentPage) {
            btn.classList.add('active');
        }
        return btn;
    };
    container.append(createBtn('&laquo;', currentPage - 1, currentPage > 1));
    for (let i = 1; i <= pageCount; i++) {
        container.append(createBtn(i, i));
    }
    container.append(createBtn('&raquo;', currentPage + 1, currentPage < pageCount));
}


// --- CUSTOM AIRLINE FUNCTIONS ---
function handleAirlineChange(e) {
    const customAirlineGroup = document.getElementById('custom_airline_group');
    const customAirlineInput = document.getElementById('custom_airline');
    if (e.target.value === 'CUSTOM') {
        customAirlineGroup.style.display = 'flex';
        customAirlineInput.required = true;
        customAirlineInput.disabled = false;
    } else {
        customAirlineGroup.style.display = 'none';
        customAirlineInput.required = false;
        customAirlineInput.disabled = true;
        customAirlineInput.value = '';
    }
}

function populateSearchAirlines() {
    const searchAirlineSelect = document.getElementById('searchAirline');
    const defaultAirlines = new Set(["MNA", "MAI", "MANYADANARPON", "AIRTHANWLIN"]);

    const airlinesFromTickets = new Set(state.allTickets.map(t => t.airline ? t.airline.toUpperCase() : null).filter(Boolean));

    const allAvailableAirlines = new Set([...defaultAirlines, ...airlinesFromTickets]);

    while (searchAirlineSelect.options.length > 1) {
        searchAirlineSelect.remove(1);
    }

    Array.from(allAvailableAirlines).sort().forEach(airline => {
        const option = document.createElement('option');
        option.value = airline;
        option.textContent = airline;
        searchAirlineSelect.appendChild(option);
    });
}


// --- UI SETTINGS ---
function initializeUISettings() {
    const settingsBtn = document.getElementById('settings-btn');
    const resetBtn = document.getElementById('reset-settings-btn');
    const opacitySlider = document.getElementById('opacity-slider');
    const blurSlider = document.getElementById('blur-slider');
    const overlaySlider = document.getElementById('overlay-slider');
    const glassSlider = document.getElementById('glass-slider');
    const opacityValue = document.getElementById('opacity-value');
    const blurValue = document.getElementById('blur-value');
    const overlayValue = document.getElementById('overlay-value');
    const glassValue = document.getElementById('glass-value');
    const root = document.documentElement;

    const defaults = {
        opacity: 0.05,
        blur: 20,
        overlay: 0.5,
        glass: 0.15
    };

    let settings = JSON.parse(localStorage.getItem('uiSettings')) || { ...defaults };

    function applySettings() {
        root.style.setProperty('--glass-bg', `rgba(255, 255, 255, ${settings.opacity})`);
        root.style.setProperty('--blur-amount', `${settings.blur}px`);
        root.style.setProperty('--overlay-opacity', settings.overlay);
        root.style.setProperty('--liquid-border', `1px solid rgba(255, 255, 255, ${settings.glass})`);
    }

    function updateSlidersAndValues() {
        opacitySlider.value = settings.opacity;
        blurSlider.value = settings.blur;
        overlaySlider.value = settings.overlay;
        glassSlider.value = settings.glass;

        opacityValue.textContent = Number(settings.opacity).toFixed(2);
        blurValue.textContent = settings.blur;
        overlayValue.textContent = Number(settings.overlay).toFixed(2);
        glassValue.textContent = Number(settings.glass).toFixed(2);
    }

    function saveSettings() {
        localStorage.setItem('uiSettings', JSON.stringify(settings));
    }

    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.toggle('show');
    });

    opacitySlider.addEventListener('input', (e) => {
        settings.opacity = e.target.value;
        opacityValue.textContent = Number(settings.opacity).toFixed(2);
        applySettings();
        saveSettings();
    });

    blurSlider.addEventListener('input', (e) => {
        settings.blur = e.target.value;
        blurValue.textContent = settings.blur;
        applySettings();
        saveSettings();
    });

    overlaySlider.addEventListener('input', (e) => {
        settings.overlay = e.target.value;
        overlayValue.textContent = Number(settings.overlay).toFixed(2);
        applySettings();
        saveSettings();
    });
    
    glassSlider.addEventListener('input', (e) => {
        settings.glass = e.target.value;
        glassValue.textContent = Number(settings.glass).toFixed(2);
        applySettings();
        saveSettings();
    });
    
    resetBtn.addEventListener('click', () => {
        settings = { ...defaults };
        applySettings();
        updateSlidersAndValues();
        saveSettings();
        showToast('UI settings have been reset.', 'info');
    });
    
    applySettings();
    updateSlidersAndValues();
}


// --- PDF EXPORT FUNCTION ---
function exportToPdf() {
    if (state.filteredTickets.length === 0) {
        showToast('No search results to export.', 'info');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    if (typeof doc.autoTable !== 'function') {
        showToast('PDF library not loaded yet. Please try again.', 'error');
        console.error('jsPDF autoTable plugin is not loaded.');
        return;
    }

    const sortedTickets = [...state.filteredTickets].sort((a, b) => 
        parseSheetDate(a.issued_date) - parseSheetDate(b.issued_date)
    );

    const tableColumns = ["Issued Date", "Name", "Booking Ref", "Route", "Airline", "Net Amount", "Date Change", "Commission"];
    const tableRows = [];

    let totalNetAmount = 0;
    let totalDateChange = 0;
    let totalCommission = 0;

    sortedTickets.forEach(ticket => {
        totalNetAmount += ticket.net_amount || 0;
        totalDateChange += ticket.date_change || 0;
        totalCommission += ticket.commission || 0;

        const ticketData = [
            formatDateToDMMMY(ticket.issued_date) || '',
            ticket.name || '',
            ticket.booking_reference || '',
            ticket.departure && ticket.destination ? `${ticket.departure} - ${ticket.destination}` : 'N/A',
            ticket.airline || '',
            (ticket.net_amount || 0).toLocaleString(),
            (ticket.date_change || 0).toLocaleString(),
            (ticket.commission || 0).toLocaleString()
        ];
        tableRows.push(ticketData);
    });

    const footerRow = [
        { 
            content: 'Total', 
            colSpan: 5, 
            styles: { halign: 'right', fontStyle: 'bold' } 
        },
        { content: totalNetAmount.toLocaleString(), styles: { halign: 'right', fontStyle: 'bold' } },
        { content: totalDateChange.toLocaleString(), styles: { halign: 'right', fontStyle: 'bold' } },
        { content: totalCommission.toLocaleString(), styles: { halign: 'right', fontStyle: 'bold' } }
    ];

    const now = new Date();
    const currentMonth = now.toLocaleString('default', { month: 'long' });
    const title = `Ocean Air Ticket (${currentMonth} Report)`;
    const exportedDate = `Exported on: ${now.toLocaleDateString('en-US')}`;

    doc.autoTable({
        head: [tableColumns],
        body: tableRows,
        foot: [footerRow],
        startY: 25,
        theme: 'grid',
        headStyles: {
            fillColor: [33, 38, 45], 
            textColor: [230, 237, 243]
        },
        footStyles: {
            fillColor: [220, 220, 220],
            textColor: [0, 0, 0],
            fontStyle: 'bold'
        },
        styles: {
            font: 'helvetica',
            fontSize: 7.5,
            cellPadding: 2,
            valign: 'middle'
        },
        columnStyles: {
            0: { cellWidth: 22 }, 1: { cellWidth: 40 }, 2: { cellWidth: 25 },
            3: { cellWidth: 75 }, 4: { cellWidth: 28 }, 5: { halign: 'right', cellWidth: 23 },
            6: { cellWidth: 23, halign: 'right' }, 7: { cellWidth: 23, halign: 'right' }
        },
        didDrawPage: function (data) {
            doc.setFontSize(18);
            doc.setTextColor(40);
            doc.text(title, data.settings.margin.left, 15);

            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text(exportedDate, data.settings.margin.left, 20);
            
            const pageCount = doc.internal.getNumberOfPages();
            doc.setFontSize(10);
            doc.text("Page " + String(data.pageNumber) + " of " + String(pageCount), data.settings.margin.left, doc.internal.pageSize.height - 10);
        }
    });

    doc.save(`Ocean_Air_Report_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.pdf`);
    showToast('Report exported successfully!', 'success');
}
