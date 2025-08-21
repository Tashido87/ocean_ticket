// Configuration
const CONFIG = {
    SHEET_ID: '1SGc80isz0VRVt447R_q-fBdZ_me52H_Z32W5HauHMWQ',
    API_KEY: 'AIzaSyC9JSD6VWXMQ7Pe8VPf-gIlNUtcwQhkG1o', // It is strongly recommended to move this to a secure backend.
    CLIENT_ID: '254093944424-mfvk48avc9n86de6jit9oai7kqrsr2f7.apps.googleusercontent.com', // IMPORTANT: REPLACE WITH YOUR CLIENT ID
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    SHEET_NAME: '2025',
    BOOKING_SHEET_NAME: 'booking',
    HISTORY_SHEET: 'history' // Consolidated history sheet
};

// --- GLOBAL STATE & CACHE ---
const state = {
    allTickets: [],
    filteredTickets: [],
    allBookings: [],
    filteredBookings: [],
    allClients: [],
    featuredClients: [], // For starred clients
    history: [],
    charts: {},
    isSubmitting: false,
    rowsPerPage: 10,
    currentPage: 1,
    bookingCurrentPage: 1,
    historyPage: 1,
    clientPage: 1,
    searchTimeout: null,
    cache: {}, // In-memory cache
    bookingToUpdate: null,
    commissionRates: { // Default commission rates
        rate: 0.05, // 5%
        cut: 0.60   // 60%
    }
};
let tokenClient;
let gapiInited = false;
let gisInited = false;

// --- City data for flight type toggle ---
const CITIES = {
    DOMESTIC: ["Bhamo (BMO)", "Bokpyin (VBP)", "Dawei (TVY)", "Heho (HEH)", "Hommalinn (HOX)", "Kalemyo (KMV)", "Kengtung (KET)", "Khamti (KHM)", "Kyaukpyu (KYP)", "Lashio (LSH)", "Loikaw (LIW)", "Mandalay (MDL)", "Mawlamyaing (MNU)", "Monywa (NYW)", "Myeik (MGZ)", "Myitkyina (MYT)", "Nay Pyi Taw (NYT)", "Nyaung U (NYU)", "Putao (PBU)", "Sittwe (AKY)", "Tachilek (THL)", "Thandwe (SNW)", "Yangon (RGN)"],
    INTERNATIONAL: ["Mandalay (MDL)", "Yangon (RGN)", "Ann (VBA)", "Anni Sakhan (VBK)", "Bangalore (BLR)", "Bangkok (BKK)", "Bassein (BSX)", "Brisbane (BNE)", "Busan (PUS)", "Chengdu (CTU)", "Chaing Mai (CNX)", "Coco Islands (VCC)", "Colombo (CMB)", "Cox's bazar (CXB)", "Denpasar (DPS)", "Dhaka (DAC)", "Don Mueang (DMK)", "Fukuoka (FUK)", "Gaya (GAY)", "Haikou (HAK)", "Hanoi (HAN)", "Ho Chi Minh City (SGN)", "Hong Kong (HKG)", "Incheon (ICN)", "Jakarta (CGK)", "Kolkata (CCU)", "Krabi (KBV)", "Kuala Lumpur (KUL)", "Kumming (KMG)", "Mae Sot (MAQ)", "Manaung (MGU)", "Mangrere (AKL)", "Mangshi (LUM)", "Manila (MNL)", "Melbourne (MEL)", "Monghsat (MOG)", "Mumbai (BOM)", "Nagoya (NGO)", "Naming (NMS)", "Nanning (NNG)", "Phuket (HKT)", "Siem Reap (SAI)", "Singapore (SIN)", "Subang (SZB)", "Surbung (SRU)", "Sydney (SYD)", "Taipei (TPE)", "Tokyo - Narita (NRT)", "Vientiane (VTE)", "Xiamen (XMN)"]
};


// --- DOM Elements ---
const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');
const loading = document.getElementById('loading');
const dashboardContent = document.getElementById('dashboard-content');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modalBody');
const toast = document.getElementById('toast');
const authorizeButton = document.getElementById('authorize_button');
const settingsPanel = document.getElementById('settings-panel');
const monthSelector = document.getElementById('dashboard-month');
const yearSelector = document.getElementById('dashboard-year');
const flightTypeToggle = document.getElementById('flightTypeToggle');
const exportConfirmModal = document.getElementById('exportConfirmModal');

// --- INITIALIZATION ---
window.onload = async () => {
    initializeDatepickers();
    initializeTimePicker();
    setupEventListeners();
    initializeBackgroundChanger();
    initializeUISettings();
    initializeCityDropdowns();
    updateToggleLabels();
    resetPassengerForms();
    resetBookingPassengerForms();
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
    const allDatePickers = ['searchStartDate', 'searchEndDate', 'searchTravelDate', 'booking_departing_on', 'exportStartDate', 'exportEndDate', 'issued_date', 'departing_on', 'paid_date', 'booking_end_date'];
    allDatePickers.forEach(id => {
        const el = document.getElementById(id);
        if (el) new Datepicker(el, defaultOptions);
    });
}

function initializeTimePicker() {
    const hourSelect = document.getElementById('booking_end_time_hour');
    const minuteSelect = document.getElementById('booking_end_time_minute');

    for (let i = 1; i <= 12; i++) {
        hourSelect.add(new Option(String(i).padStart(2, '0'), i));
    }
    for (let i = 0; i < 60; i += 5) {
        minuteSelect.add(new Option(String(i).padStart(2, '0'), i));
    }
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
        loadFeaturedClients();
        await Promise.all([
            loadTicketData(),
            loadBookingData(),
            loadHistory()
        ]);
        initializeDashboardSelectors();
        buildClientList();
        renderClientsView();
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

    ['searchTravelDate', 'searchStartDate', 'searchEndDate', 'searchDeparture', 'searchDestination', 'searchAirline', 'searchNotPaidToggle'].forEach(id => {
         document.getElementById(id).addEventListener('change', performSearch);
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            setDateRangePreset(e.target.dataset.range);
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('clearBtn').addEventListener('click', clearSearch);
    document.getElementById('exportPdfBtn').addEventListener('click', () => exportConfirmModal.classList.add('show'));
    document.getElementById('confirmExportBtn').addEventListener('click', exportToPdf);

    document.querySelectorAll('input[name="exportType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('exportDateRange').style.display = e.target.value === 'range' ? 'block' : 'none';
        });
    });

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

    document.getElementById('findTicketBtn').addEventListener('click', () => findTicketForManage());
    document.getElementById('clearManageBtn').addEventListener('click', clearManageResults);

    document.getElementById('managePnr').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') document.getElementById('findTicketBtn').click();
    });

    document.getElementById('newBookingBtn').addEventListener('click', showNewBookingForm);
    document.getElementById('cancelNewBookingBtn').addEventListener('click', hideNewBookingForm);
    document.getElementById('newBookingForm').addEventListener('submit', handleNewBookingSubmit);

    document.getElementById('addBookingPassengerBtn').addEventListener('click', addBookingPassengerForm);
    document.getElementById('removeBookingPassengerBtn').addEventListener('click', removeBookingPassengerForm);

    document.getElementById('bookingSearchBtn').addEventListener('click', performBookingSearch);
    document.getElementById('bookingClearBtn').addEventListener('click', clearBookingSearch);

    ['departure', 'destination', 'searchDeparture', 'searchDestination', 'booking_departure', 'booking_destination'].forEach(id => {
        document.getElementById(id).addEventListener('change', handleRouteValidation);
    });

    document.getElementById('phone').addEventListener('input', (e) => handleAutosuggest(e.target, 'phone'));
    document.getElementById('account_name').addEventListener('input', (e) => handleAutosuggest(e.target, 'account_name'));


    window.addEventListener('click', (event) => {
        if (event.target == modal) closeModal();
        if (event.target == exportConfirmModal) exportConfirmModal.classList.remove('show');
        if (!settingsPanel.contains(event.target) && event.target !== document.getElementById('settings-btn') && !document.getElementById('settings-btn').contains(event.target) ) {
            settingsPanel.classList.remove('show');
        }
        if (!event.target.closest('.client-autosuggest-group')) {
            document.querySelectorAll('.autosuggest-box').forEach(box => box.style.display = 'none');
        }
    });
}

