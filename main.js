/**
 * @fileoverview Main entry point for the Ocean Air Ticket Management application.
 * Initializes the application, sets up event listeners, and coordinates modules.
 */

// Core Modules
import { loadGapiClient, loadGisClient, handleAuthClick } from './auth.js';
import { state, getAuth } from './state.js';
import { showToast, parseSheetDate, debounce } from './utils.js';

// Feature Modules
import { loadTicketData, performSearch, clearSearch, setDateRangePreset, handleSellTicket, handleAirlineChange, populateSearchAirlines } from './tickets.js';
import { loadBookingData, handleNewBookingSubmit, performBookingSearch, clearBookingSearch } from './booking.js';
import { loadHistory } from './history.js';
import { loadSettlementData, showNewSettlementForm, hideNewSettlementForm, handleNewSettlementSubmit, updateSettlementDashboard } from './settlement.js';
import { buildClientList, renderClientsView, loadFeaturedClients } from './clients.js';
import { findTicketForManage, clearManageResults } from './manage.js';
import { exportToPdf, exportPrivateReportToPdf, togglePrivateReportButton } from './reports.js';

// UI Modules
import { showView, initializeDatepickers, initializeTimePicker, initializeCityDropdowns, updateToggleLabels, updateDynamicTimes, updateNotifications, initializeUISettings, closeModal, populateFlightLocations, addPassengerForm, removePassengerForm, resetPassengerForms, addBookingPassengerForm, removeBookingPassengerForm, resetBookingPassengerForms, showNewBookingForm, hideNewBookingForm } from './ui.js';

/**
 * Main application initialization function. Called after authentication.
 * @export
 */
export async function initializeApp() {
    try {
        loadFeaturedClients(); // Load this from local storage first
        // Load initial data from sheets
        await Promise.all([
            loadTicketData(),
            loadBookingData(),
            loadHistory(),
            loadSettlementData()
        ]);

        // Build derived data
        buildClientList();
        renderClientsView(); // Initial render for the clients view

        // Populate UI elements that depend on data
        initializeDashboardSelectors();


        // Start dynamic updates
        if (state.timeUpdateInterval) clearInterval(state.timeUpdateInterval);
        state.timeUpdateInterval = setInterval(updateDynamicTimes, 60000); // Update every minute
        updateDynamicTimes(); // Run once immediately

        // Set up a token refresh interval
        setInterval(() => {
            console.log("Refreshing access token automatically...");
            const { tokenClient } = getAuth();
            if (tokenClient) {
                tokenClient.requestAccessToken({ prompt: '' });
            }
        }, 2700000); // 45 minutes

    } catch (error) {
        console.error("Initialization failed:", error);
        showToast('A critical error occurred during data initialization. Please check the console (F12) for details.', 'error');
    }
}

/**
 * Sets up all event listeners for the application.
 */
function setupEventListeners() {
    // Navigation & Settings
    document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', (e) => showView(e.currentTarget.dataset.view)));
    document.getElementById('authorize_button').addEventListener('click', handleAuthClick);
    document.getElementById('settings-btn').addEventListener('click', () => document.getElementById('settings-panel').classList.toggle('show'));
    document.getElementById('background-upload-btn').addEventListener('click', () => document.getElementById('background-uploader').click());
   

    // Dashboard Search
    document.getElementById('searchName').addEventListener('input', () => debounce(performSearch, 300));
    document.getElementById('searchBooking').addEventListener('input', () => debounce(performSearch, 300));
    ['searchTravelDate', 'searchStartDate', 'searchEndDate', 'searchDeparture', 'searchDestination', 'searchAirline', 'searchNotPaidToggle'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', performSearch);
    });
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('clearBtn').addEventListener('click', clearSearch);
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            setDateRangePreset(e.target.dataset.range);
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Reports
    document.getElementById('exportPdfBtn').addEventListener('click', () => document.getElementById('exportConfirmModal').classList.add('show'));
    document.getElementById('confirmExportBtn').addEventListener('click', exportToPdf);
    document.getElementById('exportPrivateReportBtn').addEventListener('click', exportPrivateReportToPdf);
    document.getElementById('searchStartDate').addEventListener('change', togglePrivateReportButton);
    document.getElementById('searchEndDate').addEventListener('change', togglePrivateReportButton);
    document.querySelectorAll('input[name="exportType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('exportDateRange').style.display = e.target.value === 'range' ? 'block' : 'none';
        });
    });


    // Dashboard
    document.getElementById('dashboard-month').addEventListener('change', updateDashboardData);
    document.getElementById('dashboard-year').addEventListener('change', updateDashboardData);

    // Sell Ticket Form
    document.getElementById('sellForm').addEventListener('submit', handleSellTicket);
    document.getElementById('airline').addEventListener('change', handleAirlineChange);
    document.getElementById('flightTypeToggle').addEventListener('change', () => {
        populateFlightLocations();
        updateToggleLabels();
    });
    document.getElementById('addPassengerBtn').addEventListener('click', addPassengerForm);
    document.getElementById('removePassengerBtn').addEventListener('click', removePassengerForm);


    // Manage Ticket
    document.getElementById('findTicketBtn').addEventListener('click', () => findTicketForManage());
    document.getElementById('clearManageBtn').addEventListener('click', clearManageResults);
    document.getElementById('managePnr').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') document.getElementById('findTicketBtn').click();
    });

    // Booking
    document.getElementById('newBookingBtn').addEventListener('click', showNewBookingForm);
    document.getElementById('cancelNewBookingBtn').addEventListener('click', hideNewBookingForm);
    document.getElementById('newBookingForm').addEventListener('submit', handleNewBookingSubmit);
    document.getElementById('addBookingPassengerBtn').addEventListener('click', addBookingPassengerForm);
    document.getElementById('removeBookingPassengerBtn').addEventListener('click', removeBookingPassengerForm);
    document.getElementById('bookingSearchBtn').addEventListener('click', performBookingSearch);
    document.getElementById('bookingClearBtn').addEventListener('click', clearBookingSearch);

    // Settlement
    document.getElementById('newSettlementBtn').addEventListener('click', showNewSettlementForm);
    document.getElementById('cancelNewSettlementBtn').addEventListener('click', hideNewSettlementForm);
    document.getElementById('newSettlementForm').addEventListener('submit', handleNewSettlementSubmit);


    // Global listeners
    window.addEventListener('click', (event) => {
        if (event.target == document.getElementById('modal')) closeModal();
        if (event.target == document.getElementById('exportConfirmModal')) document.getElementById('exportConfirmModal').classList.remove('show');
        const settingsPanel = document.getElementById('settings-panel');
        if (!settingsPanel.contains(event.target) && event.target !== document.getElementById('settings-btn') && !document.getElementById('settings-btn').contains(event.target) ) {
            settingsPanel.classList.remove('show');
        }
    });
}

