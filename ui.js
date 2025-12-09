/**
 * @fileoverview Manages all UI interactions, DOM updates, and component rendering.
 */

import { CITIES, CONFIG } from './config.js';
import { state } from './state.js';
import { parseSheetDate, formatDateToDMMMY, makeClickable, parseDeadline } from './utils.js';
// We remove several incorrect imports from here to clean up dependencies.
import { renderClientsView } from './clients.js';
import { clearManageResults } from './manage.js';
import { displaySettlements, hideNewSettlementForm, updateSettlementDashboard } from './settlement.js';
import { showToast } from './utils.js';
import { displayTickets } from './tickets.js';
import { renderBookingPage } from './booking.js';


/**
 * Shows a specific view and hides others.
 * @param {string} viewName The name of the view to show (e.g., 'home', 'clients').
 */
export function showView(viewName) {
    const navBtns = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');

    navBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
    views.forEach(view => view.classList.toggle('active', view.id === `${viewName}-view`));

    // View-specific cleanup and setup
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
    }
}

/**
 * Opens the main modal with specified content.
 * @param {string} content The HTML content to display in the modal.
 * @param {string} [sizeClass=''] An optional class for sizing (e.g., 'large-modal').
 */
export function openModal(content, sizeClass = '') {
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modalBody');
    modalBody.innerHTML = content;
    const modalContent = modal.querySelector('.modal-content');
    modalContent.className = 'modal-content glass-card'; // Reset classes
    if (sizeClass) {
        modalContent.classList.add(sizeClass);
    }
    modal.classList.add('show');
    document.body.classList.add('modal-open');
}

/**
 * Closes the main modal.
 */
export function closeModal() {
    const modal = document.getElementById('modal');
    modal.classList.remove('show');
    document.getElementById('modalBody').innerHTML = '';
    document.body.classList.remove('modal-open');
}

/**
 * Shows a confirmation modal.
 * @param {string} message The message to display.
 * @param {Function} onConfirm The callback function to execute on confirmation.
 */
