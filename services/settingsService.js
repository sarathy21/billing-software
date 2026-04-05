const db = require('../database/db');

const defaultSettings = {
  shop_name: '',
  logo: '',
  address: '',
  phone: '',
  gst: '',
  email: ''
};

const getSettingsStmt = db.prepare(`SELECT id, shop_name, logo, address, phone, gst, email FROM settings WHERE id = 1`);
const insertDefaultSettingsStmt = db.prepare(
  `INSERT INTO settings (id, shop_name, logo, address, phone, gst, email)
   VALUES (1, ?, ?, ?, ?, ?, ?)`
);
const updateSettingsStmt = db.prepare(
  `UPDATE settings
   SET shop_name = ?, logo = ?, address = ?, phone = ?, gst = ?, email = ?
   WHERE id = 1`
);

function getSettings() {
  let settings = getSettingsStmt.get();
  if (!settings) {
    insertDefaultSettingsStmt.run(
      defaultSettings.shop_name,
      defaultSettings.logo,
      defaultSettings.address,
      defaultSettings.phone,
      defaultSettings.gst,
      defaultSettings.email
    );
    settings = getSettingsStmt.get();
  }
  return settings;
}

function saveSettings(data = {}) {
  const payload = {
    shop_name: String(data.shop_name || '').trim(),
    logo: String(data.logo || '').trim(),
    address: String(data.address || '').trim(),
    phone: String(data.phone || '').trim(),
    gst: String(data.gst || '').trim(),
    email: String(data.email || '').trim()
  };

  getSettings();
  const result = updateSettingsStmt.run(
    payload.shop_name,
    payload.logo,
    payload.address,
    payload.phone,
    payload.gst,
    payload.email
  );

  return { success: result.changes > 0, settings: getSettings() };
}

module.exports = {
  getSettings,
  saveSettings
};
