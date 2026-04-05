const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const dns = require('dns');
const { autoUpdater } = require('electron-updater');
const partyService = require('./services/partyService');
const paymentService = require('./services/paymentService');
const purchaseService = require('./services/purchaseService');
const salesService = require('./services/salesService');
const profitLossService = require('./services/profitLossService');
const settingsService = require('./services/settingsService');
const db = require('./database/db');

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
let updateCheckTimer = null;

function toCsv(rows) {
  if (!rows || rows.length === 0) {
    return '';
  }

  const headers = Object.keys(rows[0]);
  const escaped = (value) => {
    const text = String(value ?? '');
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((h) => escaped(row[h])).join(','));
  });
  return `${lines.join('\n')}\n`;
}

function parseCsv(content) {
  const lines = String(content || '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) {
    return [];
  }
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] || '';
    });
    return row;
  });
}

function createAutoBackup() {
  try {
    const autoDir = path.join(app.getPath('userData'), 'backups', 'auto');
    fs.mkdirSync(autoDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(autoDir, `auto-backup-${stamp}.db`);
    fs.copyFileSync(db.dbPath, filePath);

    const files = fs.readdirSync(autoDir)
      .filter((name) => name.endsWith('.db'))
      .map((name) => ({
        name,
        fullPath: path.join(autoDir, name),
        time: fs.statSync(path.join(autoDir, name)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time);

    files.slice(5).forEach((file) => {
      try {
        fs.unlinkSync(file.fullPath);
      } catch (_err) {
        // Ignore backup cleanup errors to avoid quitting issues.
      }
    });
  } catch (_err) {
    // Ignore auto-backup errors during shutdown.
  }
}

function hasInternetConnection(timeoutMs = 3500) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => finish(false), timeoutMs);
    dns.lookup('github.com', (error) => {
      finish(!error);
    });
  });
}

function configureAutoUpdater() {
  if (!app.isPackaged) {
    console.log('[updater] Skipping auto-update in development mode.');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: ${info.version}`);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] No update available.');
  });

  autoUpdater.on('error', (error) => {
    console.error('[updater] Error:', error && error.message ? error.message : error);
  });

  autoUpdater.on('update-downloaded', async (info) => {
    try {
      const result = await dialog.showMessageBox({
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded.`,
        detail: 'Restart the app to apply this update.'
      });

      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    } catch (error) {
      console.error('[updater] Failed to show update dialog:', error);
    }
  });
}

async function checkForUpdatesIfOnline() {
  if (!app.isPackaged) {
    return;
  }

  const online = await hasInternetConnection();
  if (!online) {
    console.log('[updater] Offline. Skipping update check.');
    return;
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    console.error('[updater] Failed to check for updates:', error && error.message ? error.message : error);
  }
}

function startAutoUpdateChecks() {
  if (!app.isPackaged) {
    return;
  }

  checkForUpdatesIfOnline();

  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
  }

  updateCheckTimer = setInterval(() => {
    checkForUpdatesIfOnline();
  }, UPDATE_CHECK_INTERVAL_MS);
}

ipcMain.handle('add-party', async (_event, data) => {
  return partyService.addParty(data);
});

ipcMain.handle('get-parties', async () => {
  return partyService.getParties();
});

ipcMain.handle('update-party', async (_event, id, data) => {
  return partyService.updateParty(id, data);
});

ipcMain.handle('delete-party', async (_event, id) => {
  return partyService.deleteParty(id);
});

ipcMain.handle('search-parties', async (_event, query) => {
  return partyService.searchParties(query);
});

ipcMain.handle('add-payment', async (_event, data) => {
  return paymentService.addPayment(data);
});

ipcMain.handle('update-payment', async (_event, id, data) => {
  return paymentService.updatePayment(id, data);
});

ipcMain.handle('delete-payment', async (_event, id) => {
  return paymentService.deletePayment(id);
});

ipcMain.handle('get-payments', async (_event, type) => {
  return paymentService.getPayments(type);
});

ipcMain.handle('get-ledger', async (_event, filters) => {
  return paymentService.getLedger(filters || {});
});

ipcMain.handle('add-purchase', async (_event, data) => {
  return purchaseService.addPurchase(data);
});

ipcMain.handle('update-purchase', async (_event, id, data) => {
  return purchaseService.updatePurchase(id, data);
});

ipcMain.handle('delete-purchase', async (_event, id) => {
  return purchaseService.deletePurchase(id);
});