export function showConfirmModal(message, onConfirm) {
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

/**
 * Initializes all datepicker instances on the page.
 */
export function initializeDatepickers() {
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
    const allDatePickers = ['searchStartDate', 'searchEndDate', 'searchTravelDate', 'booking_departing_on', 'exportStartDate', 'exportEndDate', 'issued_date', 'departing_on', 'paid_date', 'booking_end_date', 'update_departing_on', 'update_paid_date'];
    allDatePickers.forEach(id => {
        const el = document.getElementById(id);
        if (el) new Datepicker(el, defaultOptions);
    });

    const settlementDatePicker = document.getElementById('settlement_date');
    if (settlementDatePicker) new Datepicker(settlementDatePicker, settlementOptions);
}

/**
 * Populates the time picker dropdowns for booking end time.
 */
export function initializeTimePicker() {
    const hourSelect = document.getElementById('booking_end_time_hour');
    const minuteSelect = document.getElementById('booking_end_time_minute');

    for (let i = 1; i <= 12; i++) {
        hourSelect.add(new Option(String(i).padStart(2, '0'), i));
    }
    for (let i = 0; i < 60; i += 5) {
        minuteSelect.add(new Option(String(i).padStart(2, '0'), i));
    }
}


/**
 * Populates a select dropdown with city options.
 * @param {HTMLSelectElement} selectElement The select element to populate.
 * @param {string[]} locations An array of location strings.
 */
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

/**
 * Initializes all city dropdowns with a comprehensive list of locations.
 */
export function initializeCityDropdowns() {
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

/**
 * Populates the flight location dropdowns based on the flight type (Domestic/International).
 */
export function populateFlightLocations() {
    const flightTypeToggle = document.getElementById('flightTypeToggle');
    const isDomestic = !flightTypeToggle.checked;
    const locations = isDomestic ? CITIES.DOMESTIC : CITIES.INTERNATIONAL;

    const departureSelect = document.getElementById('departure');
    const destinationSelect = document.getElementById('destination');

    populateCitySelect(departureSelect, locations.sort());
    populateCitySelect(destinationSelect, locations.sort());
}

/**
 * Updates the labels for the Domestic/International toggle switch.
 */
export function updateToggleLabels() {
    const flightTypeToggle = document.getElementById('flightTypeToggle');
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

/**
 * Dynamically updates countdown timers in notifications.
 */
export function updateDynamicTimes() {
    const timeElements = document.querySelectorAll('.dynamic-time');
    timeElements.forEach(el => {
        const deadline = parseInt(el.dataset.deadline, 10);
        if (isNaN(deadline)) return;

        const now = Date.now();
        const timeLeftMs = deadline - now;

        if (timeLeftMs <= 0) {
            el.closest('.notification-item')?.remove();
            const notificationList = document.getElementById('notification-list');
            if (notificationList && notificationList.children.length === 0) {
                notificationList.innerHTML = '<div class="notification-item empty"><i class="fa-solid fa-check-circle"></i> No new notifications.</div>';
                const header = document.querySelector('.notification-panel h3');
                if (header) header.innerHTML = `<i class="fa-solid fa-bell"></i> Notifications`;
            }
        } else {
            const timeLeftMinutes = Math.round(timeLeftMs / 60000);
            const hours = Math.floor(timeLeftMinutes / 60);
            const minutes = timeLeftMinutes % 60;
            el.textContent = `~${hours}h ${minutes}m remaining`;
        }
    });
}

/**
 * Updates the notification panel with approaching deadlines and unpaid tickets.
 */
export function updateNotifications() {
    const notificationList = document.getElementById('notification-list');
    notificationList.innerHTML = '';
    let notifications = [];
    const notificationTitleLink = document.getElementById('notification-title-link');
    const header = notificationTitleLink.querySelector('h3');

    // Near deadline bookings
    const now = new Date();
    const deadlineThreshold = 6 * 60 * 60 * 1000; // 6 hours

    const nearDeadlineBookings = state.allBookings.filter(b => {
        const deadline = parseDeadline(b.enddate, b.endtime);
        const hasNoAction = !b.remark || String(b.remark).trim() === '';
        return deadline && hasNoAction && (deadline.getTime() - now.getTime()) < deadlineThreshold && deadline.getTime() > now.getTime();
    });

    nearDeadlineBookings.forEach(b => {
        const deadline = parseDeadline(b.enddate, b.endtime);
        const timeLeft = Math.round((deadline.getTime() - now.getTime()) / (1000 * 60)); // in minutes
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

    // Sort notifications
    notifications.sort((a, b) => {
        if (a.type === 'deadline' && b.type !== 'deadline') return -1;
        if (a.type !== 'deadline' && b.type === 'deadline') return 1;
        if (a.type === 'deadline' && b.type === 'deadline') {
            return a.deadlineTime - b.deadlineTime;
        }
        return 0;
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

/**
 * Displays the full notification center in a modal.
 */
export function showNotificationModal() {
    let modalContent = `
        <div class="notification-modal-header">
            <h2><i class="fa-solid fa-bell"></i> Notification Center</h2>
        </div>
        <div class="notification-modal-list">
    `;
    let notificationCount = 0;
    const now = new Date();
    const deadlineThreshold = 6 * 60 * 60 * 1000;

    const nearDeadlineBookings = state.allBookings.filter(b => {
        const deadline = parseDeadline(b.enddate, b.endtime);
        const hasNoAction = !b.remark || String(b.remark).trim() === '';
        return deadline && hasNoAction && (deadline.getTime() - now.getTime()) < deadlineThreshold && deadline.getTime() > now.getTime();
    });

    const groupedDeadlineBookings = Object.values(nearDeadlineBookings.reduce((acc, booking) => {
        if (!acc[booking.groupId]) {
            acc[booking.groupId] = { ...booking,
                passengers: []
            };
        }
        acc[booking.groupId].passengers.push(booking.name);
        return acc;
    }, {})).sort((a, b) => parseDeadline(a.enddate, a.endtime) - parseDeadline(b.enddate, b.endtime));

    if (groupedDeadlineBookings.length > 0) {
        notificationCount += groupedDeadlineBookings.length;
        modalContent += '<h3 class="notification-group-title"><i class="fa-solid fa-clock"></i>Approaching Deadlines</h3>';
        groupedDeadlineBookings.forEach(group => {
            const deadline = parseDeadline(group.enddate, group.endtime);
            const timeLeft = Math.round((deadline.getTime() - now.getTime()) / (1000 * 60));
            const passengerCount = group.passengers.length;
            const title = `${group.passengers[0]}${passengerCount > 1 ? ` (+${passengerCount - 1})` : ''}`;

            modalContent += `
                <div class="notification-modal-item deadline">
                    <div class="notification-icon"><i class="fa-solid fa-clock"></i></div>
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

    const unpaidTickets = state.allTickets.filter(t => !t.paid);
    const groupedUnpaidTickets = Object.values(unpaidTickets.reduce((acc, ticket) => {
        const groupId = ticket.booking_reference;
        if (!groupId) return acc;
        if (!acc[groupId]) {
            acc[groupId] = { ...ticket,
                passengers: [],
                total_net: 0
            };
        }
        acc[groupId].passengers.push(ticket.name);
        acc[groupId].total_net += (ticket.net_amount || 0) + (ticket.extra_fare || 0);
        return acc;
    }, {})).sort((a, b) => parseSheetDate(a.issued_date) - parseSheetDate(b.issued_date));


    if (groupedUnpaidTickets.length > 0) {
        notificationCount += groupedUnpaidTickets.length;
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
            <button class="btn btn-secondary">Close</button>
        </div>
    `;

    openModal(modalContent, 'large-modal');
    const modalContentEl = document.getElementById('modal').querySelector('.modal-content');
    if (modalContentEl) {
        modalContentEl.classList.add('notification-modal-content');
    }
    document.querySelector('.notification-modal-list + .form-actions .btn-secondary').addEventListener('click', closeModal);
}

/**
 * Shows the form for creating a new booking request.
 */
export function showNewBookingForm() {
    document.getElementById('booking-display-container').style.display = 'none';
    document.getElementById('booking-form-container').style.display = 'block';
}

/**
 * Hides the form for creating a new booking request.
 */
export function hideNewBookingForm() {
    document.getElementById('booking-form-container').style.display = 'none';
    document.getElementById('booking-display-container').style.display = 'block';
    document.getElementById('newBookingForm').reset();
}

/**
 * Resets the passenger forms in the 'Sell Ticket' view to a single default form.
 */
export function resetPassengerForms() {
    const container = document.getElementById('passenger-forms-container');
    if (!container) return;
    container.innerHTML = ''; // Clear existing forms
    addPassengerForm(); // Add the first form
    document.getElementById('removePassengerBtn').style.display = 'none';
}

/**
 * Adds a new passenger form to the 'Sell Ticket' view.
 * @param {string} [name=''] Optional name to pre-fill.
 * @param {string} [idNo=''] Optional ID number to pre-fill.
 * @param {string} [gender='MR'] Optional gender to pre-fill.
 */
export function addPassengerForm(name = '', idNo = '', gender = 'MR') {
    const container = document.getElementById('passenger-forms-container');
    if (!container) return;

    const formCount = container.children.length;
    const newForm = document.createElement('div');
    newForm.className = 'passenger-form';
    newForm.innerHTML = `
        ${formCount > 0 ? '<hr style="border-color: rgba(255,255,255,0.2); margin: 1.5rem 0;">' : ''}
        <h4>Passenger ${formCount + 1}</h4>
        <div class="form-grid">
            <div class="passenger-name-group">
                <div class="form-group">
                    <label>Gender</label>
                    <select class="passenger-gender">
                        <option value="MR" ${gender === 'MR' ? 'selected' : ''}>MR</option>
                        <option value="MS" ${gender === 'MS' ? 'selected' : ''}>MS</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Full Name</label>
                    <input type="text" class="passenger-name" placeholder="PASSENGER FULL NAME" value="${name.toUpperCase()}" required>
                </div>
            </div>
            <div class="form-group">
                <label>NRC / Passport No.</label>
                <input type="text" class="passenger-id" placeholder="ID NUMBER" value="${idNo.toUpperCase()}">
            </div>
            <div class="form-group">
                <label>Base Fare</label>
                <input type="number" class="passenger-base-fare" placeholder="0">
            </div>
            <div class="form-group">
                <label>Net Amount</label>
                <input type="number" class="passenger-net-amount" placeholder="0" required>
            </div>
            <div class="form-group">
                <label>Extra Fare</label>
                <input type="number" class="passenger-extra-fare" placeholder="0">
            </div>
            <div class="form-group">
                <label>Commission</label>
                <input type="number" class="passenger-commission" placeholder="0">
            </div>
            <div class="form-group">
                <label>Remarks</label>
                <input type="text" class="passenger-remarks" placeholder="Optional notes">
            </div>
        </div>
    `;
    container.appendChild(newForm);

    const removeBtn = document.getElementById('removePassengerBtn');
    if (container.children.length > 1) {
        removeBtn.style.display = 'inline-flex';
    } else {
        removeBtn.style.display = 'none';
    }
}

/**
 * Removes the last passenger form from the 'Sell Ticket' view.
 */
export function removePassengerForm() {
    const container = document.getElementById('passenger-forms-container');
    if (container && container.children.length > 1) {
        container.removeChild(container.lastChild);
    }

    const removeBtn = document.getElementById('removePassengerBtn');
    if (container && container.children.length <= 1) {
        removeBtn.style.display = 'none';
    }
}

/**
 * Sets up pagination controls for a given dataset using a sliding window style.
 * @param {Array<any>} data The full dataset to paginate.
 * @param {string} containerId The ID of the pagination container element.
 * @param {Function} renderPageFn The function to call to render a specific page.
 * @param {number} currentPage The currently active page.
 */
export function setupGenericPagination(data, containerId, renderPageFn, currentPage) {
    const paginationContainer = document.getElementById(containerId);
    if (!paginationContainer) return;
    paginationContainer.innerHTML = '';
    const pageCount = Math.ceil(data.length / state.rowsPerPage);

    if (pageCount <= 1) return;

    const createBtn = (txt, pg, enabled = true) => {
        const btn = document.createElement('button');
        btn.className = 'pagination-btn';
        btn.innerHTML = txt;
        btn.disabled = !enabled;
        if (enabled) {
            btn.onclick = () => renderPageFn(pg);
        }
        if (pg === currentPage) {
            btn.classList.add('active');
        }
        return btn;
    };

    paginationContainer.append(createBtn('&laquo;', 1, currentPage > 1));

    // --- SLIDING WINDOW LOGIC (Like Client Directory) ---
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(pageCount, startPage + maxPagesToShow - 1);

    if (endPage - startPage + 1 < maxPagesToShow) {
        startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    if (startPage > 1) {
        paginationContainer.append(createBtn('...', startPage - 1));
    }

    for (let i = startPage; i <= endPage; i++) {
        paginationContainer.append(createBtn(i, i));
    }

    if (endPage < pageCount) {
        paginationContainer.append(createBtn('...', endPage + 1));
    }
    // --------------------------------

    paginationContainer.append(createBtn('&raquo;', pageCount, currentPage < pageCount));
}


/**
 * Sets up pagination for the main ticket search results.
 * @param {Array<Object>} tickets The array of tickets to paginate.
 */
export function setupPagination(tickets = state.filteredTickets) {
    setupGenericPagination(tickets, 'pagination', (page) => displayTickets(tickets, page), state.currentPage);
}

/**
 * Sets up pagination for the booking requests view.
 * @param {Array<Object>} bookings The array of bookings to paginate.
 */
export function setupBookingPagination(bookings = state.filteredBookings) {
    setupGenericPagination(bookings, 'bookingPagination', renderBookingPage, state.bookingCurrentPage);
}


/**
 * Sets up pagination for the settlement records view.
 * @param {Array<Object>} settlements The array of settlements to paginate.
 */
export function setupSettlementPagination(settlements) {
    const { renderSettlementPage } =
    import ('./settlement.js');
    setupGenericPagination(settlements, 'settlementPagination', (page) => renderSettlementPage(page, settlements), state.settlementPage);
}

/**
 * Resets the passenger forms in the 'New Booking' view.
 */
export function resetBookingPassengerForms() {
    const container = document.getElementById('booking-passenger-forms-container');
    if (!container) return;
    container.innerHTML = '';
    addBookingPassengerForm();
    document.getElementById('removeBookingPassengerBtn').style.display = 'none';
}

/**
 * Adds a new passenger form to the 'New Booking' view.
 */
export function addBookingPassengerForm() {
    const container = document.getElementById('booking-passenger-forms-container');
    if (!container) return;
    const formCount = container.children.length;
    const newForm = document.createElement('div');
    newForm.className = 'passenger-form';
    newForm.innerHTML = `
        ${formCount > 0 ? '<hr style="border-color: rgba(255,255,255,0.2); margin: 1.5rem 0;">' : ''}
        <h4>Passenger ${formCount + 1}</h4>
        <div class="booking-passenger-grid">
            <div class="form-group">
                <label>Gender</label>
                <select class="booking-passenger-gender">
                    <option value="MR" selected>MR</option>
                    <option value="MS">MS</option>
                </select>
            </div>
            <div class="form-group">
                <label>Full Name</label>
                <input type="text" class="booking-passenger-name" placeholder="PASSENGER FULL NAME" required>
            </div>
            <div class="form-group">
                <label>NRC / Passport No.</label>
                <input type="text" class="booking-passenger-id" placeholder="ID NUMBER">
            </div>
        </div>
    `;
    container.appendChild(newForm);
    const removeBtn = document.getElementById('removeBookingPassengerBtn');
    if (container.children.length > 1) {
        removeBtn.style.display = 'inline-flex';
    } else {
        removeBtn.style.display = 'none';
    }
}

/**
 * Removes the last passenger form from the 'New Booking' view.
 */
export function removeBookingPassengerForm() {
    const container = document.getElementById('booking-passenger-forms-container');
    if (container.children.length > 1) {
        container.removeChild(container.lastChild);
    }
    const removeBtn = document.getElementById('removeBookingPassengerBtn');
    if (container.children.length <= 1) {
        removeBtn.style.display = 'none';
    }
}

/**
 * Initializes UI settings from local storage and sets up event listeners.
 */
export function initializeUISettings() {
    // --- Get all UI elements ---
    const themeToggle = document.getElementById('theme-toggle');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const backgroundUploader = document.getElementById('background-uploader');
    const glassSettings = document.getElementById('glass-settings-container');
    const backgroundResetBtn = document.getElementById('background-reset-btn');
    const resetSettingsBtn = document.getElementById('reset-settings-btn');

    // Glass effect sliders
    const opacitySlider = document.getElementById('opacity-slider');
    const opacityValue = document.getElementById('opacity-value');
    const blurSlider = document.getElementById('blur-slider');
    const blurValue = document.getElementById('blur-value');
    const overlaySlider = document.getElementById('overlay-slider');
    const overlayValue = document.getElementById('overlay-value');
    const glassSlider = document.getElementById('glass-slider');
    const glassValue = document.getElementById('glass-value');
    const glassTextToggle = document.getElementById('glass-text-toggle');

    // Commission slider
    const agentCutSlider = document.getElementById('agent-cut-slider');
    const agentCutValue = document.getElementById('agent-cut-value');

    // --- Define default settings ---
    const defaultSettings = {
        opacity: 0.05,
        blur: 20,
        overlay: 0.5,
        glassBorder: 0.15,
        darkText: false,
        agentCut: 60
    };

    let currentSettings = { ...defaultSettings };

    // --- Core Functions ---
    const saveSettings = () => {
        localStorage.setItem('uiCustomSettings', JSON.stringify(currentSettings));
    };

    const applySettings = (settings) => {
        // Apply glass effect styles via CSS variables
        document.documentElement.style.setProperty('--glass-bg', `rgba(255, 255, 255, ${settings.opacity})`);
        document.documentElement.style.setProperty('--blur-amount', `${settings.blur}px`);
        document.documentElement.style.setProperty('--overlay-opacity', settings.overlay);
        document.documentElement.style.setProperty('--liquid-border', `1px solid rgba(255, 255, 255, ${settings.glassBorder})`);

        // Apply dark text class for glass mode
        document.body.classList.toggle('dark-text-theme', settings.darkText);

        // Update agent cut in global state for calculations
        state.commissionRates.cut = settings.agentCut / 100;

        // Update UI controls to reflect the new values
        opacitySlider.value = settings.opacity;
        opacityValue.textContent = Number(settings.opacity).toFixed(2);
        blurSlider.value = settings.blur;
        blurValue.textContent = settings.blur;
        overlaySlider.value = settings.overlay;
        overlayValue.textContent = Number(settings.overlay).toFixed(2);
        glassSlider.value = settings.glassBorder;
        glassValue.textContent = Number(settings.glassBorder).toFixed(2);
        glassTextToggle.checked = settings.darkText;
        agentCutSlider.value = settings.agentCut;
        agentCutValue.textContent = `${settings.agentCut}%`;
    };

    const loadSettings = () => {
        const saved = JSON.parse(localStorage.getItem('uiCustomSettings'));
        currentSettings = { ...defaultSettings, ...saved };
        applySettings(currentSettings);
    };

    const renderBackground = () => {
        const isMaterial = document.body.classList.contains('material-theme');
        const savedBackground = localStorage.getItem('backgroundImage');

        if (isMaterial) {
            document.body.style.backgroundImage = 'none';
        } else {
            if (savedBackground) {
                document.body.style.backgroundImage = `url(${savedBackground})`;
            } else {
                document.body.style.removeProperty('background-image');
            }
        }
    };

    const updateUIState = (isMaterial) => {
        glassSettings.style.display = isMaterial ? 'none' : 'block';
    };

    const applyTheme = (isMaterial) => {
        document.body.classList.add('theme-transitioning');
        document.body.classList.toggle('material-theme', isMaterial);
        updateUIState(isMaterial);
        renderBackground();
        setTimeout(() => {
            document.body.classList.remove('theme-transitioning');
            document.body.dispatchEvent(new CustomEvent('themeChanged')); // Fire event
        }, 100);
    };

    // --- Event Listeners ---
    themeToggle.addEventListener('change', (e) => {
        const isMaterial = e.target.checked;
        applyTheme(isMaterial);
        localStorage.setItem('theme', isMaterial ? 'material' : 'glass');
    });

    darkModeToggle.addEventListener('change', (e) => {
        const isDark = e.target.checked;
        document.body.classList.toggle('dark-theme', isDark);
        localStorage.setItem('darkMode', isDark);
        document.body.dispatchEvent(new CustomEvent('themeChanged')); // Fire event
    });

    backgroundUploader.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            // Increase the size limit to 4.5MB, which is safer for a 5MB quota
            if (file.size > 4.5 * 1024 * 1024) {
                showToast('Image is too large. Please choose a file smaller than 4.5MB.', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                const bgData = event.target.result;
                try {
                    // Clear the old item first to make space.
                    localStorage.removeItem('backgroundImage');
                    localStorage.setItem('backgroundImage', bgData);
                    renderBackground();
                } catch (error) {
                    if (error.name === 'QuotaExceededError') {
                        showToast('Browser storage is full. This image is too large even after clearing the old one.', 'error');
                    } else {
                        showToast('An error occurred while saving the background.', 'error');
                    }
                }
            };
            reader.readAsDataURL(file);
        }
    });


    backgroundResetBtn.addEventListener('click', () => {
        localStorage.removeItem('backgroundImage');
        renderBackground();
    });

    opacitySlider.addEventListener('input', (e) => { currentSettings.opacity = e.target.value; applySettings(currentSettings); saveSettings(); });
    blurSlider.addEventListener('input', (e) => { currentSettings.blur = e.target.value; applySettings(currentSettings); saveSettings(); });
    overlaySlider.addEventListener('input', (e) => { currentSettings.overlay = e.target.value; applySettings(currentSettings); saveSettings(); });
    glassSlider.addEventListener('input', (e) => { currentSettings.glassBorder = e.target.value; applySettings(currentSettings); saveSettings(); });
    glassTextToggle.addEventListener('change', (e) => { currentSettings.darkText = e.target.checked; applySettings(currentSettings); saveSettings(); });
    agentCutSlider.addEventListener('input', (e) => { currentSettings.agentCut = e.target.value; applySettings(currentSettings); saveSettings(); });

    resetSettingsBtn.addEventListener('click', () => {
        currentSettings = { ...defaultSettings };
        localStorage.removeItem('uiCustomSettings');
        applySettings(currentSettings);
    });

    // --- Initial Load & Render ---
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'material') {
        themeToggle.checked = true;
    }
    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode === 'true') {
        darkModeToggle.checked = true;
        document.body.classList.add('dark-theme');
    }

    loadSettings();
    applyTheme(themeToggle.checked);
}


/**
 * Handles validation for departure/destination selects to prevent them from being the same.
 * @param {Event} e The change event from a select element.
 */
export function handleRouteValidation(e) {
    const dep = document.getElementById('departure');
    const dest = document.getElementById('destination');
    const changed = e.target;
    const other = changed === dep ? dest : dep;

    if (dep.value && dep.value === dest.value) {
        other.value = '';
    }
}
