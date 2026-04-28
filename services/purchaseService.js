const db = require('../database/db');

const insertPurchaseStmt = db.prepare(
  `INSERT INTO purchases (bill_no, date, party_id, godown_id, delivery_type, total)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const updatePurchaseStmt = db.prepare(
  `UPDATE purchases
   SET bill_no = ?, date = ?, party_id = ?, godown_id = ?, delivery_type = ?, total = ?
   WHERE id = ?`
);

const updatePurchaseBillNoStmt = db.prepare(`UPDATE purchases SET bill_no = ? WHERE id = ?`);

const deletePurchaseStmt = db.prepare(`DELETE FROM purchases WHERE id = ?`);

const insertPurchaseItemStmt = db.prepare(
  `INSERT INTO purchase_items (
      purchase_id, product_id, boxes, pieces, unit_type, rate, discount_percent, packing_charge,
      transport_charge, agent_name, agent_commission, selling_rate, notes, total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const updatePurchaseItemRateStmt = db.prepare(
  `UPDATE purchase_items
   SET rate = ?, discount_percent = ?, packing_charge = ?, transport_charge = ?, agent_name = ?,
       agent_commission = ?, selling_rate = ?, unit_type = ?, notes = ?, total = ?
   WHERE id = ?`
);

const deletePurchaseItemStmt = db.prepare(`DELETE FROM purchase_items WHERE id = ?`);
const deletePurchaseItemsStmt = db.prepare(`DELETE FROM purchase_items WHERE purchase_id = ?`);

const getPurchaseItemsStmt = db.prepare(
  `SELECT pi.id, pi.purchase_id, pi.product_id, p.name AS product_name,
      pi.boxes, pi.pieces, COALESCE(pi.unit_type, 'Pcs') AS unit_type,
    pi.rate, COALESCE(pi.discount_percent, 0) AS discount_percent,
      COALESCE(pi.packing_charge, 0) AS packing_charge,
          COALESCE(pi.transport_charge, 0) AS transport_charge,
          COALESCE(pi.agent_name, '') AS agent_name,
          COALESCE(pi.agent_commission, 0) AS agent_commission,
          COALESCE(pi.selling_rate, pi.rate) AS selling_rate,
          COALESCE(pi.notes, '') AS notes, pi.total
   FROM purchase_items pi
   JOIN products p ON p.id = pi.product_id
   WHERE pi.purchase_id = ?
   ORDER BY pi.id ASC`
);

const getPurchaseItemByIdStmt = db.prepare(
  `SELECT pi.id, pi.purchase_id, pi.product_id, pi.boxes, pi.pieces, pi.rate,
          COALESCE(pi.unit_type, 'Pcs') AS unit_type,
          COALESCE(pi.discount_percent, 0) AS discount_percent,
          COALESCE(pi.packing_charge, 0) AS packing_charge,
          COALESCE(pi.transport_charge, 0) AS transport_charge,
          COALESCE(pi.agent_name, '') AS agent_name,
          COALESCE(pi.agent_commission, 0) AS agent_commission,
          COALESCE(pi.selling_rate, pi.rate) AS selling_rate,
          COALESCE(pi.notes, '') AS notes, pi.total,
          pu.bill_no, pu.date, pu.party_id, pu.godown_id, pu.delivery_type, pa.name AS party_name,
          p.name AS product_name
   FROM purchase_items pi
   JOIN purchases pu ON pu.id = pi.purchase_id
   JOIN parties pa ON pa.id = pu.party_id
   JOIN products p ON p.id = pi.product_id
   WHERE pi.id = ?`
);

const getPurchaseByIdStmt = db.prepare(`SELECT * FROM purchases WHERE id = ?`);
const updatePurchaseTotalStmt = db.prepare(`UPDATE purchases SET total = ? WHERE id = ?`);
const countPurchaseItemsStmt = db.prepare(`SELECT COUNT(*) AS item_count FROM purchase_items WHERE purchase_id = ?`);
const sumPurchaseTotalStmt = db.prepare(`SELECT COALESCE(SUM(total), 0) AS purchase_total FROM purchase_items WHERE purchase_id = ?`);

const findProductByNameStmt = db.prepare(`SELECT id FROM products WHERE name = ?`);
const insertProductStmt = db.prepare(`INSERT INTO products (name, rate) VALUES (?, ?)`);
const updateProductRateStmt = db.prepare(`UPDATE products SET rate = ? WHERE id = ?`);

const findStockStmt = db.prepare(`SELECT product_id FROM stock WHERE product_id = ?`);
const getStockTotalsByProductStmt = db.prepare(
  `SELECT product_id, total_boxes, total_pieces
   FROM stock
   WHERE product_id = ?`
);
const insertStockStmt = db.prepare(
  `INSERT INTO stock (product_id, total_boxes, total_pieces)
   VALUES (?, ?, ?)`
);
const updateStockStmt = db.prepare(
  `UPDATE stock
   SET total_boxes = total_boxes + ?, total_pieces = total_pieces + ?
   WHERE product_id = ?`
);
const setStockTotalsStmt = db.prepare(
  `UPDATE stock
   SET total_boxes = ?, total_pieces = ?
   WHERE product_id = ?`
);

const getGodownsStmt = db.prepare(`SELECT id, name FROM godowns ORDER BY lower(name) ASC`);
const getGodownByIdStmt = db.prepare(`SELECT id, name FROM godowns WHERE id = ?`);
const findDuplicateGodownStmt = db.prepare(`SELECT id FROM godowns WHERE lower(name) = lower(?) LIMIT 1`);
const insertGodownStmt = db.prepare(`INSERT INTO godowns (name) VALUES (?)`);
const deleteGodownStmt = db.prepare(`DELETE FROM godowns WHERE id = ?`);
const countGodownsStmt = db.prepare(`SELECT COUNT(*) AS count FROM godowns`);
const countPurchasesByGodownStmt = db.prepare(`SELECT COUNT(*) AS count FROM purchases WHERE godown_id = ?`);
const countStockByGodownStmt = db.prepare(
  `SELECT COUNT(*) AS count FROM godown_stock WHERE godown_id = ? AND (total_boxes > 0 OR total_pieces > 0)`
);

const getGodownStockRowStmt = db.prepare(
  `SELECT godown_id, product_id, total_boxes, total_pieces
   FROM godown_stock
   WHERE godown_id = ? AND product_id = ?`
);

const getGodownStockItemDetailStmt = db.prepare(
  `SELECT godown_id, product_id,
          total_boxes, total_pieces, pieces_per_box,
          COALESCE(unit_type, 'Pcs') AS unit_type,
          purchase_rate, packing_charge, transport_charge,
          selling_rate, last_purchase_date, COALESCE(last_purchase_bill_no, '') AS last_purchase_bill_no
   FROM godown_stock
   WHERE godown_id = ? AND product_id = ?`
);

const insertGodownStockStmt = db.prepare(
  `INSERT INTO godown_stock (
      godown_id, product_id, purchase_rate, packing_charge, transport_charge,
      agent_name, selling_rate, pieces_per_box, unit_type, total_boxes, total_pieces, last_purchase_date, last_purchase_bill_no
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const updateGodownStockTotalsStmt = db.prepare(
  `UPDATE godown_stock
   SET total_boxes = ?, total_pieces = ?
   WHERE godown_id = ? AND product_id = ?`
);

const updateGodownStockMetaStmt = db.prepare(
  `UPDATE godown_stock
   SET purchase_rate = ?, packing_charge = ?, transport_charge = ?,
       agent_name = ?, selling_rate = ?, pieces_per_box = ?, unit_type = ?, last_purchase_date = ?, last_purchase_bill_no = ?
   WHERE godown_id = ? AND product_id = ?`
);

const deleteGodownStockRowStmt = db.prepare(`DELETE FROM godown_stock WHERE godown_id = ? AND product_id = ?`);

const latestMetaForGodownProductStmt = db.prepare(
  `SELECT pi.rate,
          COALESCE(pi.packing_charge, 0) AS packing_charge,
          COALESCE(pi.transport_charge, 0) AS transport_charge,
          COALESCE(pi.agent_name, '') AS agent_name,
          COALESCE(pi.selling_rate, pi.rate) AS selling_rate,
          COALESCE(pi.unit_type, 'Pcs') AS unit_type,
          pi.pieces,
          pu.date,
          COALESCE(pu.bill_no, CAST(pu.id AS TEXT)) AS bill_no
   FROM purchase_items pi
   JOIN purchases pu ON pu.id = pi.purchase_id
   WHERE pu.godown_id = ? AND pi.product_id = ?
   ORDER BY pu.date DESC, pi.id DESC
   LIMIT 1`
);

const insertLedgerStmt = db.prepare(
  `INSERT INTO ledger (date, payment_id, purchase_id, party_id, type, account, particulars, amount, description)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const deleteLedgerByPurchaseStmt = db.prepare(`DELETE FROM ledger WHERE purchase_id = ? OR particulars = ?`);

function normalizeDeliveryType(type) {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'cash') {
    return 'Cash';
  }
  if (value === 'credit') {
    return 'Credit';
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
    const productName = String(item.product_name || '').trim();
    const boxes = Number(item.boxes);
    const piecesPerBox = Number(item.pieces);
    const unitType = normalizeUnitType(item.unit_type);
    const rate = Number(item.rate);
    const discountPercent = Number(item.discount_percent);
    const packingCharge = Number(item.packing_charge);
    const transportCharge = Number(item.transport_charge);
    const agentName = String(item.agent_name || '').trim() || 'Supplier';
    const agentCommission = Number(item.agent_commission);
    const sellingRate = Number(item.selling_rate);
    const notes = String(item.notes || '').trim();
    const lineBase = (Number.isFinite(boxes) ? boxes : 0) * (Number.isFinite(piecesPerBox) ? piecesPerBox : 0) * (Number.isFinite(rate) ? rate : 0);
    const discountAmount = Number.isFinite(discountPercent) ? discountPercent : 0;
    const computedTotal = (lineBase - discountAmount)
      + (Number.isFinite(packingCharge) ? packingCharge : 0)
      + (Number.isFinite(transportCharge) ? transportCharge : 0)
      + (Number.isFinite(agentCommission) ? agentCommission : 0);
    const total = Number.isFinite(Number(item.total)) ? Number(item.total) : computedTotal;

    return {
      productName,
      boxes,
      piecesPerBox,
      unitType,
      rate,
      discountPercent,
      packingCharge,
      transportCharge,
      agentName,
      agentCommission,
      sellingRate,
      notes,
      lineBase,
      total
    };
  }).filter((item) => (
    item.productName
      && Number.isFinite(item.boxes) && item.boxes > 0
      && Number.isFinite(item.piecesPerBox) && item.piecesPerBox > 0
      && !!item.unitType
      && Number.isFinite(item.rate) && item.rate > 0
      && Number.isFinite(item.discountPercent) && item.discountPercent >= 0 && item.discountPercent <= item.lineBase
      && Number.isFinite(item.packingCharge) && item.packingCharge >= 0
      && Number.isFinite(item.transportCharge) && item.transportCharge >= 0
      && Number.isFinite(item.agentCommission) && item.agentCommission >= 0
      && Number.isFinite(item.sellingRate) && item.sellingRate > 0
      && Number.isFinite(item.total) && item.total > 0
  ));
}

function getEffectiveSellingRate(item) {
  return Number(item.sellingRate) > 0 ? Number(item.sellingRate) : Number(item.rate) || 0;
}

function getOrCreateProduct(item, shouldUpdateRate) {
  let product = findProductByNameStmt.get(item.productName);
  const effectiveRate = getEffectiveSellingRate(item);

  if (!product) {
    const created = insertProductStmt.run(item.productName, effectiveRate);
    product = { id: Number(created.lastInsertRowid) };
  } else if (shouldUpdateRate) {
    updateProductRateStmt.run(effectiveRate, product.id);
  }

  return product.id;
}

function applyAggregateStockDelta(productId, boxes, piecesPerBox, multiplier) {
  const deltaBoxes = Number(boxes) * multiplier;
  const deltaPieces = Number(boxes) * Number(piecesPerBox) * multiplier;
  const stockRow = findStockStmt.get(productId);

  if (stockRow) {
    updateStockStmt.run(deltaBoxes, deltaPieces, productId);
  } else if (multiplier > 0) {
    insertStockStmt.run(productId, deltaBoxes, deltaPieces);
  }
}

function applyAggregateStockTotalsDelta(productId, deltaBoxes, deltaPieces) {
  const stockRow = getStockTotalsByProductStmt.get(productId);
  if (!stockRow) {
    if (deltaBoxes > 0 || deltaPieces > 0) {
      insertStockStmt.run(productId, Math.max(0, deltaBoxes), Math.max(0, deltaPieces));
    }
    return;
  }

  const nextBoxes = Math.max(0, Number(stockRow.total_boxes || 0) + Number(deltaBoxes || 0));
  const nextPieces = Math.max(0, Number(stockRow.total_pieces || 0) + Number(deltaPieces || 0));
  setStockTotalsStmt.run(nextBoxes, nextPieces, productId);
}

function syncGodownStockMeta(godownId, productId) {
  const latest = latestMetaForGodownProductStmt.get(godownId, productId);
  if (!latest) {
    return;
  }

  updateGodownStockMetaStmt.run(
    Number(latest.rate) || 0,
    Number(latest.packing_charge) || 0,
    Number(latest.transport_charge) || 0,
    String(latest.agent_name || ''),
    Number(latest.selling_rate) || Number(latest.rate) || 0,
    Math.max(1, Number(latest.pieces) || 1),
    normalizeUnitType(latest.unit_type) || 'Pcs',
    latest.date || null,
    String(latest.bill_no || '').trim() || null,
    godownId,
    productId
  );
}

function applyGodownStockDelta(item, godownId, multiplier, purchaseDate, purchaseBillNo = '') {
  const existing = getGodownStockRowStmt.get(godownId, item.productId);
  const deltaBoxes = Number(item.boxes) * multiplier;
  const deltaPieces = Number(item.boxes) * Number(item.piecesPerBox) * multiplier;

  if (existing) {
    const nextBoxes = Number(existing.total_boxes) + deltaBoxes;
    const nextPieces = Number(existing.total_pieces) + deltaPieces;

    if (nextBoxes <= 0 || nextPieces <= 0) {
      deleteGodownStockRowStmt.run(godownId, item.productId);
      return;
    }

    updateGodownStockTotalsStmt.run(nextBoxes, nextPieces, godownId, item.productId);
    if (multiplier > 0) {
      updateGodownStockMetaStmt.run(
        Number(item.rate) || 0,
        Number(item.packingCharge) || 0,
        Number(item.transportCharge) || 0,
        String(item.agentName || ''),
        getEffectiveSellingRate(item),
        Math.max(1, Number(item.piecesPerBox) || 1),
        normalizeUnitType(item.unitType) || 'Pcs',
        purchaseDate || null,
        String(purchaseBillNo || '').trim() || null,
        godownId,
        item.productId
      );
    }
    return;
  }

  if (multiplier > 0) {
    insertGodownStockStmt.run(
      godownId,
      item.productId,
      Number(item.rate) || 0,
      Number(item.packingCharge) || 0,
      Number(item.transportCharge) || 0,
      String(item.agentName || ''),
      getEffectiveSellingRate(item),
      Math.max(1, Number(item.piecesPerBox) || 1),
      normalizeUnitType(item.unitType) || 'Pcs',
      deltaBoxes,
      deltaPieces,
      purchaseDate || null,
      String(purchaseBillNo || '').trim() || null
    );
  }
}

function writePurchaseLedgerEntries(purchaseId, purchaseDate, partyId, deliveryType, purchaseTotal, billNo) {
  const safeBillNo = String(billNo || purchaseId || '').trim() || String(purchaseId);
  const particulars = `Purchase Bill #${safeBillNo}`;
  const creditAccount = deliveryType === 'Cash' ? 'Cash' : 'Party';

  insertLedgerStmt.run(
    purchaseDate,
    null,
    purchaseId,
    partyId,
    'debit',
    'Stock',
    particulars,
    purchaseTotal,
    particulars
  );

  insertLedgerStmt.run(
    purchaseDate,
    null,
    purchaseId,
    partyId,
    'credit',
    creditAccount,
    particulars,
    purchaseTotal,
    particulars
  );
}

function rebuildPurchaseLedger(purchaseId) {
  const purchase = getPurchaseByIdStmt.get(purchaseId);
  if (!purchase) {
    return;
  }

  deleteLedgerByPurchaseStmt.run(purchaseId, `Purchase #${purchaseId}`);
  writePurchaseLedgerEntries(
    purchaseId,
    purchase.date,
    purchase.party_id,
    normalizeDeliveryType(purchase.delivery_type) || 'Cash',
    Number(purchase.total) || 0,
    purchase.bill_no
  );
}

function recalculatePurchaseTotalAndLedger(purchaseId) {
  const purchaseTotal = sumPurchaseTotalStmt.get(purchaseId).purchase_total || 0;
  updatePurchaseTotalStmt.run(purchaseTotal, purchaseId);
  rebuildPurchaseLedger(purchaseId);
  return purchaseTotal;
}

function syncAffectedGodownMeta(affectedProductKeys) {
  affectedProductKeys.forEach((key) => {
    const [godownIdText, productIdText] = key.split(':');
    const godownId = Number(godownIdText);
    const productId = Number(productIdText);
    const row = getGodownStockRowStmt.get(godownId, productId);
    if (row) {
      syncGodownStockMeta(godownId, productId);
    }
  });
}

const addPurchaseTxn = db.transaction((data) => {
  const purchaseDate = data.date || new Date().toISOString().slice(0, 10);
  const requestedBillNo = String(data.bill_no || '').trim();
  const partyId = Number(data.party_id);
  const godownId = Number(data.godown_id);
  const deliveryType = normalizeDeliveryType(data.delivery_type);
  const inputItems = Array.isArray(data.items) ? data.items : [];

  if (!partyId || !godownId || !deliveryType || inputItems.length === 0) {
    return { success: false, message: 'Fill all required purchase fields.' };
  }

  if (!getGodownByIdStmt.get(godownId)) {
    return { success: false, message: 'Selected godown does not exist.' };
  }

  const normalizedItems = normalizeItems(inputItems);
  if (normalizedItems.length !== inputItems.length || normalizedItems.length === 0) {
    return { success: false, message: 'Each purchase row must have product, qty, discount, rate, charges, agent and selling rate.' };
  }

  const purchaseTotal = normalizedItems.reduce((sum, item) => sum + item.total, 0);
  const purchaseResult = insertPurchaseStmt.run(requestedBillNo || null, purchaseDate, partyId, godownId, deliveryType, purchaseTotal);
  const purchaseId = Number(purchaseResult.lastInsertRowid);
  const effectiveBillNo = requestedBillNo || String(purchaseId);
  if (!requestedBillNo) {
    updatePurchaseBillNoStmt.run(effectiveBillNo, purchaseId);
  }

  normalizedItems.forEach((item) => {
    const productId = getOrCreateProduct(item, true);
    const enrichedItem = { ...item, productId };

    applyAggregateStockDelta(productId, item.boxes, item.piecesPerBox, 1);
    applyGodownStockDelta(enrichedItem, godownId, 1, purchaseDate, effectiveBillNo);

    insertPurchaseItemStmt.run(
      purchaseId,
      productId,
      item.boxes,
      item.piecesPerBox,
      item.unitType,
      item.rate,
      item.discountPercent,
      item.packingCharge,
      item.transportCharge,
      item.agentName,
      item.agentCommission,
      getEffectiveSellingRate(item),
      item.notes,
      item.total
    );
  });

  writePurchaseLedgerEntries(purchaseId, purchaseDate, partyId, deliveryType, purchaseTotal, effectiveBillNo);
  return { success: true, id: purchaseId };
});

const updatePurchaseTxn = db.transaction((id, data) => {
  const purchaseId = Number(id);
  const existingPurchase = getPurchaseByIdStmt.get(purchaseId);
  if (!existingPurchase) {
    return { success: false, message: 'Purchase not found' };
  }

  const purchaseDate = data.date || existingPurchase.date;
  const billNo = String(data.bill_no ?? existingPurchase.bill_no ?? existingPurchase.id ?? '').trim() || String(existingPurchase.id);
  const partyId = Number(data.party_id) || existingPurchase.party_id;
  const godownId = Number(data.godown_id) || Number(existingPurchase.godown_id);
  const deliveryType = normalizeDeliveryType(data.delivery_type || existingPurchase.delivery_type);

  if (!partyId || !godownId || !deliveryType) {
    return { success: false, message: 'Fill all required purchase fields.' };
  }

  if (!getGodownByIdStmt.get(godownId)) {
    return { success: false, message: 'Selected godown does not exist.' };
  }

  const inputItems = Array.isArray(data.items) ? data.items : [];
  const normalizedItems = normalizeItems(inputItems);
  if (normalizedItems.length !== inputItems.length || normalizedItems.length === 0) {
    return { success: false, message: 'Each purchase row must have product, qty, discount, rate, charges, agent and selling rate.' };
  }

  const affectedKeys = new Set();
  const oldItems = getPurchaseItemsStmt.all(purchaseId);
  oldItems.forEach((item) => {
    applyAggregateStockDelta(item.product_id, item.boxes, item.pieces, -1);
    const rollbackItem = {
      productId: item.product_id,
      boxes: Number(item.boxes),
      piecesPerBox: Number(item.pieces),
      unitType: normalizeUnitType(item.unit_type) || 'Pcs',
      rate: Number(item.rate),
      packingCharge: Number(item.packing_charge) || 0,
      transportCharge: Number(item.transport_charge) || 0,
      agentName: String(item.agent_name || ''),
      agentCommission: Number(item.agent_commission) || 0,
      sellingRate: Number(item.selling_rate) || Number(item.rate) || 0
    };
    applyGodownStockDelta(rollbackItem, Number(existingPurchase.godown_id), -1, existingPurchase.date, existingPurchase.bill_no || existingPurchase.id);
    affectedKeys.add(`${Number(existingPurchase.godown_id)}:${item.product_id}`);
  });

  const purchaseTotal = normalizedItems.reduce((sum, item) => sum + item.total, 0);
  updatePurchaseStmt.run(billNo, purchaseDate, partyId, godownId, deliveryType, purchaseTotal, purchaseId);

  deletePurchaseItemsStmt.run(purchaseId);
  normalizedItems.forEach((item) => {
    const productId = getOrCreateProduct(item, true);
    const enrichedItem = { ...item, productId };

    applyAggregateStockDelta(productId, item.boxes, item.piecesPerBox, 1);
    applyGodownStockDelta(enrichedItem, godownId, 1, purchaseDate, billNo);
    affectedKeys.add(`${godownId}:${productId}`);

    insertPurchaseItemStmt.run(
      purchaseId,
      productId,
      item.boxes,
      item.piecesPerBox,
      item.unitType,
      item.rate,
      item.discountPercent,
      item.packingCharge,
      item.transportCharge,
      item.agentName,
      item.agentCommission,
      getEffectiveSellingRate(item),
      item.notes,
      item.total
    );
  });

  syncAffectedGodownMeta(affectedKeys);
  deleteLedgerByPurchaseStmt.run(purchaseId, `Purchase #${purchaseId}`);
  writePurchaseLedgerEntries(purchaseId, purchaseDate, partyId, deliveryType, purchaseTotal, billNo);
  return { success: true, id: purchaseId };
});

const deletePurchaseTxn = db.transaction((id) => {
  const purchaseId = Number(id);
  const existingPurchase = getPurchaseByIdStmt.get(purchaseId);
  if (!existingPurchase) {
    return { success: false, message: 'Purchase not found' };
  }

  const affectedKeys = new Set();
  const oldItems = getPurchaseItemsStmt.all(purchaseId);
  oldItems.forEach((item) => {
    applyAggregateStockDelta(item.product_id, item.boxes, item.pieces, -1);
    const rollbackItem = {
      productId: item.product_id,
      boxes: Number(item.boxes),
      piecesPerBox: Number(item.pieces),
      unitType: normalizeUnitType(item.unit_type) || 'Pcs',
      rate: Number(item.rate),
      packingCharge: Number(item.packing_charge) || 0,
      transportCharge: Number(item.transport_charge) || 0,
      agentName: String(item.agent_name || ''),
      agentCommission: Number(item.agent_commission) || 0,
      sellingRate: Number(item.selling_rate) || Number(item.rate) || 0
    };
    applyGodownStockDelta(rollbackItem, Number(existingPurchase.godown_id), -1, existingPurchase.date, existingPurchase.bill_no || existingPurchase.id);
    affectedKeys.add(`${Number(existingPurchase.godown_id)}:${item.product_id}`);
  });

  deletePurchaseItemsStmt.run(purchaseId);
  syncAffectedGodownMeta(affectedKeys);
  deleteLedgerByPurchaseStmt.run(purchaseId, `Purchase #${purchaseId}`);
  const result = deletePurchaseStmt.run(purchaseId);
  return { success: result.changes > 0 };
});

function addPurchase(data) {
  try {
    return addPurchaseTxn(data);
  } catch (error) {
    return { success: false, message: error.message || 'Unable to add purchase.' };
  }
}

function updatePurchase(id, data) {
  try {
    return updatePurchaseTxn(id, data);
  } catch (error) {
    return { success: false, message: error.message || 'Unable to update purchase.' };
  }
}

function deletePurchase(id) {
  try {
    return deletePurchaseTxn(id);
  } catch (error) {
    return { success: false, message: error.message || 'Unable to delete purchase.' };
  }
}

function getPurchaseDetails(id) {
  try {
    const purchaseId = Number(id);
    const purchase = getPurchaseByIdStmt.get(purchaseId);
    if (!purchase) {
      return null;
    }

    const items = getPurchaseItemsStmt.all(purchaseId).map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      boxes: item.boxes,
      pieces: item.pieces,
      unit_type: normalizeUnitType(item.unit_type) || 'Pcs',
      rate: item.rate,
      discount_percent: Number(item.discount_percent) || 0,
      packing_charge: Number(item.packing_charge) || 0,
      transport_charge: Number(item.transport_charge) || 0,
      agent_name: item.agent_name || '',
      agent_commission: Number(item.agent_commission) || 0,
      selling_rate: Number(item.selling_rate) || Number(item.rate) || 0,
      notes: item.notes || '',
      total: item.total
    }));

    return {
      ...purchase,
      bill_no: String(purchase.bill_no || purchase.id || ''),
      delivery_type: normalizeDeliveryType(purchase.delivery_type) || 'Cash',
      items
    };
  } catch (_error) {
    return null;
  }
}