ipcMain.handle('get-purchase-details', async (_event, id) => {
  return purchaseService.getPurchaseDetails(id);
});

ipcMain.handle('get-purchases', async () => {
  return purchaseService.getPurchases();
});

ipcMain.handle('get-stock', async () => {
  return purchaseService.getStock();
});

ipcMain.handle('get-godowns', async () => {
  return purchaseService.getGodowns();
});

ipcMain.handle('add-godown', async (_event, name) => {
  return purchaseService.addGodown(name);
});

ipcMain.handle('delete-godown', async (_event, id) => {
  return purchaseService.deleteGodown(id);
});

ipcMain.handle('get-godown-stock', async (_event, godownId, query) => {
  return purchaseService.getGodownStock(godownId, query || '');
});

ipcMain.handle('update-godown-stock-item', async (_event, godownId, productId, data) => {
  return purchaseService.updateGodownStockItem(godownId, productId, data || {});
});

ipcMain.handle('delete-godown-stock-item', async (_event, godownId, productId) => {
  return purchaseService.deleteGodownStockItem(godownId, productId);
});

ipcMain.handle('get-products', async () => {
  return purchaseService.getProducts();
});

ipcMain.handle('get-purchase-rates', async (_event, query) => {
  return purchaseService.getPurchaseRates(query || '');
});

ipcMain.handle('update-purchase-rate', async (_event, id, data) => {
  return purchaseService.updatePurchaseRate(id, data || {});
});

ipcMain.handle('delete-purchase-rate', async (_event, id) => {
  return purchaseService.deletePurchaseRate(id);
});

ipcMain.handle('add-sale', async (_event, data) => {
  return salesService.addSale(data);
});

ipcMain.handle('update-sale', async (_event, id, data) => {
  return salesService.updateSale(id, data);
});

ipcMain.handle('delete-sale', async (_event, id) => {
  return salesService.deleteSale(id);
});

ipcMain.handle('get-sale-details', async (_event, id) => {
  return salesService.getSaleDetails(id);
});

ipcMain.handle('get-sales', async () => {
  return salesService.getSales();
});

ipcMain.handle('get-profit-loss', async () => {
  return profitLossService.getProfitLoss();
});

ipcMain.handle('get-monthly-report', async () => {
  return profitLossService.getMonthlyReport();
});

ipcMain.handle('get-daily-report', async () => {
  return profitLossService.getDailyReport();
});

ipcMain.handle('get-party-report', async () => {
  return profitLossService.getDailyReport();
});

ipcMain.handle('get-expenses', async () => {
  return profitLossService.getExpenses();
});

ipcMain.handle('add-expense', async (_event, data) => {
  return profitLossService.addExpense(data || {});
});

ipcMain.handle('update-expense', async (_event, id, data) => {
  return profitLossService.updateExpense(id, data || {});
});

ipcMain.handle('delete-expense', async (_event, id) => {
  return profitLossService.deleteExpense(id);
});

ipcMain.handle('set-daily-report-values', async (_event, data) => {
  return profitLossService.setDailyReportValues(data || {});
});

ipcMain.handle('set-monthly-report-values', async (_event, data) => {
  return profitLossService.setMonthlyReportValues(data || {});
});

ipcMain.handle('get-settings', async () => {
  return settingsService.getSettings();
});

ipcMain.handle('save-settings', async (_event, data) => {
  return settingsService.saveSettings(data || {});
});

ipcMain.handle('create-backup', async () => {
  try {
    const defaultName = `backup-${new Date().toISOString().slice(0, 10)}.db`;
    const result = await dialog.showSaveDialog({
      title: 'Create Backup',
      defaultPath: path.join(app.getPath('documents'), defaultName),
      filters: [{ name: 'SQLite DB', extensions: ['db'] }]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, message: 'Backup cancelled.' };
    }

    fs.copyFileSync(db.dbPath, result.filePath);
    return { success: true, message: 'Backup created successfully.' };
  } catch (error) {
    return { success: false, message: error.message || 'Backup failed.' };
  }
});

ipcMain.handle('restore-backup', async () => {
  try {
    const result = await dialog.showOpenDialog({
      title: 'Restore Backup',
      properties: ['openFile'],
      filters: [{ name: 'SQLite DB', extensions: ['db'] }]
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, message: 'Restore cancelled.' };
    }

    const sourcePath = result.filePaths[0];
    db.close();
    fs.copyFileSync(sourcePath, db.dbPath);

    app.relaunch();
    app.exit(0);
    return { success: true, message: 'Backup restored. Restarting app.' };
  } catch (error) {
    return { success: false, message: error.message || 'Restore failed.' };
  }
});

