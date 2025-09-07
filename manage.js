/**
 * @fileoverview Manages ticket modification and cancellation logic.
 */

import {
    CONFIG
} from './config.js';
import {
    state
} from './state.js';
import {
    batchUpdateSheet,
    updateSheet
} from './api.js';
import {
    showToast,
    parseSheetDate,
    renderEmptyState,
    formatDateForSheet,
    formatDateToDMMMY
} from './utils.js';
import {
    openModal,
    closeModal,
    showConfirmModal
} from './ui.js';
import {
    saveHistory,
    displayHistory
} from './history.js';
// Static imports that created the circular dependency have been removed.

/**
 * Finds tickets by PNR and displays them in the manage view.
 * @param {string|null} [pnrFromClick=null] Optional PNR passed from a button click.
 */
export function findTicketForManage(pnrFromClick = null) {
    const pnrInput = document.getElementById('managePnr');
    const pnr = pnrFromClick || pnrInput.value.toUpperCase();
    if (!pnr) {
        showToast('Please enter a PNR code.', 'error');
        return;
    }

    if (pnrFromClick) {
        pnrInput.value = pnr;
    }

    const found = state.allTickets.filter(t => t.booking_reference === pnr);
    displayManageResults(found);

    const pnrHistory = state.history.filter(entry => entry.pnr === pnr);
    displayHistory(1, pnrHistory);
}

/**
 * Clears the manage ticket view results and resets the input.
 */
export function clearManageResults() {
    document.getElementById('managePnr').value = '';
    document.getElementById('manageResultsContainer').innerHTML = '';
    displayHistory(1, state.history); // Reset to show all history
}

/**
 * Displays the tickets found for a specific PNR.
 * @param {Array<Object>} tickets The tickets to display.
 */
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
            actionButton = `<button class="btn btn-secondary" disabled>Refunded</button>`;
        } else {
            actionButton = `<button class="btn btn-primary manage-btn" data-row-index="${t.rowIndex}">Manage</button>`;
        }
        html += `<tr><td>${t.name}</td><td>${t.departure.split(' ')[0]}→${t.destination.split(' ')[0]}</td><td>${t.departing_on}</td><td>${actionButton}</td></tr>`;
    });
    container.innerHTML = html + '</tbody></table></div>';

    // Add event listeners after rendering
    container.querySelectorAll('.manage-btn').forEach(btn => {
        btn.addEventListener('click', (e) => openManageModal(parseInt(e.currentTarget.dataset.rowIndex)));
    });
}

/**
 * Opens the modal for managing a specific ticket.
 * @param {number} rowIndex The row index of the ticket.
 */