function getPurchases() {
  try {
    const stmt = db.prepare(
      `SELECT pu.id, pu.date, pu.party_id, p.name AS party_name,
              COALESCE(pu.bill_no, CAST(pu.id AS TEXT)) AS bill_no,
              pu.godown_id,
              pu.total,
              pr.name AS product_name,
              COALESCE(pi.boxes, 0) AS boxes,
              COALESCE(pi.pieces, 0) AS pieces,
              COALESCE(pi.unit_type, 'Pcs') AS unit_type,
              COALESCE(pi.rate, 0) AS rate,
              COALESCE(pi.discount_percent, 0) AS discount_percent,
              COALESCE(pi.packing_charge, 0) AS packing_charge,
              COALESCE(pi.transport_charge, 0) AS transport_charge,
              COALESCE(pi.agent_name, '') AS agent_name,
              COALESCE(pi.agent_commission, 0) AS agent_commission,
              COALESCE(pi.selling_rate, pi.rate) AS selling_rate,
              pi.id AS purchase_item_id
       FROM purchases pu
       JOIN parties p ON p.id = pu.party_id
       JOIN purchase_items pi ON pi.purchase_id = pu.id
       JOIN products pr ON pr.id = pi.product_id
       ORDER BY pu.date DESC, pu.id DESC, pi.id DESC`
    );
    return stmt.all();
  } catch (_error) {
    return [];
  }
}

