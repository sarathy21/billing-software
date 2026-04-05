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
      : modeLower === 'bank'
        ? 'Bank'
        : '';
  const description = (data.description || '').trim();

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
  if (!data.paymentDate || !data.partyId || data.amount <= 0 || !data.mode || !data.description) {
    return 'Date, party, amount, mode and description are required.';
  }
  return null;
}

function createDoubleLedgerEntries(paymentId, data) {
  const partyParticulars = data.description || `${data.paymentType} payment (${data.mode})`;
  const cashParticulars = data.description || `${data.paymentType === 'IN' ? 'Cash received' : 'Cash paid'} (${data.mode})`;

  if (data.paymentType === 'IN') {
    // Payment IN: debit cash, credit party
    insertLedgerStmt.run(data.paymentDate, paymentId, data.partyId, 'debit', 'Cash', cashParticulars, data.amount, cashParticulars);
    insertLedgerStmt.run(data.paymentDate, paymentId, data.partyId, 'credit', 'Party', partyParticulars, data.amount, partyParticulars);
  } else {
    // Payment OUT: debit party, credit cash
    insertLedgerStmt.run(data.paymentDate, paymentId, data.partyId, 'debit', 'Party', partyParticulars, data.amount, partyParticulars);
    insertLedgerStmt.run(data.paymentDate, paymentId, data.partyId, 'credit', 'Cash', cashParticulars, data.amount, cashParticulars);
  }
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
      SELECT l.id, l.payment_id, l.date, l.party_id, p.name AS party_name, l.type, l.account, l.particulars, l.amount, l.description
      FROM ledger l
      JOIN parties p ON p.id = l.party_id
      ${whereSql}
      ORDER BY l.date ASC, l.id ASC
    `);
    return stmt.all(...params);
  } catch (_error) {
    return [];
  }
}

module.exports = {
  addPayment,
  updatePayment,
  deletePayment,
  getPayments,
  getLedger
};