function openManageModal(rowIndex) {
    const ticket = state.allTickets.find(t => t.rowIndex === rowIndex);
    if (!ticket) {
        showToast('Ticket not found.', 'error');
        return;
    }

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

    const content = `
        <h2>Manage Ticket: ${ticket.name}</h2>
        <form id="updateForm" data-pnr="${ticket.booking_reference}" data-master-row-index="${rowIndex}">
            <h4>Modify Details</h4>
            <div class="form-grid" style="margin-top: 1rem;">
                <div class="form-group"><label>New Travel Date (for all in PNR)</label><input type="text" id="update_departing_on" placeholder="MM/DD/YYYY" value="${travelDateForInput}" ${isPast ? 'disabled' : ''}></div>
                <div class="form-group"><label>New Base Fare</label><input type="number" id="update_base_fare" placeholder="${(ticket.base_fare||0).toLocaleString()}"></div>
                <div class="form-group"><label>New Net Amount</label><input type="number" id="update_net_amount" placeholder="${(ticket.net_amount||0).toLocaleString()}"></div>
                <div class="form-group"><label>New Commission</label><input type="number" id="update_commission" placeholder="${(ticket.commission||0).toLocaleString()}"></div>
                <div class="form-group"><label>Date Change Fees</label><input type="number" id="date_change_fees"></div>
                <div class="form-group"><label>Extra Fare (Adds to existing)</label><input type="number" id="update_extra_fare"></div>
            </div>
            ${!ticket.paid ? `
            <hr style="border-color: rgba(255,255,255,0.2); margin: 1.5rem 0;">
            <h4>Update Payment Status</h4>
            <div class="form-grid" style="margin-top: 1rem;">
                <div class="form-group checkbox-group" style="padding-top: 1.5rem;"><label for="update_paid">Mark as Paid</label><input type="checkbox" id="update_paid" name="update_paid" style="width: 20px; height: 20px; -webkit-appearance: checkbox; appearance: checkbox;"></div>
                <div class="form-group"><label for="update_payment_method">Payment Method</label><select id="update_payment_method" name="update_payment_method"><option value="">Select</option><option value="KBZ Pay">KBZ Pay</option><option value="Mobile Banking">Mobile Banking</option><option value="Aya Pay">Aya Pay</option><option value="Cash">Cash</option></select></div>
                <div class="form-group"><label for="update_paid_date">Paid Date</label><input type="text" id="update_paid_date" name="update_paid_date" placeholder="MM/DD/YYYY"></div>
            </div>` : ''}
            <div class="form-actions" style="margin-top: 2rem; justify-content: space-between;">
                <div><button type="button" class="btn btn-secondary" id="cancelRefundBtn" style="background-color: rgba(248, 81, 73, 0.2); color: #F85149;">Cancel/Refund...</button></div>
                <div><button type="button" class="btn btn-secondary" id="modalBackBtn">Back</button><button type="submit" class="btn btn-primary">Update Ticket(s)</button></div>
            </div>
        </form>`;

    openModal(content, 'large');
    new Datepicker(document.getElementById('update_departing_on'), {
        format: 'mm/dd/yyyy',
        autohide: true,
        todayHighlight: true
    });
    if (!ticket.paid) {
        new Datepicker(document.getElementById('update_paid_date'), {
            format: 'mm/dd/yyyy',
            autohide: true,
            todayHighlight: true
        });
    }
    document.getElementById('updateForm').addEventListener('submit', handleUpdateTicket);
    document.getElementById('cancelRefundBtn').addEventListener('click', () => openCancelSubModal(rowIndex));
    document.getElementById('modalBackBtn').addEventListener('click', closeModal);
}

/**
 * Handles the ticket update form submission.
 */
