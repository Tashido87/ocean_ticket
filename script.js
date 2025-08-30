// Configuration
const CONFIG = {
    SHEET_ID: '1SGc80isz0VRVt447R_q-fBdZ_me52H_Z32W5HauHMWQ',
    API_KEY: 'AIzaSyC9JSD6VWXMQ7Pe8VPf-gIlNUtcwQhkG1o', // It is strongly recommended to move this to a secure backend.
    CLIENT_ID: '254093944424-mfvk48avc9n86de6jit9oai7kqrsr2f7.apps.googleusercontent.com', // IMPORTANT: REPLACE WITH YOUR CLIENT ID
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets',
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    SHEET_NAME: '2025',
    BOOKING_SHEET_NAME: 'booking',
    HISTORY_SHEET: 'history', // Consolidated history sheet
    SETTLE_SHEET_NAME: 'settle'
};

// --- GLOBAL STATE & CACHE ---
const state = {
    allTickets: [],
    filteredTickets: [],
    allBookings: [],
    filteredBookings: [],
    allClients: [],
    allSettlements: [],
    featuredClients: [], // For starred clients
    history: [],
    charts: {},
    isSubmitting: false,
    rowsPerPage: 10,
    currentPage: 1,
    bookingCurrentPage: 1,
    historyPage: 1,
    clientPage: 1,
    settlementPage: 1,
    searchTimeout: null,
    cache: {}, // In-memory cache
    bookingToUpdate: null,
    commissionRates: { // Default commission rates
        cut: 0.60   // 60%
    },
    timeUpdateInterval: null // To hold the timer
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
    initializeBackgroundChanger(); // Sets up listeners only
    initializeUISettings(); // Handles initial theme and background application
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
     const settlementOptions = {
        format: 'dd-M-yyyy',
        autohide: true,
        todayHighlight: true
    };
    const allDatePickers = ['searchStartDate', 'searchEndDate', 'searchTravelDate', 'booking_departing_on', 'exportStartDate', 'exportEndDate', 'issued_date', 'departing_on', 'paid_date', 'booking_end_date'];
    allDatePickers.forEach(id => {
        const el = document.getElementById(id);
        if (el) new Datepicker(el, defaultOptions);
    });

    const settlementDatePicker = document.getElementById('settlement_date');
    if(settlementDatePicker) new Datepicker(settlementDatePicker, settlementOptions);
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
            loadHistory(),
            loadSettlementData()
        ]);
        initializeDashboardSelectors();
        buildClientList();
        renderClientsView();
        
        // Start the dynamic timer
        if (state.timeUpdateInterval) clearInterval(state.timeUpdateInterval);
        state.timeUpdateInterval = setInterval(updateDynamicTimes, 60000); // Update every minute
        updateDynamicTimes(); // Run once immediately

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
    
    document.getElementById('newSettlementBtn').addEventListener('click', showNewSettlementForm);
    document.getElementById('cancelNewSettlementBtn').addEventListener('click', hideNewSettlementForm);
    document.getElementById('newSettlementForm').addEventListener('submit', handleNewSettlementSubmit);

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
            await handleExpiredBookings(); // Automatically update expired bookings
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
            let propertyName = h;
            if (propertyName === 'remarks') {
                propertyName = 'remark';
            }
            booking[propertyName] = typeof value === 'string' ? value.trim() : value;
        });
        booking.rowIndex = i + 2;
        const groupIdBase = booking.pnr || `${booking.phone}-${booking.account_link}`;
        booking.groupId = `${groupIdBase}-${booking.departing_on}-${booking.departure}-${booking.destination}`;
        return booking;
    });
}

async function handleExpiredBookings() {
    const now = new Date();
    const expiredBookingsToUpdate = [];

    state.allBookings.forEach(booking => {
        const deadline = parseDeadline(booking.enddate, booking.endtime);
        const hasNoAction = !booking.remark || String(booking.remark).trim() === '';
        
        if (hasNoAction && deadline && deadline < now) {
            // This booking is expired and needs to be marked as 'end'
             const values = [
                booking.name || '',
                booking.id_no || '',
                booking.phone || '',
                booking.account_name || '',
                booking.account_type || '',
                booking.account_link || '',
                booking.departure || '',
                booking.destination || '',
                booking.departing_on || '',
                booking.pnr || '',
                'end', // Set remark to 'end'
                booking.enddate || '',
                booking.endtime || '',
                ''
            ];
            expiredBookingsToUpdate.push({
                range: `${CONFIG.BOOKING_SHEET_NAME}!A${booking.rowIndex}:N${booking.rowIndex}`,
                values: [values]
            });
        }
    });

    if (expiredBookingsToUpdate.length > 0) {
        console.log(`Found ${expiredBookingsToUpdate.length} expired bookings to update.`);
        try {
            await gapi.client.sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: CONFIG.SHEET_ID,
                resource: {
                    valueInputOption: 'USER_ENTERED',
                    data: expiredBookingsToUpdate
                }
            });
            console.log('Successfully updated expired bookings.');
            state.cache['bookingData'] = null; // Invalidate cache to force a reload next time
            // Re-filter the local state to hide the ones we just updated
            const updatedRowIndices = expiredBookingsToUpdate.map(upd => parseInt(upd.range.match(/\d+$/)[0], 10));
            state.allBookings = state.allBookings.filter(b => !updatedRowIndices.includes(b.rowIndex));

        } catch (error) {
            console.error('Failed to update expired bookings:', error);
            showToast('Could not update expired bookings automatically.', 'error');
        }
    }
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
            const hasNoAction = !b.remark || String(b.remark).trim() === '';
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
    showConfirmModal(message, async () => {
        closeModal();
        await updateBookingStatus(rowIndices, 'complete');
    });
}

function handleCancelBooking(rowIndicesStr) {
    const rowIndices = rowIndicesStr.split(',').map(Number);
    const bookingGroup = state.filteredBookings.find(g => g.rowIndices.includes(rowIndices[0]));
    const clientName = bookingGroup ? bookingGroup.passengers[0].name : 'this booking';
    const passengerCount = bookingGroup ? bookingGroup.passengers.length : 1;
    const message = `Are you sure you want to <strong>CANCEL</strong> the booking for <strong>${clientName} ${passengerCount > 1 ? `and ${passengerCount - 1} other(s)` : ''}</strong>? This will remove it from the list.`;
    showConfirmModal(message, async () => {
        closeModal();
        await updateBookingStatus(rowIndices, 'cancel');
    });
}

