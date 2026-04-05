const db = require('../database/db');

const getTotalSalesStmt = db.prepare(`SELECT COALESCE(SUM(total), 0) AS total_sales FROM sales`);
const getTotalPurchaseStmt = db.prepare(`SELECT COALESCE(SUM(total), 0) AS total_purchase FROM purchases`);
const getExpenseProfitTotalStmt = db.prepare(
  `SELECT COALESCE(SUM(amount), 0) AS total_profit
   FROM expenses
   WHERE upper(type) = 'PROFIT'`
);
const getExpenseLossTotalStmt = db.prepare(
  `SELECT COALESCE(SUM(amount), 0) AS total_loss
   FROM expenses
   WHERE upper(type) = 'LOSS'`
);

const insertExpenseStmt = db.prepare(
  `INSERT INTO expenses (date, reason, type, amount)
   VALUES (?, ?, ?, ?)`
);

const updateExpenseStmt = db.prepare(
  `UPDATE expenses
   SET date = ?, reason = ?, type = ?, amount = ?
   WHERE id = ?`
);

const deleteExpenseStmt = db.prepare(`DELETE FROM expenses WHERE id = ?`);

const getExpensesStmt = db.prepare(
  `SELECT id, date, reason, upper(type) AS type, amount
   FROM expenses
   ORDER BY date DESC, id DESC`
);

const upsertReportOverrideStmt = db.prepare(
  `INSERT INTO report_overrides (scope, period_key, name, sales_value, purchase_value, updated_at)
   VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
   ON CONFLICT(scope, period_key, name)
   DO UPDATE SET
     sales_value = excluded.sales_value,
     purchase_value = excluded.purchase_value,
     updated_at = CURRENT_TIMESTAMP`
);

const getMonthlyStmt = db.prepare(
  `WITH months AS (
     SELECT strftime('%Y-%m', date) AS month FROM sales
     UNION
     SELECT strftime('%Y-%m', date) AS month FROM purchases
     UNION
     SELECT strftime('%Y-%m', date) AS month FROM expenses
   ),
   sales_month AS (
     SELECT strftime('%Y-%m', date) AS month, COALESCE(SUM(total), 0) AS sales_total
     FROM sales
     GROUP BY strftime('%Y-%m', date)
   ),
   purchase_month AS (
     SELECT strftime('%Y-%m', date) AS month, COALESCE(SUM(total), 0) AS purchase_total
     FROM purchases
     GROUP BY strftime('%Y-%m', date)
   ),
   expense_month AS (
     SELECT strftime('%Y-%m', date) AS month,
            COALESCE(SUM(CASE WHEN upper(type) = 'PROFIT' THEN amount ELSE 0 END), 0) AS extra_profit,
            COALESCE(SUM(CASE WHEN upper(type) = 'LOSS' THEN amount ELSE 0 END), 0) AS extra_loss
     FROM expenses
     GROUP BY strftime('%Y-%m', date)
   )
   SELECT m.month,
          COALESCE(rm.sales_value, COALESCE(sm.sales_total, 0)) AS sales,
          COALESCE(rm.purchase_value, COALESCE(pm.purchase_total, 0)) AS purchase,
          COALESCE(em.extra_profit, 0) AS extra_profit,
          COALESCE(em.extra_loss, 0) AS extra_loss,
          CASE WHEN (
            COALESCE(rm.sales_value, COALESCE(sm.sales_total, 0))
              - COALESCE(rm.purchase_value, COALESCE(pm.purchase_total, 0))
              + COALESCE(em.extra_profit, 0)
              - COALESCE(em.extra_loss, 0)
          ) > 0 THEN (
            COALESCE(rm.sales_value, COALESCE(sm.sales_total, 0))
              - COALESCE(rm.purchase_value, COALESCE(pm.purchase_total, 0))
              + COALESCE(em.extra_profit, 0)
              - COALESCE(em.extra_loss, 0)
          ) ELSE 0 END AS profit,
          CASE WHEN (
            COALESCE(rm.sales_value, COALESCE(sm.sales_total, 0))
              - COALESCE(rm.purchase_value, COALESCE(pm.purchase_total, 0))
              + COALESCE(em.extra_profit, 0)
              - COALESCE(em.extra_loss, 0)
          ) < 0 THEN ABS(
            COALESCE(rm.sales_value, COALESCE(sm.sales_total, 0))
              - COALESCE(rm.purchase_value, COALESCE(pm.purchase_total, 0))
              + COALESCE(em.extra_profit, 0)
              - COALESCE(em.extra_loss, 0)
          ) ELSE 0 END AS loss,
          (
            COALESCE(rm.sales_value, COALESCE(sm.sales_total, 0))
              - COALESCE(rm.purchase_value, COALESCE(pm.purchase_total, 0))
              + COALESCE(em.extra_profit, 0)
              - COALESCE(em.extra_loss, 0)
          ) AS net_value
   FROM months m
   LEFT JOIN sales_month sm ON sm.month = m.month
   LEFT JOIN purchase_month pm ON pm.month = m.month
   LEFT JOIN expense_month em ON em.month = m.month
   LEFT JOIN report_overrides rm ON rm.scope = 'MONTHLY' AND rm.period_key = m.month AND rm.name = ''
   WHERE m.month IS NOT NULL
   ORDER BY m.month DESC`
);