async function handleUpdateTicket(e) {
    e.preventDefault();
    const form = e.target;
    const pnr = form.dataset.pnr;
    let historyDetails = [];

    const ticketsToUpdate = state.allTickets.filter(t => t.booking_reference === pnr);
    const originalTicket = ticketsToUpdate[0];

    // Collect new values
    const newTravelDateVal = document.getElementById('update_departing_on').value;
    const newBaseFare = parseFloat(document.getElementById('update_base_fare').value);
    const newNetAmount = parseFloat(document.getElementById('update_net_amount').value);
    const newCommission = parseFloat(document.getElementById('update_commission').value);
    const dateChangeFees = parseFloat(document.getElementById('date_change_fees').value) || 0;
    const extraFare = parseFloat(document.getElementById('update_extra_fare').value) || 0;
    const newPaidStatus = document.getElementById('update_paid')?.checked;
    const newPaymentMethod = document.getElementById('update_payment_method')?.value.toUpperCase();
    const newPaidDate = document.getElementById('update_paid_date')?.value;

    // Build history log
    if (newTravelDateVal && parseSheetDate(newTravelDateVal).getTime() !== parseSheetDate(originalTicket.departing_on).getTime()) historyDetails.push(`Travel Date: ${originalTicket.departing_on} to ${newTravelDateVal}`);
    if (!isNaN(newBaseFare) && newBaseFare !== originalTicket.base_fare) historyDetails.push(`Base Fare: ${originalTicket.base_fare} to ${newBaseFare}`);
    if (!isNaN(newNetAmount) && newNetAmount !== originalTicket.net_amount) historyDetails.push(`Net Amount: ${originalTicket.net_amount} to ${newNetAmount}`);
    if (!isNaN(newCommission) && newCommission !== originalTicket.commission) historyDetails.push(`Commission: ${originalTicket.commission} to ${newCommission}`);
    if (dateChangeFees > 0) historyDetails.push(`Date Change Fees Added: ${dateChangeFees}`);
    if (extraFare > 0) historyDetails.push(`Extra Fare Added: ${extraFare}`);
    if (newPaidStatus && !originalTicket.paid) historyDetails.push(`Status: Unpaid to Paid`);
    if (newPaymentMethod && newPaymentMethod !== originalTicket.payment_method) historyDetails.push(`Payment Method: ${originalTicket.payment_method} to ${newPaymentMethod}`);
    if (newPaidDate && newPaidDate !== originalTicket.paid_date) historyDetails.push(`Paid Date: ${originalTicket.paid_date} to ${newPaidDate}`);

    if (historyDetails.length === 0) {
        showToast('No changes were made.', 'info');
        return;
    }

    const dataForBatchUpdate = ticketsToUpdate.map(ticket => {
        // Construct the full row of data with updated values
        const values = [
            ticket.issued_date, ticket.name, ticket.id_no, ticket.phone,
            ticket.account_name, ticket.account_type, ticket.account_link,
            ticket.departure, ticket.destination,
            newTravelDateVal ? formatDateForSheet(newTravelDateVal) : ticket.departing_on,
            ticket.airline,
            !isNaN(newBaseFare) ? newBaseFare : ticket.base_fare,
            ticket.booking_reference,
            !isNaN(newNetAmount) ? newNetAmount : ticket.net_amount,
            newPaidStatus !== undefined ? newPaidStatus : ticket.paid,
            newPaymentMethod || ticket.payment_method,
            newPaidDate ? formatDateForSheet(newPaidDate) : ticket.paid_date,
            !isNaN(newCommission) ? newCommission : ticket.commission,
            ticket.remarks,
            (ticket.extra_fare || 0) + extraFare,
            (ticket.date_change || 0) + dateChangeFees,
            ticket.gender
        ];
        return {
            range: `${CONFIG.SHEET_NAME}!A${ticket.rowIndex}:V${ticket.rowIndex}`,
            values: [values]
        };
    });

    try {
        showToast('Updating tickets...', 'info');
        await batchUpdateSheet(dataForBatchUpdate);
        await saveHistory(originalTicket, `MODIFIED: ${historyDetails.join('; ')}`);
        state.cache['ticketData'] = null;
        state.cache['historyData'] = null;
        showToast('Tickets updated successfully!', 'success');
        closeModal();
        clearManageResults();

        // MODIFIED: Use dynamic imports for reloading data to break circular dependency
        const { loadTicketData } = await import('./tickets.js');
        const { updateDashboardData } = await import('./main.js');
        const { loadHistory } = await import('./history.js');
        await Promise.all([loadTicketData(), loadHistory()]);
        updateDashboardData();

    } catch (error) {
        // Error toast is handled by api.js
    }
}

/**
 * Opens a sub-modal for cancellation and refund options.
 * @param {number} rowIndex The row index of the ticket.
 */