async function updateBookingStatus(rowIndices, remarks) {
    if (state.isSubmitting) return;
    state.isSubmitting = true;
    showToast('Updating booking status...', 'info');

    // Find the original bookings to get their full data
    const bookingsToUpdate = [];
    rowIndices.forEach(rowIndex => {
        const booking = state.allBookings.find(b => b.rowIndex === rowIndex);
        if (booking) {
            bookingsToUpdate.push(booking);
        }
    });

    // Optimistic UI update
    const originalAllBookings = [...state.allBookings];
    state.allBookings = state.allBookings.filter(b => !rowIndices.includes(b.rowIndex));
    displayBookings();
    updateNotifications(); // BUG FIX: Refresh notifications after updating status

    try {
        const data = bookingsToUpdate.map(booking => {
            // Create the full row data for update. Column K is index 10.
            const values = [
                booking.name || '',         // A
                booking.id_no || '',        // B
                booking.phone || '',        // C
                booking.account_name || '', // D
                booking.account_type || '', // E
                booking.account_link || '', // F
                booking.departure || '',    // G
                booking.destination || '',  // H
                booking.departing_on || '', // I
                booking.pnr || '',          // J
                remarks,                    // K - The new remark: 'complete' or 'cancel'
                booking.enddate || '',      // L
                booking.endtime || '',      // M
                ''                          // N
            ];
            return {
                range: `${CONFIG.BOOKING_SHEET_NAME}!A${booking.rowIndex}:N${booking.rowIndex}`,
                values: [values]
            };
        });

        if (data.length === 0) {
            throw new Error("Could not find booking records to update.");
        }

        await gapi.client.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: CONFIG.SHEET_ID,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: data
            }
        });

        state.cache['bookingData'] = null; // Invalidate cache
        showToast('Booking updated successfully!', 'success');
        // No need to reload data here, the optimistic update is now permanent.

    } catch (error) {
        showToast(`Update Error: ${error.message || error.result?.error?.message || 'Could not update.'}`, 'error');
        // On error, revert optimistic change by restoring original data
        state.allBookings = originalAllBookings;
        displayBookings();
        updateNotifications();
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
        updateNotifications(); // BUG FIX: Refresh notifications after adding a booking
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
        const hasNoAction = !b.remark || String(b.remark).trim() === '';
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
        const hasNoAction = !b.remark || String(b.remark).trim() === '';
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
                localStorage.setItem('customBackground', imageUrl);
                // Apply background only if not in material theme
                if (!document.body.classList.contains('material-theme')) {
                    document.body.style.backgroundImage = `url(${imageUrl})`;
                }
                showToast('Background updated!', 'success');
            };
            reader.readAsDataURL(file);
        }
        // Reset the input value to allow re-uploading the same file
        event.target.value = '';
    });
    
    resetBtn.addEventListener('click', () => {
        localStorage.removeItem('customBackground');
        // Re-apply the default glass background if not in material theme
        if (!document.body.classList.contains('material-theme')) {
            document.body.style.backgroundImage = `url('https://images.unsplash.com/photo-1550684376-efcbd6e3f031?q=80&w=2970&auto=format&fit=crop')`;
        }
        showToast('Background reset.', 'info');
    });
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
        // BUG FIX: Ensure bookingToUpdate is cleared when navigating away from the sell page
        state.bookingToUpdate = null; 
    }
    if (viewName === 'booking') {
        hideNewBookingForm();
    }
     if (viewName === 'settle') {
        hideNewSettlementForm();
        displaySettlements();
        updateSettlementDashboard();
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

    // Filter for tickets in the selected period
    const ticketsInPeriod = state.allTickets.filter(t => {
        const ticketDate = parseSheetDate(t.issued_date);
        return ticketDate.getMonth() === selectedMonth && ticketDate.getFullYear() === selectedYear;
    });

    // Total tickets count (includes all tickets issued in the period, even if later canceled)
    document.getElementById('total-tickets-value').textContent = ticketsInPeriod.length;

    // Revenue: Includes net amount from non-refunded tickets (partially canceled tickets have net_amount = fee)
    const revenueTickets = ticketsInPeriod.filter(t => !t.remarks?.toLowerCase().includes('full refund'));
    const totalRevenue = revenueTickets.reduce((sum, t) => sum + (t.net_amount || 0) + (t.date_change || 0), 0);
    const revenueBox = document.getElementById('monthly-revenue-box');
    revenueBox.innerHTML = `<div class="info-card-content"><h3>Total Revenue</h3><div class="main-value">${totalRevenue.toLocaleString()}</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-sack-dollar"></i></div>`;

    // Profit: Commission and Extra Fare from tickets that are NOT fully refunded.
    const profitTickets = ticketsInPeriod.filter(t => {
        const lowerRemarks = t.remarks?.toLowerCase() || '';
        return !lowerRemarks.includes('full refund');
    });

    const totalCommission = profitTickets.reduce((sum, t) => sum + (t.commission || 0), 0);
    const commissionBox = document.getElementById('monthly-commission-box');
    commissionBox.innerHTML = `<div class="info-card-content"><h3>Total Commission</h3><div class="main-value">${totalCommission.toLocaleString()}</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-hand-holding-dollar"></i></div>`;

    const totalExtraFare = profitTickets.reduce((sum, t) => sum + (t.extra_fare || 0), 0);
    const extraFareBox = document.getElementById('monthly-extra-fare-box');
    extraFareBox.innerHTML = `<div class="info-card-content"><h3>Total Extra Fare</h3><div class="main-value">${totalExtraFare.toLocaleString()}</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-dollar-sign"></i></div>`;
    
    updateNotifications();
    updateSettlementDashboard();
}


/**
 * NEW FUNCTION: Dynamically updates countdown timers in notifications.
 */
function updateDynamicTimes() {
    const timeElements = document.querySelectorAll('.dynamic-time');
    timeElements.forEach(el => {
        const deadline = parseInt(el.dataset.deadline, 10);
        if (isNaN(deadline)) return;

        const now = Date.now();
        const timeLeftMs = deadline - now;

        if (timeLeftMs <= 0) {
            // Remove the notification item once the deadline has passed
            el.closest('.notification-item')?.remove();
            // Check if the list is now empty and show the "empty" message
            const notificationList = document.getElementById('notification-list');
            if (notificationList && notificationList.children.length === 0) {
                notificationList.innerHTML = '<div class="notification-item empty"><i class="fa-solid fa-check-circle"></i> No new notifications.</div>';
                // Also update the main header count
                const header = document.querySelector('.notification-panel h3');
                if(header) header.innerHTML = `<i class="fa-solid fa-bell"></i> Notifications`;
            }
        } else {
            const timeLeftMinutes = Math.round(timeLeftMs / 60000);
            const hours = Math.floor(timeLeftMinutes / 60);
            const minutes = timeLeftMinutes % 60;
            el.textContent = `~${hours}h ${minutes}m remaining`;
        }
    });
}