function getStock() {
  try {
    const stmt = db.prepare(
      `SELECT s.product_id, p.name AS product_name, p.rate,
              s.total_boxes, s.total_pieces
       FROM stock s
       JOIN products p ON p.id = s.product_id
       ORDER BY p.name ASC`
    );
    return stmt.all();
  } catch (_error) {
    return [];
  }
}

function getGodowns() {
  try {
    return getGodownsStmt.all();
  } catch (_error) {
    return [];
  }
}

function addGodown(name) {
  const godownName = String(name || '').trim();
  if (!godownName) {
    return { success: false, message: 'Godown name is required.' };
  }

  const duplicate = findDuplicateGodownStmt.get(godownName);
  if (duplicate) {
    return { success: false, message: 'Godown with this name already exists.' };
  }

  const result = insertGodownStmt.run(godownName);
  return { success: result.changes > 0, id: Number(result.lastInsertRowid) };
}

function deleteGodown(id) {
  const godownId = Number(id);
  if (!godownId) {
    return { success: false, message: 'Invalid godown.' };
  }

  const totalGodowns = Number(countGodownsStmt.get().count) || 0;
  if (totalGodowns <= 1) {
    return { success: false, message: 'At least one godown is required.' };
  }

  const purchaseRefs = Number(countPurchasesByGodownStmt.get(godownId).count) || 0;
  const stockRefs = Number(countStockByGodownStmt.get(godownId).count) || 0;
  if (purchaseRefs > 0 || stockRefs > 0) {
    return { success: false, message: 'Cannot delete godown with stock or purchase history.' };
  }

  const result = deleteGodownStmt.run(godownId);
  return { success: result.changes > 0 };
}