/**
 * Initializes dashboard-specific UI elements like date selectors.
 */
function initializeDashboardSelectors() {
    const monthSelector = document.getElementById('dashboard-month');
    const yearSelector = document.getElementById('dashboard-year');

    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    monthSelector.innerHTML = months.map((m, i) => `<option value="${i}">${m}</option>`).join('');

    const years = [...new Set(state.allTickets.map(t => parseSheetDate(t.issued_date).getFullYear()))].filter(Boolean).sort((a, b) => b - a);
    if (years.length === 0) years.push(new Date().getFullYear());
    yearSelector.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');

    const now = new Date();
    monthSelector.value = now.getMonth();
    yearSelector.value = now.getFullYear();

    updateDashboardData();
}

/**
 * Updates the main dashboard cards with the latest data.
 */
export function updateDashboardData() {
    const selectedMonth = parseInt(document.getElementById('dashboard-month').value);
    const selectedYear = parseInt(document.getElementById('dashboard-year').value);

    if (isNaN(selectedMonth) || isNaN(selectedYear)) return;

    const ticketsInPeriod = state.allTickets.filter(t => {
        const ticketDate = parseSheetDate(t.issued_date);
        return ticketDate.getMonth() === selectedMonth && ticketDate.getFullYear() === selectedYear;
    });

    document.getElementById('total-tickets-value').textContent = ticketsInPeriod.length;
    const revenueTickets = ticketsInPeriod.filter(t => !t.remarks?.toLowerCase().includes('full refund'));
    const totalRevenue = revenueTickets.reduce((sum, t) => sum + (t.net_amount || 0) + (t.date_change || 0), 0);
    const revenueBox = document.getElementById('monthly-revenue-box');
    revenueBox.querySelector('.main-value').textContent = totalRevenue.toLocaleString();

    const totalCommission = revenueTickets.reduce((sum, t) => sum + (t.commission || 0), 0);
    const commissionBox = document.getElementById('monthly-commission-box');
    commissionBox.querySelector('.main-value').textContent = totalCommission.toLocaleString();

    const totalExtraFare = revenueTickets.reduce((sum, t) => sum + (t.extra_fare || 0), 0);
    const extraFareBox = document.getElementById('monthly-extra-fare-box');
    extraFareBox.querySelector('.main-value').textContent = totalExtraFare.toLocaleString();

    updateNotifications();
    updateSettlementDashboard();
}


// --- APP START ---
window.onload = async () => {
    // Initialize UI components that don't depend on data
    initializeDatepickers();
    initializeTimePicker();
    setupEventListeners();
    initializeUISettings();
    initializeCityDropdowns();
    updateToggleLabels();
    resetPassengerForms();
    resetBookingPassengerForms();

    if (typeof gapi === 'undefined' || typeof google === 'undefined') {
        showToast('Google API scripts not loaded.', 'error');
        return;
    }
    try {
        await Promise.all([loadGapiClient(), loadGisClient()]);
    } catch (error) {
        showToast('Failed to load Google APIs. Please refresh.', 'error');
        document.getElementById('authorize_button').style.display = 'block';
        document.getElementById('loading').style.display = 'none';
    }
};