function updateNotifications() {
    const notificationList = document.getElementById('notification-list');
    notificationList.innerHTML = '';
    let notifications = [];
    const notificationTitleLink = document.getElementById('notification-title-link');
    const header = notificationTitleLink.querySelector('h3');

    // Near deadline bookings
    const now = new Date();
    const deadlineThreshold = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

    const nearDeadlineBookings = state.allBookings.filter(b => {
        const deadline = parseDeadline(b.enddate, b.endtime);
        const hasNoAction = !b.remark || String(b.remark).trim() === '';
        return deadline && hasNoAction && (deadline.getTime() - now.getTime()) < deadlineThreshold && deadline.getTime() > now.getTime();
    });

    nearDeadlineBookings.forEach(b => {
        const deadline = parseDeadline(b.enddate, b.endtime);
        const timeLeft = Math.round((deadline.getTime() - now.getTime()) / (1000 * 60)); // Time left in minutes
        notifications.push({
            type: 'deadline',
            deadlineTime: deadline.getTime(),
            html: `<div class="notification-item deadline">
                <i class="fa-solid fa-clock"></i>
                <div>
                    <strong>Booking Deadline Approaching</strong>
                    <span>${b.name || 'N/A'} - PNR: ${b.pnr || 'N/A'}</span>
                    <span class="dynamic-time" data-deadline="${deadline.getTime()}">~${Math.floor(timeLeft / 60)}h ${timeLeft % 60}m remaining</span>
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

    // Sort notifications to show deadlines first, and among deadlines, the nearest one first
    notifications.sort((a, b) => {
        if (a.type === 'deadline' && b.type !== 'deadline') return -1;
        if (a.type !== 'deadline' && b.type === 'deadline') return 1;
        if (a.type === 'deadline' && b.type === 'deadline') {
            return a.deadlineTime - b.deadlineTime; // Sort by nearest deadline
        }
        return 0; // Keep original order for other types
    });

    if (notifications.length > 0) {
        notificationList.innerHTML = notifications.map(n => n.html).join('');
        header.innerHTML = `<i class="fa-solid fa-bell"></i> Notifications <span class="notification-count">${notifications.length}</span>`;
        notificationTitleLink.classList.add('active');
        notificationTitleLink.onclick = (e) => {
            e.preventDefault();
            showNotificationModal();
        };
    } else {
        notificationList.innerHTML = '<div class="notification-item empty"><i class="fa-solid fa-check-circle"></i> No new notifications.</div>';
        header.innerHTML = `<i class="fa-solid fa-bell"></i> Notifications`;
        notificationTitleLink.classList.remove('active');
        notificationTitleLink.onclick = (e) => e.preventDefault();
    }
}

function showNotificationModal() {
    let modalContent = `
        <div class="notification-modal-header">
            <h2><i class="fa-solid fa-bell"></i> Notification Center</h2>
        </div>
        <div class="notification-modal-list">
    `;
    let notificationCount = 0;

    // --- Near deadline bookings ---
    const now = new Date();
    const deadlineThreshold = 6 * 60 * 60 * 1000; // 6 hours

    const nearDeadlineBookings = state.allBookings.filter(b => {
        const deadline = parseDeadline(b.enddate, b.endtime);
        const hasNoAction = !b.remark || String(b.remark).trim() === '';
        return deadline && hasNoAction && (deadline.getTime() - now.getTime()) < deadlineThreshold && deadline.getTime() > now.getTime();
    });

    const groupedDeadlineBookings = Object.values(nearDeadlineBookings.reduce((acc, booking) => {
        const groupId = booking.groupId; // Use the same groupId as the main booking view
        if (!acc[groupId]) {
            acc[groupId] = { ...booking, passengers: [] };
        }
        acc[groupId].passengers.push(booking.name);
        return acc;
    }, {})).sort((a, b) => parseDeadline(a.enddate, a.endtime) - parseDeadline(b.enddate, b.endtime));


    if (groupedDeadlineBookings.length > 0) {
        notificationCount += groupedDeadlineBookings.length;
        // MODIFIED LINE: Icon added without inline style
        modalContent += '<h3 class="notification-group-title"><i class="fa-solid fa-clock-fast-forward"></i>Approaching Deadlines</h3>';
        groupedDeadlineBookings.forEach(group => {
            const deadline = parseDeadline(group.enddate, group.endtime);
            const timeLeft = Math.round((deadline.getTime() - now.getTime()) / (1000 * 60));
            const passengerCount = group.passengers.length;
            const title = `${group.passengers[0]}${passengerCount > 1 ? ` (+${passengerCount - 1})` : ''}`;

            modalContent += `
                <div class="notification-modal-item deadline">
                    <div class="notification-icon"><i class="fa-solid fa-clock-fast-forward"></i></div>
                    <div class="notification-content">
                        <div class="notification-title">${title}</div>
                        <div class="notification-details">
                            PNR: <strong>${group.pnr || 'N/A'}</strong> | Route: ${group.departure.split(' ')[0]} → ${group.destination.split(' ')[0]}
                        </div>
                    </div>
                    <div class="notification-time" data-deadline="${deadline.getTime()}">~${Math.floor(timeLeft/60)}h ${timeLeft%60}m remaining</div>
                </div>
            `;
        });
    }

    // --- Unpaid tickets ---
    const unpaidTickets = state.allTickets.filter(t => !t.paid);

    const groupedUnpaidTickets = Object.values(unpaidTickets.reduce((acc, ticket) => {
        const groupId = ticket.booking_reference;
        if (!groupId) return acc;
        if (!acc[groupId]) {
            acc[groupId] = { ...ticket, passengers: [], total_net: 0 };
        }
        acc[groupId].passengers.push(ticket.name);
        // UPDATED CALCULATION: Sum of net_amount and extra_fare
        acc[groupId].total_net += (ticket.net_amount || 0) + (ticket.extra_fare || 0);
        return acc;
    }, {})).sort((a, b) => parseSheetDate(a.issued_date) - parseSheetDate(b.issued_date));

    if (groupedUnpaidTickets.length > 0) {
        notificationCount += groupedUnpaidTickets.length;
        // MODIFIED LINE: Icon added without inline style
        modalContent += '<h3 class="notification-group-title"><i class="fa-solid fa-file-invoice-dollar"></i>Unpaid Tickets</h3>';
        groupedUnpaidTickets.forEach(group => {
            const passengerCount = group.passengers.length;
            const title = `${group.passengers[0]}${passengerCount > 1 ? ` (+${passengerCount - 1})` : ''}`;
            
            modalContent += `
                <div class="notification-modal-item unpaid">
                    <div class="notification-icon"><i class="fa-solid fa-file-invoice-dollar"></i></div>
                    <div class="notification-content">
                        <div class="notification-title">${title}</div>
                        <div class="notification-details">
                           PNR: <strong>${group.booking_reference || 'N/A'}</strong> | Total Net: <strong>${(group.total_net || 0).toLocaleString()} MMK</strong>
                        </div>
                    </div>
                    <div class="notification-time">Issued: ${formatDateToDMMMY(group.issued_date)}</div>
                </div>
            `;
        });
    }

    if (notificationCount === 0) {
        modalContent += `
            <div class="notification-modal-item empty-modal">
                <i class="fa-solid fa-check-circle"></i>
                <span>All caught up! No new notifications.</span>
            </div>
        `;
    }

    modalContent += `
        </div>
        <div class="form-actions" style="margin-top: 1.5rem; padding: 0 1.5rem 1.5rem 1.5rem; background: transparent;">
            <button class="btn btn-secondary" onclick="closeModal()">Close</button>
        </div>
    `;

    openModal(content, 'large-modal');
    const modalContentEl = modal.querySelector('.modal-content');
    if (modalContentEl) {
        modalContentEl.classList.add('notification-modal-content');
    }
}

// --- UTILITY FUNCTIONS ---
function makeClickable(text) { if (!text) return 'N/A'; if (text.toLowerCase().startsWith('http')) return `<a href="${text}" target="_blank" rel="noopener noreferrer">${text}</a>`; if (/^[\d\s\-+()]+$/.test(text)) return `<a href="tel:${text.replace(/[^\d+]/g, '')}">${text}</a>`; if (text.startsWith('@')) return `<a href="https://t.me/${text.substring(1)}" target="_blank" rel="noopener noreferrer">${text}</a>`; return text; }
function showToast(message, type = 'info') { document.getElementById('toastMessage').textContent = message; const toastEl = document.getElementById('toast'); toastEl.className = `show ${type}`; setTimeout(() => toastEl.className = toastEl.className.replace('show', ''), 4000); }
function formatDateForSheet(dateString) { if (!dateString) return ''; const date = new Date(dateString); return isNaN(date.getTime()) ? dateString : `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`; }
function formatDateToDDMMMYYYY(dateString) { if (!dateString) return ''; const date = new Date(dateString); const day = String(date.getDate()).padStart(2, '0'); const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; const month = monthNames[date.getMonth()]; const year = date.getFullYear(); return `${day}-${month}-${year}`; }

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
    if (isNaN(date.getTime()) || date.getTime() === 0) {
        console.error("Invalid date string provided to parseDeadline:", dateStr);
        return null;
    }

    const timeParts = timeStr.match(/(\d+):(\d+)(:(\d+))?\s*(AM|PM)/i);

    if (!timeParts) {
        console.error("Invalid time string provided to parseDeadline:", timeStr);
        return null;
    }

    let hours = parseInt(timeParts[1], 10);
    const minutes = parseInt(timeParts[2], 10);
    const ampm = timeParts[5].toUpperCase();

    if (ampm === 'PM' && hours < 12) {
        hours += 12;
    }
    if (ampm === 'AM' && hours === 12) { // 12 AM is 00 hours
        hours = 0;
    }

    date.setHours(hours, minutes, 0, 0);
    return date;
}

function calculateAgentCut(totalCommission) {
    return Math.round(totalCommission * state.commissionRates.cut);
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
    
    // Find if a count span already exists
    let countSpan = label.querySelector('.notification-count');

    if (count > 0) {
        if (!countSpan) {
            // If it doesn't exist, create it and append it to the label
            countSpan = document.createElement('span');
            countSpan.className = 'notification-count';
            // Use a non-breaking space to ensure space between text and badge
            label.appendChild(document.createTextNode('\u00A0')); 
            label.appendChild(countSpan);
        }
        // Update its content
        countSpan.textContent = count;
    } else {
        // If count is 0 and the span exists, remove it
        if (countSpan) {
            // Also remove the preceding space
            if (countSpan.previousSibling && countSpan.previousSibling.nodeType === Node.TEXT_NODE) {
                countSpan.previousSibling.remove();
            }
            countSpan.remove();
        }
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
    for (let i = 1; i <= pageCount; i++) container.append(btn(i, i));
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

    const totalNetAmount = passengerData.reduce((sum, p) => sum + p.net_amount, 0);
    const confirmationMessage = `
        <h3>Confirm Submission</h3>
        <p>Please review the details before submitting:</p>
        <ul style="list-style: none; padding-left: 0; margin: 1rem 0;">
            <li><strong>PNR Code:</strong> ${sharedData.booking_reference}</li>
            <li><strong>Total Passengers:</strong> ${passengerData.length}</li>
            <li><strong>Total Net Amount:</strong> ${totalNetAmount.toLocaleString()} MMK</li>
            <li><strong>Payment Status:</strong> ${sharedData.paid ? `Paid via ${sharedData.payment_method}` : 'Not Paid'}</li>
        </ul>
    `;

    showConfirmModal(confirmationMessage, () => {
        const pnrExists = state.allTickets.some(t => t.booking_reference === sharedData.booking_reference);
        if (pnrExists) {
            const pnrMessage = `PNR <strong>${sharedData.booking_reference}</strong> already exists. Are you sure you want to add more passengers under this PNR?`;
            showConfirmModal(pnrMessage, () => confirmAndSaveTicket(form, sharedData, passengerData));
        } else {
            confirmAndSaveTicket(form, sharedData, passengerData);
        }
    });
}

async function confirmAndSaveTicket(form, sharedData, passengerData) {
    state.isSubmitting = true;
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    closeModal();

    try {
        await saveTicket(sharedData, passengerData);

        if (state.bookingToUpdate) {
            await updateBookingStatus(state.bookingToUpdate, 'complete');
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
        updateNotifications(); // Explicitly call to refresh notifications
        showView('home');

    } catch (error) {
        showToast(`Error: ${error.message || 'Could not save ticket.'}`, 'error');
    } finally {
        state.isSubmitting = false;
        if (submitButton) submitButton.disabled = false;
        state.bookingToUpdate = null; // Clear this at the end
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
    const values = passengerData.map(p => {
        const agentCommission = calculateAgentCut(p.commission); // Calculate the agent's cut
        return [
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
            agentCommission, // Save the calculated agent's commission
            p.remarks,
            p.extra_fare,
            0
        ];
    });

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
            <div class="form-group"><label>Total Commission</label><input type="number" class="passenger-commission" step="1" required></div>
            <div class="form-group"><label>Extra Fare (Optional)</label><input type="number" class="passenger-extra-fare" step="1"></div>
            <div class="form-group"><label>Remarks (Optional)</label><input type="text" class="passenger-remarks"></div>
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
                <div class="form-group"><label>New Commission (Optional)</label><input type="number" id="update_commission" placeholder="${(ticket.commission||0).toLocaleString()}"></div>
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
    const newCommission = parseFloat(document.getElementById('update_commission').value);
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
    if (!isNaN(newCommission) && newCommission !== originalTicket.commission) historyDetails.push(`Commission: ${originalTicket.commission} to ${newCommission}`);
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
        let finalCommission = isNaN(newCommission) ? ticket.commission : newCommission;
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
        </div>

        <hr style="border-color: rgba(255,255,255,0.2); margin: 1.5rem 0;">
        
        <h4>Partial Cancellation</h4>
        <form id="cancelForm" style="width: 100%;">
            <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                    <label for="cancellation_fee">Cancellation Fee (MMK)</label>
                    <input type="number" id="cancellation_fee" required class="form-group input">
                </div>
                <div class="form-group">
                    <label for="refund_amount">Refund Amount (MMK)</label>
                    <input type="number" id="refund_amount" required class="form-group input">
                </div>
                <div class="form-group">
                    <label for="refund_payment_method">Refund Payment Method</label>
                    <select id="refund_payment_method" required>
                        <option value="" disabled selected>Select Method</option>
                        <option value="KBZ Pay">KBZ Pay</option>
                        <option value="Mobile Banking">Mobile Banking</option>
                        <option value="Aya Pay">Aya Pay</option>
                        <option value="Cash">Cash</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="refund_transaction_id">Transaction ID (Optional)</label>
                    <input type="text" id="refund_transaction_id" class="form-group input">
                </div>
            </div>
            <button type="submit" class="btn btn-secondary" style="width: 100%; margin-top: 1rem;">Process Partial Cancellation</button>
        </form>

        <div class="form-actions" style="margin-top: 2rem;">
            <button class="btn btn-secondary" onclick="openManageModal(${rowIndex})">Back to Modify</button>
        </div>
    `;
    openModal(content);
    document.getElementById('cancelForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const refundAmount = parseFloat(document.getElementById('refund_amount').value);
        const cancellationFee = parseFloat(document.getElementById('cancellation_fee').value);
        const paymentMethod = document.getElementById('refund_payment_method').value;
        const transactionId = document.getElementById('refund_transaction_id').value;

        if (isNaN(refundAmount) || refundAmount < 0) {
            showToast('Please enter a valid refund amount.', 'error');
            return;
        }
        if (isNaN(cancellationFee) || cancellationFee < 0) {
            showToast('Please enter a valid cancellation fee.', 'error');
            return;
        }
        if (!paymentMethod) {
            showToast('Please select a refund payment method.', 'error');
            return;
        }
        
        handleCancelTicket(rowIndex, 'cancel', {
            refundAmount,
            cancellationFee,
            paymentMethod,
            transactionId
        });
    });
}

async function handleCancelTicket(rowIndex, type, details = {}) {
    const ticket = state.allTickets.find(t => t.rowIndex === rowIndex);
    if (!ticket) return;

    let confirmationMessage = '';
    if (type === 'refund') {
        confirmationMessage = `Are you sure you want to process a <strong>Full Refund</strong> for ${ticket.name}? This will set the Net Amount and all financial values to 0.`;
    } else {
        confirmationMessage = `
            <h3>Confirm Partial Cancellation</h3>
            <p>Please review for <strong>${ticket.name}</strong>:</p>
            <ul style="list-style: none; padding-left: 0; margin: 1rem 0;">
                <li><strong>Cancellation Fee:</strong> ${details.cancellationFee.toLocaleString()} MMK</li>
                <li><strong>Refund Amount:</strong> ${details.refundAmount.toLocaleString()} MMK</li>
                <li><strong>Via:</strong> ${details.paymentMethod} ${details.transactionId ? `(${details.transactionId})` : ''}</li>
            </ul>
            <p>The ticket's Net Amount will be updated to the cancellation fee.</p>
        `;
    }

    showConfirmModal(confirmationMessage, async () => {
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
            const remark = `Canceled on ${dateStr} with ${details.refundAmount.toLocaleString()} refund`;
            updatedValues = [
                ticket.issued_date, ticket.name, ticket.id_no, ticket.phone,
                ticket.account_name, ticket.account_type, ticket.account_link,
                ticket.departure, ticket.destination, ticket.departing_on,
                ticket.airline, ticket.base_fare, ticket.booking_reference, details.cancellationFee,
                ticket.paid, ticket.payment_method, ticket.paid_date,
                ticket.commission, remark, ticket.extra_fare, ticket.date_change
            ];
            historyDetails = `CANCELED: Partial. Refunded: ${details.refundAmount.toLocaleString()} MMK via ${details.paymentMethod} ${details.transactionId ? `(ID: ${details.transactionId})` : ''}. New Net Amount: ${details.cancellationFee.toLocaleString()} MMK.`;
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
            showToast('Ticket canceled/refunded successfully!', 'success');
            closeModal();
            clearManageResults();
            await Promise.all([loadTicketData(), loadHistory()]);
            updateDashboardData();
        } catch (error) {
            showToast(`Cancellation Error: ${error.result?.error?.message || 'Could not process.'}`, 'error');
        }
    });
}



// --- HISTORY LOGGING ---
async function loadHistory() {
    try {
        const response = await fetchFromSheet(`${CONFIG.HISTORY_SHEET}!A:D`, 'historyData');
        if (response.values) {
            state.history = response.values.slice(1).map(row => ({
                date: row[0],
                name: row[1],
                pnr: row[2],
                details: row[3]
            })).reverse();
        }
    } catch (error) {
        console.error("Error loading history:", error);
    }
}

async function saveHistory(ticket, details) {
    const now = new Date();
    const timestamp = now.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });

    const values = [[timestamp, ticket.name, ticket.booking_reference, details]];

    try {
        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SHEET_ID,
            range: `${CONFIG.HISTORY_SHEET}!A:D`,
            valueInputOption: 'USER_ENTERED',
            resource: { values }
        });
    } catch (error) {
        console.error("Could not save history:", error);
        showToast('Failed to log action to history.', 'error');
    }
}

