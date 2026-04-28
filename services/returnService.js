const db = require('../database/db');

const insertPurchaseReturnStmt = db.prepare(
  `INSERT INTO purchase_returns (bill_no, date, party_id, godown_id, mode, total, reference_purchase_id, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const updatePurchaseReturnBillNoStmt = db.prepare(`UPDATE purchase_returns SET bill_no = ? WHERE id = ?`);
const insertPurchaseReturnItemStmt = db.prepare(
  `INSERT INTO purchase_return_items (purchase_return_id, product_id, boxes, pieces, unit_type, rate, total)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const getPurchaseReturnByIdStmt = db.prepare(`SELECT * FROM purchase_returns WHERE id = ?`);
const getPurchaseReturnItemsStmt = db.prepare(
  `SELECT pri.id, pri.purchase_return_id, pri.product_id, p.name AS product_name,
          pri.boxes, pri.pieces, pri.unit_type, pri.rate, pri.total
   FROM purchase_return_items pri
   JOIN products p ON p.id = pri.product_id
   WHERE pri.purchase_return_id = ?
   ORDER BY pri.id ASC`
);
const deletePurchaseReturnItemsStmt = db.prepare(`DELETE FROM purchase_return_items WHERE purchase_return_id = ?`);
const deletePurchaseReturnStmt = db.prepare(`DELETE FROM purchase_returns WHERE id = ?`);
const getPurchaseReturnsStmt = db.prepare(
  `SELECT pr.id, pr.bill_no, pr.date, pr.party_id, pa.name AS party_name, pr.godown_id,
          pr.mode, pr.total, pr.reference_purchase_id, COALESCE(pr.notes, '') AS notes
   FROM purchase_returns pr
   JOIN parties pa ON pa.id = pr.party_id
   ORDER BY pr.date DESC, pr.id DESC`
);

const insertSalesReturnStmt = db.prepare(
  `INSERT INTO sales_returns (bill_no, date, party_id, godown_id, mode, total, reference_sale_id, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const updateSalesReturnBillNoStmt = db.prepare(`UPDATE sales_returns SET bill_no = ? WHERE id = ?`);
const insertSalesReturnItemStmt = db.prepare(
  `INSERT INTO sales_return_items (sales_return_id, product_id, boxes, pieces, unit_type, rate, total)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const getSalesReturnByIdStmt = db.prepare(`SELECT * FROM sales_returns WHERE id = ?`);
const getSalesReturnItemsStmt = db.prepare(
  `SELECT sri.id, sri.sales_return_id, sri.product_id, p.name AS product_name,
          sri.boxes, sri.pieces, sri.unit_type, sri.rate, sri.total
   FROM sales_return_items sri
   JOIN products p ON p.id = sri.product_id
   WHERE sri.sales_return_id = ?
   ORDER BY sri.id ASC`
);
const deleteSalesReturnItemsStmt = db.prepare(`DELETE FROM sales_return_items WHERE sales_return_id = ?`);
const deleteSalesReturnStmt = db.prepare(`DELETE FROM sales_returns WHERE id = ?`);
const getSalesReturnsStmt = db.prepare(
  `SELECT sr.id, sr.bill_no, sr.date, sr.party_id, pa.name AS party_name, sr.godown_id,
          sr.mode, sr.total, sr.reference_sale_id, COALESCE(sr.notes, '') AS notes
   FROM sales_returns sr
   JOIN parties pa ON pa.id = sr.party_id
   ORDER BY sr.date DESC, sr.id DESC`
);

const getStockByProductStmt = db.prepare(
  `SELECT product_id, total_boxes, total_pieces
   FROM stock
   WHERE product_id = ?`
);
const updateStockAddStmt = db.prepare(
  `UPDATE stock
   SET total_boxes = total_boxes + ?, total_pieces = total_pieces + ?
   WHERE product_id = ?`
);
const updateStockSubtractStmt = db.prepare(
  `UPDATE stock
   SET total_boxes = total_boxes - ?, total_pieces = total_pieces - ?
   WHERE product_id = ?`
);
const insertStockStmt = db.prepare(
  `INSERT INTO stock (product_id, total_boxes, total_pieces)
   VALUES (?, ?, ?)`
);

const getGodownStockByProductStmt = db.prepare(
  `SELECT godown_id, product_id, total_boxes, total_pieces, pieces_per_box,
          COALESCE(unit_type, 'Pcs') AS unit_type
   FROM godown_stock
   WHERE godown_id = ? AND product_id = ?`
);
const updateGodownStockAddStmt = db.prepare(
  `UPDATE godown_stock
   SET total_boxes = total_boxes + ?, total_pieces = total_pieces + ?
   WHERE godown_id = ? AND product_id = ?`
);
const updateGodownStockSubtractStmt = db.prepare(
  `UPDATE godown_stock
   SET total_boxes = total_boxes - ?, total_pieces = total_pieces - ?
   WHERE godown_id = ? AND product_id = ?`
);
const insertGodownStockStmt = db.prepare(
  `INSERT INTO godown_stock (
      godown_id, product_id, purchase_rate, packing_charge, transport_charge,
      agent_name, selling_rate, pieces_per_box, unit_type, total_boxes, total_pieces,
      last_purchase_date, last_purchase_bill_no
    ) VALUES (?, ?, ?, 0, 0, '', ?, ?, ?, ?, ?, ?, ?)`
);

const insertLedgerStmt = db.prepare(
  `INSERT INTO ledger (date, payment_id, purchase_id, sale_id, party_id, type, account, particulars, amount, description)
   VALUES (?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)`
);
const deleteLedgerByParticularsStmt = db.prepare(`DELETE FROM ledger WHERE particulars = ?`);

function normalizeMode(value, fallback = 'Credit') {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'cash') {
    return 'Cash';
  }
  if (mode === 'credit') {
    return 'Credit';
  }
  return fallback;
}

function normalizeUnitType(unitType) {
  const normalized = String(unitType || '').trim().toLowerCase();
  if (normalized === 'pcs' || normalized === 'pc' || normalized === 'piece' || normalized === 'pieces') {
    return 'Pcs';
  }
  if (normalized === 'box' || normalized === 'boxes' || normalized === 'case' || normalized === 'cases') {
    return 'Box';
  }
  if (normalized === 'pkt' || normalized === 'packet' || normalized === 'packets') {
    return 'Pkt';
  }
  if (
    normalized === 'unit'
    || normalized === 'units'
    || normalized === 'nos'
    || normalized === 'no'
    || normalized === 'number'
    || normalized === 'numbers'
  ) {
    return 'Unit';
  }
  return '';
}

function normalizeItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const productId = Number(item.product_id);
    const boxes = Number(item.boxes);
    const pieces = Number(item.pieces);
    const unitType = normalizeUnitType(item.unit_type);
    const rate = Number(item.rate);
    const total = Number.isFinite(Number(item.total))
      ? Number(item.total)
      : Math.max(0, (Number.isFinite(boxes) ? boxes : 0) * (Number.isFinite(pieces) ? pieces : 0) * (Number.isFinite(rate) ? rate : 0));

    return {
      productId,
      boxes,
      pieces,
      unitType,
      rate,
      total
    };
  }).filter((item) => (
    item.productId > 0
      && Number.isFinite(item.boxes) && item.boxes > 0
      && Number.isFinite(item.pieces) && item.pieces > 0
      && !!item.unitType
      && Number.isFinite(item.rate) && item.rate >= 0
      && Number.isFinite(item.total) && item.total >= 0
  ));
}