function updateGodownStockItem(godownId, productId, data) {
  const targetGodownId = Number(godownId);
  const targetProductId = Number(productId);

  if (!targetGodownId || !targetProductId) {
    return { success: false, message: 'Invalid godown stock item.' };
  }

  const existing = getGodownStockItemDetailStmt.get(targetGodownId, targetProductId);
  if (!existing) {
    return { success: false, message: 'Godown item not found.' };
  }

  const nextBoxes = Number(data?.total_boxes);
  const nextPiecesPerBox = Number(data?.pieces_per_box);
  const nextUnitType = normalizeUnitType(data?.unit_type);
  const nextRate = Number(data?.purchase_rate ?? data?.rate);
  const nextPacking = Number(data?.packing_charge);
  const nextTransport = Number(data?.transport_charge);
  const nextSelling = Number(data?.selling_rate);
  const nextDate = String(data?.last_purchase_date || existing.last_purchase_date || '').trim();
  const nextBillNo = String(data?.last_purchase_bill_no || existing.last_purchase_bill_no || '').trim();

  if (
    !Number.isFinite(nextBoxes) || nextBoxes <= 0
    || !Number.isFinite(nextPiecesPerBox) || nextPiecesPerBox <= 0
    || !nextUnitType
    || !Number.isFinite(nextRate) || nextRate <= 0
    || !Number.isFinite(nextPacking) || nextPacking < 0
    || !Number.isFinite(nextTransport) || nextTransport < 0
    || !Number.isFinite(nextSelling) || nextSelling <= 0
  ) {
    return { success: false, message: 'Enter valid values for all editable stock fields.' };
  }

  const oldBoxes = Number(existing.total_boxes) || 0;
  const oldPieces = Number(existing.total_pieces) || 0;
  const nextTotalPieces = nextBoxes * nextPiecesPerBox;

  const tx = db.transaction(() => {
    updateGodownStockTotalsStmt.run(nextBoxes, nextTotalPieces, targetGodownId, targetProductId);
    updateGodownStockMetaStmt.run(
      nextRate,
      nextPacking,
      nextTransport,
      '',
      nextSelling,
      nextPiecesPerBox,
      nextUnitType,
      nextDate || null,
      nextBillNo || null,
      targetGodownId,
      targetProductId
    );

    applyAggregateStockTotalsDelta(
      targetProductId,
      nextBoxes - oldBoxes,
      nextTotalPieces - oldPieces
    );
  });

  try {
    tx();
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message || 'Unable to update godown item.' };
  }
}