function displayHistory(page) {
    const container = document.getElementById('modificationHistoryBody');
    const paginationContainer = document.getElementById('modificationHistoryPagination');
    const historySection = document.getElementById('modificationHistoryContainer');
    container.innerHTML = '';
    paginationContainer.innerHTML = '';
    state.historyPage = page;

    if (state.history.length === 0) {
        historySection.style.display = 'none';
        return;
    }
    historySection.style.display = 'block';

    const paginated = state.history.slice((page - 1) * state.rowsPerPage, page * state.rowsPerPage);
    paginated.forEach(entry => {
        const row = container.insertRow();
        row.innerHTML = `<td>${entry.date}</td><td>${entry.name}</td><td>${entry.pnr}</td><td>${entry.details}</td>`;
    });

    // Pagination for history
    const pageCount = Math.ceil(state.history.length / state.rowsPerPage);
    if (pageCount <= 1) return;
    const btn = (txt, pg, en = true) => {
        const b = document.createElement('button');
        b.className = 'pagination-btn';
        b.innerHTML = txt;
        b.disabled = !en;
        if (en) b.onclick = () => displayHistory(pg);
        if (pg === state.historyPage) b.classList.add('active');
        return b;
    };
    paginationContainer.append(btn('&laquo;', state.historyPage - 1, state.historyPage > 1));
    for (let i = 1; i <= pageCount; i++) paginationContainer.append(btn(i, i));
    paginationContainer.append(btn('&raquo;', state.historyPage + 1, state.historyPage < pageCount));
}