function openCancelSubModal(rowIndex) {
    const ticket = state.allTickets.find(t => t.rowIndex === rowIndex);
    if (!ticket) return;

    const content = `
        <h2>Cancel or Refund Ticket</h2>
        <p>For <strong>${ticket.name}</strong> (PNR: ${ticket.booking_reference})</p>
        <div class="form-actions" style="flex-direction: column; gap: 1rem; margin-top: 1.5rem;">
            <button type="button" class="btn btn-primary" id="fullRefundBtn" style="background-color: var(--danger-accent); border-color: var(--danger-accent);">Process Full Refund</button>
        </div>
        <hr style="border-color: rgba(255,255,255,0.2); margin: 1.5rem 0;">
        <h4>Partial Cancellation</h4>
        <form id="cancelForm" style="width: 100%;">
            <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group"><label for="cancellation_fee">Cancellation Fee</label><input type="number" id="cancellation_fee" required></div>
                <div class="form-group"><label for="refund_amount">Refund Amount</label><input type="number" id="refund_amount" required></div>
                <div class="form-group"><label for="refund_payment_method">Refund Method</label><select id="refund_payment_method" required><option value="" disabled selected>Select</option><option>KBZ Pay</option><option>Mobile Banking</option><option>Aya Pay</option><option>Cash</option></select></div>
                <div class="form-group"><label for="refund_transaction_id">Transaction ID</label><input type="text" id="refund_transaction_id"></div>
            </div>
            <button type="submit" class="btn btn-secondary" style="width: 100%; margin-top: 1rem;">Process Partial Cancellation</button>
        </form>
        <div class="form-actions" style="margin-top: 2rem;"><button class="btn btn-secondary" id="backToModifyBtn">Back to Modify</button></div>`;
    openModal(content);
    document.getElementById('fullRefundBtn').addEventListener('click', () => handleCancelTicket(rowIndex, 'refund'));
    document.getElementById('cancelForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const details = {
            cancellationFee: parseFloat(document.getElementById('cancellation_fee').value),
            refundAmount: parseFloat(document.getElementById('refund_amount').value),
            paymentMethod: document.getElementById('refund_payment_method').value,
            transactionId: document.getElementById('refund_transaction_id').value
        };
        handleCancelTicket(rowIndex, 'cancel', details);
    });
    document.getElementById('backToModifyBtn').addEventListener('click', () => openManageModal(rowIndex));
}

/**
 * Processes the cancellation or refund of a ticket.
 * @param {number} rowIndex The row index of the ticket.
 * @param {string} type The type of action ('refund' or 'cancel').
 * @param {Object} [details={}] Additional details for partial cancellation.
 */
async function handleCancelTicket(rowIndex, type, details = {}) {
    const ticket = state.allTickets.find(t => t.rowIndex === rowIndex);
    if (!ticket) return;

    const message = type === 'refund' ? `Process a <strong>Full Refund</strong> for ${ticket.name}?` : `Process <strong>Partial Cancellation</strong> for ${ticket.name}?`;

    showConfirmModal(message, async () => {
        let updatedValues, historyDetails;
        const dateStr = formatDateForSheet(new Date());

        if (type === 'refund') {
            updatedValues = [...Object.values(ticket).slice(0, 22)]; // Create a copy
            updatedValues[11] = 0; // base_fare
            updatedValues[13] = 0; // net_amount
            updatedValues[17] = 0; // commission
            updatedValues[18] = `Full Refund on ${dateStr}`; // remarks
            historyDetails = "CANCELED: Full Refund processed.";
        } else {
            updatedValues = [...Object.values(ticket).slice(0, 22)];
            updatedValues[13] = details.cancellationFee; // net_amount
            updatedValues[18] = `Canceled on ${dateStr} with ${details.refundAmount.toLocaleString()} refund`; // remarks
            historyDetails = `CANCELED: Partial. Refunded: ${details.refundAmount.toLocaleString()} MMK.`;
        }

        try {
            showToast('Processing cancellation...', 'info');
            await updateSheet(`${CONFIG.SHEET_NAME}!A${rowIndex}:V${rowIndex}`, [updatedValues]);
            await saveHistory(ticket, historyDetails);
            state.cache['ticketData'] = null;
            state.cache['historyData'] = null;
            showToast('Ticket canceled successfully!', 'success');
            closeModal();
            clearManageResults();

            // MODIFIED: Use dynamic imports for reloading data to break circular dependency
            const { loadTicketData } = await import('./tickets.js');
            const { updateDashboardData } = await import('./main.js');
            const { loadHistory } = await import('./history.js');
            await Promise.all([loadTicketData(), loadHistory()]);
            updateDashboardData();
        } catch (error) {
            // Error handled by api.js
        }
    });
}