function writePurchaseReturnLedger(returnId, payload) {
  const particulars = `Purchase Return #${returnId}`;
  const settlementAccount = payload.mode === 'Cash' ? 'Cash' : 'Party';

  insertLedgerStmt.run(payload.date, payload.partyId, 'debit', settlementAccount, particulars, payload.total, particulars);
  insertLedgerStmt.run(payload.date, payload.partyId, 'credit', 'Stock', particulars, payload.total, particulars);
}

function writeSalesReturnLedger(returnId, payload) {
  const particulars = `Sales Return #${returnId}`;
  const settlementAccount = payload.mode === 'Cash' ? 'Cash' : 'Party';

  insertLedgerStmt.run(payload.date, payload.partyId, 'debit', 'Sales Return', particulars, payload.total, particulars);
  insertLedgerStmt.run(payload.date, payload.partyId, 'credit', settlementAccount, particulars, payload.total, particulars);
}

function ensurePurchaseReturnStockAvailable(items, godownId) {
  const selectedGodownId = Number(godownId) || 0;
  for (const item of items) {
    const requiredPieces = item.boxes * item.pieces;
    const stock = getStockByProductStmt.get(item.productId);
    if (!stock || Number(stock.total_boxes) < item.boxes || Number(stock.total_pieces) < requiredPieces) {
      return { success: false, message: 'Insufficient stock for selected return items.' };
    }

    if (selectedGodownId > 0) {
      const godownStock = getGodownStockByProductStmt.get(selectedGodownId, item.productId);
      if (!godownStock || Number(godownStock.total_boxes) < item.boxes || Number(godownStock.total_pieces) < requiredPieces) {
        return { success: false, message: 'Insufficient stock in selected godown for return.' };
      }
    }
  }

  return { success: true };
}