// --- CLIENTS VIEW ---
function buildClientList() {
    const clients = {};
    state.allTickets.forEach(ticket => {
        const clientKey = `${ticket.name}|${ticket.phone}|${ticket.account_name}`;
        if (!clients[clientKey]) {
            clients[clientKey] = {
                name: ticket.name,
                phone: ticket.phone,
                account_name: ticket.account_name,
                id_no: ticket.id_no,
                ticket_count: 0,
                total_spent: 0,
                last_travel: new Date(0)
            };
        }
        clients[clientKey].ticket_count++;
        clients[clientKey].total_spent += (ticket.net_amount || 0) + (ticket.extra_fare || 0) + (ticket.date_change || 0);
        const travelDate = parseSheetDate(ticket.departing_on);
        if (travelDate > clients[clientKey].last_travel) {
            clients[clientKey].last_travel = travelDate;
        }
    });

    state.allClients = Object.values(clients).sort((a, b) => a.name.localeCompare(b.name));
}


function renderClientsView(page = 1, searchQuery = '') {
    const tbody = document.getElementById('clientListTableBody');
    const paginationContainer = document.getElementById('clientListPagination');
    if (!tbody || !paginationContainer) {
        // If the view hasn't been built yet, build it
        const container = document.getElementById('clients-view');
        container.innerHTML = `
            <div class="clients-container">
                <div class="clients-header">
                    <h2><i class="fa-solid fa-users"></i> Client Directory</h2>
                    <div class="client-controls">
                        <div class="client-search-box" style="display: flex; gap: 0.5rem;">
                            <input type="text" id="clientSearchInput" placeholder="Search by name or phone...">
                            <button id="clientClearBtn" class="btn btn-secondary"><i class="fa-solid fa-eraser"></i></button>
                        </div>
                    </div>
                </div>
                <div class="results-section glass-card">
                    <div class="table-container">
                        <table id="clientListTable">
                            <thead>
                                <tr>
                                    <th></th>
                                    <th>Client Name</th>
                                    <th>Phone</th>
                                    <th>Social Media</th>
                                    <th>Total Tickets</th>
                                    <th>Total Spent (MMK)</th>
                                    <th>Last Travel</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody id="clientListTableBody"></tbody>
                        </table>
                    </div>
                    <div id="clientListPagination" class="pagination-container"></div>
                </div>
            </div>`;
        document.getElementById('clientSearchInput').addEventListener('input', (e) => debounce(() => renderClientsView(1, e.target.value), 300));
        document.getElementById('clientClearBtn').addEventListener('click', () => {
            document.getElementById('clientSearchInput').value = '';
            renderClientsView(1, '');
        });
        return renderClientsView(page, searchQuery); // Re-run now that it's built
    }

    tbody.innerHTML = '';
    paginationContainer.innerHTML = '';
    state.clientPage = page;

    const query = searchQuery.toLowerCase();
    const filteredClients = state.allClients.filter(c =>
        c.name.toLowerCase().includes(query) ||
        c.phone.includes(query)
    );

    // Sort featured clients to the top
    filteredClients.sort((a, b) => {
        const aIsFeatured = state.featuredClients.includes(a.name);
        const bIsFeatured = state.featuredClients.includes(b.name);
        if (aIsFeatured && !bIsFeatured) return -1;
        if (!aIsFeatured && bIsFeatured) return 1;
        return a.name.localeCompare(b.name); // Then sort by name
    });


    if (filteredClients.length === 0) {
        const colSpan = 8;
        tbody.innerHTML = `<tr><td colspan="${colSpan}"><div class="empty-state" style="padding: 2rem 1rem;"><i class="fa-solid fa-user-slash"></i><h4>No Clients Found</h4><p>Your search for "${searchQuery}" did not match any clients.</p></div></td></tr>`;
        return;
    }

    const paginated = filteredClients.slice((page - 1) * state.rowsPerPage, page * state.rowsPerPage);

    paginated.forEach(client => {
        const isFeatured = state.featuredClients.includes(client.name);
        const row = tbody.insertRow();
        row.innerHTML = `
            <td><i class="fa-regular fa-star star-icon ${isFeatured ? 'featured' : ''}" onclick="toggleFeaturedClient(event, '${client.name}')"></i></td>
            <td class="client-name-cell">${client.name}</td>
            <td>${client.phone}</td>
            <td>${client.account_name}</td>
            <td>${client.ticket_count}</td>
            <td>${client.total_spent.toLocaleString()}</td>
            <td>${client.last_travel.getTime() > 0 ? formatDateToDMMMY(client.last_travel) : 'N/A'}</td>
            <td class="actions-cell">
                <button class="icon-btn icon-btn-table" title="View History" onclick="viewClientHistory('${client.name}')"><i class="fa-solid fa-clock-rotate-left"></i></button>
                <button class="icon-btn icon-btn-table" title="Sell Ticket" onclick="sellTicketForClient('${client.name}')"><i class="fa-solid fa-ticket"></i></button>
            </td>
        `;
    });

    // Pagination
    const pageCount = Math.ceil(filteredClients.length / state.rowsPerPage);
    if (pageCount <= 1) return;
    const btn = (txt, pg, en = true) => {
        const b = document.createElement('button');
        b.className = 'pagination-btn';
        b.innerHTML = txt;
        b.disabled = !en;
        if (en) b.onclick = () => renderClientsView(pg, searchQuery);
        if (pg === state.clientPage) b.classList.add('active');
        return b;
    };
    paginationContainer.append(btn('&laquo;', state.clientPage - 1, state.clientPage > 1));
    for (let i = 1; i <= pageCount; i++) paginationContainer.append(btn(i, i));
    paginationContainer.append(btn('&raquo;', state.clientPage + 1, state.clientPage < pageCount));
}

function viewClientHistory(clientName) {
    const clientTickets = state.allTickets.filter(t => t.name === clientName)
        .sort((a, b) => parseSheetDate(b.issued_date) - parseSheetDate(a.issued_date));

    if (clientTickets.length === 0) {
        showToast("No ticket history found for this client.", "info");
        return;
    }

    const firstTicket = clientTickets[0];
    const totalSpent = clientTickets.reduce((sum, t) => sum + (t.net_amount || 0) + (t.extra_fare || 0) + (t.date_change || 0), 0);
    const totalProfit = clientTickets.reduce((sum, t) => sum + (t.commission || 0) + (t.extra_fare || 0), 0);

    let historyHtml = '<div class="table-container"><table id="clientHistoryTable"><thead><tr><th>Issued</th><th>PNR</th><th>Route</th><th>Travel Date</th><th>Airline</th><th>Net Amount</th></tr></thead><tbody>';
    clientTickets.forEach(t => {
        const isCanceled = t.remarks?.toLowerCase().includes('cancel') || t.remarks?.toLowerCase().includes('refund');
        historyHtml += `
            <tr class="${isCanceled ? 'canceled-row' : ''}">
                <td>${formatDateToDMMMY(t.issued_date)}</td>
                <td>${t.booking_reference}</td>
                <td>${t.departure.split(' ')[0]}→${t.destination.split(' ')[0]}</td>
                <td>${formatDateToDMMMY(t.departing_on)}</td>
                <td>${t.airline}</td>
                <td>${(t.net_amount || 0).toLocaleString()}</td>
            </tr>
        `;
    });
    historyHtml += '</tbody></table></div>';

    const content = `
        <div class="client-history-header">
            <div class="client-history-info">
                <h2>${clientName}</h2>
                <p>ID: ${firstTicket.id_no || 'N/A'} | Phone: ${firstTicket.phone || 'N/A'} | Social: ${firstTicket.account_name || 'N/A'} (${firstTicket.account_type || 'N/A'})</p>
            </div>
            <div class="client-history-actions">
                <button class="btn btn-primary" onclick="sellTicketForClient('${clientName}')"><i class="fa-solid fa-ticket"></i> Sell New Ticket</button>
                <button class="btn btn-secondary" onclick="closeModal()">Close</button>
            </div>
        </div>
        <div class="client-history-stats">
            <div class="stat-card"><div class="label">Total Tickets</div><div class="value">${clientTickets.length}</div></div>
            <div class="stat-card"><div class="label">Total Spent</div><div class="value">${totalSpent.toLocaleString()} MMK</div></div>
            <div class="stat-card"><div class="label">Total Profit</div><div class="value">${totalProfit.toLocaleString()} MMK</div></div>
        </div>
        <h3>Ticket History</h3>
        ${historyHtml}
    `;

    openModal(content, 'large-modal');
}


// --- FEATURED CLIENTS ---
function loadFeaturedClients() {
    const featured = localStorage.getItem('featuredClients');
    state.featuredClients = featured ? JSON.parse(featured) : [];
}

function saveFeaturedClients() {
    localStorage.setItem('featuredClients', JSON.stringify(state.featuredClients));
}

