const db = require('../database/db');

const insertSaleStmt = db.prepare(
  `INSERT INTO sales (date, party_id, type, discount, delivery_charges, total)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const updateSaleStmt = db.prepare(
  `UPDATE sales
  SET date = ?, party_id = ?, type = ?, discount = ?, delivery_charges = ?, total = ?
   WHERE id = ?`
);

const deleteSaleStmt = db.prepare(`DELETE FROM sales WHERE id = ?`);

const insertSaleItemStmt = db.prepare(
  `INSERT INTO sale_items (sale_id, product_id, boxes, pieces, unit_type, rate, total)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const deleteSaleItemsStmt = db.prepare(`DELETE FROM sale_items WHERE sale_id = ?`);
const getSaleItemsStmt = db.prepare(
  `SELECT si.id, si.sale_id, si.product_id, p.name AS product_name,
          si.boxes, si.pieces, COALESCE(si.unit_type, 'Pcs') AS unit_type, si.rate, si.total
   FROM sale_items si
   JOIN products p ON p.id = si.product_id
   WHERE si.sale_id = ?
   ORDER BY si.id ASC`
);

const getSaleByIdStmt = db.prepare(`SELECT * FROM sales WHERE id = ?`);

const getProductByIdStmt = db.prepare(`SELECT id, name, rate FROM products WHERE id = ?`);
const getStockByProductStmt = db.prepare(
  `SELECT product_id, total_boxes, total_pieces
   FROM stock
   WHERE product_id = ?`
);

const reduceStockStmt = db.prepare(
  `UPDATE stock
   SET total_boxes = total_boxes - ?, total_pieces = total_pieces - ?
   WHERE product_id = ?`
);

const increaseStockStmt = db.prepare(
  `UPDATE stock
   SET total_boxes = total_boxes + ?, total_pieces = total_pieces + ?
   WHERE product_id = ?`
);

const insertLedgerStmt = db.prepare(
  `INSERT INTO ledger (date, payment_id, purchase_id, sale_id, party_id, type, account, particulars, amount, description)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const deleteLedgerBySaleStmt = db.prepare(`DELETE FROM ledger WHERE sale_id = ? OR particulars = ?`);

function normalizeSaleType(type) {
  return String(type || '').toLowerCase() === 'cash' ? 'cash' : 'credit';
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

function normalizeSaleItems(items) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const productId = Number(item.product_id);
    const boxes = Number(item.boxes) || 0;
    const piecesPerBox = Number(item.pieces) || 0;
    const unitType = normalizeUnitType(item.unit_type);
    const rate = Number(item.rate) || 0;
    const total = Number(item.total) || boxes * piecesPerBox * rate;

    return {
      productId,
      boxes,
      piecesPerBox,
      unitType,
      rate,
      total
    };
  }).filter((item) => item.productId > 0 && item.boxes > 0 && item.piecesPerBox > 0 && !!item.unitType && item.rate >= 0);
}

function applySaleStockReduction(items) {
  for (const item of items) {
    const product = getProductByIdStmt.get(item.productId);
    if (!product) {
      return { success: false, message: 'Product not found' };
    }

    const stock = getStockByProductStmt.get(item.productId);
    const requiredPieces = item.boxes * item.piecesPerBox;
    if (!stock || stock.total_boxes < item.boxes || stock.total_pieces < requiredPieces) {
      return {
        success: false,
        message: `Insufficient stock for ${product.name}`
      };
    }
  }

  items.forEach((item) => {
    const removePieces = item.boxes * item.piecesPerBox;
    reduceStockStmt.run(item.boxes, removePieces, item.productId);
  });

  return { success: true };
}

function rollbackSaleStock(items) {
  items.forEach((item) => {
    const addPieces = item.boxes * item.pieces;
    increaseStockStmt.run(item.boxes, addPieces, item.product_id);
  });
}

function writeSaleLedgerEntries(saleId, saleDate, partyId, saleType, total) {
  const particulars = `Sale #${saleId}`;
  if (saleType === 'cash') {
    insertLedgerStmt.run(saleDate, null, null, saleId, partyId, 'debit', 'Cash', particulars, total, particulars);
    insertLedgerStmt.run(saleDate, null, null, saleId, partyId, 'credit', 'Sales', particulars, total, particulars);
  } else {
    insertLedgerStmt.run(saleDate, null, null, saleId, partyId, 'debit', 'Party', particulars, total, particulars);
    insertLedgerStmt.run(saleDate, null, null, saleId, partyId, 'credit', 'Sales', particulars, total, particulars);
  }
}

const addSaleTxn = db.transaction((data) => {
  const saleDate = data.date || new Date().toISOString().slice(0, 10);
  const partyId = Number(data.party_id);
  const saleType = normalizeSaleType(data.type);
  const discount = Number(data.discount) || 0;
  const deliveryCharges = Number(data.delivery_charges) || 0;
  const items = normalizeSaleItems(data.items);

  if (!partyId || items.length === 0) {
    return { success: false, message: 'Invalid sale data' };
  }

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const finalTotal = Math.max(0, subtotal - discount) + deliveryCharges;

  const stockCheck = applySaleStockReduction(items);
  if (!stockCheck.success) {
    return stockCheck;
  }

  const saleResult = insertSaleStmt.run(saleDate, partyId, saleType, discount, deliveryCharges, finalTotal);
  const saleId = Number(saleResult.lastInsertRowid);

  items.forEach((item) => {
    insertSaleItemStmt.run(
      saleId,
      item.productId,
      item.boxes,
      item.piecesPerBox,
      item.unitType,
      item.rate,
      item.total
    );
  });

  writeSaleLedgerEntries(saleId, saleDate, partyId, saleType, finalTotal);
  return { success: true, id: saleId, total: finalTotal };
});

const updateSaleTxn = db.transaction((id, data) => {
  const saleId = Number(id);
  const existingSale = getSaleByIdStmt.get(saleId);
  if (!existingSale) {
    return { success: false, message: 'Sale not found' };
  }

  const oldItems = getSaleItemsStmt.all(saleId);
  rollbackSaleStock(oldItems);

  const saleDate = data.date || existingSale.date;
  const partyId = Number(data.party_id) || existingSale.party_id;
  const saleType = normalizeSaleType(data.type || existingSale.type);
  const discount = Number(data.discount) || 0;
  const deliveryCharges = Number(data.delivery_charges) || 0;
  const items = normalizeSaleItems(data.items);
  if (items.length === 0) {
    return { success: false, message: 'No valid sale items' };
  }

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const finalTotal = Math.max(0, subtotal - discount) + deliveryCharges;

  const stockCheck = applySaleStockReduction(items);
  if (!stockCheck.success) {
    return stockCheck;
  }

  updateSaleStmt.run(saleDate, partyId, saleType, discount, deliveryCharges, finalTotal, saleId);
  deleteSaleItemsStmt.run(saleId);
  items.forEach((item) => {
    insertSaleItemStmt.run(
      saleId,
      item.productId,
      item.boxes,
      item.piecesPerBox,
      item.unitType,
      item.rate,
      item.total
    );
  });

  deleteLedgerBySaleStmt.run(saleId, `Sale #${saleId}`);
  writeSaleLedgerEntries(saleId, saleDate, partyId, saleType, finalTotal);
  return { success: true, id: saleId, total: finalTotal };
});

const deleteSaleTxn = db.transaction((id) => {
  const saleId = Number(id);
  const existingSale = getSaleByIdStmt.get(saleId);
  if (!existingSale) {
    return { success: false, message: 'Sale not found' };
  }

  const oldItems = getSaleItemsStmt.all(saleId);
  rollbackSaleStock(oldItems);
  deleteSaleItemsStmt.run(saleId);
  deleteLedgerBySaleStmt.run(saleId, `Sale #${saleId}`);
  const result = deleteSaleStmt.run(saleId);
  return { success: result.changes > 0 };
});

function addSale(data) {
  try {
    return addSaleTxn(data);
  } catch (error) {
    return { success: false, message: error.message || 'Unable to add sale.' };
  }
}

function updateSale(id, data) {
  try {
    return updateSaleTxn(id, data);
  } catch (error) {
    return { success: false, message: error.message || 'Unable to update sale.' };
  }
}

function deleteSale(id) {
  try {
    return deleteSaleTxn(id);
  } catch (error) {
    return { success: false, message: error.message || 'Unable to delete sale.' };
  }
}

function getSaleDetails(id) {
  try {
    const saleId = Number(id);
    const sale = getSaleByIdStmt.get(saleId);
    if (!sale) {
      return null;
    }

    const items = getSaleItemsStmt.all(saleId).map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      boxes: item.boxes,
      pieces: item.pieces,
      unit_type: normalizeUnitType(item.unit_type) || 'Pcs',
      rate: item.rate,
      total: item.total
    }));

    return {
      ...sale,
      items
    };
  } catch (_error) {
    return null;
  }
}

function getSales() {
  try {
    const stmt = db.prepare(
      `SELECT s.id, s.date, s.party_id, p.name AS party_name, s.type, s.discount, s.delivery_charges, s.total,
              COUNT(si.id) AS item_count
       FROM sales s
       JOIN parties p ON p.id = s.party_id
       LEFT JOIN sale_items si ON si.sale_id = s.id
       GROUP BY s.id, s.date, s.party_id, p.name, s.type, s.discount, s.delivery_charges, s.total
       ORDER BY s.date DESC, s.id DESC`
    );
    return stmt.all();
  } catch (_error) {
    return [];
  }
}

module.exports = {
  addSale,
  updateSale,
  deleteSale,
  getSaleDetails,
  getSales
};
