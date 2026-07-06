const db = require('../database/db');

const insertRawMaterialTxnStmt = db.prepare(
  `INSERT INTO raw_material_transactions (
      date, party_id, entry_type, product_name, quantity, unit_type, rate, product_details, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const updateRawMaterialTxnStmt = db.prepare(
  `UPDATE raw_material_transactions
   SET date = ?, party_id = ?, entry_type = ?, product_name = ?, quantity = ?, unit_type = ?,
       rate = ?, product_details = ?, notes = ?
   WHERE id = ?`
);

const deleteRawMaterialTxnStmt = db.prepare(`DELETE FROM raw_material_transactions WHERE id = ?`);

const getRawMaterialTxnByIdStmt = db.prepare(
  `SELECT id, date, party_id, entry_type, product_name, quantity, unit_type, rate, product_details, notes
   FROM raw_material_transactions
   WHERE id = ?`
);

const getRawMaterialBalanceStmt = db.prepare(
  `SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'IN' THEN quantity ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN entry_type = 'OUT' THEN quantity ELSE 0 END), 0) AS total_out
   FROM raw_material_transactions
   WHERE lower(product_name) = lower(?) AND lower(unit_type) = lower(?)`
);

const getRawMaterialBalanceExcludingIdStmt = db.prepare(
  `SELECT
      COALESCE(SUM(CASE WHEN entry_type = 'IN' THEN quantity ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN entry_type = 'OUT' THEN quantity ELSE 0 END), 0) AS total_out
   FROM raw_material_transactions
   WHERE lower(product_name) = lower(?) AND lower(unit_type) = lower(?) AND id != ?`
);

const getRawMaterialTransactionsStmt = db.prepare(
  `SELECT rt.id,
          rt.date,
          rt.party_id,
          p.name AS party_name,
          rt.entry_type,
          rt.product_name,
          rt.quantity,
          rt.unit_type,
          rt.rate,
          COALESCE(rt.product_details, '') AS product_details,
          COALESCE(rt.notes, '') AS notes
   FROM raw_material_transactions rt
   JOIN parties p ON p.id = rt.party_id
   WHERE (
      rt.product_name LIKE ?
      OR p.name LIKE ?
      OR COALESCE(rt.product_details, '') LIKE ?
   )
   AND (? = '' OR rt.entry_type = ?)
   ORDER BY rt.date DESC, rt.id DESC`
);

const getRawMaterialStockStmt = db.prepare(
  `SELECT rt.product_name,
          rt.unit_type,
          COALESCE(SUM(CASE WHEN rt.entry_type = 'IN' THEN rt.quantity ELSE 0 END), 0) AS total_in,
          COALESCE(SUM(CASE WHEN rt.entry_type = 'OUT' THEN rt.quantity ELSE 0 END), 0) AS total_out,
          MAX(rt.date) AS last_updated
   FROM raw_material_transactions rt
   WHERE rt.product_name LIKE ?
   GROUP BY rt.product_name, rt.unit_type
   ORDER BY lower(rt.product_name) ASC, lower(rt.unit_type) ASC`
);

const getRawMaterialProductsStmt = db.prepare(
  `SELECT DISTINCT product_name
   FROM raw_material_transactions
   WHERE product_name LIKE ?
   ORDER BY lower(product_name) ASC
   LIMIT 500`
);

function normalizeEntryType(entryType) {
  const normalized = String(entryType || '').trim().toUpperCase();
  if (normalized === 'IN') {
    return 'IN';
  }
  if (normalized === 'OUT') {
    return 'OUT';
  }
  return '';
}

function normalizeUnitType(unitType) {
  const normalized = String(unitType || '').trim().toLowerCase();
  if (normalized === 'pcs' || normalized === 'pc' || normalized === 'piece' || normalized === 'pieces') {
    return 'Pcs';
  }
  if (normalized === 'box' || normalized === 'boxes' || normalized === 'case' || normalized === 'cases') {
    return 'Box';
  }
  if (normalized === 'pkt' || normalized === 'packet' || normalized === 'packets' || normalized === 'pack') {
    return 'Pkt';
  }
  if (normalized === 'unit' || normalized === 'units' || normalized === 'nos' || normalized === 'no') {
    return 'Unit';
  }
  if (normalized === 'kg' || normalized === 'kilogram' || normalized === 'kilograms') {
    return 'Kg';
  }
  if (normalized === 'gram' || normalized === 'grams' || normalized === 'g') {
    return 'Gram';
  }
  if (normalized === 'bag' || normalized === 'bags') {
    return 'Bag';
  }
  if (normalized === 'sheet' || normalized === 'sheets') {
    return 'Sheet';
  }
  if (normalized === 'ream' || normalized === 'reams') {
    return 'Ream';
  }
  if (normalized === 'gross') {
    return 'Gross';
  }
  return '';
}

function getAvailableQuantity(productName, unitType, excludeId = 0, clampToZero = true) {
  const row = excludeId
    ? getRawMaterialBalanceExcludingIdStmt.get(productName, unitType, Number(excludeId))
    : getRawMaterialBalanceStmt.get(productName, unitType);
  const totalIn = Number(row?.total_in || 0);
  const totalOut = Number(row?.total_out || 0);
  const balance = totalIn - totalOut;
  return clampToZero ? Math.max(0, balance) : balance;
}

function normalizePayload(data = {}, fallback = null) {
  const date = String(data.date ?? fallback?.date ?? '').trim();
  const partyId = Number(data.party_id ?? fallback?.party_id ?? 0);
  const entryType = normalizeEntryType(data.entry_type ?? fallback?.entry_type);
  const productName = String(data.product_name ?? fallback?.product_name ?? '').trim();
  const quantity = Number(data.quantity ?? fallback?.quantity);
  const unitType = normalizeUnitType(data.unit_type ?? fallback?.unit_type);
  const inputRate = Number(data.rate ?? fallback?.rate ?? 0);
  const inputDetails = String(data.product_details ?? fallback?.product_details ?? '').trim();
  const rate = entryType === 'OUT' ? 0 : inputRate;
  const productDetails = entryType === 'OUT' ? '' : inputDetails;
  const notes = String(data.notes ?? fallback?.notes ?? '').trim();

  return {
    date,
    partyId,
    entryType,
    productName,
    quantity,
    unitType,
    rate,
    productDetails,
    notes
  };
}

function validatePayload(payload) {
  if (!payload.date || !payload.partyId || !payload.entryType || !payload.productName || !payload.unitType) {
    return 'Date, party, type, product name and unit type are required.';
  }

  if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
    return 'Quantity must be greater than zero.';
  }

  if (!Number.isFinite(payload.rate) || payload.rate < 0) {
    return 'Rate cannot be negative.';
  }

  return '';
}

const addRawMaterialTransactionTxn = db.transaction((data) => {
  const payload = normalizePayload(data || {}, null);
  const validationMessage = validatePayload(payload);
  if (validationMessage) {
    return { success: false, message: validationMessage };
  }

  if (payload.entryType === 'OUT') {
    const available = getAvailableQuantity(payload.productName, payload.unitType);
    if (payload.quantity > available) {
      return {
        success: false,
        message: `Insufficient stock. Available ${available.toFixed(2)} ${payload.unitType}.`
      };
    }
  }

  const result = insertRawMaterialTxnStmt.run(
    payload.date,
    payload.partyId,
    payload.entryType,
    payload.productName,
    payload.quantity,
    payload.unitType,
    payload.rate,
    payload.purchasePlace,
    payload.notes
  );

  return {
    success: true,
    id: Number(result.lastInsertRowid)
  };
});

const updateRawMaterialTransactionTxn = db.transaction((id, data) => {
  const txnId = Number(id);
  if (!txnId) {
    return { success: false, message: 'Invalid transaction.' };
  }

  const existing = getRawMaterialTxnByIdStmt.get(txnId);
  if (!existing) {
    return { success: false, message: 'Transaction not found.' };
  }

  const payload = normalizePayload(data || {}, existing);
  const validationMessage = validatePayload(payload);
  if (validationMessage) {
    return { success: false, message: validationMessage };
  }

  const availableExcludingCurrent = getAvailableQuantity(payload.productName, payload.unitType, txnId, false);
  const nextBalance = payload.entryType === 'OUT'
    ? availableExcludingCurrent - payload.quantity
    : availableExcludingCurrent + payload.quantity;

  if (nextBalance < 0) {
    return {
      success: false,
      message: `Insufficient stock. Available ${Math.max(0, availableExcludingCurrent).toFixed(2)} ${payload.unitType}.`
    };
  }

  const result = updateRawMaterialTxnStmt.run(
    payload.date,
    payload.partyId,
    payload.entryType,
    payload.productName,
    payload.quantity,
    payload.unitType,
    payload.rate,
    payload.purchasePlace,
    payload.notes,
    txnId
  );

  return {
    success: result.changes > 0
  };
});

function addRawMaterialTransaction(data) {
  try {
    return addRawMaterialTransactionTxn(data || {});
  } catch (error) {
    return { success: false, message: error.message || 'Unable to save transaction.' };
  }
}

function updateRawMaterialTransaction(id, data) {
  try {
    return updateRawMaterialTransactionTxn(id, data || {});
  } catch (error) {
    return { success: false, message: error.message || 'Unable to update transaction.' };
  }
}

function deleteRawMaterialTransaction(id) {
  try {
    const txnId = Number(id);
    if (!txnId) {
      return { success: false, message: 'Invalid transaction.' };
    }

    const existing = getRawMaterialTxnByIdStmt.get(txnId);
    if (!existing) {
      return { success: false, message: 'Transaction not found.' };
    }

    const normalizedUnitType = normalizeUnitType(existing.unit_type) || 'Pcs';
    if (String(existing.entry_type || '').toUpperCase() === 'IN') {
      const balanceWithoutThisRow = getAvailableQuantity(existing.product_name, normalizedUnitType, txnId, false);
      if (balanceWithoutThisRow < 0) {
        return {
          success: false,
          message: `Cannot delete. Product OUT exceeds Product IN for ${existing.product_name} (${normalizedUnitType}).`
        };
      }
    }

    const result = deleteRawMaterialTxnStmt.run(txnId);
    return { success: result.changes > 0 };
  } catch (error) {
    return { success: false, message: error.message || 'Unable to delete transaction.' };
  }
}

function updateRawMaterialProductName(oldName, newName) {
  try {
    const result = db.prepare(`UPDATE raw_material_transactions SET product_name = ? WHERE product_name = ?`).run(String(newName).trim(), String(oldName).trim());
    return { success: true, changes: result.changes };
  } catch (error) {
    return { success: false, message: error.message || 'Unable to update product name.' };
  }
}

function deleteRawMaterialProduct(productName) {
  try {
    const result = db.prepare(`DELETE FROM raw_material_transactions WHERE product_name = ?`).run(String(productName).trim());
    return { success: true, changes: result.changes };
  } catch (error) {
    return { success: false, message: error.message || 'Unable to delete product.' };
  }
}

function getRawMaterialTransactions(filters = {}) {
  try {
    const query = String(filters.query || '').trim();
    const type = normalizeEntryType(filters.type);
    const searchTerm = `%${query}%`;

    return getRawMaterialTransactionsStmt.all(searchTerm, searchTerm, searchTerm, type || '', type || '').map((row) => ({
      ...row,
      entry_type: normalizeEntryType(row.entry_type),
      unit_type: normalizeUnitType(row.unit_type) || 'Pcs',
      quantity: Number(row.quantity) || 0,
      rate: Number(row.rate) || 0
    }));
  } catch (_error) {
    return [];
  }
}

function getRawMaterialStock(query = '') {
  try {
    const searchTerm = `%${String(query || '').trim()}%`;
    return getRawMaterialStockStmt.all(searchTerm).map((row) => {
      const totalIn = Number(row.total_in) || 0;
      const totalOut = Number(row.total_out) || 0;
      return {
        product_name: row.product_name,
        unit_type: normalizeUnitType(row.unit_type) || 'Pcs',
        total_in: totalIn,
        total_out: totalOut,
        balance_qty: totalIn - totalOut,
        last_updated: row.last_updated || ''
      };
    });
  } catch (_error) {
    return [];
  }
}

function getRawMaterialProducts(query = '') {
  try {
    const searchTerm = `%${String(query || '').trim()}%`;
    return getRawMaterialProductsStmt.all(searchTerm).map((row) => String(row.product_name || '').trim()).filter(Boolean);
  } catch (_error) {
    return [];
  }
}

module.exports = {
  addRawMaterialTransaction,
  updateRawMaterialTransaction,
  deleteRawMaterialTransaction,
  updateRawMaterialProductName,
  deleteRawMaterialProduct,
  getRawMaterialTransactions,
  getRawMaterialStock,
  getRawMaterialProducts
};