function deleteGodownStockItem(godownId, productId) {
  const targetGodownId = Number(godownId);
  const targetProductId = Number(productId);

  if (!targetGodownId || !targetProductId) {
    return { success: false, message: 'Invalid godown stock item.' };
  }

  const existing = getGodownStockItemDetailStmt.get(targetGodownId, targetProductId);
  if (!existing) {
    return { success: false, message: 'Godown item not found.' };
  }

  const oldBoxes = Number(existing.total_boxes) || 0;
  const oldPieces = Number(existing.total_pieces) || 0;

  const tx = db.transaction(() => {
    deleteGodownStockRowStmt.run(targetGodownId, targetProductId);
    applyAggregateStockTotalsDelta(targetProductId, -oldBoxes, -oldPieces);
  });

  try {
    tx();
    return { success: true };
  } catch (error) {
    return { success: false, message: error.message || 'Unable to remove godown item.' };
  }
}

function getGodownStock(godownId, query = '') {
  try {
    const id = Number(godownId);
    if (!id) {
      return [];
    }
    const searchTerm = `%${String(query || '').trim()}%`;
    const stmt = db.prepare(
      `SELECT gs.product_id,
              p.name AS product_name,
              gs.purchase_rate AS rate,
              gs.packing_charge,
              gs.transport_charge,
              gs.agent_name,
              gs.selling_rate,
              gs.total_boxes,
              gs.pieces_per_box,
              COALESCE(gs.unit_type, 'Pcs') AS unit_type,
              gs.total_pieces,
              gs.last_purchase_date,
              COALESCE(gs.last_purchase_bill_no, '') AS last_purchase_bill_no
       FROM godown_stock gs
       JOIN products p ON p.id = gs.product_id
       WHERE gs.godown_id = ? AND p.name LIKE ?
       ORDER BY p.name ASC`
    );

    return stmt.all(id, searchTerm).map((row) => {
      const derivedPieces = (Number(row.total_boxes) || 0) * (Number(row.pieces_per_box) || 0);
      const totalPieces = derivedPieces > 0 ? derivedPieces : Number(row.total_pieces) || 0;
      const purchaseRate = Number(row.rate) || 0;
      const packingCharge = Number(row.packing_charge) || 0;
      const transportCharge = Number(row.transport_charge) || 0;
      const sellingRate = Number(row.selling_rate) || 0;

      return {
        ...row,
        unit_type: normalizeUnitType(row.unit_type) || 'Pcs',
        total_pieces: totalPieces,
        total_quantity: totalPieces,
        commission: sellingRate - (purchaseRate + packingCharge + transportCharge),
        total_value: totalPieces * purchaseRate
      };
    });
  } catch (_error) {
    return [];
  }
}

