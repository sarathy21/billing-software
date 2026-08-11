const { app } = require('electron');
const db = require('./database/db.js');
const rawMaterialService = require('./services/rawMaterialService.js');

app.whenReady().then(() => {
  try {
    const res = rawMaterialService.deleteRawMaterialTransaction(1);
    console.log('[TEST-RESULT]', res);
  } catch(e) {
    console.error('[TEST-ERROR]', e);
  }
  app.quit();
});
