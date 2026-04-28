const db = require('../database/db');

const insertSaleStmt = db.prepare(
  `INSERT INTO sales (
    date, party_id, godown_id, type, bill_no, bill_name, party_address,
    bill_time, delivery_date, vehicle_no, delivery_place, delivery_time, delivery_feedback, delivery_details,
    discount, delivery_charges, packing_charges, total
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const updateSaleStmt = db.prepare(
  `UPDATE sales
  SET date = ?, party_id = ?, godown_id = ?, type = ?, bill_no = ?, bill_name = ?, party_address = ?,
      bill_time = ?, delivery_date = ?, vehicle_no = ?, delivery_place = ?, delivery_time = ?, delivery_feedback = ?, delivery_details = ?,
      discount = ?, delivery_charges = ?, packing_charges = ?, total = ?
   WHERE id = ?`
);

const updateSaleBillNoStmt = db.prepare(`UPDATE sales SET bill_no = ? WHERE id = ?`);

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

const getGodownStockByProductStmt = db.prepare(
  `SELECT godown_id, product_id, total_boxes, total_pieces
   FROM godown_stock
   WHERE godown_id = ? AND product_id = ?`
);

const reduceStockStmt = db.prepare(
  `UPDATE stock
   SET total_boxes = total_boxes - ?, total_pieces = total_pieces - ?
   WHERE product_id = ?`
);

const reduceGodownStockStmt = db.prepare(
  `UPDATE godown_stock
   SET total_boxes = total_boxes - ?, total_pieces = total_pieces - ?
   WHERE godown_id = ? AND product_id = ?`
);

const increaseStockStmt = db.prepare(
  `UPDATE stock
   SET total_boxes = total_boxes + ?, total_pieces = total_pieces + ?
   WHERE product_id = ?`
);

const increaseGodownStockStmt = db.prepare(
  `UPDATE godown_stock
   SET total_boxes = total_boxes + ?, total_pieces = total_pieces + ?
   WHERE godown_id = ? AND product_id = ?`
);

const insertLedgerStmt = db.prepare(
  `INSERT INTO ledger (date, payment_id, purchase_id, sale_id, party_id, type, account, particulars, amount, description)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const deleteLedgerBySaleStmt = db.prepare(`DELETE FROM ledger WHERE sale_id = ? OR particulars = ?`);

function normalizeSaleType(type) {
  const normalized = String(type || '').trim().toLowerCase();
  if (normalized === 'cash') {
    return 'cash';
  }
  if (normalized === 'upi') {
    return 'upi';
  }
  if (normalized === 'cheque' || normalized === 'check') {
    return 'cheque';
  }
  if (
    normalized === 'bank transfer'
    || normalized === 'bank transaction'
    || normalized === 'bank'
    || normalized === 'bank_transfer'
  ) {
    return 'bank transfer';
  }
  // Keep backward compatibility with older rows.
  if (normalized === 'credit') {
    return 'credit';
  }
  return 'cash';
}

function getSaleSettlementAccount(saleType) {
  if (saleType === 'credit') {
    return 'Party';
  }
  if (saleType === 'cash') {
    return 'Cash';
  }
  return 'Bank';
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

function applySaleStockReduction(items, godownId) {
  const selectedGodownId = Number(godownId) || 0;
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

    if (selectedGodownId > 0) {
      const godownStock = getGodownStockByProductStmt.get(selectedGodownId, item.productId);
      if (!godownStock || godownStock.total_boxes < item.boxes || godownStock.total_pieces < requiredPieces) {
        return {
          success: false,
          message: `Insufficient stock in selected godown for ${product.name}`
        };
      }
    }
  }

  items.forEach((item) => {
    const removePieces = item.boxes * item.piecesPerBox;
    reduceStockStmt.run(item.boxes, removePieces, item.productId);
    if (selectedGodownId > 0) {
      reduceGodownStockStmt.run(item.boxes, removePieces, selectedGodownId, item.productId);
    }
  });

  return { success: true };
}

function rollbackSaleStock(items, godownId) {
  const selectedGodownId = Number(godownId) || 0;
  items.forEach((item) => {
    const addPieces = item.boxes * item.pieces;
    increaseStockStmt.run(item.boxes, addPieces, item.product_id);
    if (selectedGodownId > 0) {
      increaseGodownStockStmt.run(item.boxes, addPieces, selectedGodownId, item.product_id);
    }
  });
}

function writeSaleLedgerEntries(saleId, saleDate, partyId, saleType, total) {
  const particulars = `Sale #${saleId}`;
  const settlementAccount = getSaleSettlementAccount(saleType);
  insertLedgerStmt.run(saleDate, null, null, saleId, partyId, 'debit', settlementAccount, particulars, total, particulars);
  insertLedgerStmt.run(saleDate, null, null, saleId, partyId, 'credit', 'Sales', particulars, total, particulars);
}

const addSaleTxn = db.transaction((data) => {
  const saleDate = data.date || new Date().toISOString().slice(0, 10);
  const partyId = Number(data.party_id);
  const godownId = Number(data.godown_id) || null;
  const saleType = normalizeSaleType(data.type);
  const requestedBillNo = String(data.bill_no || '').trim();
  const billName = String(data.bill_name || '').trim();
  const partyAddress = String(data.party_address || '').trim();
  const billTime = String(data.bill_time || '').trim();
  const deliveryDate = String(data.delivery_date || '').trim();
  const vehicleNo = String(data.vehicle_no || '').trim();
  const deliveryPlace = String(data.delivery_place || '').trim();
  const deliveryTime = String(data.delivery_time || '').trim();
  const deliveryFeedback = String(data.delivery_feedback || '').trim();
  const deliveryDetails = String(data.delivery_details || '').trim();
  const discount = Number(data.discount) || 0;
  const deliveryCharges = Number(data.delivery_charges) || 0;
  const packingCharges = Number(data.packing_charges) || 0;
  const items = normalizeSaleItems(data.items);

  if (!partyId || items.length === 0) {
    return { success: false, message: 'Invalid sale data' };
  }

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const finalTotal = Math.max(0, subtotal - discount) + deliveryCharges + packingCharges;

  const stockCheck = applySaleStockReduction(items, godownId);
  if (!stockCheck.success) {
    return stockCheck;
  }

  const saleResult = insertSaleStmt.run(
    saleDate,
    partyId,
    godownId,
    saleType,
    requestedBillNo || null,
    billName,
    partyAddress,
    billTime,
    deliveryDate,
    vehicleNo,
    deliveryPlace,
    deliveryTime,
    deliveryFeedback,
    deliveryDetails,
    discount,
    deliveryCharges,
    packingCharges,
    finalTotal
  );
  const saleId = Number(saleResult.lastInsertRowid);
  const effectiveBillNo = requestedBillNo || String(saleId);
  if (!requestedBillNo) {
    updateSaleBillNoStmt.run(effectiveBillNo, saleId);
  }

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
  rollbackSaleStock(oldItems, existingSale.godown_id);

  const saleDate = data.date || existingSale.date;
  const partyId = Number(data.party_id) || existingSale.party_id;
  const godownId = Number(data.godown_id) || Number(existingSale.godown_id) || null;
  const saleType = normalizeSaleType(data.type || existingSale.type);
  const billNo = String(data.bill_no ?? existingSale.bill_no ?? saleId).trim() || String(saleId);
  const billName = String(data.bill_name ?? existingSale.bill_name ?? '').trim();
  const partyAddress = String(data.party_address ?? existingSale.party_address ?? '').trim();
  const billTime = String(data.bill_time ?? existingSale.bill_time ?? '').trim();
  const deliveryDate = String(data.delivery_date ?? existingSale.delivery_date ?? '').trim();
  const vehicleNo = String(data.vehicle_no ?? existingSale.vehicle_no ?? '').trim();
  const deliveryPlace = String(data.delivery_place ?? existingSale.delivery_place ?? '').trim();
  const deliveryTime = String(data.delivery_time ?? existingSale.delivery_time ?? '').trim();
  const deliveryFeedback = String(data.delivery_feedback ?? existingSale.delivery_feedback ?? '').trim();
  const deliveryDetails = String(data.delivery_details ?? existingSale.delivery_details ?? '').trim();
  const discount = Number(data.discount) || 0;
  const deliveryCharges = Number(data.delivery_charges) || 0;
  const packingCharges = Number(data.packing_charges) || 0;
  const items = normalizeSaleItems(data.items);
  if (items.length === 0) {
    return { success: false, message: 'No valid sale items' };
  }

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const finalTotal = Math.max(0, subtotal - discount) + deliveryCharges + packingCharges;

  const stockCheck = applySaleStockReduction(items, godownId);
  if (!stockCheck.success) {
    return stockCheck;
  }

  updateSaleStmt.run(
    saleDate,
    partyId,
    godownId,
    saleType,
    billNo,
    billName,
    partyAddress,
    billTime,
    deliveryDate,
    vehicleNo,
    deliveryPlace,
    deliveryTime,
    deliveryFeedback,
    deliveryDetails,
    discount,
    deliveryCharges,
    packingCharges,
    finalTotal,
    saleId
  );
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
  rollbackSaleStock(oldItems, existingSale.godown_id);
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
      godown_id: sale.godown_id,
      bill_no: String(sale.bill_no || sale.id || ''),
      bill_name: sale.bill_name || '',
      party_address: sale.party_address || '',
      bill_time: sale.bill_time || '',
      delivery_date: sale.delivery_date || '',
      vehicle_no: sale.vehicle_no || '',
      delivery_place: sale.delivery_place || '',
      delivery_time: sale.delivery_time || '',
      delivery_feedback: sale.delivery_feedback || '',
      delivery_details: sale.delivery_details || '',
      packing_charges: Number(sale.packing_charges) || 0,
      items
    };
  } catch (_error) {
    return null;
  }
}

function getSales() {
  try {
    const stmt = db.prepare(
      `SELECT s.id, s.date, s.party_id, s.godown_id, p.name AS party_name, s.type,
              s.discount, s.delivery_charges, s.packing_charges,
              COALESCE(s.bill_no, CAST(s.id AS TEXT)) AS bill_no,
              s.bill_name, s.party_address, s.bill_time, s.delivery_date, s.vehicle_no,
              s.delivery_place, s.delivery_time, s.delivery_feedback, s.delivery_details,
              s.total,
              COUNT(si.id) AS item_count
       FROM sales s
       JOIN parties p ON p.id = s.party_id
       LEFT JOIN sale_items si ON si.sale_id = s.id
       GROUP BY s.id, s.date, s.party_id, s.godown_id, p.name, s.type,
                s.discount, s.delivery_charges, s.packing_charges,
                s.bill_no,
                s.bill_name, s.party_address, s.bill_time, s.delivery_date, s.vehicle_no,
                s.delivery_place, s.delivery_time, s.delivery_feedback, s.delivery_details,
                s.total
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