function getProducts() {
  try {
    const stmt = db.prepare(`SELECT id, name, rate FROM products ORDER BY name ASC`);
    return stmt.all();
  } catch (_error) {
    return [];
  }
}

function getPurchaseRates(query = '') {
  try {
    const searchTerm = `%${String(query || '').trim()}%`;
    const stmt = db.prepare(
      `SELECT pi.id, pu.date, p.name AS product_name,
              COALESCE(pu.bill_no, CAST(pu.id AS TEXT)) AS bill_no,
              COALESCE(pi.unit_type, 'Pcs') AS unit_type,
              pi.rate, COALESCE(pi.selling_rate, pi.rate) AS selling_rate,
              COALESCE(pi.discount_percent, 0) AS discount_percent,
              COALESCE(pi.packing_charge, 0) AS packing_charge,
              COALESCE(pi.transport_charge, 0) AS transport_charge,
              COALESCE(pi.agent_commission, 0) AS agent_commission,
              COALESCE(pi.agent_name, '') AS agent_name,
              pa.name AS party_name,
              pi.purchase_id
       FROM purchase_items pi
       JOIN purchases pu ON pu.id = pi.purchase_id
       JOIN products p ON p.id = pi.product_id
       JOIN parties pa ON pa.id = pu.party_id
       WHERE p.name LIKE ?
       ORDER BY pu.date DESC, pi.id DESC`
    );
    return stmt.all(searchTerm);
  } catch (_error) {
    return [];
  }
}