function applyPurchaseReturnStockReduction(items, godownId) {
  const selectedGodownId = Number(godownId) || 0;
  items.forEach((item) => {
    const pieces = item.boxes * item.pieces;
    updateStockSubtractStmt.run(item.boxes, pieces, item.productId);
    if (selectedGodownId > 0) {
      updateGodownStockSubtractStmt.run(item.boxes, pieces, selectedGodownId, item.productId);
    }
  });
}

function rollbackPurchaseReturnStock(items, godownId) {
  const selectedGodownId = Number(godownId) || 0;
  items.forEach((item) => {
    const pieces = item.boxes * item.pieces;
    const stock = getStockByProductStmt.get(item.productId);
    if (stock) {
      updateStockAddStmt.run(item.boxes, pieces, item.productId);
    } else {
      insertStockStmt.run(item.productId, item.boxes, pieces);
    }

    if (selectedGodownId > 0) {
      const godownStock = getGodownStockByProductStmt.get(selectedGodownId, item.productId);
      if (godownStock) {
        updateGodownStockAddStmt.run(item.boxes, pieces, selectedGodownId, item.productId);
      } else {
        insertGodownStockStmt.run(
          selectedGodownId,
          item.productId,
          Number(item.rate) || 0,
          Number(item.rate) || 0,
          Math.max(1, Number(item.pieces) || 1),
          item.unitType || 'Pcs',
          item.boxes,
          pieces,
          null,
          null
        );
      }
    }
  });
}

function applySalesReturnStockIncrease(items, godownId, date, billNo) {
  const selectedGodownId = Number(godownId) || 0;
  items.forEach((item) => {
    const pieces = item.boxes * item.pieces;
    const stock = getStockByProductStmt.get(item.productId);
    if (stock) {
      updateStockAddStmt.run(item.boxes, pieces, item.productId);
    } else {
      insertStockStmt.run(item.productId, item.boxes, pieces);
    }

    if (selectedGodownId > 0) {
      const godownStock = getGodownStockByProductStmt.get(selectedGodownId, item.productId);
      if (godownStock) {
        updateGodownStockAddStmt.run(item.boxes, pieces, selectedGodownId, item.productId);
      } else {
        insertGodownStockStmt.run(
          selectedGodownId,
          item.productId,
          Number(item.rate) || 0,
          Number(item.rate) || 0,
          Math.max(1, Number(item.pieces) || 1),
          item.unitType || 'Pcs',
          item.boxes,
          pieces,
          date || null,
          String(billNo || '').trim() || null
        );
      }
    }
  });
}

function rollbackSalesReturnStock(items, godownId) {
  const selectedGodownId = Number(godownId) || 0;
  for (const item of items) {
    const pieces = item.boxes * item.pieces;
    const stock = getStockByProductStmt.get(item.productId);
    if (!stock || Number(stock.total_boxes) < item.boxes || Number(stock.total_pieces) < pieces) {
      return { success: false, message: 'Unable to delete sales return due to stock mismatch.' };
    }

    if (selectedGodownId > 0) {
      const godownStock = getGodownStockByProductStmt.get(selectedGodownId, item.productId);
      if (!godownStock || Number(godownStock.total_boxes) < item.boxes || Number(godownStock.total_pieces) < pieces) {
        return { success: false, message: 'Unable to delete sales return due to godown stock mismatch.' };
      }
    }
  }

  items.forEach((item) => {
    const pieces = item.boxes * item.pieces;
    updateStockSubtractStmt.run(item.boxes, pieces, item.productId);
    if (selectedGodownId > 0) {
      updateGodownStockSubtractStmt.run(item.boxes, pieces, selectedGodownId, item.productId);
    }
  });

  return { success: true };
}

