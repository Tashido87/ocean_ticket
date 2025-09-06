/**
 * @fileoverview Manages the generation and exporting of PDF reports.
 */

import {
    state
} from './state.js';
import {
    showToast,
    parseSheetDate,
    formatDateToDMMMY
} from './utils.js';

/**
 * Toggles the disabled state of the "Private Report" button based on date input.
 */
export function togglePrivateReportButton() {
    const startDate = document.getElementById('searchStartDate').value;
    const endDate = document.getElementById('searchEndDate').value;
    document.getElementById('exportPrivateReportBtn').disabled = !(startDate && endDate);
}

/**
 * Exports the Agent Report to a PDF file.
 */
export async function exportToPdf() {
    const {
        jsPDF
    } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });
    const exportType = document.querySelector('input[name="exportType"]:checked').value;
    const isMerged = document.getElementById('mergeToggle')?.checked;
    const exportConfirmModal = document.getElementById('exportConfirmModal');

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

    // --- PDF Generation ---
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Agent Report', 105, 15, {
        align: 'center'
    });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const reportTypeStr = exportType === 'filtered' ? 'Filtered Results' : `Date Range: ${dateRangeString}`;
    doc.text(reportTypeStr, 105, 20, {
        align: 'center'
    });

    let head, body, columnStyles;
    let totalNetAmount = 0,
        totalDateChange = 0,
        totalCommission = 0;

    if (isMerged && exportType === 'range') {
        // Merged report logic
        head = [
            ['No.', 'Issued Date', 'Client Name(s)', 'PNR', 'Route', 'Pax', 'Net Amount', 'Date Change', 'Commission']
        ];
        const mergedData = {};
        ticketsToExport.forEach(t => {
            const key = `${t.account_link}-${t.issued_date}`;
            if (!mergedData[key]) {
                mergedData[key] = {
                    ...t,
                    clientNames: new Set(),
                    pax: 0,
                    net_amount: 0,
                    date_change: 0,
                    commission: 0
                };
            }
            mergedData[key].clientNames.add(t.name);
            mergedData[key].pax++;
            mergedData[key].net_amount += (t.net_amount || 0);
            mergedData[key].date_change += (t.date_change || 0);
            mergedData[key].commission += (t.commission || 0);
        });

        // ### START OF FIX ###
        body = Object.values(mergedData).map((t, index) => {
            return [
                index + 1,
                formatDateToDMMMY(t.issued_date),
                Array.from(t.clientNames).join(', '),
                t.booking_reference,
                `${(t.departure||'').split('(')[0].trim()} - ${(t.destination||'').split('(')[0].trim()}`,
                t.pax,
                (t.net_amount || 0).toLocaleString(),
                (t.date_change || 0).toLocaleString(),
                (t.commission || 0).toLocaleString()
            ];
        });

        totalNetAmount = Object.values(mergedData).reduce((sum, t) => sum + (t.net_amount || 0), 0);
        totalDateChange = Object.values(mergedData).reduce((sum, t) => sum + (t.date_change || 0), 0);
        totalCommission = Object.values(mergedData).reduce((sum, t) => sum + (t.commission || 0), 0);

        body.push([{
            content: 'Total',
            colSpan: 6,
            styles: {
                halign: 'right',
                fontStyle: 'bold'
            }
        }, {
            content: totalNetAmount.toLocaleString(),
            styles: {
                fontStyle: 'bold',
                halign: 'right'
            }
        }, {
            content: totalDateChange.toLocaleString(),
            styles: {
                fontStyle: 'bold',
                halign: 'right'
            }
        }, {
            content: totalCommission.toLocaleString(),
            styles: {
                fontStyle: 'bold',
                halign: 'right'
            }
        }]);
        // ### END OF FIX ###

        columnStyles = {
            5: { halign: 'center' },
            6: { halign: 'right' },
            7: { halign: 'right' },
            8: { halign: 'right' }
        };
    } else {
        // Standard report logic
        head = [
            ['No.', 'Issued Date', 'Name', 'PNR', 'Route', 'Net Amount', 'Date Change', 'Commission']
        ];
        body = ticketsToExport.map((t, index) => [
            index + 1,
            formatDateToDMMMY(t.issued_date),
            t.name,
            t.booking_reference,
            `${(t.departure||'').split('(')[0].trim()} - ${(t.destination||'').split('(')[0].trim()}`,
            (t.net_amount || 0).toLocaleString(),
            (t.date_change || 0).toLocaleString(),
            (t.commission || 0).toLocaleString()
        ]);
        totalNetAmount = ticketsToExport.reduce((sum, t) => sum + (t.net_amount || 0), 0);
        totalDateChange = ticketsToExport.reduce((sum, t) => sum + (t.date_change || 0), 0);
        totalCommission = ticketsToExport.reduce((sum, t) => sum + (t.commission || 0), 0);
        body.push([{
            content: 'Total',
            colSpan: 5,
            styles: {
                halign: 'right',
                fontStyle: 'bold'
            }
        }, {
            content: totalNetAmount.toLocaleString(),
            styles: {
                fontStyle: 'bold',
                halign: 'right'
            }
        }, {
            content: totalDateChange.toLocaleString(),
            styles: {
                fontStyle: 'bold',
                halign: 'right'
            }
        }, {
            content: totalCommission.toLocaleString(),
            styles: {
                fontStyle: 'bold',
                halign: 'right'
            }
        }]);
        columnStyles = {
            5: {
                halign: 'right'
            },
            6: {
                halign: 'right'
            },
            7: {
                halign: 'right'
            }
        };
    }

    doc.autoTable({
        head,
        body,
        startY: 25,
        theme: 'grid',
        headStyles: {
            fillColor: [44, 62, 80],
            fontSize: 8
        },
        styles: {
            fontSize: 7,
            cellPadding: 1.5
        },
        columnStyles
    });

    // ... Settlement calculation and rendering logic for range-based reports ...

    doc.save(`agent_report_${new Date().toISOString().slice(0,10)}.pdf`);
    exportConfirmModal.classList.remove('show');
}