function toggleFeaturedClient(event, clientName) {
    event.stopPropagation(); // Prevent row click events if any
    const icon = event.target;
    const index = state.featuredClients.indexOf(clientName);

    if (index > -1) {
        state.featuredClients.splice(index, 1);
        icon.classList.remove('featured');
        showToast(`${clientName} removed from featured.`, 'info');
    } else {
        state.featuredClients.push(clientName);
        icon.classList.add('featured');
        showToast(`${clientName} added to featured!`, 'success');
    }

    saveFeaturedClients();
    // Re-render the current page to reflect the change immediately
    const currentPage = state.clientPage;
    const currentSearch = document.getElementById('clientSearchInput')?.value || '';
    renderClientsView(currentPage, currentSearch);
}

// --- SELL TICKET FOR CLIENT ---
function sellTicketForClient(clientName) {
    const client = state.allClients.find(c => c.name === clientName);
    if (!client) {
        showToast('Could not find client details.', 'error');
        return;
    }

    showView('sell');
    closeModal(); // Close the history modal if it's open

    // Pre-fill the form
    document.getElementById('phone').value = client.phone || '';
    document.getElementById('account_name').value = client.account_name || '';

    // Find a ticket from this client to get more details
    const clientTicket = state.allTickets.find(t => t.name === clientName);
    if (clientTicket) {
        document.getElementById('account_type').value = clientTicket.account_type || '';
        document.getElementById('account_link').value = clientTicket.account_link || '';
    }
    
    // Add a passenger form with the client's name and ID
    resetPassengerForms(); 
    const passengerNameInput = document.querySelector('#passenger-forms-container .passenger-name');
    const passengerIdInput = document.querySelector('#passenger-forms-container .passenger-id');
    if (passengerNameInput) {
        passengerNameInput.value = client.name.toUpperCase();
    }
    if (passengerIdInput) {
        passengerIdInput.value = client.id_no || '';
    }
    
    showToast(`Form pre-filled for ${client.name}.`, 'info');
}


// --- MODAL & UI SETTINGS ---
function openModal(content, sizeClass = '') {
    modalBody.innerHTML = content;
    const modalContent = modal.querySelector('.modal-content');
    modalContent.className = 'modal-content glass-card'; // Reset classes
    if (sizeClass) {
        modalContent.classList.add(sizeClass);
    }
    modal.classList.add('show');
}

function closeModal() {
    modal.classList.remove('show');
    modalBody.innerHTML = '';
}

function showConfirmModal(message, onConfirm) {
    const content = `
        <div style="text-align: center;">
            <div style="font-size: 1.1rem; margin-bottom: 2rem;">${message}</div>
            <div class="form-actions">
                <button id="confirmCancelBtn" class="btn btn-secondary">Cancel</button>
                <button id="confirmActionBtn" class="btn btn-primary">Confirm</button>
            </div>
        </div>
    `;
    openModal(content, 'small-modal');
    document.getElementById('confirmActionBtn').onclick = onConfirm;
    document.getElementById('confirmCancelBtn').onclick = closeModal;
}