const addPurchaseReturnTxn = db.transaction((data) => {
  const date = String(data?.date || '').trim() || new Date().toISOString().slice(0, 10);
  const requestedBillNo = String(data?.bill_no || '').trim();
  const partyId = Number(data?.party_id);
  const godownId = Number(data?.godown_id) || null;
  const mode = normalizeMode(data?.mode, 'Credit');
  const referencePurchaseId = Number(data?.reference_purchase_id) || null;
  const notes = String(data?.notes || '').trim();
  const inputItems = Array.isArray(data?.items) ? data.items : [];
  const items = normalizeItems(inputItems);

  if (!date || !partyId || items.length === 0 || items.length !== inputItems.length) {
    return { success: false, message: 'Invalid purchase return data.' };
  }

  const stockCheck = ensurePurchaseReturnStockAvailable(items, godownId);
  if (!stockCheck.success) {
    return stockCheck;
  }

  const total = items.reduce((sum, item) => sum + item.total, 0);
  const result = insertPurchaseReturnStmt.run(
    requestedBillNo || null,
    date,
    partyId,
    godownId,
    mode,
    total,
    referencePurchaseId,
    notes
  );

  const returnId = Number(result.lastInsertRowid);
  const billNo = requestedBillNo || String(returnId);
  if (!requestedBillNo) {
    updatePurchaseReturnBillNoStmt.run(billNo, returnId);
  }

  applyPurchaseReturnStockReduction(items, godownId);
  items.forEach((item) => {
    insertPurchaseReturnItemStmt.run(returnId, item.productId, item.boxes, item.pieces, item.unitType, item.rate, item.total);
  });

  writePurchaseReturnLedger(returnId, {
    date,
    partyId,
    mode,
    total
  });

  return { success: true, id: returnId };
});

const deletePurchaseReturnTxn = db.transaction((id) => {
  const returnId = Number(id);
  const row = getPurchaseReturnByIdStmt.get(returnId);
  if (!row) {
    return { success: false, message: 'Purchase return not found.' };
  }

  const items = getPurchaseReturnItemsStmt.all(returnId).map((item) => ({
    productId: Number(item.product_id),
    boxes: Number(item.boxes),
    pieces: Number(item.pieces),
    unitType: normalizeUnitType(item.unit_type) || 'Pcs',
    rate: Number(item.rate) || 0
  }));

  rollbackPurchaseReturnStock(items, row.godown_id);
  deletePurchaseReturnItemsStmt.run(returnId);
  deleteLedgerByParticularsStmt.run(`Purchase Return #${returnId}`);
  const result = deletePurchaseReturnStmt.run(returnId);
  return { success: result.changes > 0 };
});

const addSalesReturnTxn = db.transaction((data) => {
  const date = String(data?.date || '').trim() || new Date().toISOString().slice(0, 10);
  const requestedBillNo = String(data?.bill_no || '').trim();
  const partyId = Number(data?.party_id);
  const godownId = Number(data?.godown_id) || null;
  const mode = normalizeMode(data?.mode, 'Credit');
  const referenceSaleId = Number(data?.reference_sale_id) || null;
  const notes = String(data?.notes || '').trim();
  const inputItems = Array.isArray(data?.items) ? data.items : [];
  const items = normalizeItems(inputItems);

  if (!date || !partyId || items.length === 0 || items.length !== inputItems.length) {
    return { success: false, message: 'Invalid sales return data.' };
  }

  const total = items.reduce((sum, item) => sum + item.total, 0);
  const result = insertSalesReturnStmt.run(
    requestedBillNo || null,
    date,
    partyId,
    godownId,
    mode,
    total,
    referenceSaleId,
    notes
  );

  const returnId = Number(result.lastInsertRowid);
  const billNo = requestedBillNo || String(returnId);
  if (!requestedBillNo) {
    updateSalesReturnBillNoStmt.run(billNo, returnId);
  }

  applySalesReturnStockIncrease(items, godownId, date, billNo);
  items.forEach((item) => {
    insertSalesReturnItemStmt.run(returnId, item.productId, item.boxes, item.pieces, item.unitType, item.rate, item.total);
  });

  writeSalesReturnLedger(returnId, {
    date,
    partyId,
    mode,
    total
  });

  return { success: true, id: returnId };
});