const updatePurchaseRateTxn = db.transaction((id, data) => {
  const rateId = Number(id);
  const item = getPurchaseItemByIdStmt.get(rateId);
  if (!item) {
    return { success: false, message: 'Rate entry not found' };
  }

  const updatedRate = Number(data.rate);
  if (!Number.isFinite(updatedRate) || updatedRate <= 0) {
    return { success: false, message: 'Invalid rate' };
  }

  const updatedDiscountPercent = Number.isFinite(Number(data.discount_percent))
    ? Number(data.discount_percent)
    : Number(item.discount_percent) || 0;

  const updatedPackingCharge = Number.isFinite(Number(data.packing_charge))
    ? Number(data.packing_charge)
    : Number(item.packing_charge) || 0;
  const updatedTransportCharge = Number.isFinite(Number(data.transport_charge))
    ? Number(data.transport_charge)
    : Number(item.transport_charge) || 0;
  const updatedAgentName = String(data.agent_name ?? item.agent_name ?? '').trim() || 'Supplier';
  const updatedAgentCommission = Number.isFinite(Number(data.agent_commission))
    ? Number(data.agent_commission)
    : Number(item.agent_commission) || 0;
  const updatedSellingRate = Number.isFinite(Number(data.selling_rate)) && Number(data.selling_rate) > 0
    ? Number(data.selling_rate)
    : Number(item.selling_rate) || updatedRate;
  const updatedUnitType = normalizeUnitType(data.unit_type || item.unit_type || 'Pcs');
  const updatedNotes = String(data.notes ?? item.notes ?? '').trim();

  if (!Number.isFinite(updatedAgentCommission) || updatedAgentCommission < 0) {
    return { success: false, message: 'Agent commission must be zero or more.' };
  }

  if (!updatedUnitType) {
    return { success: false, message: 'Unit type is required.' };
  }

  const lineBase = Number(item.boxes) * Number(item.pieces) * updatedRate;
  if (!Number.isFinite(updatedDiscountPercent) || updatedDiscountPercent < 0 || updatedDiscountPercent > lineBase) {
    return { success: false, message: 'Discount must be between 0 and line amount.' };
  }

  const discountAmount = updatedDiscountPercent;
  const updatedTotal = (lineBase - discountAmount)
    + updatedPackingCharge
    + updatedTransportCharge
    + updatedAgentCommission;
  updatePurchaseItemRateStmt.run(
    updatedRate,
    updatedDiscountPercent,
    updatedPackingCharge,
    updatedTransportCharge,
    updatedAgentName,
    updatedAgentCommission,
    updatedSellingRate,
    updatedUnitType,
    updatedNotes,
    updatedTotal,
    rateId
  );

  updateProductRateStmt.run(updatedSellingRate, item.product_id);
  syncGodownStockMeta(Number(item.godown_id), Number(item.product_id));
  recalculatePurchaseTotalAndLedger(item.purchase_id);
  return { success: true };
});

