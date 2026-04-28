const db = require('../database/db');

const insertLabourEntryStmt = db.prepare(
  `INSERT INTO labour_attendance (date, name, per_hour_cost, total_hours, total_salary, notes)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const updateLabourEntryStmt = db.prepare(
  `UPDATE labour_attendance
   SET date = ?, name = ?, per_hour_cost = ?, total_hours = ?, total_salary = ?, notes = ?
   WHERE id = ?`
);
const deleteLabourEntryStmt = db.prepare(`DELETE FROM labour_attendance WHERE id = ?`);
const getLabourEntryByIdStmt = db.prepare(`SELECT * FROM labour_attendance WHERE id = ?`);
const getLabourEntriesStmt = db.prepare(
  `SELECT id, date, name, per_hour_cost, total_hours, total_salary, COALESCE(notes, '') AS notes
   FROM labour_attendance
   ORDER BY date DESC, id DESC`
);

const getLabourWeeklySummaryStmt = db.prepare(
  `SELECT
      date(date, printf('+%d day', ((6 - CAST(strftime('%w', date) AS INTEGER) + 7) % 7))) AS week_end_saturday,
      COUNT(*) AS row_count,
      COALESCE(SUM(total_hours), 0) AS total_hours,
      COALESCE(SUM(total_salary), 0) AS total_salary
   FROM labour_attendance
   GROUP BY week_end_saturday
   ORDER BY week_end_saturday DESC`
);

function normalizePayload(raw = {}, fallback = null) {
  const date = String(raw.date ?? fallback?.date ?? '').trim() || new Date().toISOString().slice(0, 10);
  const name = String(raw.name ?? fallback?.name ?? '').trim();
  const perHourCost = Number(raw.per_hour_cost ?? fallback?.per_hour_cost);
  const totalHours = Number(raw.total_hours ?? fallback?.total_hours);
  const notes = String(raw.notes ?? fallback?.notes ?? '').trim();
  const totalSalary = Number.isFinite(Number(raw.total_salary))
    ? Number(raw.total_salary)
    : (Number.isFinite(perHourCost) ? perHourCost : 0) * (Number.isFinite(totalHours) ? totalHours : 0);

  return {
    date,
    name,
    perHourCost,
    totalHours,
    totalSalary,
    notes
  };
}

function validatePayload(payload) {
  if (!payload.date || !payload.name) {
    return 'Date and labour name are required.';
  }
  if (!Number.isFinite(payload.perHourCost) || payload.perHourCost < 0) {
    return 'Per hour cost must be zero or greater.';
  }
  if (!Number.isFinite(payload.totalHours) || payload.totalHours < 0) {
    return 'Total hours must be zero or greater.';
  }
  if (!Number.isFinite(payload.totalSalary) || payload.totalSalary < 0) {
    return 'Total salary must be zero or greater.';
  }
  return '';
}

function addLabourEntry(data) {
  try {
    const payload = normalizePayload(data || {}, null);
    const validation = validatePayload(payload);
    if (validation) {
      return { success: false, message: validation };
    }

    const result = insertLabourEntryStmt.run(
      payload.date,
      payload.name,
      payload.perHourCost,
      payload.totalHours,
      payload.totalSalary,
      payload.notes
    );

    return { success: true, id: Number(result.lastInsertRowid) };
  } catch (error) {
    return { success: false, message: error.message || 'Unable to add labour attendance row.' };
  }
}

function updateLabourEntry(id, data) {
  try {
    const rowId = Number(id);
    if (!rowId) {
      return { success: false, message: 'Invalid labour row.' };
    }

    const existing = getLabourEntryByIdStmt.get(rowId);
    if (!existing) {
      return { success: false, message: 'Labour row not found.' };
    }

    const payload = normalizePayload(data || {}, existing);
    const validation = validatePayload(payload);
    if (validation) {
      return { success: false, message: validation };
    }

    const result = updateLabourEntryStmt.run(
      payload.date,
      payload.name,
      payload.perHourCost,
      payload.totalHours,
      payload.totalSalary,
      payload.notes,
      rowId
    );

    return { success: result.changes > 0 };
  } catch (error) {
    return { success: false, message: error.message || 'Unable to update labour row.' };
  }
}

function deleteLabourEntry(id) {
  try {
    const result = deleteLabourEntryStmt.run(Number(id));
    return { success: result.changes > 0 };
  } catch (error) {
    return { success: false, message: error.message || 'Unable to delete labour row.' };
  }
}

function getLabourEntries() {
  try {
    return getLabourEntriesStmt.all();
  } catch (_error) {
    return [];
  }
}

function getLabourWeeklySummary() {
  try {
    return getLabourWeeklySummaryStmt.all();
  } catch (_error) {
    return [];
  }
}

module.exports = {
  addLabourEntry,
  updateLabourEntry,
  deleteLabourEntry,
  getLabourEntries,
  getLabourWeeklySummary
};