const getDailyStmt = db.prepare(
  `WITH sales_daily AS (
     SELECT date, party_id, COALESCE(SUM(total), 0) AS sales
     FROM sales
     GROUP BY date, party_id
   ),
   purchase_daily AS (
     SELECT date, party_id, COALESCE(SUM(total), 0) AS purchase
     FROM purchases
     GROUP BY date, party_id
   ),
   party_daily AS (
     SELECT date,
            party_id,
            COALESCE(SUM(sales), 0) AS sales,
            COALESCE(SUM(purchase), 0) AS purchase
     FROM (
       SELECT date, party_id, sales, 0 AS purchase FROM sales_daily
       UNION ALL
       SELECT date, party_id, 0 AS sales, purchase FROM purchase_daily
     ) merged
     GROUP BY date, party_id
   ),
   party_rows AS (
     SELECT pd.date,
            p.name AS name,
            pd.sales,
            pd.purchase,
            0 AS extra_profit,
            0 AS extra_loss
     FROM party_daily pd
     JOIN parties p ON p.id = pd.party_id
   ),
   expense_rows AS (
     SELECT e.date,
            e.reason AS name,
            0 AS sales,
            0 AS purchase,
            COALESCE(SUM(CASE WHEN upper(e.type) = 'PROFIT' THEN e.amount ELSE 0 END), 0) AS extra_profit,
            COALESCE(SUM(CASE WHEN upper(e.type) = 'LOSS' THEN e.amount ELSE 0 END), 0) AS extra_loss
     FROM expenses e
     GROUP BY e.date, e.reason
   ),
   daily_union AS (
     SELECT * FROM party_rows
     UNION ALL
     SELECT * FROM expense_rows
   ),
   daily_grouped AS (
     SELECT date,
            name,
            COALESCE(SUM(sales), 0) AS sales,
            COALESCE(SUM(purchase), 0) AS purchase,
            COALESCE(SUM(extra_profit), 0) AS extra_profit,
            COALESCE(SUM(extra_loss), 0) AS extra_loss
     FROM daily_union
     GROUP BY date, name
   )
   SELECT dg.date,
          dg.name,
          COALESCE(rd.sales_value, COALESCE(dg.sales, 0)) AS sales,
          COALESCE(rd.purchase_value, COALESCE(dg.purchase, 0)) AS purchase,
          CASE WHEN (
            COALESCE(rd.sales_value, COALESCE(dg.sales, 0))
              + COALESCE(dg.extra_profit, 0)
              - COALESCE(rd.purchase_value, COALESCE(dg.purchase, 0))
              - COALESCE(dg.extra_loss, 0)
          ) > 0
               THEN (
                 COALESCE(rd.sales_value, COALESCE(dg.sales, 0))
                   + COALESCE(dg.extra_profit, 0)
                   - COALESCE(rd.purchase_value, COALESCE(dg.purchase, 0))
                   - COALESCE(dg.extra_loss, 0)
               )
               ELSE 0 END AS profit,
          CASE WHEN (
            COALESCE(rd.sales_value, COALESCE(dg.sales, 0))
              + COALESCE(dg.extra_profit, 0)
              - COALESCE(rd.purchase_value, COALESCE(dg.purchase, 0))
              - COALESCE(dg.extra_loss, 0)
          ) < 0
               THEN ABS(
                 COALESCE(rd.sales_value, COALESCE(dg.sales, 0))
                   + COALESCE(dg.extra_profit, 0)
                   - COALESCE(rd.purchase_value, COALESCE(dg.purchase, 0))
                   - COALESCE(dg.extra_loss, 0)
               )
               ELSE 0 END AS loss
   FROM daily_grouped dg
   LEFT JOIN report_overrides rd
     ON rd.scope = 'DAILY'
     AND rd.period_key = dg.date
     AND rd.name = dg.name
   WHERE COALESCE(dg.sales, 0) != 0
      OR COALESCE(dg.purchase, 0) != 0
      OR COALESCE(dg.extra_profit, 0) != 0
      OR COALESCE(dg.extra_loss, 0) != 0
      OR rd.sales_value IS NOT NULL
      OR rd.purchase_value IS NOT NULL
   ORDER BY dg.date DESC, dg.name ASC`
);