// --- DROPDOWN LOGIC ---
function populateCitySelect(selectElement, locations) {
    const firstOption = selectElement.options[0];
    selectElement.innerHTML = '';
    if (firstOption && firstOption.disabled) {
        selectElement.appendChild(firstOption);
    }

    locations.forEach(location => {
        const match = location.match(/(.+) \((.+)\)/);
        let text, value;
        if (match) {
            text = `${match[2]} - ${match[1]}`;
            value = location;
        } else {
            text = location;
            value = location;
        }
        selectElement.add(new Option(text, value));
    });
}

function initializeCityDropdowns() {
    const allLocations = [...new Set([...CITIES.DOMESTIC, ...CITIES.INTERNATIONAL])].sort();

    const dropdownsToPopulate = [
        document.getElementById('searchDeparture'),
        document.getElementById('searchDestination'),
        document.getElementById('booking_departure'),
        document.getElementById('booking_destination')
    ];

    dropdownsToPopulate.forEach(dropdown => {
        if (dropdown) {
            populateCitySelect(dropdown, allLocations);
        }
    });

    populateFlightLocations();
}

// --- ROUTE & FLIGHT TYPE LOGIC ---
function populateFlightLocations() {
    const isDomestic = !flightTypeToggle.checked;
    const locations = isDomestic ? CITIES.DOMESTIC : CITIES.INTERNATIONAL;

    const departureSelect = document.getElementById('departure');
    const destinationSelect = document.getElementById('destination');

    populateCitySelect(departureSelect, locations.sort());
    populateCitySelect(destinationSelect, locations.sort());
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
    const form = changedSelect.closest('form, .view');
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
        } else {
            renderEmptyState('resultsBodyContainer', 'fa-ticket', 'No Tickets Found', 'There are no tickets in the system yet. Start by selling a new ticket.');
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
        const response = await fetchFromSheet(`${CONFIG.BOOKING_SHEET_NAME}!A:N`, 'bookingData');

        if (response.values) {
            state.allBookings = parseBookingData(response.values);
        } else {
            state.allBookings = [];
        }
        populateBookingSearchOptions();
        displayBookings();
    } catch (error) {
        showToast(`Error loading booking data: ${error.result?.error?.message || error}`, 'error');
        renderEmptyState('bookingTableContainer', 'fa-calendar-xmark', 'Failed to load bookings', 'Could not retrieve booking data from the sheet. Please check permissions and try again.');
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
        const groupIdBase = booking.pnr || `${booking.phone}-${booking.account_link}`;
        booking.groupId = `${groupIdBase}-${booking.departing_on}-${booking.departure}-${booking.destination}`;
        return booking;
    });
}


function displayBookings(bookingsToDisplay) {
    const container = document.getElementById('bookingTableContainer');
    container.innerHTML = '';

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

    const groupedBookings = bookings.reduce((acc, booking) => {
        if (!acc[booking.groupId]) {
            acc[booking.groupId] = {
                ...booking,
                passengers: [],
                rowIndices: []
            };
        }
        acc[booking.groupId].passengers.push({ name: booking.name, id_no: booking.id_no, rowIndex: booking.rowIndex });
        acc[booking.groupId].rowIndices.push(booking.rowIndex);
        return acc;
    }, {});

    const displayableGroups = Object.values(groupedBookings);

    displayableGroups.sort((a, b) => {
        const dateA = parseSheetDate(a.departing_on);
        const dateB = parseSheetDate(b.departing_on);
        return dateA - dateB;
    });

    state.filteredBookings = displayableGroups;

    if (state.filteredBookings.length === 0) {
        renderEmptyState('bookingTableContainer', 'fa-calendar-check', 'No Active Bookings', 'There are no current booking requests. Add one to get started!');
        setupBookingPagination([]);
        return;
    }

    const table = document.createElement('table');
    table.innerHTML = `
        <thead>
            <tr>
                <th>Travel Date</th>
                <th>Client Name</th>
                <th>Route</th>
                <th>PNR</th>
                <th>Booking End date and time</th>
                <th>Get Ticket</th>
                <th>Cancel</th>
                <th>Details</th>
                <th>Sell</th>
            </tr>
        </thead>
        <tbody id="bookingTableBody"></tbody>
    `;
    container.appendChild(table);

    state.bookingCurrentPage = 1;
    renderBookingPage(1);
}