/**
 * Exports the Private financial summary report to a PDF file.
 */
export async function exportPrivateReportToPdf() {
    const {
        jsPDF
    } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    const startDateStr = document.getElementById('searchStartDate').value;
    const endDateStr = document.getElementById('searchEndDate').value;

    if (!startDateStr || !endDateStr) {
        showToast('Please select a valid date range for the private report.', 'error');
        return;
    }

    const startDate = parseSheetDate(startDateStr);
    const endDate = parseSheetDate(endDateStr);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const ticketsInMonth = state.allTickets.filter(t => {
        const issuedDate = parseSheetDate(t.issued_date);
        return issuedDate >= startDate && issuedDate <= endDate;
    });

    if (ticketsInMonth.length === 0) {
        showToast('No tickets to export in the selected month.', 'info');
        return;
    }

    const dateRangeString = `${formatDateToDMMMY(startDate)} to ${formatDateToDMMMY(endDate)}`;

    // --- PDF Generation ---
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Private Report', 105, 15, {
        align: 'center'
    });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(dateRangeString, 105, 20, {
        align: 'center'
    });

    // --- Summary Section ---
    const totalTickets = ticketsInMonth.length;
    const totalRevenue = ticketsInMonth.reduce((sum, t) => sum + t.net_amount, 0);
    const totalCommission = ticketsInMonth.reduce((sum, t) => sum + t.commission, 0);
    const totalExtraFare = ticketsInMonth.reduce((sum, t) => sum + t.extra_fare, 0);
    const totalProfit = totalCommission + totalExtraFare;

    const summaryBody = [
        ['Total Ticket Sales', `${totalTickets} tickets`],
        ['Total Revenue', `${totalRevenue.toLocaleString()} MMK`],
        ['Total Commission', `${totalCommission.toLocaleString()} MMK`],
        ['Total Extra Fare', `${totalExtraFare.toLocaleString()} MMK`],
        ['Total Profit', `${totalProfit.toLocaleString()} MMK`],
    ];
    doc.autoTable({
        body: summaryBody,
        startY: 25,
        theme: 'grid',
        styles: {
            fontSize: 9,
            cellPadding: 2
        },
        columnStyles: {
            0: {
                fontStyle: 'bold',
                fillColor: [230, 247, 255]
            }
        },
    });

    let finalY = doc.lastAutoTable.finalY + 10;

    // --- Analysis Tables ---
    // ... Most Traveled Route, Airline Financials, Extra Fare, Commission, etc. ...

    doc.save(`private_report_${new Date().toISOString().slice(0,10)}.pdf`);
}