const deletePurchaseRateTxn = db.transaction((id) => {
  const rateId = Number(id);
  const item = getPurchaseItemByIdStmt.get(rateId);
  if (!item) {
    return { success: false, message: 'Rate entry not found' };
  }

  applyAggregateStockDelta(item.product_id, item.boxes, item.pieces, -1);
  const rollbackItem = {
    productId: item.product_id,
    boxes: Number(item.boxes),
    piecesPerBox: Number(item.pieces),
    rate: Number(item.rate),
    discountPercent: Number(item.discount_percent) || 0,
    packingCharge: Number(item.packing_charge) || 0,
    transportCharge: Number(item.transport_charge) || 0,
    agentName: String(item.agent_name || ''),
    agentCommission: Number(item.agent_commission) || 0,
    sellingRate: Number(item.selling_rate) || Number(item.rate) || 0
  };
  applyGodownStockDelta(rollbackItem, Number(item.godown_id), -1, item.date, item.bill_no || item.purchase_id);

  deletePurchaseItemStmt.run(rateId);
  syncGodownStockMeta(Number(item.godown_id), Number(item.product_id));

  const remaining = countPurchaseItemsStmt.get(item.purchase_id).item_count || 0;
  if (remaining === 0) {
    deleteLedgerByPurchaseStmt.run(item.purchase_id, `Purchase #${item.purchase_id}`);
    deletePurchaseStmt.run(item.purchase_id);
  } else {
    recalculatePurchaseTotalAndLedger(item.purchase_id);
  }

  return { success: true };
});

function updatePurchaseRate(id, data) {
  try {
    return updatePurchaseRateTxn(id, data || {});
  } catch (error) {
    return { success: false, message: error.message || 'Unable to update purchase rate.' };
  }
}

function deletePurchaseRate(id) {
  try {
    return deletePurchaseRateTxn(id);
  } catch (error) {
    return { success: false, message: error.message || 'Unable to delete purchase rate.' };
  }
}

module.exports = {
  addPurchase,
  updatePurchase,
  deletePurchase,
  getPurchaseDetails,
  getPurchases,
  getStock,
  getGodowns,
  addGodown,
  deleteGodown,
  updateGodownStockItem,
  deleteGodownStockItem,
  getGodownStock,
  getProducts,
  getPurchaseRates,
  updatePurchaseRate,
  deletePurchaseRate
};