const getItemProfitStmt = db.prepare(
  `WITH purchase_cost AS (
     SELECT product_id,
            CASE WHEN SUM(boxes * pieces) = 0 THEN 0
                 ELSE SUM(total) / SUM(boxes * pieces)
            END AS avg_purchase_rate
     FROM purchase_items
     GROUP BY product_id
   )
   SELECT COALESCE(SUM((si.rate - COALESCE(pc.avg_purchase_rate, 0)) * (si.boxes * si.pieces)), 0) AS item_profit
   FROM sale_items si
   LEFT JOIN purchase_cost pc ON pc.product_id = si.product_id`
);

function getTotalSales() {
  return getTotalSalesStmt.get().total_sales || 0;
}

function getTotalPurchase() {
  return getTotalPurchaseStmt.get().total_purchase || 0;
}

function getOtherProfitTotal() {
  return getExpenseProfitTotalStmt.get().total_profit || 0;
}

function getOtherLossTotal() {
  return getExpenseLossTotalStmt.get().total_loss || 0;
}

function normalizeExpenseType(type) {
  return String(type || '').trim().toUpperCase() === 'PROFIT' ? 'PROFIT' : 'LOSS';
}

function getProfitLoss() {
  const totalSales = getTotalSales();
  const totalPurchase = getTotalPurchase();
  const otherProfit = getOtherProfitTotal();
  const otherLoss = getOtherLossTotal();
  const adjustment = otherProfit - otherLoss;
  const netProfit = totalSales - totalPurchase + adjustment;
  const itemBasedProfit = getItemProfitStmt.get().item_profit || 0;

  return {
    totalSales,
    totalPurchase,
    otherProfit,
    otherLoss,
    adjustment,
    netProfit,
    itemBasedProfit
  };
}

function getMonthlyReport() {
  return getMonthlyStmt.all();
}

function getDailyReport() {
  return getDailyStmt.all();
}

function getExpenses() {
  return getExpensesStmt.all();
}

function addExpense(data) {
  const date = String(data?.date || new Date().toISOString().slice(0, 10)).trim();
  const reason = String(data?.reason || '').trim();
  const type = normalizeExpenseType(data?.type);
  const amount = Number(data?.amount);

  if (!date || !reason || !Number.isFinite(amount) || amount <= 0) {
    return { success: false, message: 'Date, reason and valid amount are required.' };
  }

  const result = insertExpenseStmt.run(date, reason, type, amount);
  return { success: result.changes > 0, id: Number(result.lastInsertRowid) };
}

function updateExpense(id, data) {
  const expenseId = Number(id);
  const date = String(data?.date || '').trim();
  const reason = String(data?.reason || '').trim();
  const type = normalizeExpenseType(data?.type);
  const amount = Number(data?.amount);

  if (!expenseId || !date || !reason || !Number.isFinite(amount) || amount <= 0) {
    return { success: false, message: 'Date, reason and valid amount are required.' };
  }

  const result = updateExpenseStmt.run(date, reason, type, amount, expenseId);
  return {
    success: result.changes > 0,
    message: result.changes > 0 ? 'Entry updated.' : 'Entry not found.'
  };
}

function deleteExpense(id) {
  const result = deleteExpenseStmt.run(Number(id));
  return {
    success: result.changes > 0,
    message: result.changes > 0 ? 'Entry deleted.' : 'Entry not found.'
  };
}

function setDailyReportValues(data) {
  const date = String(data?.date || '').trim();
  const name = String(data?.name || '').trim();
  const sales = Number(data?.sales);
  const purchase = Number(data?.purchase);

  if (!date || !name || !Number.isFinite(sales) || sales < 0 || !Number.isFinite(purchase) || purchase < 0) {
    return { success: false, message: 'Date, name, sales and purchase are required.' };
  }

  const result = upsertReportOverrideStmt.run('DAILY', date, name, sales, purchase);
  return { success: result.changes > 0 };
}

function setMonthlyReportValues(data) {
  const month = String(data?.month || '').trim();
  const sales = Number(data?.sales);
  const purchase = Number(data?.purchase);

  if (!month || !/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(sales) || sales < 0 || !Number.isFinite(purchase) || purchase < 0) {
    return { success: false, message: 'Valid month, sales and purchase are required.' };
  }

  const result = upsertReportOverrideStmt.run('MONTHLY', month, '', sales, purchase);
  return { success: result.changes > 0 };
}

module.exports = {
  getTotalSales,
  getTotalPurchase,
  getProfitLoss,
  getMonthlyReport,
  getDailyReport,
  getExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  setDailyReportValues,
  setMonthlyReportValues
};
