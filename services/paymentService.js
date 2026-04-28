const db = require('../database/db');

const insertPaymentStmt = db.prepare(
  `INSERT INTO payments (date, party_id, type, amount, mode, description)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const updatePaymentStmt = db.prepare(
  `UPDATE payments
   SET date = ?, party_id = ?, type = ?, amount = ?, mode = ?, description = ?
   WHERE id = ?`
);

const deletePaymentStmt = db.prepare(`DELETE FROM payments WHERE id = ?`);
const deleteLedgerByPaymentStmt = db.prepare(`DELETE FROM ledger WHERE payment_id = ?`);
const getLedgerEntryByIdStmt = db.prepare(
  `SELECT id, payment_id, purchase_id, sale_id, date, party_id, type, account, particulars, amount, description
   FROM ledger
   WHERE id = ?`
);
const insertManualLedgerStmt = db.prepare(
  `INSERT INTO ledger (date, payment_id, purchase_id, sale_id, party_id, type, account, particulars, amount, description)
   VALUES (?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)`
);
const updateManualLedgerStmt = db.prepare(
  `UPDATE ledger
   SET date = ?, particulars = ?, amount = ?, description = ?
   WHERE id = ? AND payment_id IS NULL AND purchase_id IS NULL AND sale_id IS NULL`
);
const deleteManualLedgerStmt = db.prepare(
  `DELETE FROM ledger
   WHERE id = ? AND payment_id IS NULL AND purchase_id IS NULL AND sale_id IS NULL`
);

const insertLedgerStmt = db.prepare(
  `INSERT INTO ledger (date, payment_id, party_id, type, account, particulars, amount, description)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

function normalizePaymentData(data) {
  const paymentType = data.type === 'OUT' ? 'OUT' : 'IN';
  const paymentDate = data.date || new Date().toISOString().slice(0, 10);
  const partyId = Number(data.party_id);
  const amount = Number(data.amount) || 0;
  const modeRaw = String(data.mode || '').trim();
  const modeLower = modeRaw.toLowerCase();
  const mode = modeLower === 'cash'
    ? 'Cash'
    : modeLower === 'upi'
      ? 'UPI'
      : modeLower === 'bank' || modeLower === 'bank transaction' || modeLower === 'bank transfer'
        ? 'Bank Transaction'
        : modeLower === 'cheque' || modeLower === 'check'
          ? 'Cheque'
        : '';
  const description = paymentType === 'IN' ? 'Payment Received' : 'Payment Out';

  return {
    paymentType,
    paymentDate,
    partyId,
    amount,
    mode,
    description
  };
}

function validatePaymentData(data) {
  if (!data.paymentDate || !data.partyId || data.amount <= 0 || !data.mode) {
    return 'Date, particulars, amount and mode are required.';
  }

  return null;
}

function createDoubleLedgerEntries(paymentId, data) {
  const partyParticulars = data.description || `${data.paymentType} payment (${data.mode})`;

  if (data.paymentType === 'IN') {
    insertLedgerStmt.run(data.paymentDate, paymentId, data.partyId, 'credit', 'Party', partyParticulars, data.amount, partyParticulars);
    return;
  }

  insertLedgerStmt.run(data.paymentDate, paymentId, data.partyId, 'debit', 'Party', partyParticulars, data.amount, partyParticulars);
}

const addPaymentTxn = db.transaction((rawData) => {
  const data = normalizePaymentData(rawData);
  const validationError = validatePaymentData(data);
  if (validationError) {
    return { success: false, message: validationError };
  }

  const result = insertPaymentStmt.run(
    data.paymentDate,
    data.partyId,
    data.paymentType,
    data.amount,
    data.mode,
    data.description
  );

  createDoubleLedgerEntries(result.lastInsertRowid, data);
  return { success: true, id: result.lastInsertRowid };
});

const updatePaymentTxn = db.transaction((id, rawData) => {
  const data = normalizePaymentData(rawData);
  const validationError = validatePaymentData(data);
  if (validationError) {
    return { success: false, message: validationError };
  }

  const result = updatePaymentStmt.run(
    data.paymentDate,
    data.partyId,
    data.paymentType,
    data.amount,
    data.mode,
    data.description,
    id
  );

  if (result.changes > 0) {
    deleteLedgerByPaymentStmt.run(id);
    createDoubleLedgerEntries(id, data);
  }

  return { success: result.changes > 0 };
});

const deletePaymentTxn = db.transaction((id) => {
  deleteLedgerByPaymentStmt.run(id);
  const result = deletePaymentStmt.run(id);
  return { success: result.changes > 0 };
});

function addPayment(data) {
  try {
    return addPaymentTxn(data);
  } catch (error) {
    return { success: false, message: error.message || 'Unable to add payment.' };
  }
}

function updatePayment(id, data) {
  try {
    return updatePaymentTxn(Number(id), data);
  } catch (error) {
    return { success: false, message: error.message || 'Unable to update payment.' };
  }
}

function deletePayment(id) {
  try {
    return deletePaymentTxn(Number(id));
  } catch (error) {
    return { success: false, message: error.message || 'Unable to delete payment.' };
  }
}

function getPayments(type) {
  try {
    const normalizedType = String(type || '').toUpperCase();
    if (normalizedType === 'IN' || normalizedType === 'OUT') {
      const stmt = db.prepare(`
        SELECT p.id, p.date, p.party_id, pa.name AS party_name, p.type, p.amount, p.mode, p.description
        FROM payments p
        JOIN parties pa ON pa.id = p.party_id
        WHERE p.type = ?
        ORDER BY p.date DESC, p.id DESC
      `);
      return stmt.all(normalizedType);
    }

    const stmt = db.prepare(`
        SELECT p.id, p.date, p.party_id, pa.name AS party_name, p.type, p.amount, p.mode, p.description
        FROM payments p
        JOIN parties pa ON pa.id = p.party_id
        ORDER BY p.date DESC, p.id DESC
      `);
    return stmt.all();
  } catch (_error) {
    return [];
  }
}

function getLedger(filters = {}) {
  try {
    const conditions = [];
    const params = [];

    if (filters.partyId) {
      conditions.push('l.party_id = ?');
      params.push(Number(filters.partyId));
    }

    if (filters.dateFrom) {
      conditions.push('l.date >= ?');
      params.push(filters.dateFrom);
    }

    if (filters.dateTo) {
      conditions.push('l.date <= ?');
      params.push(filters.dateTo);
    }
    
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = db.prepare(`
      SELECT l.id, l.payment_id, l.purchase_id, l.sale_id,
             l.date, l.party_id, p.name AS party_name, p.phone AS party_phone,
             l.type, l.account, l.particulars, l.amount, l.description,
             pay.type AS payment_type,
             COALESCE(pu.bill_no, CAST(pu.id AS TEXT), '') AS purchase_bill_no,
             COALESCE(s.bill_no, CAST(s.id AS TEXT), '') AS sale_bill_no
      FROM ledger l
      JOIN parties p ON p.id = l.party_id
      LEFT JOIN payments pay ON pay.id = l.payment_id
      LEFT JOIN purchases pu ON pu.id = l.purchase_id
      LEFT JOIN sales s ON s.id = l.sale_id
      ${whereSql}
      ORDER BY l.date ASC, l.id ASC
    `);
    return stmt.all(...params);
  } catch (_error) {
    return [];
  }
}

const addManualLedgerEntryTxn = db.transaction((rawData) => {
  const date = String(rawData?.date || '').trim() || new Date().toISOString().slice(0, 10);
  const partyId = Number(rawData?.party_id);
  const particulars = String(rawData?.particulars || '').trim();
  const debit = Number(rawData?.debit) || 0;
  const credit = Number(rawData?.credit) || 0;

  if (!date || !partyId || !particulars) {
    return { success: false, message: 'Date, party and particulars are required.' };
  }

  if (debit < 0 || credit < 0) {
    return { success: false, message: 'Debit and credit cannot be negative.' };
  }

  if (debit <= 0 && credit <= 0) {
    return { success: false, message: 'Enter debit or credit amount.' };
  }

  const insertedIds = [];
  if (debit > 0) {
    const result = insertManualLedgerStmt.run(date, partyId, 'debit', 'Manual', particulars, debit, particulars);
    insertedIds.push(Number(result.lastInsertRowid));
  }
  if (credit > 0) {
    const result = insertManualLedgerStmt.run(date, partyId, 'credit', 'Manual', particulars, credit, particulars);
    insertedIds.push(Number(result.lastInsertRowid));
  }

  return { success: true, ids: insertedIds };
});

function addManualLedgerEntry(data) {
  try {
    return addManualLedgerEntryTxn(data || {});
  } catch (error) {
    return { success: false, message: error.message || 'Unable to add manual ledger entry.' };
  }
}

function updateManualLedgerEntry(id, rawData) {
  try {
    const rowId = Number(id);
    const existing = getLedgerEntryByIdStmt.get(rowId);
    if (!existing) {
      return { success: false, message: 'Ledger entry not found.' };
    }

    if (existing.payment_id || existing.purchase_id || existing.sale_id) {
      return { success: false, message: 'Auto ledger entries cannot be edited directly.' };
    }

    const date = String(rawData?.date || existing.date || '').trim();
    const particulars = String(rawData?.particulars || existing.particulars || '').trim();
    const debit = Number(rawData?.debit) || 0;
    const credit = Number(rawData?.credit) || 0;
    const amount = existing.type === 'debit' ? debit : credit;

    if (!date || !particulars || amount <= 0) {
      return { success: false, message: 'Valid date, particulars and amount are required.' };
    }

    const result = updateManualLedgerStmt.run(date, particulars, amount, particulars, rowId);
    return { success: result.changes > 0 };
  } catch (error) {
    return { success: false, message: error.message || 'Unable to update manual ledger entry.' };
  }
}

function deleteManualLedgerEntry(id) {
  try {
    const rowId = Number(id);
    const existing = getLedgerEntryByIdStmt.get(rowId);
    if (!existing) {
      return { success: false, message: 'Ledger entry not found.' };
    }

    if (existing.payment_id || existing.purchase_id || existing.sale_id) {
      return { success: false, message: 'Auto ledger entries cannot be deleted directly.' };
    }

    const result = deleteManualLedgerStmt.run(rowId);
    return { success: result.changes > 0 };
  } catch (error) {
    return { success: false, message: error.message || 'Unable to delete manual ledger entry.' };
  }
}

module.exports = {
  addPayment,
  updatePayment,
  deletePayment,
  getPayments,
  getLedger,
  addManualLedgerEntry,
  updateManualLedgerEntry,
  deleteManualLedgerEntry
};