function initializeUISettings() {
    // --- Sliders ---
    const sliders = {
        'opacity-slider': { property: '--glass-bg', valueId: 'opacity-value', unit: '' },
        'blur-slider': { property: '--blur-amount', valueId: 'blur-value', unit: 'px' },
        'overlay-slider': { property: '--overlay-opacity', valueId: 'overlay-value', unit: '' },
        'glass-slider': { property: '--liquid-border', valueId: 'glass-value', unit: 'px solid rgba(255, 255, 255, 0.15)', transform: (v) => `${v}` },
        'agent-cut-slider': { property: 'commissionCut', valueId: 'agent-cut-value', unit: '%', isState: true }
    };

    for (const id in sliders) {
        const slider = document.getElementById(id);
        const { property, valueId, unit, transform, isState } = sliders[id];
        const valueEl = document.getElementById(valueId);

        const savedValue = localStorage.getItem(id);
        if (savedValue) {
            slider.value = savedValue;
        }

        const update = () => {
            const val = slider.value;
            valueEl.textContent = val + (unit === '%' ? '%' : '');
            if (isState) {
                state.commissionRates.cut = val / 100;
            } else {
                const finalValue = transform ? transform(val) : `rgba(255, 255, 255, ${val})`;
                if (unit && !transform) {
                     document.documentElement.style.setProperty(property, val + unit);
                } else if (transform) {
                     document.documentElement.style.setProperty(property, `1px solid rgba(255, 255, 255, ${val})`);
                }
                 else {
                     if(property === '--glass-bg') document.documentElement.style.setProperty(property, `rgba(255, 255, 255, ${val})`);
                     else document.documentElement.style.setProperty(property, val);
                }
            }
            localStorage.setItem(id, val);
        };
        slider.addEventListener('input', update);
        update();
    }
    
    // --- Theme Toggles ---
    const themeToggle = document.getElementById('theme-toggle');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const darkModeContainer = document.getElementById('dark-mode-container');
    const glassSettingsContainer = document.getElementById('glass-settings-container');

    const applyTheme = (isMaterial, isDark) => {
        if (isMaterial) {
            document.body.classList.add('material-theme');
            darkModeContainer.style.display = 'flex';
            glassSettingsContainer.style.display = 'none';
             if (isDark) {
                document.body.classList.add('dark-theme');
            } else {
                document.body.classList.remove('dark-theme');
            }
        } else {
            document.body.classList.remove('material-theme', 'dark-theme');
            darkModeContainer.style.display = 'none';
            glassSettingsContainer.style.display = 'block';
        }
        
        // BUG FIX: Background logic
        const customBg = localStorage.getItem('customBackground');
        if (isMaterial) {
            document.body.style.backgroundImage = 'none'; // Material theme never has a background image
        } else if (customBg) {
            document.body.style.backgroundImage = `url(${customBg})`; // Glass theme prioritizes custom
        } else {
            // Glass theme with no custom background gets the default
            document.body.style.backgroundImage = `url('https://images.unsplash.com/photo-1550684376-efcbd6e3f031?q=80&w=2970&auto=format&fit=crop')`;
        }
    };

    const isMaterialSaved = localStorage.getItem('isMaterial') === 'true';
    const isDarkSaved = localStorage.getItem('isDark') === 'true';

    themeToggle.checked = isMaterialSaved;
    darkModeToggle.checked = isDarkSaved;

    applyTheme(isMaterialSaved, isDarkSaved);

    themeToggle.addEventListener('change', () => {
        const isMaterial = themeToggle.checked;
        localStorage.setItem('isMaterial', isMaterial);
        applyTheme(isMaterial, darkModeToggle.checked);
    });

    darkModeToggle.addEventListener('change', () => {
        const isDark = darkModeToggle.checked;
        localStorage.setItem('isDark', isDark);
        applyTheme(themeToggle.checked, isDark);
    });

    // --- Settings Panel Toggle ---
    document.getElementById('settings-btn').addEventListener('click', () => {
        settingsPanel.classList.toggle('show');
    });

    document.getElementById('reset-settings-btn').addEventListener('click', () => {
        Object.keys(sliders).forEach(id => localStorage.removeItem(id));
        localStorage.removeItem('isMaterial');
        localStorage.removeItem('isDark');
        window.location.reload();
    });

    // --- Inject custom styles for dynamic elements ---
    const styleSheet = document.createElement("style");
    styleSheet.innerText = `
        .notification-count {
            background-color: var(--danger-accent);
            color: #FFFFFF !important;
            font-size: 0.75rem;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 10px;
            margin-left: 0.5rem;
            line-height: 1;
            display: inline-block;
            vertical-align: middle;
        }
        #unpaid-only-label {
            display: flex;
            align-items: center;
        }
    `;
    document.head.appendChild(styleSheet);
}
// --- PDF EXPORT ---
async function exportToPdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const exportType = document.querySelector('input[name="exportType"]:checked').value;

    let ticketsToExport;
    let startDate, endDate;
    let dateRangeString = '';

    if (exportType === 'filtered') {
        ticketsToExport = state.filteredTickets;
    } else {
        const startDateStr = document.getElementById('exportStartDate').value;
        const endDateStr = document.getElementById('exportEndDate').value;
        startDate = parseSheetDate(startDateStr);
        endDate = parseSheetDate(endDateStr);

        if (!startDate || !endDate || isNaN(startDate) || isNaN(endDate)) {
            showToast('Please select a valid date range.', 'error');
            return;
        }
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        
        dateRangeString = `${formatDateToDMMMY(startDate)} to ${formatDateToDMMMY(endDate)}`;

        ticketsToExport = state.allTickets.filter(t => {
            const issuedDate = parseSheetDate(t.issued_date);
            return issuedDate >= startDate && issuedDate <= endDate;
        });
    }

    if (ticketsToExport.length === 0) {
        showToast('No tickets to export in the selected range.', 'info');
        exportConfirmModal.classList.remove('show');
        return;
    }

    ticketsToExport.sort((a, b) => parseSheetDate(a.issued_date) - parseSheetDate(b.issued_date));

    // --- Header ---
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Ticket Sales Report', 105, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const reportTypeStr = exportType === 'filtered' ? 'Filtered Results' : `Date Range: ${dateRangeString}`;
    doc.text(reportTypeStr, 105, 20, { align: 'center' });

    // --- Table ---
    const head = [['No.', 'Issued Date', 'Name', 'PNR', 'Route', 'Net Amount', 'Date Change', 'Commission']];
    const body = ticketsToExport.map((t, index) => {
        const route = `${(t.departure||'').split('(')[0].trim()} - ${(t.destination||'').split('(')[0].trim()}`;
        return [
            index + 1,
            formatDateToDMMMY(t.issued_date),
            t.name,
            t.booking_reference,
            route,
            (t.net_amount || 0).toLocaleString(),
            (t.date_change || 0).toLocaleString(),
            (t.commission || 0).toLocaleString()
        ];
    });

    const totalNetAmount = ticketsToExport.reduce((sum, t) => sum + (t.net_amount || 0), 0);
    const totalDateChange = ticketsToExport.reduce((sum, t) => sum + (t.date_change || 0), 0);
    const totalCommission = ticketsToExport.reduce((sum, t) => sum + (t.commission || 0), 0);
    
    body.push([
        { content: 'Total', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: totalNetAmount.toLocaleString(), styles: { fontStyle: 'bold', halign: 'right' } },
        { content: totalDateChange.toLocaleString(), styles: { fontStyle: 'bold', halign: 'right' } },
        { content: totalCommission.toLocaleString(), styles: { fontStyle: 'bold', halign: 'right' } }
    ]);

    doc.autoTable({
        head: head,
        body: body,
        startY: 25,
        theme: 'grid',
        headStyles: { fillColor: [44, 62, 80], fontSize: 8 },
        styles: { fontSize: 7, cellPadding: 1.5 },
        columnStyles: {
            0: { halign: 'center', cellWidth: 8 }, // No.
            1: { cellWidth: 18 }, // Issued Date
            2: { cellWidth: 30 }, // Name
            3: { cellWidth: 18 }, // PNR
            4: { cellWidth: 40 }, // Route
            5: { halign: 'right', cellWidth: 20 }, // Net
            6: { halign: 'right', cellWidth: 20 }, // Date Change
            7: { halign: 'right', cellWidth: 20 }  // Commission
        },
        didParseCell: function (data) {
            if (data.row.raw[0].content === 'Total') {
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });

    let finalY = doc.lastAutoTable.finalY;
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageMargin = 15;
    
    // Check if space is left for the summary. If not, add a new page.
    // Estimate required height: 10mm for title + 4 * 7mm for rows = ~40-50mm
    if (finalY + 50 > pageHeight - pageMargin) {
        doc.addPage();
        finalY = pageMargin;
    } else {
        finalY += 10;
    }
    
    const grandTotal = totalNetAmount + totalDateChange;
    
    // --- Summary & Settlement Section (only for date range) ---
    if (exportType === 'range') {
        const settlementsInRange = state.allSettlements.filter(s => {
            const settlementDate = parseSheetDate(s.settlement_date);
            return settlementDate >= startDate && settlementDate <= endDate;
        });
        const totalSettlements = settlementsInRange.reduce((sum, s) => sum + s.amount_paid, 0);
        const amountToPay = grandTotal - (totalCommission + totalSettlements);

        // --- Create Settlement Breakdown Body ---
        let settlementBody = [];
        settlementBody.push(
            [{ content: `Grand Total for ${dateRangeString}:`, styles: { fontStyle: 'bold' } }, { content: `${grandTotal.toLocaleString()} MMK`, styles: { halign: 'right', fontStyle: 'bold' } }],
            [{ content: `Commissions for ${dateRangeString}:`, styles: {} }, { content: `(${totalCommission.toLocaleString()}) MMK`, styles: { halign: 'right' } }],
        );

        // Add line-by-line settlements
        if(settlementsInRange.length > 0) {
            settlementsInRange.forEach(s => {
                const notes = s.notes ? `, ${s.notes}` : '';
                const settlementText = `Settlement (${s.settlement_date}, ${s.payment_method}${notes})`;
                settlementBody.push(
                     [{ content: settlementText, styles: {textColor: [100, 100, 100]} }, { content: `(${s.amount_paid.toLocaleString()}) MMK`, styles: { halign: 'right', textColor: [100, 100, 100] } }]
                );
            });
        } else {
             settlementBody.push(
                 [{ content: `No settlements made during ${dateRangeString}`, styles: {textColor: [150, 150, 150]} }, { content: `(0) MMK`, styles: { halign: 'right', textColor: [150, 150, 150] } }]
            );
        }
        
        // Final Balance Row
        settlementBody.push(
             [{ content: 'Remaining Balance to Settle:', styles: { fontStyle: 'bold' } }, { content: `${amountToPay.toLocaleString()} MMK`, styles: { halign: 'right', fontStyle: 'bold' } }]
        );

        // Draw the settlement summary table
        doc.autoTable({
            body: settlementBody,
            startY: finalY,
            theme: 'plain',
            styles: { fontSize: 10, cellPadding: 2 },
            columnStyles: { 0: { cellWidth: 120 }, 1: { halign: 'right' } },
            tableWidth: 'auto',
            margin: { left: 14 },
            didDrawCell: (data) => {
                 // Draw a line before the final balance row
                 if (data.row.index === settlementBody.length - 2) {
                    doc.setLineWidth(0.2);
                    doc.line(data.cell.x, data.cell.y + data.cell.height + 1, data.cell.x + 182, data.cell.y + data.cell.height + 1);
                }
            }
        });
    }
    
    doc.save(`ticket_report_${new Date().toISOString().slice(0,10)}.pdf`);
    exportConfirmModal.classList.remove('show');
}
// --- AUTOSUGGEST ---
function handleAutosuggest(inputElement, fieldType) {
    const value = inputElement.value.toLowerCase();
    const autosuggestBox = inputElement.nextElementSibling;
    autosuggestBox.innerHTML = '';

    if (value.length < 2) {
        autosuggestBox.style.display = 'none';
        return;
    }

    const seen = new Set();
    const suggestions = state.allClients
        .filter(client => {
            const clientFieldValue = client[fieldType]?.toLowerCase() || '';
            if (clientFieldValue.includes(value) && !seen.has(clientFieldValue)) {
                seen.add(clientFieldValue);
                return true;
            }
            return false;
        })
        .slice(0, 5);

    if (suggestions.length > 0) {
        suggestions.forEach(client => {
            const item = document.createElement('div');
            item.className = 'autosuggest-item';
            item.innerHTML = client[fieldType].replace(new RegExp(value, 'gi'), `<strong>$&</strong>`);
            item.onclick = () => {
                const fullClient = state.allClients.find(c => c.name === client.name);
                if (fullClient) {
                    document.getElementById('phone').value = fullClient.phone;
                    document.getElementById('account_name').value = fullClient.account_name;
                    // You might need to retrieve and set account_type and account_link if they exist on the client object
                }
                autosuggestBox.style.display = 'none';
            };
            autosuggestBox.appendChild(item);
        });
        autosuggestBox.style.display = 'block';
    } else {
        autosuggestBox.style.display = 'none';
    }
}

// Helper function for airline dropdown change
function handleAirlineChange() {
    const airlineSelect = document.getElementById('airline');
    const customAirlineGroup = document.getElementById('custom_airline_group');
    if (airlineSelect.value === 'CUSTOM') {
        customAirlineGroup.style.display = 'block';
    } else {
        customAirlineGroup.style.display = 'none';
    }
}
// Populate Airline Dropdown in Search
function populateSearchAirlines() {
    const airlineSelect = document.getElementById('searchAirline');
    // Convert to uppercase BEFORE creating the Set to ensure uniqueness
    const uniqueAirlines = [...new Set(state.allTickets.map(t => t.airline.toUpperCase()).filter(Boolean))];
    uniqueAirlines.sort();
    
    // Clear existing options except the first one
    while (airlineSelect.options.length > 1) {
        airlineSelect.remove(1);
    }
    
    uniqueAirlines.forEach(airline => {
        // The airline is already uppercase, so we can use it for both value and text
        airlineSelect.add(new Option(airline, airline));
    });
}

// --- SETTLEMENT LOGIC ---
async function loadSettlementData() {
    try {
        const response = await fetchFromSheet(`${CONFIG.SETTLE_SHEET_NAME}!A:G`, 'settlementData');
        if (response.values) {
            state.allSettlements = parseSettlementData(response.values);
        } else {
            state.allSettlements = [];
        }
        displaySettlements();
    } catch (error) {
        showToast(`Error loading settlement data: ${error.result?.error?.message || error}`, 'error');
        renderEmptyState('settlementTableContainer', 'fa-handshake-slash', 'Failed to load settlements', 'Could not retrieve settlement data from the sheet.');
    }
}

function parseSettlementData(values) {
    if (values.length < 1) return [];
    const headers = values[0].map(h => h.toLowerCase().replace(/\s+/g, '_'));
    return values.slice(1).map((row, i) => {
        const settlement = {};
        headers.forEach((h, j) => {
            const value = row[j] || '';
            settlement[h] = typeof value === 'string' ? value.trim() : value;
        });
        const safeParse = (val) => parseFloat(String(val).replace(/,/g, '')) || 0;
        ['amount_paid'].forEach(key => settlement[key] = safeParse(settlement[key]));
        settlement.rowIndex = i + 2;
        return settlement;
    });
}

function displaySettlements() {
    const container = document.getElementById('settlementTableContainer');
    container.innerHTML = '';

    const sortedSettlements = [...state.allSettlements].sort((a, b) => parseSheetDate(b.settlement_date) - parseSheetDate(a.settlement_date));

    if (sortedSettlements.length === 0) {
        renderEmptyState('settlementTableContainer', 'fa-handshake', 'No Settlements Yet', 'Start by adding a new settlement record.');
        setupSettlementPagination([]);
        return;
    }

    const table = document.createElement('table');
    table.innerHTML = `
        <thead>
            <tr>
                <th>Settlement Date</th>
                <th>Amount Paid</th>
                <th>Payment Method</th>
                <th>Transaction ID</th>
                <th>Status</th>
                <th>Notes</th>
            </tr>
        </thead>
        <tbody id="settlementTableBody"></tbody>
    `;
    container.appendChild(table);

    state.settlementPage = 1;
    renderSettlementPage(1, sortedSettlements);
}

function renderSettlementPage(page, settlements) {
    state.settlementPage = page;
    const tbody = document.getElementById('settlementTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const paginated = settlements.slice((page - 1) * state.rowsPerPage, page * state.rowsPerPage);

    paginated.forEach(settlement => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${settlement.settlement_date || ''}</td>
            <td>${(settlement.amount_paid || 0).toLocaleString()}</td>
            <td>${settlement.payment_method || ''}</td>
            <td>${settlement.transaction_id || 'N/A'}</td>
            <td>${settlement.status || ''}</td>
            <td>${settlement.notes || ''}</td>
        `;
    });

    setupSettlementPagination(settlements);
}

function setupSettlementPagination(items) {
    const container = document.getElementById('settlementPagination');
    container.innerHTML = '';
    const pageCount = Math.ceil(items.length / state.rowsPerPage);
    if (pageCount <= 1) return;

    const createBtn = (txt, pg, enabled = true) => {
        const btn = document.createElement('button');
        btn.className = 'pagination-btn';
        btn.innerHTML = txt;
        btn.disabled = !enabled;
        if (enabled) {
            btn.onclick = () => renderSettlementPage(pg, items);
        }
        if (pg === state.settlementPage) {
            btn.classList.add('active');
        }
        return btn;
    };

    container.append(createBtn('&laquo;', state.settlementPage - 1, state.settlementPage > 1));
    for (let i = 1; i <= pageCount; i++) {
        container.append(createBtn(i, i));
    }
    container.append(createBtn('&raquo;', state.settlementPage + 1, state.settlementPage < pageCount));
}

function showNewSettlementForm() {
    document.getElementById('settle-display-container').style.display = 'none';
    document.getElementById('settle-form-container').style.display = 'block';
}

function hideNewSettlementForm() {
    document.getElementById('settle-form-container').style.display = 'none';
    document.getElementById('settle-display-container').style.display = 'block';
    document.getElementById('newSettlementForm').reset();
}

async function handleNewSettlementSubmit(e) {
    e.preventDefault();
    if (state.isSubmitting) return;
    state.isSubmitting = true;
    const submitButton = e.target.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
        const settlementData = {
            settlement_date: document.getElementById('settlement_date').value,
            amount_paid: document.getElementById('settlement_amount_paid').value,
            payment_method: document.getElementById('settlement_payment_method').value,
            transaction_id: document.getElementById('settlement_transaction_id').value.toUpperCase(),
            notes: document.getElementById('settlement_notes').value
        };

        if (!settlementData.settlement_date || !settlementData.amount_paid) {
            throw new Error('Settlement Date and Amount Paid are required.');
        }

        // The 'values' array now includes an empty string for the 'net_amount' column (B)
        // and correctly maps the rest of the data to columns C through G.
        const values = [[
            formatDateToDDMMMYYYY(settlementData.settlement_date), // Column A: Date
            '',                                                   // Column B: net_amount (now empty)
            settlementData.amount_paid,                           // Column C: Amount Paid
            settlementData.payment_method,                        // Column D: Payment Method
            settlementData.transaction_id,                        // Column E: Transaction ID
            "Paid",                                               // Column F: Status
            settlementData.notes                                  // Column G: Notes
        ]];

        await gapi.client.sheets.spreadsheets.values.append({
            spreadsheetId: CONFIG.SHEET_ID,
            // The range has been updated to include the new 'notes' column (G).
            range: `${CONFIG.SETTLE_SHEET_NAME}!A:G`,
            valueInputOption: 'USER_ENTERED',
            resource: { values },
        });

        state.cache['settlementData'] = null;
        showToast('Settlement saved successfully!', 'success');
        hideNewSettlementForm();
        await loadSettlementData();
        updateSettlementDashboard();
    } catch (error) {
        showToast(`Error: ${error.message || 'Could not save settlement.'}`, 'error');
    } finally {
        state.isSubmitting = false;
        if (submitButton) submitButton.disabled = false;
    }
}

function updateSettlementDashboard() {
    // Revenue: Includes net amount from non-fully-refunded tickets
    const revenueTickets = state.allTickets.filter(t => !t.remarks?.toLowerCase().includes('full refund'));
    const totalRevenue = revenueTickets.reduce((sum, t) => sum + (t.net_amount || 0) + (t.date_change || 0), 0);

    // Total settlements made
    const totalAmountPaid = state.allSettlements.reduce((sum, s) => sum + (s.amount_paid || 0), 0);
    const netAmountLeft = totalRevenue - totalAmountPaid;

    const netAmountBox = document.getElementById('settlement-net-amount-box');
    netAmountBox.innerHTML = `<div class="info-card-content"><h3>Total Outstanding Revenue</h3><div class="main-value">${netAmountLeft.toLocaleString()}</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-file-invoice-dollar"></i></div>`;
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Profit: From tickets in the current month that are NOT fully refunded
    const profitTicketsThisMonth = state.allTickets.filter(t => {
        const ticketDate = parseSheetDate(t.issued_date);
        const lowerRemarks = t.remarks?.toLowerCase() || '';
        return ticketDate.getMonth() === currentMonth && ticketDate.getFullYear() === currentYear && !lowerRemarks.includes('full refund');
    });

    const commissionThisMonth = profitTicketsThisMonth.reduce((sum, t) => sum + (t.commission || 0), 0);
    const extraFareThisMonth = profitTicketsThisMonth.reduce((sum, t) => sum + (t.extra_fare || 0), 0);
    const totalProfitThisMonth = commissionThisMonth + extraFareThisMonth;
    
    // This calculation might need business logic refinement, but based on UI, it's what's displayed.
    const endOfMonthSettlement = netAmountLeft - totalProfitThisMonth;

    const monthlyDueBox = document.getElementById('settlement-monthly-due-box');
    monthlyDueBox.innerHTML = `<div class="info-card-content"><h3>End-of-Month Settlement Due</h3><div class="main-value">${endOfMonthSettlement.toLocaleString()}</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-cash-register"></i></div>`;

    const commissionBox = document.getElementById('settlement-commission-box');
    commissionBox.innerHTML = `<div class="info-card-content"><h3>Current Month's Total Profit</h3><div class="main-value">${totalProfitThisMonth.toLocaleString()}</div><span class="sub-value">MMK</span><i class="icon fa-solid fa-hand-holding-dollar"></i></div>`;
}