function renderBookingPage(page) {
    state.bookingCurrentPage = page;
    const tbody = document.getElementById('bookingTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const paginated = state.filteredBookings.slice((page - 1) * state.rowsPerPage, page * state.rowsPerPage);

    paginated.forEach(group => {
        const rowIndicesStr = group.rowIndices.join(',');
        const firstPassengerName = group.passengers[0] ? group.passengers[0].name : 'N/A';
        const passengerCount = group.passengers.length;

        const deadline = parseDeadline(group.enddate, group.endtime);
        const isNearDeadline = deadline && (deadline.getTime() - Date.now()) < (6 * 60 * 60 * 1000) && deadline.getTime() > Date.now();
        
        const row = tbody.insertRow();
        if(isNearDeadline) {
            row.classList.add('deadline-warning');
        }

        row.innerHTML = `
            <td>${formatDateToDMMMY(group.departing_on) || ''}</td>
            <td>${firstPassengerName}${passengerCount > 1 ? ` (+${passengerCount - 1})` : ''}</td>
            <td>${(group.departure || '').split(' ')[0]}→${(group.destination || '').split(' ')[0]}</td>
            <td>${group.pnr || 'N/A'}</td>
            <td>${group.enddate && group.endtime ? `${formatDateToDMMMY(group.enddate)} ${group.endtime}` : 'N/A'}</td>
            <td><input type="checkbox" class="action-checkbox" onclick="handleGetTicket('${rowIndicesStr}')"></td>
            <td><input type="checkbox" class="action-checkbox" onclick="handleCancelBooking('${rowIndicesStr}')"></td>
            <td><button class="icon-btn icon-btn-table" title="View Details" onclick="showBookingDetails('${rowIndicesStr}')"><i class="fa-solid fa-eye"></i></button></td>
            <td><button class="icon-btn icon-btn-table" title="Sell Ticket" onclick="sellTicketFromBooking('${rowIndicesStr}')"><i class="fa-solid fa-ticket"></i></button></td>
        `;
    });

    setupBookingPagination(state.filteredBookings);
}

function handleGetTicket(rowIndicesStr) {
    const rowIndices = rowIndicesStr.split(',').map(Number);
    const bookingGroup = state.filteredBookings.find(g => g.rowIndices.includes(rowIndices[0]));
    const clientName = bookingGroup ? bookingGroup.passengers[0].name : 'this booking';
    const passengerCount = bookingGroup ? bookingGroup.passengers.length : 1;
    const message = `Are you sure you want to mark the booking for <strong>${clientName} ${passengerCount > 1 ? `and ${passengerCount - 1} other(s)` : ''}</strong> as "Get Ticket"? This will remove it from the list.`;
    showConfirmModal(message, () => {
        updateBookingStatus(rowIndices, 'Get Ticket');
        closeModal();
    });
}

function handleCancelBooking(rowIndicesStr) {
    const rowIndices = rowIndicesStr.split(',').map(Number);
    const bookingGroup = state.filteredBookings.find(g => g.rowIndices.includes(rowIndices[0]));
    const clientName = bookingGroup ? bookingGroup.passengers[0].name : 'this booking';
    const passengerCount = bookingGroup ? bookingGroup.passengers.length : 1;
    const message = `Are you sure you want to <strong>CANCEL</strong> the booking for <strong>${clientName} ${passengerCount > 1 ? `and ${passengerCount - 1} other(s)` : ''}</strong>? This will remove it from the list.`;
    showConfirmModal(message, () => {
        updateBookingStatus(rowIndices, 'Canceled');
        closeModal();
    });
}

async function updateBookingStatus(rowIndices, remarks) {
    try {
        state.isSubmitting = true;
        showToast('Updating booking status...', 'info');

        const data = rowIndices.map(rowIndex => ({
            range: `${CONFIG.BOOKING_SHEET_NAME}!N${rowIndex}`,
            values: [[remarks]]
        }));

        await gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: CONFIG.SHEET_ID,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: data
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
    }
}

function showBookingDetails(rowIndicesStr) {
    const rowIndices = rowIndicesStr.split(',').map(Number);
    const bookingGroup = state.filteredBookings.find(g => g.rowIndices.includes(rowIndices[0]));

    if (bookingGroup) {
        const passengerListHtml = bookingGroup.passengers.map(p => `<li><strong>${p.name}</strong> (ID: ${p.id_no || 'N/A'})</li>`).join('');
        const passengerCount = bookingGroup.passengers.length;

        const content = `
            <h3>Booking Request Details</h3>
            ${bookingGroup.pnr ? `<p><strong>PNR Code:</strong> ${bookingGroup.pnr}</p>` : ''}
            <div class="details-section">
                <div class="details-section-title">Passenger(s)</div>
                <ul style="list-style: none; padding-left: 0;">${passengerListHtml}</ul>
                <p><strong>Total Passengers:</strong> ${passengerCount || 'N/A'}</p>
            </div>
             <hr style="border-color: rgba(255,255,255,0.2); margin: 1rem 0;">
            <p><strong>Phone:</strong> ${makeClickable(bookingGroup.phone)}</p>
            <p><strong>Account Name:</strong> ${bookingGroup.account_name || 'N/A'}</p>
            <p><strong>Account Type:</strong> ${bookingGroup.account_type || 'N/A'}</p>
            <p><strong>Account Link:</strong> ${makeClickable(bookingGroup.account_link) || 'N/A'}</a></p>
            <hr style="border-color: rgba(255,255,255,0.2); margin: 1rem 0;">
            <p><strong>Route:</strong> ${bookingGroup.departure || 'N/A'} → ${bookingGroup.destination || 'N/A'}</p>
            <p><strong>Travel Date:</strong> ${formatDateToDMMMY(bookingGroup.departing_on) || 'N/A'}</p>
            <p><strong>Booking Deadline:</strong> ${bookingGroup.enddate && bookingGroup.endtime ? `${formatDateToDMMMY(bookingGroup.enddate)} ${bookingGroup.endtime}` : 'N/A'}</p>
            <div class="form-actions" style="margin-top: 1.5rem;">
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            </div>
        `;
        openModal(content);
    }
}


function showNewBookingForm() {
    document.getElementById('booking-display-container').style.display = 'none';
    document.getElementById('booking-form-container').style.display = 'block';
    resetBookingPassengerForms();
}

function hideNewBookingForm() {
    document.getElementById('booking-form-container').style.display = 'none';
    document.getElementById('booking-display-container').style.display = 'block';
    document.getElementById('newBookingForm').reset();
    resetBookingPassengerForms();
}

async function handleNewBookingSubmit(e) {
    e.preventDefault();
    if (state.isSubmitting) return;
    state.isSubmitting = true;
    const submitButton = e.target.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
        const hour = document.getElementById('booking_end_time_hour').value;
        const minute = document.getElementById('booking_end_time_minute').value;
        const ampm = document.getElementById('booking_end_time_ampm').value;
        
        const sharedData = {
            phone: document.getElementById('booking_phone').value,
            pnr: document.getElementById('booking_pnr').value.toUpperCase(),
            account_name: document.getElementById('booking_account_name').value.toUpperCase(),
            account_type: document.getElementById('booking_account_type').value.toUpperCase(),
            account_link: document.getElementById('booking_account_link').value,
            departure: document.getElementById('booking_departure').value.toUpperCase(),
            destination: document.getElementById('booking_destination').value.toUpperCase(),
            departing_on: document.getElementById('booking_departing_on').value,
            enddate: document.getElementById('booking_end_date').value,
            endtime: `${hour}:${String(minute).padStart(2, '0')} ${ampm}`
        };

        const passengerForms = document.querySelectorAll('#booking-passenger-forms-container .passenger-form');
        const passengerData = [];
        passengerForms.forEach(form => {
            const name = form.querySelector('.booking-passenger-name').value.toUpperCase();
            const id_no = form.querySelector('.booking-passenger-id').value.toUpperCase();
            if (name) {
                passengerData.push({ name, id_no });
            }
        });

        if (passengerData.length === 0) {
            throw new Error('At least one passenger with a Name is required.');
        }
        if (!sharedData.departing_on || !sharedData.departure || !sharedData.destination) {
            throw new Error('Departure, Destination, and Travel Date are required.');
        }

        const values = passengerData.map(passenger => [
            passenger.name, // A
            passenger.id_no, // B
            sharedData.phone, // C
            sharedData.account_name, // D
            sharedData.account_type, // E
            sharedData.account_link, // F
            sharedData.departure, // G
            sharedData.destination, // H
            formatDateForSheet(sharedData.departing_on), // I
            sharedData.pnr, // J
            '', // K
            formatDateForSheet(sharedData.enddate), // L
            sharedData.endtime, // M
            '' // N (Remarks)
        ]);

        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.BOOKING_SHEET_NAME}!A:N`,
            valueInputOption: 'USER_ENTERED',
            resource: { values },
        });

        state.cache['bookingData'] = null;
        showToast(`Booking for ${passengerData.length} passenger(s) saved!`, 'success');
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

function sellTicketFromBooking(rowIndicesStr) {
    const rowIndices = rowIndicesStr.split(',').map(Number);
    const bookingGroup = state.filteredBookings.find(g => g.rowIndices.includes(rowIndices[0]));

    if (!bookingGroup) {
        showToast('Could not find booking details.', 'error');
        return;
    }

    state.bookingToUpdate = rowIndices;

    showView('sell');

    document.getElementById('booking_reference').value = bookingGroup.pnr || '';
    document.getElementById('phone').value = bookingGroup.phone || '';
    document.getElementById('account_name').value = bookingGroup.account_name || '';
    document.getElementById('account_type').value = bookingGroup.account_type || '';
    document.getElementById('account_link').value = bookingGroup.account_link || '';
    document.getElementById('departure').value = bookingGroup.departure || '';
    document.getElementById('destination').value = bookingGroup.destination || '';
    document.getElementById('departing_on').value = bookingGroup.departing_on || '';

    handleRouteValidation({ target: document.getElementById('departure') });
    handleRouteValidation({ target: document.getElementById('destination') });

    const container = document.getElementById('passenger-forms-container');
    container.innerHTML = '';

    const passengerCount = bookingGroup.passengers.length;

    bookingGroup.passengers.forEach(passenger => {
        addPassengerForm(passenger.name, passenger.id_no);
    });

    showToast(`Form pre-filled for ${bookingGroup.passengers[0].name}${passengerCount > 1 ? ` and ${passengerCount - 1} other(s)`: ''}. Complete financial details.`, 'info');
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
        resetPassengerForms();
        populateFlightLocations();
        updateToggleLabels();
    } else {
        state.bookingToUpdate = null;
    }
    if (viewName === 'booking') {
        hideNewBookingForm();
    }
    if (viewName === 'clients') {
        renderClientsView();
    }
    if (viewName === 'manage') {
        clearManageResults();
        displayHistory(1);
    }
}

function displayInitialTickets() {
    const sorted = [...state.allTickets].sort((a, b) => parseSheetDate(b.issued_date) - parseSheetDate(a.issued_date) || b.rowIndex - a.rowIndex);
    const initialTickets = sorted.slice(0, 50);
    state.filteredTickets = initialTickets;
    displayTickets(initialTickets, 1);
}

function displayTickets(tickets, page = 1) {
    const container = document.getElementById('resultsBodyContainer');
    container.innerHTML = '';

    if (tickets.length === 0) {
        renderEmptyState('resultsBodyContainer', 'fa-magnifying-glass', 'No Results Found', 'Your search did not match any tickets. Try adjusting your filters.');
        setupPagination([]);
        return;
    }

    const table = document.createElement('table');
    table.id = 'resultsTable';
    table.innerHTML = `
        <thead>
            <tr>
                <th>Issued Date</th><th>Name</th><th>Booking Ref</th><th>Route</th><th>Airline</th><th>Actions</th>
            </tr>
        </thead>
        <tbody id="resultsBody"></tbody>
    `;
    container.appendChild(table);
    const tbody = document.getElementById('resultsBody');

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

        row.innerHTML = `
            <td>${ticket.issued_date||''}</td>
            <td>${ticket.name||''}</td>
            <td>${ticket.booking_reference||''}</td>
            <td>${(ticket.departure||'').split(' ')[0]}→${(ticket.destination||'').split(' ')[0]}</td>
            <td>${ticket.airline||''}</td>
            <td class="actions-cell">
                <button class="icon-btn icon-btn-table" title="View Details" onclick="showDetails(${ticket.rowIndex})"><i class="fa-solid fa-eye"></i></button>
                <button class="icon-btn icon-btn-table" title="Manage Ticket" onclick="showView('manage'); findTicketForManage('${ticket.booking_reference}')"><i class="fa-solid fa-pen-to-square"></i></button>
            </td>
        `;
    });
    setupPagination(tickets);
}

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

    const content = `
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
        <div class="form-actions" style="margin-top: 1rem;">
            <button class="btn btn-secondary" onclick="closeModal()">Close</button>
        </div>
    `;
    openModal(content);
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
    
    updateNotifications();
}

function updateNotifications() {
    const notificationList = document.getElementById('notification-list');
    notificationList.innerHTML = '';
    let notifications = [];

    // Near deadline bookings
    const now = new Date();
    const deadlineThreshold = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

    const nearDeadlineBookings = state.allBookings.filter(b => {
        const deadline = parseDeadline(b.enddate, b.endtime);
        return deadline && (deadline.getTime() - now.getTime()) < deadlineThreshold && deadline.getTime() > now.getTime();
    });

    nearDeadlineBookings.forEach(b => {
        const deadline = parseDeadline(b.enddate, b.endtime);
        const timeLeft = Math.round((deadline.getTime() - now.getTime()) / (1000 * 60)); // Time left in minutes
        notifications.push({
            type: 'deadline',
            html: `<div class="notification-item deadline">
                <i class="fa-solid fa-clock"></i>
                <div>
                    <strong>Booking Deadline Approaching</strong>
                    <span>${b.name || 'N/A'} - PNR: ${b.pnr || 'N/A'}</span>
                    <span>~${Math.floor(timeLeft / 60)}h ${timeLeft % 60}m remaining</span>
                </div>
            </div>`
        });
    });

    // Unpaid tickets
    const unpaidTickets = state.allTickets.filter(t => !t.paid);
    unpaidTickets.forEach(t => {
        notifications.push({
            type: 'unpaid',
            html: `<div class="notification-item unpaid">
                <i class="fa-solid fa-file-invoice-dollar"></i>
                <div>
                    <strong>Unpaid Ticket</strong>
                    <span>${t.name || 'N/A'} - PNR: ${t.booking_reference || 'N/A'}</span>
                    <span>Issued: ${formatDateToDMMMY(t.issued_date)}</span>
                </div>
            </div>`
        });
    });

    // ... (rest of the function) ...

    if (notifications.length > 0) {
        notificationList.innerHTML = notifications.map(n => n.html).join('');
    } else {
        notificationList.innerHTML = '<div class="notification-item empty"><i class="fa-solid fa-check-circle"></i> No new notifications.</div>';
    }

    // ADD THIS CODE TO UPDATE THE HEADER
    const notificationCount = notifications.length;
    const header = document.querySelector('.notification-panel h3');
    if (header) {
        if (notificationCount > 0) {
            header.innerHTML = `<i class="fa-solid fa-bell"></i> Notifications <span class="notification-count">${notificationCount}</span>`;
        } else {
            header.innerHTML = `<i class="fa-solid fa-bell"></i> Notifications`;
        }
    }
}

// --- UTILITY FUNCTIONS ---
function makeClickable(text) { if (!text) return 'N/A'; if (text.toLowerCase().startsWith('http')) return `<a href="${text}" target="_blank" rel="noopener noreferrer">${text}</a>`; if (/^[\d\s\-+()]+$/.test(text)) return `<a href="tel:${text.replace(/[^\d+]/g, '')}">${text}</a>`; if (text.startsWith('@')) return `<a href="https://t.me/${text.substring(1)}" target="_blank" rel="noopener noreferrer">${text}</a>`; return text; }
function showToast(message, type = 'info') { document.getElementById('toastMessage').textContent = message; const toastEl = document.getElementById('toast'); toastEl.className = `show ${type}`; setTimeout(() => toastEl.className = toastEl.className.replace('show', ''), 4000); }
function formatDateForSheet(dateString) { if (!dateString) return ''; const date = new Date(dateString); return isNaN(date.getTime()) ? dateString : `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`; }

function formatDateToDMMMY(dateString) {
    if (!dateString) return '';
    const date = parseSheetDate(dateString);
    if (isNaN(date.getTime()) || date.getTime() === 0) {
        return dateString;
    }
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[date.getMonth()];
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
            const d = new Date(year, month, day);
            if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
                return d;
            }
        }
    }
    const fallbackDate = new Date(safeDateString);
    if (!isNaN(fallbackDate.getTime())) {
        return fallbackDate;
    }
    return new Date(0);
}

function parseDeadline(dateStr, timeStr) {
    if (!dateStr || !timeStr) return null;
    const date = parseSheetDate(dateStr);
    if (isNaN(date.getTime())) return null;

    const timeParts = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!timeParts) return null;

    let hours = parseInt(timeParts[1], 10);
    const minutes = parseInt(timeParts[2], 10);
    const ampm = timeParts[3].toUpperCase();

    if (ampm === 'PM' && hours < 12) {
        hours += 12;
    }
    if (ampm === 'AM' && hours === 12) {
        hours = 0;
    }

    date.setHours(hours, minutes, 0, 0);
    return date;
}

function calculateCommission(baseFareInput) {
    const passengerForm = baseFareInput.closest('.passenger-form');
    const commissionInput = passengerForm.querySelector('.passenger-commission');
    const baseFare = parseFloat(baseFareInput.value) || 0;
    commissionInput.value = Math.round((baseFare * state.commissionRates.rate) * state.commissionRates.cut);
}

function renderEmptyState(containerId, iconClass, title, message, buttonText = '', buttonAction = null) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let buttonHtml = '';
    if (buttonText && buttonAction) {
        buttonHtml = `<button class="btn btn-primary">${buttonText}</button>`;
    }
    container.innerHTML = `
        <div class="empty-state">
            <i class="fa-solid ${iconClass}"></i>
            <h4>${title}</h4>
            <p>${message}</p>
            ${buttonHtml}
        </div>
    `;
    if (buttonAction) {
        container.querySelector('button').addEventListener('click', buttonAction);
    }
}

// --- SEARCH & PAGINATION ---

function updateUnpaidCount() {
    const unpaidTickets = state.allTickets.filter(t => !t.paid);
    const count = unpaidTickets.length;
    const label = document.getElementById('unpaid-only-label');

    if (count > 0) {
        const countString = `(${count})`;
        label.innerHTML = `Unpaid Only <span style="color: var(--danger-accent); font-weight: 700; margin-left: 4px;">${countString}</span>`;
    } else {
        label.textContent = 'Unpaid Only';
    }
}

function setDateRangePreset(range) {
    const startDateInput = document.getElementById('searchStartDate');
    const endDateInput = document.getElementById('searchEndDate');
    const today = new Date();
    let startDate = new Date();

    if (range === '7') {
        startDate.setDate(today.getDate() - 7);
    } else if (range === '30') {
        startDate.setDate(today.getDate() - 30);
    } else if (range === 'month') {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
    }

    startDateInput.value = formatDateForSheet(startDate);
    endDateInput.value = formatDateForSheet(today);
    performSearch();
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

    let searchStartDate = startDateVal ? parseSheetDate(startDateVal) : null;
    let searchEndDate = endDateVal ? parseSheetDate(endDateVal) : null;

    if (searchStartDate) searchStartDate.setHours(0, 0, 0, 0);
    if (searchEndDate) searchEndDate.setHours(23, 59, 59, 999);

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
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    performSearch();
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

    const pnrExists = state.allTickets.some(t => t.booking_reference === sharedData.booking_reference);
    if (pnrExists) {
        const message = `PNR <strong>${sharedData.booking_reference}</strong> already exists. Are you sure you want to add more passengers under this PNR?`;
        showConfirmModal(message, () => confirmAndSaveTicket(form, sharedData, passengerData));
    } else {
        confirmAndSaveTicket(form, sharedData, passengerData);
    }
}

async function confirmAndSaveTicket(form, sharedData, passengerData) {
    state.isSubmitting = true;
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    closeModal();

    try {
        await saveTicket(sharedData, passengerData);

        if (state.bookingToUpdate) {
            await updateBookingStatus(state.bookingToUpdate, 'Get Ticket');
            state.bookingToUpdate = null;
        }

        showToast('Ticket(s) saved successfully!', 'success');
        form.reset();
        resetPassengerForms();
        populateFlightLocations();
        updateToggleLabels();
        state.cache['ticketData'] = null;
        await loadTicketData();
        updateDashboardData();
        buildClientList();
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
        if(passenger.name) {
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
        0
    ]);

    await gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: CONFIG.SHEET_ID,
        range: `${CONFIG.SHEET_NAME}!A:U`,
        valueInputOption: 'USER_ENTERED',
        resource: { values },
    });
}

function addPassengerForm(name = '', id_no = '') {
    const container = document.getElementById('passenger-forms-container');
    const passengerCount = container.children.length;

    const newForm = document.createElement('div');
    newForm.className = 'passenger-form';
    newForm.innerHTML = `
        <hr style="border-color: rgba(255,255,255,0.1); margin-bottom: 1rem;">
        <h4>Passenger ${passengerCount + 1}</h4>
        <div class="form-grid">
            <div class="form-group"><label>Client Name</label><input type="text" class="passenger-name" value="${name}" required></div>
            <div class="form-group"><label>ID Number</label><input type="text" class="passenger-id" value="${id_no}" required></div>
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
    container.innerHTML = '';
    addPassengerForm();
    updateRemovePassengerButton();
}