ipcMain.handle('export-ledger-csv', async () => {
  try {
    const rows = db.prepare(
      `SELECT l.date, p.name AS party, l.type, l.account, l.particulars, l.amount, l.description
       FROM ledger l
       JOIN parties p ON p.id = l.party_id
       ORDER BY l.date ASC, l.id ASC`
    ).all();

    const save = await dialog.showSaveDialog({
      title: 'Export Ledger CSV',
      defaultPath: path.join(app.getPath('documents'), 'ledger-export.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (save.canceled || !save.filePath) {
      return { success: false, message: 'Export cancelled.' };
    }

    fs.writeFileSync(save.filePath, toCsv(rows), 'utf8');
    return { success: true, message: 'Ledger exported.' };
  } catch (error) {
    return { success: false, message: error.message || 'Ledger export failed.' };
  }
});

ipcMain.handle('export-sales-csv', async () => {
  try {
    const rows = db.prepare(
      `SELECT s.id, s.date, p.name AS party, s.type, s.discount, s.delivery_charges, s.total
       FROM sales s
       JOIN parties p ON p.id = s.party_id
       ORDER BY s.date DESC, s.id DESC`
    ).all();

    const save = await dialog.showSaveDialog({
      title: 'Export Sales CSV',
      defaultPath: path.join(app.getPath('documents'), 'sales-export.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (save.canceled || !save.filePath) {
      return { success: false, message: 'Export cancelled.' };
    }

    fs.writeFileSync(save.filePath, toCsv(rows), 'utf8');
    return { success: true, message: 'Sales exported.' };
  } catch (error) {
    return { success: false, message: error.message || 'Sales export failed.' };
  }
});

ipcMain.handle('export-purchases-csv', async () => {
  try {
    const rows = db.prepare(
      `SELECT pu.id, pu.date, p.name AS party, pu.total
       FROM purchases pu
       JOIN parties p ON p.id = pu.party_id
       ORDER BY pu.date DESC, pu.id DESC`
    ).all();

    const save = await dialog.showSaveDialog({
      title: 'Export Purchase CSV',
      defaultPath: path.join(app.getPath('documents'), 'purchase-export.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (save.canceled || !save.filePath) {
      return { success: false, message: 'Export cancelled.' };
    }

    fs.writeFileSync(save.filePath, toCsv(rows), 'utf8');
    return { success: true, message: 'Purchase exported.' };
  } catch (error) {
    return { success: false, message: error.message || 'Purchase export failed.' };
  }
});

ipcMain.handle('import-parties-csv', async () => {
  try {
    const open = await dialog.showOpenDialog({
      title: 'Import Parties CSV',
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (open.canceled || !open.filePaths || open.filePaths.length === 0) {
      return { success: false, message: 'Import cancelled.' };
    }

    const content = fs.readFileSync(open.filePaths[0], 'utf8');
    const rows = parseCsv(content);
    if (rows.length === 0) {
      return { success: false, message: 'No data rows found in CSV.' };
    }

    const findDupStmt = db.prepare(`SELECT id FROM parties WHERE lower(name) = lower(?) AND phone = ?`);
    const insertStmt = db.prepare(
      `INSERT INTO parties (name, city, state, phone, address, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    let inserted = 0;
    let skipped = 0;
    const txn = db.transaction(() => {
      rows.forEach((row) => {
        const name = String(row.name || '').trim();
        if (!name) {
          skipped += 1;
          return;
        }
        const phone = String(row.phone || '').trim();
        const duplicate = findDupStmt.get(name, phone);
        if (duplicate) {
          skipped += 1;
          return;
        }
        insertStmt.run(
          name,
          String(row.city || '').trim(),
          String(row.state || '').trim(),
          phone,
          String(row.address || '').trim(),
          String(row.notes || '').trim()
        );
        inserted += 1;
      });
    });

    txn();
    return {
      success: true,
      message: `Import complete. Inserted: ${inserted}, Skipped: ${skipped}`
    };
  } catch (error) {
    return { success: false, message: error.message || 'Import failed.' };
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('renderer/index.html');
}

app.whenReady().then(() => {
  createWindow();
  configureAutoUpdater();
  startAutoUpdateChecks();
});

app.on('before-quit', () => {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
  createAutoBackup();
});