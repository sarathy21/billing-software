const db = require('../database/db');

let StateLibrary = null;
let CityLibrary = null;
try {
  ({ State: StateLibrary, City: CityLibrary } = require('country-state-city'));
} catch (_error) {
  StateLibrary = null;
  CityLibrary = null;
}

const fallbackStateNames = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry'
];

const countPaymentRefsStmt = db.prepare(`SELECT COUNT(*) AS count FROM payments WHERE party_id = ?`);
const countPurchaseRefsStmt = db.prepare(`SELECT COUNT(*) AS count FROM purchases WHERE party_id = ?`);
const countSaleRefsStmt = db.prepare(`SELECT COUNT(*) AS count FROM sales WHERE party_id = ?`);
const countLedgerRefsStmt = db.prepare(`SELECT COUNT(*) AS count FROM ledger WHERE party_id = ?`);
const findDuplicatePartyStmt = db.prepare(
  `SELECT id FROM parties WHERE lower(name) = lower(?) AND phone = ? LIMIT 1`
);
const findDuplicatePartyExcludingIdStmt = db.prepare(
  `SELECT id FROM parties WHERE lower(name) = lower(?) AND phone = ? AND id != ? LIMIT 1`
);

function addParty(data) {
  const name = String(data.name || '').trim();
  const phone = String(data.phone || '').trim();
  if (!name) {
    return { success: false, message: 'Party name is required.' };
  }
  const duplicate = findDuplicatePartyStmt.get(name, phone);
  if (duplicate) {
    return { success: false, message: 'Duplicate party exists with same name and phone.' };
  }

  const stmt = db.prepare(`
    INSERT INTO parties (name, city, state, phone, address, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    name,
    data.city,
    data.state,
    phone,
    data.address,
    data.notes || ''
  );

  return { success: result.changes > 0, id: result.lastInsertRowid };
}

function getParties() {
  return db.prepare(`SELECT * FROM parties ORDER BY id DESC`).all();
}

function updateParty(id, data) {
  const partyId = Number(id);
  const name = String(data.name || '').trim();
  const phone = String(data.phone || '').trim();
  if (!name) {
    return { success: false, message: 'Party name is required.', changes: 0 };
  }

  const duplicate = findDuplicatePartyExcludingIdStmt.get(name, phone, partyId);
  if (duplicate) {
    return { success: false, message: 'Duplicate party exists with same name and phone.', changes: 0 };
  }

  const stmt = db.prepare(`
    UPDATE parties
    SET name = ?, city = ?, state = ?, phone = ?, address = ?, notes = ?
    WHERE id = ?
  `);

  const result = stmt.run(
    name,
    data.city,
    data.state,
    phone,
    data.address,
    data.notes || '',
    partyId
  );

  return {
    success: result.changes > 0,
    message: result.changes > 0 ? 'Party updated.' : 'Party not found.',
    changes: result.changes
  };
}

function deleteParty(id) {
  const partyId = Number(id);
  const paymentRefs = countPaymentRefsStmt.get(partyId).count || 0;
  const purchaseRefs = countPurchaseRefsStmt.get(partyId).count || 0;
  const saleRefs = countSaleRefsStmt.get(partyId).count || 0;
  const ledgerRefs = countLedgerRefsStmt.get(partyId).count || 0;
  const totalRefs = paymentRefs + purchaseRefs + saleRefs + ledgerRefs;

  if (totalRefs > 0) {
    return {
      success: false,
      message: 'Cannot delete party. Existing payments, purchases, sales or ledger entries are linked to this party.',
      changes: 0
    };
  }

  try {
    const stmt = db.prepare(`DELETE FROM parties WHERE id = ?`);
    const result = stmt.run(partyId);
    return {
      success: result.changes > 0,
      message: result.changes > 0 ? 'Party deleted.' : 'Party not found.',
      changes: result.changes
    };
  } catch (_err) {
    return {
      success: false,
      message: 'Cannot delete party because related records exist.',
      changes: 0
    };
  }
}

function searchParties(query) {
  const searchTerm = `%${String(query || '').trim()}%`;
  const stmt = db.prepare(`
    SELECT * FROM parties
    WHERE name LIKE ? OR city LIKE ? OR state LIKE ? OR phone LIKE ? OR address LIKE ?
    ORDER BY id DESC
  `);
  return stmt.all(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
}

function getIndianStates() {
  if (StateLibrary && typeof StateLibrary.getStatesOfCountry === 'function') {
    const states = StateLibrary.getStatesOfCountry('IN') || [];
    return states
      .map((stateItem) => ({
        name: String(stateItem?.name || '').trim(),
        isoCode: String(stateItem?.isoCode || '').trim()
      }))
      .filter((stateItem) => stateItem.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  }

  return fallbackStateNames
    .map((name) => ({ name, isoCode: '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
}

function getIndianCities(stateNameOrCode) {
  const stateNeedle = String(stateNameOrCode || '').trim();
  if (!stateNeedle) {
    return [];
  }

  if (!(StateLibrary && CityLibrary)) {
    return [];
  }

  const states = StateLibrary.getStatesOfCountry('IN') || [];
  const selectedState = states.find((stateItem) => (
    String(stateItem?.isoCode || '').toLowerCase() === stateNeedle.toLowerCase()
      || String(stateItem?.name || '').toLowerCase() === stateNeedle.toLowerCase()
  ));

  if (!selectedState || !selectedState.isoCode) {
    return [];
  }

  const uniqueCityNames = new Set();
  (CityLibrary.getCitiesOfState('IN', selectedState.isoCode) || []).forEach((cityItem) => {
    const name = String(cityItem?.name || '').trim();
    if (name) {
      uniqueCityNames.add(name);
    }
  });

  return Array.from(uniqueCityNames)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

module.exports = {
  addParty,
  getParties,
  updateParty,
  deleteParty,
  searchParties,
  getIndianStates,
  getIndianCities
};