function updateRemovePassengerButton() {
    const container = document.getElementById('passenger-forms-container');
    const removeBtn = document.getElementById('removePassengerBtn');
    removeBtn.style.display = container.children.length > 1 ? 'inline-flex' : 'none';
}

// --- NEW BOOKING PASSENGER FORM LOGIC ---

function addBookingPassengerForm() {
    const container = document.getElementById('booking-passenger-forms-container');
    const passengerCount = container.children.length;

    const newForm = document.createElement('div');
    newForm.className = 'passenger-form';
    newForm.innerHTML = `
        ${passengerCount > 0 ? '<hr style="border-color: rgba(255,255,255,0.1); margin: 1rem 0;">' : ''}
        <h4>Passenger ${passengerCount + 1}</h4>
        <div class="booking-passenger-grid">
            <div class="form-group"><label>Client Name</label><input type="text" class="booking-passenger-name" required></div>
            <div class="form-group"><label>ID Number</label><input type="text" class="booking-passenger-id"></div>
        </div>
    `;
    container.appendChild(newForm);
    updateRemoveBookingPassengerButton();
}

function removeBookingPassengerForm() {
    const container = document.getElementById('booking-passenger-forms-container');
    if (container.children.length > 1) {
        container.removeChild(container.lastChild);
    }
    updateRemoveBookingPassengerButton();
}