const deleteSalesReturnTxn = db.transaction((id) => {
  const returnId = Number(id);
  const row = getSalesReturnByIdStmt.get(returnId);
  if (!row) {
    return { success: false, message: 'Sales return not found.' };
  }

  const items = getSalesReturnItemsStmt.all(returnId).map((item) => ({
    productId: Number(item.product_id),
    boxes: Number(item.boxes),
    pieces: Number(item.pieces),
    unitType: normalizeUnitType(item.unit_type) || 'Pcs',
    rate: Number(item.rate) || 0
  }));

  const rollbackResult = rollbackSalesReturnStock(items, row.godown_id);
  if (!rollbackResult.success) {
    return rollbackResult;
  }

  deleteSalesReturnItemsStmt.run(returnId);
  deleteLedgerByParticularsStmt.run(`Sales Return #${returnId}`);
  const result = deleteSalesReturnStmt.run(returnId);
  return { success: result.changes > 0 };
});

function addPurchaseReturn(data) {
  try {
    return addPurchaseReturnTxn(data || {});
  } catch (error) {
    return { success: false, message: error.message || 'Unable to add purchase return.' };
  }
}

function deletePurchaseReturn(id) {
  try {
    return deletePurchaseReturnTxn(id);
  } catch (error) {
    return { success: false, message: error.message || 'Unable to delete purchase return.' };
  }
}

function getPurchaseReturns() {
  try {
    return getPurchaseReturnsStmt.all();
  } catch (_error) {
    return [];
  }
}

function getPurchaseReturnDetails(id) {
  try {
    const row = getPurchaseReturnByIdStmt.get(Number(id));
    if (!row) {
      return null;
    }

    return {
      ...row,
      bill_no: String(row.bill_no || row.id || ''),
      items: getPurchaseReturnItemsStmt.all(Number(id)).map((item) => ({
        product_id: Number(item.product_id),
        product_name: item.product_name,
        boxes: Number(item.boxes),
        pieces: Number(item.pieces),
        unit_type: normalizeUnitType(item.unit_type) || 'Pcs',
        rate: Number(item.rate) || 0,
        total: Number(item.total) || 0
      }))
    };
  } catch (_error) {
    return null;
  }
}

function addSalesReturn(data) {
  try {
    return addSalesReturnTxn(data || {});
  } catch (error) {
    return { success: false, message: error.message || 'Unable to add sales return.' };
  }
}

function deleteSalesReturn(id) {
  try {
    return deleteSalesReturnTxn(id);
  } catch (error) {
    return { success: false, message: error.message || 'Unable to delete sales return.' };
  }
}

function getSalesReturns() {
  try {
    return getSalesReturnsStmt.all();
  } catch (_error) {
    return [];
  }
}

function getSalesReturnDetails(id) {
  try {
    const row = getSalesReturnByIdStmt.get(Number(id));
    if (!row) {
      return null;
    }

    return {
      ...row,
      bill_no: String(row.bill_no || row.id || ''),
      items: getSalesReturnItemsStmt.all(Number(id)).map((item) => ({
        product_id: Number(item.product_id),
        product_name: item.product_name,
        boxes: Number(item.boxes),
        pieces: Number(item.pieces),
        unit_type: normalizeUnitType(item.unit_type) || 'Pcs',
        rate: Number(item.rate) || 0,
        total: Number(item.total) || 0
      }))
    };
  } catch (_error) {
    return null;
  }
}

module.exports = {
  addPurchaseReturn,
  deletePurchaseReturn,
  getPurchaseReturns,
  getPurchaseReturnDetails,
  addSalesReturn,
  deleteSalesReturn,
  getSalesReturns,
  getSalesReturnDetails
};