function resetBookingPassengerForms() {
    const container = document.getElementById('booking-passenger-forms-container');
    container.innerHTML = '';
    addBookingPassengerForm();
    updateRemoveBookingPassengerButton();
}

function updateRemoveBookingPassengerButton() {
    const container = document.getElementById('booking-passenger-forms-container');
    const removeBtn = document.getElementById('removeBookingPassengerBtn');
    removeBtn.style.display = container.children.length > 1 ? 'inline-flex' : 'none';
}


// --- MANAGE TICKET (CONSOLIDATED) ---
function findTicketForManage(pnrFromClick = null) {
    const pnr = pnrFromClick || document.getElementById('managePnr').value.toUpperCase();
    if (!pnr) return showToast('Please enter a PNR code.', 'error');

    if (pnrFromClick) {
        document.getElementById('managePnr').value = pnr;
    }

    const found = state.allTickets.filter(t => t.booking_reference === pnr);
    displayManageResults(found);
}

function clearManageResults() {
    document.getElementById('managePnr').value = '';
    document.getElementById('manageResultsContainer').innerHTML = '';
}

function displayManageResults(tickets) {
    const container = document.getElementById('manageResultsContainer');
    if (tickets.length === 0) {
        renderEmptyState('manageResultsContainer', 'fa-ticket-slash', 'No Tickets Found', `No tickets were found for PNR: ${document.getElementById('managePnr').value}.`);
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
            actionButton = `<button class="btn btn-primary" onclick="openManageModal(${t.rowIndex})">Manage</button>`;
        }

        html += `<tr><td>${t.name}</td><td>${t.departure.split(' ')[0]}→${t.destination.split(' ')[0]}</td><td>${t.departing_on}</td><td>${actionButton}</td></tr>`;
    });
    container.innerHTML = html + '</tbody></table></div>';
}

function openManageModal(rowIndex) {
    const ticket = state.allTickets.find(t => t.rowIndex === rowIndex);
    if (!ticket) return showToast('Ticket not found.', 'error');

    let travelDateForInput = '';
    if (ticket.departing_on) {
        const d = parseSheetDate(ticket.departing_on);
        if (!isNaN(d.getTime()) && d.getTime() !== 0) {
            travelDateForInput = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
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

    const content = `
        <h2>Manage Ticket: ${ticket.name}</h2>
        <form id="updateForm" data-pnr="${ticket.booking_reference}" data-master-row-index="${rowIndex}">
            <h4>Modify Details</h4>
            <div class="form-grid" style="margin-top: 1rem;">
                <div class="form-group"><label>New Travel Date (for all in PNR)</label><input type="text" id="update_departing_on" placeholder="MM/DD/YYYY" value="${travelDateForInput}" ${isPast ? 'disabled' : ''}></div>
                <div class="form-group"><label>New Base Fare (Optional)</label><input type="number" id="update_base_fare" placeholder="${(ticket.base_fare||0).toLocaleString()}"></div>
                <div class="form-group"><label>New Net Amount (Optional)</label><input type="number" id="update_net_amount" placeholder="${(ticket.net_amount||0).toLocaleString()}"></div>
                <div class="form-group"><label>Date Change Fees (Optional)</label><input type="number" id="date_change_fees"></div>
                <div class="form-group"><label>Extra Fare (Optional)</label><input type="number" id="update_extra_fare" placeholder="Adds to existing extra fare"></div>
            </div>
            ${paymentUpdateHtml}
            <div class="form-actions" style="margin-top: 2rem; justify-content: space-between;">
                <div>
                    <button type="button" class="btn btn-secondary" style="background-color: rgba(248, 81, 73, 0.2); color: #F85149;" onclick="openCancelSubModal(${rowIndex})">Cancel/Refund...</button>
                </div>
                <div>
                    <button type="button" class="btn btn-secondary" onclick="closeModal()">Back</button>
                    <button type="submit" class="btn btn-primary">Update Ticket(s)</button>
                </div>
            </div>
        </form>`;

    openModal(content, 'large');
    new Datepicker(document.getElementById('update_departing_on'), { format: 'mm/dd/yyyy', autohide: true, todayHighlight: true });
    if (!ticket.paid) {
        new Datepicker(document.getElementById('update_paid_date'), { format: 'mm/dd/yyyy', autohide: true, todayHighlight: true });
    }
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

    if (historyDetails.length === 0) {
        showToast('No changes were made.', 'info');
        return;
    }

    const dataForBatchUpdate = ticketsToUpdate.map(ticket => {
        let finalBaseFare = isNaN(newBaseFare) ? ticket.base_fare : newBaseFare;
        let finalNetAmount = isNaN(newNetAmount) ? ticket.net_amount : newNetAmount;
        let finalCommission = isNaN(newBaseFare) ? ticket.commission : calculateCommissionValue(newBaseFare);
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
        await saveHistory(originalTicket, `MODIFIED: ${historyDetails.join('; ')}`);
        state.cache['ticketData'] = null;
        state.cache['historyData'] = null;
        showToast('Tickets updated successfully!', 'success');
        closeModal();
        clearManageResults();
        await Promise.all([loadTicketData(), loadHistory()]);
        updateDashboardData();
    } catch (error) {
        showToast(`Update Error: ${error.result?.error?.message || 'Could not update.'}`, 'error');
    }
}


function openCancelSubModal(rowIndex) {
    const ticket = state.allTickets.find(t => t.rowIndex === rowIndex);
    if (!ticket) return;

    const content = `
        <h2>Cancel or Refund Ticket</h2>
        <p>For <strong>${ticket.name}</strong> (PNR: ${ticket.booking_reference})</p>
        <p>Current Net Amount: <strong>${(ticket.net_amount || 0).toLocaleString()} MMK</strong></p>
        <div class="form-actions" style="flex-direction: column; gap: 1rem; margin-top: 1.5rem;">
             <button type="button" class="btn btn-primary" style="background-color: var(--danger-accent); border-color: var(--danger-accent);" onclick="handleCancelTicket(${rowIndex}, 'refund')">Process Full Refund</button>
             <form id="cancelForm" style="width: 100%;">
                <div class="form-group">
                    <label for="refund_amount">Partial Refund Amount (MMK)</label>
                    <input type="number" id="refund_amount" required class="form-group input" style="text-align: center;">
                </div>
                <button type="submit" class="btn btn-secondary" style="width: 100%;">Process Partial Cancellation</button>
            </form>
        </div>
        <div class="form-actions" style="margin-top: 2rem;">
            <button class="btn btn-secondary" onclick="openManageModal(${rowIndex})">Back to Modify</button>
        </div>
    `;
    openModal(content);
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

async function handleCancelTicket(rowIndex, type, refundAmount = 0) {
    const ticket = state.allTickets.find(t => t.rowIndex === rowIndex);
    if (!ticket) return;

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
        historyDetails = "CANCELED: Full Refund processed.";
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
        historyDetails = `CANCELED: Partial. Refunded: ${refundAmount.toLocaleString()} MMK.`;
    }

    try {
        showToast('Processing cancellation...', 'info');
        await gapi.client.sheets.spreadsheets.values.update({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.SHEET_NAME}!A${rowIndex}:U${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [updatedValues] }
        });
        await saveHistory(ticket, historyDetails);
        state.cache['ticketData'] = null;
        state.cache['historyData'] = null;
        showToast('Ticket updated successfully!', 'success');
        closeModal();
        clearManageResults();
        await Promise.all([loadTicketData(), loadHistory()]);
        updateDashboardData();
    } catch (error) {
        showToast(`Cancellation Error: ${error.result?.error?.message || 'Could not update.'}`, 'error');
    }
}


// --- HISTORY FUNCTIONS ---
async function loadHistory() {
    try {
        const response = await fetchFromSheet(`${CONFIG.HISTORY_SHEET}!A:D`, 'historyData');
        state.history = parseHistoryData(response.values);
        displayHistory(1);
    } catch (error) {
        showToast('Could not load history. Ensure the sheet exists.', 'error');
        console.error("History Error:", error);
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

async function saveHistory(ticket, details) {
    if (!details) return;
    const now = new Date();
    const date = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
    const values = [[date, ticket.name, ticket.booking_reference, details]];
    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.HISTORY_SHEET}!A:D`,
            valueInputOption: 'USER_ENTERED',
            resource: { values }
        });
    } catch (error) {
        showToast(`Failed to save history: ${error.result?.error?.message}`, 'error');
    }
}

function displayHistory(page) {
    state.historyPage = page;
    const container = document.getElementById('modificationHistoryContainer');
    const tbody = document.getElementById('modificationHistoryBody');
    const sortedHistory = state.history;

    if (sortedHistory.length > 0) {
        container.style.display = 'block';
    } else {
        container.style.display = 'none';
    }

    const paginated = sortedHistory.slice((page - 1) * state.rowsPerPage, page * state.rowsPerPage);
    tbody.innerHTML = '';
    paginated.forEach(entry => {
        const row = tbody.insertRow();
        row.innerHTML = `<td>${formatDateToDMMMY(entry.date)}</td><td>${entry.name}</td><td>${entry.booking_ref}</td><td>${entry.details}</td>`;
    });
    setupHistoryPagination(sortedHistory, page);
}

function setupHistoryPagination(items, currentPage) {
    const container = document.getElementById('modificationHistoryPagination');
    container.innerHTML = '';
    const pageCount = Math.ceil(items.length / state.rowsPerPage);
    if (pageCount <= 1) return;

    const createBtn = (txt, pg, enabled = true) => {
        const btn = document.createElement('button');
        btn.className = 'pagination-btn';
        btn.innerHTML = txt;
        btn.disabled = !enabled;
        if (enabled) {
            btn.onclick = () => displayHistory(pg);
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

    const firstOption = searchAirlineSelect.options[0];
    searchAirlineSelect.innerHTML = '';
    searchAirlineSelect.appendChild(firstOption);

    Array.from(allAvailableAirlines).sort().forEach(airline => {
        const option = document.createElement('option');
        option.value = airline;
        option.textContent = airline;
        searchAirlineSelect.appendChild(option);
    });
}


// --- UI SETTINGS & DYNAMIC COMMISSION ---
function initializeUISettings() {
    const settingsBtn = document.getElementById('settings-btn');
    const resetBtn = document.getElementById('reset-settings-btn');
    const opacitySlider = document.getElementById('opacity-slider');
    const blurSlider = document.getElementById('blur-slider');
    const overlaySlider = document.getElementById('overlay-slider');
    const glassSlider = document.getElementById('glass-slider');
    const commissionRateSlider = document.getElementById('commission-rate-slider');
    const agentCutSlider = document.getElementById('agent-cut-slider');

    const root = document.documentElement;

    const defaults = {
        opacity: 0.05,
        blur: 20,
        overlay: 0.5,
        glass: 0.15,
        commissionRate: 5,
        agentCut: 60
    };

    let settings = JSON.parse(localStorage.getItem('uiSettings')) || { ...defaults };
    state.commissionRates.rate = settings.commissionRate / 100;
    state.commissionRates.cut = settings.agentCut / 100;

    function applySettings() {
        root.style.setProperty('--glass-bg', `rgba(255, 255, 255, ${settings.opacity})`);
        root.style.setProperty('--blur-amount', `${settings.blur}px`);
        root.style.setProperty('--overlay-opacity', settings.overlay);
        root.style.setProperty('--liquid-border', `1px solid rgba(255, 255, 255, ${settings.glass})`);

        state.commissionRates.rate = settings.commissionRate / 100;
        state.commissionRates.cut = settings.agentCut / 100;
    }

    function updateSlidersAndValues() {
        opacitySlider.value = settings.opacity;
        blurSlider.value = settings.blur;
        overlaySlider.value = settings.overlay;
        glassSlider.value = settings.glass;
        commissionRateSlider.value = settings.commissionRate;
        agentCutSlider.value = settings.agentCut;

        document.getElementById('opacity-value').textContent = Number(settings.opacity).toFixed(2);
        document.getElementById('blur-value').textContent = settings.blur;
        document.getElementById('overlay-value').textContent = Number(settings.overlay).toFixed(2);
        document.getElementById('glass-value').textContent = Number(settings.glass).toFixed(2);
        document.getElementById('commission-rate-value').textContent = `${settings.commissionRate}%`;
        document.getElementById('agent-cut-value').textContent = `${settings.agentCut}%`;
    }

    function saveSettings() {
        localStorage.setItem('uiSettings', JSON.stringify(settings));
    }

    settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        settingsPanel.classList.toggle('show');
    });

    opacitySlider.addEventListener('input', (e) => { settings.opacity = e.target.value; updateSlidersAndValues(); applySettings(); saveSettings(); });
    blurSlider.addEventListener('input', (e) => { settings.blur = e.target.value; updateSlidersAndValues(); applySettings(); saveSettings(); });
    overlaySlider.addEventListener('input', (e) => { settings.overlay = e.target.value; updateSlidersAndValues(); applySettings(); saveSettings(); });
    glassSlider.addEventListener('input', (e) => { settings.glass = e.target.value; updateSlidersAndValues(); applySettings(); saveSettings(); });
    commissionRateSlider.addEventListener('input', (e) => { settings.commissionRate = e.target.value; updateSlidersAndValues(); applySettings(); saveSettings(); });
    agentCutSlider.addEventListener('input', (e) => { settings.agentCut = e.target.value; updateSlidersAndValues(); applySettings(); saveSettings(); });

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

function calculateCommissionValue(baseFare) {
    return Math.round((baseFare * state.commissionRates.rate) * state.commissionRates.cut);
}


// --- PDF EXPORT FUNCTION ---
function exportToPdf() {
    const exportType = document.querySelector('input[name="exportType"]:checked').value;
    let ticketsToExport;

    if (exportType === 'range') {
        const startDate = parseSheetDate(document.getElementById('exportStartDate').value);
        const endDate = parseSheetDate(document.getElementById('exportEndDate').value);
        if (!startDate || !endDate) {
            showToast('Please select a valid date range.', 'error');
            return;
        }
        ticketsToExport = state.allTickets.filter(t => {
            const issuedDate = parseSheetDate(t.issued_date);
            return issuedDate >= startDate && issuedDate <= endDate;
        });
    } else {
        ticketsToExport = state.filteredTickets;
    }

    if (ticketsToExport.length === 0) {
        showToast('No data to export for the selected criteria.', 'info');
        return;
    }

    exportConfirmModal.classList.remove('show');
    generatePdf(ticketsToExport);
}

function generatePdf(tickets) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    if (typeof doc.autoTable !== 'function') {
        showToast('PDF library not loaded yet. Please try again.', 'error');
        console.error('jsPDF autoTable plugin is not loaded.');
        return;
    }

    const sortedTickets = [...tickets].sort((a, b) =>
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

    const now = new Date();
    const currentMonth = now.toLocaleString('default', { month: 'long' });
    const title = `Ocean Air Ticket (${currentMonth} Report)`;
    const exportedDate = `Exported on: ${now.toLocaleDateString('en-US')}`;

    doc.autoTable({
        head: [tableColumns],
        body: tableRows,
        startY: 25,
        theme: 'grid',
        headStyles: {
            fillColor: [33, 38, 45],
            textColor: [230, 237, 243]
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
            if (data.pageNumber === 1) {
                doc.setFontSize(18);
                doc.setTextColor(40);
                doc.text(title, data.settings.margin.left, 15);

                doc.setFontSize(11);
                doc.setTextColor(100);
                doc.text(exportedDate, data.settings.margin.left, 20);
            }
            doc.setFontSize(10);
            doc.text("Page " + String(data.pageNumber), data.settings.margin.left, doc.internal.pageSize.height - 10);
        }
    });

    const grandTotal = totalNetAmount + totalDateChange;
    
    if (doc.lastAutoTable.finalY + 25 > doc.internal.pageSize.height) {
        doc.addPage();
    }

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 3,
        body: [
            [
                { content: 'Total', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
                { content: totalNetAmount.toLocaleString(), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: totalDateChange.toLocaleString(), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: totalCommission.toLocaleString(), styles: { halign: 'right', fontStyle: 'bold' } }
            ],
            [
                { content: 'Grand Total (Net Amount + Date Change)', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
                { content: grandTotal.toLocaleString(), styles: { halign: 'right', fontStyle: 'bold' } },
                { content: '', colSpan: 2 }
            ]
        ],
        theme: 'grid',
        styles: {
            font: 'helvetica',
            fontSize: 8,
            cellPadding: 2,
            valign: 'middle',
            fillColor: [220, 220, 220],
            textColor: [0, 0, 0],
        },
        columnStyles: {
            0: { cellWidth: 22 }, 1: { cellWidth: 40 }, 2: { cellWidth: 25 },
            3: { cellWidth: 75 }, 4: { cellWidth: 28 }, 5: { halign: 'right', cellWidth: 23 },
            6: { cellWidth: 23, halign: 'right' }, 7: { cellWidth: 23, halign: 'right' }
        },
    });


    doc.save(`Ocean_Air_Report_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.pdf`);
    showToast('Report exported successfully!', 'success');
}


// --- MODAL & CONFIRMATION ---
function openModal(content, size = 'default') {
    modalBody.innerHTML = content;
    modal.querySelector('.modal-content').className = `modal-content glass-card ${size === 'large' ? 'large-modal' : size === 'small' ? 'small-modal' : ''}`;
    modal.classList.add('show');
}

function closeModal() {
    modal.classList.remove('show');
    modalBody.innerHTML = '';
}

function showConfirmModal(message, onConfirm) {
    const content = `
        <p style="margin-bottom: 1.5rem; line-height: 1.5;">${message}</p>
        <div class="form-actions">
            <button id="confirmCancelBtn" type="button" class="btn btn-secondary">Back</button>
            <button id="confirmActionBtn" type="button" class="btn btn-primary">Confirm</button>
        </div>
    `;
    openModal(content, 'small-modal');

    document.getElementById('confirmActionBtn').onclick = onConfirm;
    document.getElementById('confirmCancelBtn').onclick = async () => {
        closeModal();
        await loadBookingData();
    };
}

// --- CLIENT MANAGEMENT ---
function buildClientList() {
    const clientsMap = new Map();

    state.allTickets.forEach(ticket => {
        const key = `${(ticket.name || '').trim().toUpperCase()}|${(ticket.id_no || '').trim().toUpperCase()}`;
        if (!ticket.name || !ticket.id_no) return;

        if (!clientsMap.has(key)) {
            clientsMap.set(key, {
                compositeKey: key,
                name: ticket.name,
                id_no: ticket.id_no,
                phone: ticket.phone,
                account_name: ticket.account_name,
                account_type: ticket.account_type,
                account_link: ticket.account_link,
                ticketCount: 0,
                totalSpent: 0,
                lastContact: new Date(0)
            });
        }

        const client = clientsMap.get(key);
        client.ticketCount++;
        client.totalSpent += (ticket.net_amount || 0) + (ticket.date_change || 0) + (ticket.extra_fare || 0);
        
        const ticketDate = parseSheetDate(ticket.issued_date);
        if (ticketDate > client.lastContact) {
            client.lastContact = ticketDate;
            client.phone = ticket.phone;
            client.account_name = ticket.account_name;
            client.account_type = ticket.account_type;
            client.account_link = ticket.account_link;
        }
    });
    state.allClients = Array.from(clientsMap.values()).sort((a,b) => b.lastContact - a.lastContact);
}

function renderClientsView() {
    const view = document.getElementById('clients-view');
    view.innerHTML = `
        <div class="clients-container glass-card">
            <div class="clients-header">
                <h2><i class="fa-solid fa-users"></i> Client Directory</h2>
                <div class="client-controls">
                    <div class="toggle-switch">
                        <label for="featuredClientsToggle">Show Featured Only</label>
                        <label class="switch">
                            <input type="checkbox" id="featuredClientsToggle">
                            <span class="slider round"></span>
                        </label>
                    </div>
                    <div class="client-search-box">
                        <input type="text" id="clientSearchInput" placeholder="Search by name, ID, or phone...">
                    </div>
                </div>
            </div>
            <div id="clientListContainer" class="table-container"></div>
            <div id="clientPagination" class="pagination-container"></div>
        </div>
    `;

    document.getElementById('clientSearchInput').addEventListener('input', () => renderClientListPage(1));
    document.getElementById('featuredClientsToggle').addEventListener('change', () => renderClientListPage(1));

    renderClientListPage(1);
}


function renderClientListPage(page) {
    state.clientPage = page;
    const container = document.getElementById('clientListContainer');
    const searchInput = document.getElementById('clientSearchInput');
    const featuredOnlyToggle = document.getElementById('featuredClientsToggle');

    const query = (searchInput?.value || '').toLowerCase();
    const featuredOnly = featuredOnlyToggle?.checked;

    let clientsToDisplay = state.allClients;

    if (featuredOnly) {
        clientsToDisplay = clientsToDisplay.filter(c => state.featuredClients.includes(c.compositeKey));
    }

    if (query) {
        clientsToDisplay = clientsToDisplay.filter(c =>
            c.name.toLowerCase().includes(query) ||
            (c.id_no && c.id_no.toLowerCase().includes(query)) ||
            (c.phone && c.phone.includes(query))
        );
    }
    
    if (clientsToDisplay.length === 0) {
        if (featuredOnly) {
            renderEmptyState('clientListContainer', 'fa-star', 'No Featured Clients', 'You haven\'t starred any clients yet. Click the star icon next to a client\'s name to feature them.');
        } else {
             renderEmptyState('clientListContainer', 'fa-user-slash', 'No Clients Found', 'Your search did not match any clients.');
        }
        setupClientPagination([]);
        return;
    }

    const table = `
        <table id="clientListTable">
            <thead>
                <tr>
                    <th>Client Name</th>
                    <th>ID Number</th>
                    <th>Account Name</th>
                    <th>Account Type</th>
                    <th>Phone Number</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="clientListBody"></tbody>
        </table>
    `;
    container.innerHTML = table;
    const tbody = document.getElementById('clientListBody');

    const paginated = clientsToDisplay.slice((page - 1) * state.rowsPerPage, page * state.rowsPerPage);

    paginated.forEach(client => {
        const isFeatured = state.featuredClients.includes(client.compositeKey);
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>
                <i class="fa-regular fa-star star-icon ${isFeatured ? 'featured' : ''}" onclick="toggleFeaturedClient('${client.compositeKey}', event)"></i>
                ${client.name}
            </td>
            <td>${client.id_no || 'N/A'}</td>
            <td>${client.account_name || 'N/A'}</td>
            <td>${client.account_type || 'N/A'}</td>
            <td>${client.phone || 'N/A'}</td>
            <td class="client-actions">
                <button class="icon-btn icon-btn-table" title="View History" onclick='renderClientHistory("${client.compositeKey}")'><i class="fa-solid fa-clock-rotate-left"></i></button>
                <button class="icon-btn icon-btn-table" title="Sell New Ticket" onclick='sellToClient("${client.compositeKey}")'><i class="fa-solid fa-ticket"></i></button>
            </td>
        `;
    });
    setupClientPagination(clientsToDisplay);
}

function setupClientPagination(items) {
    const container = document.getElementById('clientPagination');
    container.innerHTML = '';
    const pageCount = Math.ceil(items.length / state.rowsPerPage);
    if (pageCount <= 1) return;

    const createBtn = (txt, pg, enabled = true) => {
        const btn = document.createElement('button');
        btn.className = 'pagination-btn';
        btn.innerHTML = txt;
        btn.disabled = !enabled;
        if (enabled) {
            btn.onclick = () => renderClientListPage(pg);
        }
        if (pg === state.clientPage) {
            btn.classList.add('active');
        }
        return btn;
    };
    container.append(createBtn('&laquo;', state.clientPage - 1, state.clientPage > 1));
    for (let i = 1; i <= pageCount; i++) {
        container.append(createBtn(i, i));
    }
    container.append(createBtn('&raquo;', state.clientPage + 1, state.clientPage < pageCount));
}

function renderClientHistory(clientKey) {
    const client = state.allClients.find(c => c.compositeKey === clientKey);
    if (!client) {
        showToast('Could not find client details.', 'error');
        return;
    }
    
    const clientTickets = state.allTickets.filter(t => 
        (t.name || '').trim().toUpperCase() === client.name.trim().toUpperCase() &&
        (t.id_no || '').trim().toUpperCase() === client.id_no.trim().toUpperCase()
    ).sort((a,b) => parseSheetDate(b.issued_date) - parseSheetDate(a.issued_date));

    const view = document.getElementById('clients-view');

    const totalCommission = clientTickets.reduce((sum, t) => sum + (t.commission || 0), 0);
    const totalSpent = client.totalSpent;
    const ticketCount = client.ticketCount;

    let ticketsHtml = '';
    if (clientTickets.length > 0) {
        ticketsHtml = `
            <div class="table-container">
                <table>
                    <thead><tr><th>Issued</th><th>PNR</th><th>Route</th><th>Net Amount</th><th>Status</th><th></th></tr></thead>
                    <tbody>
                        ${clientTickets.map(t => `
                            <tr class="${(t.remarks || '').toLowerCase().includes('cancel') ? 'canceled-row' : ''}">
                                <td>${t.issued_date}</td>
                                <td>${t.booking_reference}</td>
                                <td>${t.departure.split(' ')[0]}→${t.destination.split(' ')[0]}</td>
                                <td>${(t.net_amount || 0).toLocaleString()}</td>
                                <td>${(t.remarks || '').toLowerCase().includes('cancel') ? 'Canceled' : 'Confirmed'}</td>
                                <td><button class="icon-btn icon-btn-table" onclick="showDetails(${t.rowIndex})"><i class="fa-solid fa-eye"></i></button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } else {
        ticketsHtml = `<p>No tickets found for this client.</p>`;
    }

    view.innerHTML = `
        <div class="glass-card">
            <div class="client-history-header">
                <div class="client-history-info">
                    <h2>${client.name}</h2>
                    <p>ID: ${client.id_no}</p>
                </div>
                <div class="client-history-actions">
                    <button class="btn btn-secondary" onclick="renderClientsView()"><i class="fa-solid fa-arrow-left"></i> Back to List</button>
                    <button class="btn btn-primary" onclick='sellToClient("${client.compositeKey}")'><i class="fa-solid fa-plus"></i> Sell New Ticket</button>
                </div>
            </div>
            <div class="client-history-stats">
                <div class="stat-card"><div class="label">Total Tickets</div><div class="value">${ticketCount}</div></div>
                <div class="stat-card"><div class="label">Total Spent</div><div class="value">${totalSpent.toLocaleString()} MMK</div></div>
                <div class="stat-card"><div class="label">Total Commission</div><div class="value">${totalCommission.toLocaleString()} MMK</div></div>
            </div>
            <h3>Ticket History</h3>
            ${ticketsHtml}
        </div>
    `;
}

function sellToClient(clientKey) {
    const client = state.allClients.find(c => c.compositeKey === clientKey);
    if (!client) return;

    showView('sell');
    document.getElementById('phone').value = client.phone || '';
    document.getElementById('account_name').value = client.account_name || '';
    document.getElementById('account_type').value = client.account_type || '';
    document.getElementById('account_link').value = client.account_link || '';

    const firstPassengerNameInput = document.querySelector('#passenger-forms-container .passenger-name');
    const firstPassengerIdInput = document.querySelector('#passenger-forms-container .passenger-id');
    if (firstPassengerNameInput) {
        firstPassengerNameInput.value = client.name;
    }
    if(firstPassengerIdInput){
        firstPassengerIdInput.value = client.id_no;
    }
}

function handleAutosuggest(inputElement, field) {
    const value = inputElement.value.toLowerCase();
    const autosuggestBox = document.getElementById(`${field}_autosuggest`);
    if (value.length < 2) {
        autosuggestBox.style.display = 'none';
        return;
    }

    const suggestions = state.allClients.filter(client =>
        client[field] && client[field].toLowerCase().includes(value)
    );

    if (suggestions.length > 0) {
        autosuggestBox.innerHTML = suggestions.slice(0, 5).map(client =>
            `<div class="autosuggest-item" data-client-key="${client.compositeKey}">
                <strong>${client.name}</strong> (${client[field]})
            </div>`
        ).join('');
        autosuggestBox.style.display = 'block';

        document.querySelectorAll('.autosuggest-item').forEach(item => {
            item.addEventListener('click', () => {
                const clientKey = item.dataset.clientKey;
                const client = state.allClients.find(c => c.compositeKey === clientKey);
                if (client) {
                    document.getElementById('phone').value = client.phone || '';
                    document.getElementById('account_name').value = client.account_name || '';
                    document.getElementById('account_type').value = client.account_type || '';
                    document.getElementById('account_link').value = client.account_link || '';
                    document.querySelector('.passenger-name').value = client.name;
                    document.querySelector('.passenger-id').value = client.id_no;
                }
                autosuggestBox.style.display = 'none';
            });
        });
    } else {
        autosuggestBox.style.display = 'none';
    }
}

// --- FEATURED CLIENTS ---
function loadFeaturedClients() {
    const featured = localStorage.getItem('featuredClients');
    if (featured) {
        state.featuredClients = JSON.parse(featured);
    }
}

function saveFeaturedClients() {
    localStorage.setItem('featuredClients', JSON.stringify(state.featuredClients));
}

function toggleFeaturedClient(clientKey, event) {
    event.stopPropagation(); // Prevent row click events if any
    const index = state.featuredClients.indexOf(clientKey);
    if (index > -1) {
        state.featuredClients.splice(index, 1);
    } else {
        state.featuredClients.push(clientKey);
    }
    saveFeaturedClients();
    
    // Visually update the star instantly without a full re-render
    const starIcon = event.target;
    starIcon.classList.toggle('featured');
}
