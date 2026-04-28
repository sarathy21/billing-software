const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Keep user data persistent across launches.
const RESET_USER_DATA_ON_START = false;

function resolveUserDataPath() {
  try {
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch (error) {
    console.error('[db] Failed to resolve userData path:', error);
  }

  // Fallback keeps the app running in non-Electron contexts (for example, node -e checks).
  return process.cwd();
}

const newDbPath = path.join(resolveUserDataPath(), 'billing.db');
const oldDbPath = path.join(__dirname, 'billing.db');

try {
  fs.mkdirSync(path.dirname(newDbPath), { recursive: true });

  if (RESET_USER_DATA_ON_START) {
    const dbFilesToRemove = [
      newDbPath,
      `${newDbPath}-wal`,
      `${newDbPath}-shm`,
      `${newDbPath}-journal`,
      oldDbPath,
      `${oldDbPath}-wal`,
      `${oldDbPath}-shm`,
      `${oldDbPath}-journal`
    ];

    dbFilesToRemove.forEach((filePath) => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (removeError) {
        console.error('[db] Failed to remove file during reset:', filePath, removeError);
      }
    });

    try {
      const backupDir = path.join(path.dirname(newDbPath), 'backups');
      fs.rmSync(backupDir, { recursive: true, force: true });
    } catch (backupRemoveError) {
      console.error('[db] Failed to remove backup directory during reset:', backupRemoveError);
    }

    console.log('[db] User data reset complete. Starting with fresh database.');
  } else if (fs.existsSync(oldDbPath) && !fs.existsSync(newDbPath)) {
    fs.copyFileSync(oldDbPath, newDbPath);
    console.log('[db] Migrated existing database to userData path.');
  }
} catch (error) {
  console.error('[db] Database initialization step failed:', error);
}

let db;
let activeDbPath = newDbPath;
try {
  db = new Database(newDbPath);
} catch (error) {
  console.error('[db] Failed to open database at userData path:', error);
  try {
    if (fs.existsSync(oldDbPath)) {
      db = new Database(oldDbPath);
      activeDbPath = oldDbPath;
      console.warn('[db] Using legacy database path as fallback.');
    } else {
      db = new Database(':memory:');
      activeDbPath = ':memory:';
      console.warn('[db] Using in-memory database as fallback.');
    }
  } catch (fallbackError) {
    console.error('[db] Failed to open fallback database:', fallbackError);
    throw fallbackError;
  }
}

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// create table
db.prepare(`
  CREATE TABLE IF NOT EXISTS parties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    city TEXT,
    state TEXT,
    phone TEXT,
    address TEXT,
    notes TEXT
  )
`).run();

const partyColumns = db.prepare(`PRAGMA table_info(parties)`).all();
const hasNotesColumn = partyColumns.some((col) => col.name === 'notes');

if (!hasNotesColumn) {
  db.prepare(`ALTER TABLE parties ADD COLUMN notes TEXT`).run();
}

db.prepare(`
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    party_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    mode TEXT,
    description TEXT,
    FOREIGN KEY (party_id) REFERENCES parties (id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    reason TEXT NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS report_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    period_key TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    sales_value REAL,
    purchase_value REAL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (scope, period_key, name)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    payment_id INTEGER,
    purchase_id INTEGER,
    sale_id INTEGER,
    party_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    account TEXT,
    particulars TEXT,
    amount REAL NOT NULL,
    description TEXT,
    FOREIGN KEY (party_id) REFERENCES parties (id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    party_id INTEGER NOT NULL,
    godown_id INTEGER,
    type TEXT NOT NULL,
    bill_no TEXT,
    bill_name TEXT,
    party_address TEXT,
    bill_time TEXT,
    delivery_date TEXT,
    vehicle_no TEXT,
    delivery_place TEXT,
    delivery_time TEXT,
    delivery_feedback TEXT,
    delivery_details TEXT,
    discount REAL NOT NULL DEFAULT 0,
    delivery_charges REAL NOT NULL DEFAULT 0,
    packing_charges REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL,
    FOREIGN KEY (party_id) REFERENCES parties (id),
    FOREIGN KEY (godown_id) REFERENCES godowns (id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    boxes INTEGER NOT NULL,
    pieces INTEGER NOT NULL,
    unit_type TEXT NOT NULL DEFAULT 'Pcs',
    rate REAL NOT NULL,
    total REAL NOT NULL,
    FOREIGN KEY (sale_id) REFERENCES sales (id),
    FOREIGN KEY (product_id) REFERENCES products (id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    rate REAL DEFAULT 0
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS godowns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS godown_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    godown_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    purchase_rate REAL NOT NULL DEFAULT 0,
    packing_charge REAL NOT NULL DEFAULT 0,
    transport_charge REAL NOT NULL DEFAULT 0,
    agent_name TEXT,
    selling_rate REAL NOT NULL DEFAULT 0,
    pieces_per_box INTEGER NOT NULL DEFAULT 1,
    unit_type TEXT NOT NULL DEFAULT 'Pcs',
    total_boxes INTEGER NOT NULL DEFAULT 0,
    total_pieces INTEGER NOT NULL DEFAULT 0,
    last_purchase_date TEXT,
    last_purchase_bill_no TEXT,
    UNIQUE (godown_id, product_id),
    FOREIGN KEY (godown_id) REFERENCES godowns (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_no TEXT,
    date TEXT NOT NULL,
    party_id INTEGER NOT NULL,
    total REAL NOT NULL,
    FOREIGN KEY (party_id) REFERENCES parties (id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    boxes INTEGER NOT NULL,
    pieces INTEGER NOT NULL,
    unit_type TEXT NOT NULL DEFAULT 'Pcs',
    rate REAL NOT NULL,
    discount_percent REAL NOT NULL DEFAULT 0,
    agent_commission REAL NOT NULL DEFAULT 0,
    notes TEXT,
    total REAL NOT NULL,
    FOREIGN KEY (purchase_id) REFERENCES purchases (id),
    FOREIGN KEY (product_id) REFERENCES products (id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY,
    shop_name TEXT,
    logo TEXT,
    address TEXT,
    phone TEXT,
    gst TEXT,
    email TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS stock (
    product_id INTEGER PRIMARY KEY,
    total_boxes INTEGER NOT NULL DEFAULT 0,
    total_pieces INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (product_id) REFERENCES products (id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS raw_material_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    party_id INTEGER NOT NULL,
    entry_type TEXT NOT NULL,
    product_name TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_type TEXT NOT NULL DEFAULT 'Pcs',
    rate REAL NOT NULL DEFAULT 0,
    purchase_place TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties (id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS purchase_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_no TEXT,
    date TEXT NOT NULL,
    party_id INTEGER NOT NULL,
    godown_id INTEGER,
    mode TEXT NOT NULL DEFAULT 'Credit',
    total REAL NOT NULL,
    reference_purchase_id INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties (id),
    FOREIGN KEY (godown_id) REFERENCES godowns (id),
    FOREIGN KEY (reference_purchase_id) REFERENCES purchases (id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS purchase_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_return_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    boxes INTEGER NOT NULL,
    pieces INTEGER NOT NULL,
    unit_type TEXT NOT NULL DEFAULT 'Pcs',
    rate REAL NOT NULL,
    total REAL NOT NULL,
    FOREIGN KEY (purchase_return_id) REFERENCES purchase_returns (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS sales_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_no TEXT,
    date TEXT NOT NULL,
    party_id INTEGER NOT NULL,
    godown_id INTEGER,
    mode TEXT NOT NULL DEFAULT 'Credit',
    total REAL NOT NULL,
    reference_sale_id INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (party_id) REFERENCES parties (id),
    FOREIGN KEY (godown_id) REFERENCES godowns (id),
    FOREIGN KEY (reference_sale_id) REFERENCES sales (id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS sales_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sales_return_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    boxes INTEGER NOT NULL,
    pieces INTEGER NOT NULL,
    unit_type TEXT NOT NULL DEFAULT 'Pcs',
    rate REAL NOT NULL,
    total REAL NOT NULL,
    FOREIGN KEY (sales_return_id) REFERENCES sales_returns (id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products (id)
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS labour_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    per_hour_cost REAL NOT NULL,
    total_hours REAL NOT NULL,
    total_salary REAL NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_raw_material_transactions_product
  ON raw_material_transactions (product_name)
`).run();

db.prepare(`
  CREATE INDEX IF NOT EXISTS idx_raw_material_transactions_date
  ON raw_material_transactions (date)
`).run();

const ledgerColumns = db.prepare(`PRAGMA table_info(ledger)`).all();
const hasPaymentIdColumn = ledgerColumns.some((col) => col.name === 'payment_id');
const hasPurchaseIdColumn = ledgerColumns.some((col) => col.name === 'purchase_id');
const hasSaleIdColumn = ledgerColumns.some((col) => col.name === 'sale_id');
const hasAccountColumn = ledgerColumns.some((col) => col.name === 'account');
const hasParticularsColumn = ledgerColumns.some((col) => col.name === 'particulars');
const purchaseItemColumns = db.prepare(`PRAGMA table_info(purchase_items)`).all();
const hasPurchaseItemNotesColumn = purchaseItemColumns.some((col) => col.name === 'notes');
const hasPurchaseItemUnitTypeColumn = purchaseItemColumns.some((col) => col.name === 'unit_type');
const hasPackingChargeColumn = purchaseItemColumns.some((col) => col.name === 'packing_charge');
const hasTransportChargeColumn = purchaseItemColumns.some((col) => col.name === 'transport_charge');
const hasAgentNameColumn = purchaseItemColumns.some((col) => col.name === 'agent_name');
const hasAgentCommissionColumn = purchaseItemColumns.some((col) => col.name === 'agent_commission');
const hasSellingRateColumn = purchaseItemColumns.some((col) => col.name === 'selling_rate');
const hasPurchaseItemDiscountColumn = purchaseItemColumns.some((col) => col.name === 'discount_percent');
const purchaseColumns = db.prepare(`PRAGMA table_info(purchases)`).all();
const hasPurchaseBillNoColumn = purchaseColumns.some((col) => col.name === 'bill_no');
const hasGodownIdColumn = purchaseColumns.some((col) => col.name === 'godown_id');
const hasDeliveryTypeColumn = purchaseColumns.some((col) => col.name === 'delivery_type');
const salesColumns = db.prepare(`PRAGMA table_info(sales)`).all();
const hasSalesGodownIdColumn = salesColumns.some((col) => col.name === 'godown_id');
const hasSalesBillNoColumn = salesColumns.some((col) => col.name === 'bill_no');
const hasSalesBillNameColumn = salesColumns.some((col) => col.name === 'bill_name');
const hasSalesPartyAddressColumn = salesColumns.some((col) => col.name === 'party_address');
const hasSalesBillTimeColumn = salesColumns.some((col) => col.name === 'bill_time');
const hasSalesDeliveryDateColumn = salesColumns.some((col) => col.name === 'delivery_date');
const hasSalesVehicleNoColumn = salesColumns.some((col) => col.name === 'vehicle_no');
const hasSalesDeliveryPlaceColumn = salesColumns.some((col) => col.name === 'delivery_place');
const hasSalesDeliveryTimeColumn = salesColumns.some((col) => col.name === 'delivery_time');
const hasSalesDeliveryFeedbackColumn = salesColumns.some((col) => col.name === 'delivery_feedback');
const hasSalesDeliveryDetailsColumn = salesColumns.some((col) => col.name === 'delivery_details');
const hasDiscountColumn = salesColumns.some((col) => col.name === 'discount');
const hasDeliveryColumn = salesColumns.some((col) => col.name === 'delivery_charges');
const hasPackingChargesColumn = salesColumns.some((col) => col.name === 'packing_charges');
const saleItemColumns = db.prepare(`PRAGMA table_info(sale_items)`).all();
const hasSaleItemUnitTypeColumn = saleItemColumns.some((col) => col.name === 'unit_type');
const godownStockColumns = db.prepare(`PRAGMA table_info(godown_stock)`).all();
const hasGodownStockUnitTypeColumn = godownStockColumns.some((col) => col.name === 'unit_type');
const hasGodownStockLastBillNoColumn = godownStockColumns.some((col) => col.name === 'last_purchase_bill_no');

if (!hasPaymentIdColumn) {
  db.prepare(`ALTER TABLE ledger ADD COLUMN payment_id INTEGER`).run();
}

if (!hasPurchaseIdColumn) {
  db.prepare(`ALTER TABLE ledger ADD COLUMN purchase_id INTEGER`).run();
}

if (!hasSaleIdColumn) {
  db.prepare(`ALTER TABLE ledger ADD COLUMN sale_id INTEGER`).run();
}

if (!hasAccountColumn) {
  db.prepare(`ALTER TABLE ledger ADD COLUMN account TEXT`).run();
}

if (!hasParticularsColumn) {
  db.prepare(`ALTER TABLE ledger ADD COLUMN particulars TEXT`).run();
}

if (!hasPurchaseItemNotesColumn) {
  db.prepare(`ALTER TABLE purchase_items ADD COLUMN notes TEXT`).run();
}

if (!hasPurchaseItemUnitTypeColumn) {
  db.prepare(`ALTER TABLE purchase_items ADD COLUMN unit_type TEXT NOT NULL DEFAULT 'Pcs'`).run();
}

if (!hasPackingChargeColumn) {
  db.prepare(`ALTER TABLE purchase_items ADD COLUMN packing_charge REAL NOT NULL DEFAULT 0`).run();
}

if (!hasTransportChargeColumn) {
  db.prepare(`ALTER TABLE purchase_items ADD COLUMN transport_charge REAL NOT NULL DEFAULT 0`).run();
}

if (!hasAgentNameColumn) {
  db.prepare(`ALTER TABLE purchase_items ADD COLUMN agent_name TEXT`).run();
}

if (!hasAgentCommissionColumn) {
  db.prepare(`ALTER TABLE purchase_items ADD COLUMN agent_commission REAL NOT NULL DEFAULT 0`).run();
}

if (!hasSellingRateColumn) {
  db.prepare(`ALTER TABLE purchase_items ADD COLUMN selling_rate REAL NOT NULL DEFAULT 0`).run();
}

if (!hasPurchaseItemDiscountColumn) {
  db.prepare(`ALTER TABLE purchase_items ADD COLUMN discount_percent REAL NOT NULL DEFAULT 0`).run();
}

if (!hasSaleItemUnitTypeColumn) {
  db.prepare(`ALTER TABLE sale_items ADD COLUMN unit_type TEXT NOT NULL DEFAULT 'Pcs'`).run();
}

if (!hasGodownStockUnitTypeColumn) {
  db.prepare(`ALTER TABLE godown_stock ADD COLUMN unit_type TEXT NOT NULL DEFAULT 'Pcs'`).run();
}

if (!hasGodownStockLastBillNoColumn) {
  db.prepare(`ALTER TABLE godown_stock ADD COLUMN last_purchase_bill_no TEXT`).run();
}

if (!hasPurchaseBillNoColumn) {
  db.prepare(`ALTER TABLE purchases ADD COLUMN bill_no TEXT`).run();
}

if (!hasGodownIdColumn) {
  db.prepare(`ALTER TABLE purchases ADD COLUMN godown_id INTEGER`).run();
}

if (!hasDeliveryTypeColumn) {
  db.prepare(`ALTER TABLE purchases ADD COLUMN delivery_type TEXT NOT NULL DEFAULT 'Cash'`).run();
}

if (!hasDiscountColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN discount REAL NOT NULL DEFAULT 0`).run();
}

if (!hasDeliveryColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN delivery_charges REAL NOT NULL DEFAULT 0`).run();
}

if (!hasPackingChargesColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN packing_charges REAL NOT NULL DEFAULT 0`).run();
}

if (!hasSalesGodownIdColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN godown_id INTEGER`).run();
}

if (!hasSalesBillNoColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN bill_no TEXT`).run();
}

if (!hasSalesBillNameColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN bill_name TEXT`).run();
}

if (!hasSalesPartyAddressColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN party_address TEXT`).run();
}

if (!hasSalesBillTimeColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN bill_time TEXT`).run();
}

if (!hasSalesDeliveryDateColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN delivery_date TEXT`).run();
}

if (!hasSalesVehicleNoColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN vehicle_no TEXT`).run();
}

if (!hasSalesDeliveryPlaceColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN delivery_place TEXT`).run();
}

if (!hasSalesDeliveryTimeColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN delivery_time TEXT`).run();
}

if (!hasSalesDeliveryFeedbackColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN delivery_feedback TEXT`).run();
}

if (!hasSalesDeliveryDetailsColumn) {
  db.prepare(`ALTER TABLE sales ADD COLUMN delivery_details TEXT`).run();
}

db.prepare(`UPDATE purchase_items SET unit_type = 'Pcs' WHERE unit_type IS NULL OR trim(unit_type) = ''`).run();
db.prepare(`UPDATE sale_items SET unit_type = 'Pcs' WHERE unit_type IS NULL OR trim(unit_type) = ''`).run();
db.prepare(`UPDATE godown_stock SET unit_type = 'Pcs' WHERE unit_type IS NULL OR trim(unit_type) = ''`).run();

db.prepare(`UPDATE purchase_items SET unit_type = 'Pcs' WHERE lower(unit_type) IN ('piece', 'pieces', 'pcs', 'pc')`).run();
db.prepare(`UPDATE sale_items SET unit_type = 'Pcs' WHERE lower(unit_type) IN ('piece', 'pieces', 'pcs', 'pc')`).run();
db.prepare(`UPDATE godown_stock SET unit_type = 'Pcs' WHERE lower(unit_type) IN ('piece', 'pieces', 'pcs', 'pc')`).run();

db.prepare(`UPDATE purchase_items SET unit_type = 'Box' WHERE lower(unit_type) IN ('box', 'boxes', 'case', 'cases')`).run();
db.prepare(`UPDATE sale_items SET unit_type = 'Box' WHERE lower(unit_type) IN ('box', 'boxes', 'case', 'cases')`).run();
db.prepare(`UPDATE godown_stock SET unit_type = 'Box' WHERE lower(unit_type) IN ('box', 'boxes', 'case', 'cases')`).run();

db.prepare(`UPDATE purchase_items SET unit_type = 'Unit' WHERE lower(unit_type) IN ('unit', 'units', 'nos', 'no', 'number', 'numbers')`).run();
db.prepare(`UPDATE sale_items SET unit_type = 'Unit' WHERE lower(unit_type) IN ('unit', 'units', 'nos', 'no', 'number', 'numbers')`).run();
db.prepare(`UPDATE godown_stock SET unit_type = 'Unit' WHERE lower(unit_type) IN ('unit', 'units', 'nos', 'no', 'number', 'numbers')`).run();

db.prepare(`UPDATE purchase_items SET unit_type = 'Pkt' WHERE lower(unit_type) IN ('pkt', 'packet', 'packets', 'pack')`).run();
db.prepare(`UPDATE sale_items SET unit_type = 'Pkt' WHERE lower(unit_type) IN ('pkt', 'packet', 'packets', 'pack')`).run();
db.prepare(`UPDATE godown_stock SET unit_type = 'Pkt' WHERE lower(unit_type) IN ('pkt', 'packet', 'packets', 'pack')`).run();

const firstGodown = db.prepare(`SELECT id FROM godowns ORDER BY id ASC LIMIT 1`).get();
if (firstGodown) {
  db.prepare(`UPDATE purchases SET godown_id = ? WHERE godown_id IS NULL OR godown_id = 0`).run(firstGodown.id);
}

db.prepare(`UPDATE purchases SET delivery_type = 'Cash' WHERE delivery_type IS NULL OR trim(delivery_type) = ''`).run();
db.prepare(`UPDATE purchases SET bill_no = CAST(id AS TEXT) WHERE bill_no IS NULL OR trim(bill_no) = ''`).run();
db.prepare(`UPDATE sales SET bill_no = CAST(id AS TEXT) WHERE bill_no IS NULL OR trim(bill_no) = ''`).run();

const godownStockCount = db.prepare(`SELECT COUNT(*) AS count FROM godown_stock`).get().count || 0;
if (godownStockCount === 0 && firstGodown) {
  const rows = db.prepare(
    `SELECT s.product_id, s.total_boxes, s.total_pieces, COALESCE(p.rate, 0) AS rate
     FROM stock s
     JOIN products p ON p.id = s.product_id
     WHERE s.total_boxes > 0 OR s.total_pieces > 0`
  ).all();

  const seedGodownStockStmt = db.prepare(
    `INSERT INTO godown_stock (
      godown_id, product_id, purchase_rate, packing_charge, transport_charge,
      agent_name, selling_rate, pieces_per_box, unit_type, total_boxes, total_pieces, last_purchase_date, last_purchase_bill_no
    ) VALUES (?, ?, ?, 0, 0, '', ?, ?, 'Pcs', ?, ?, NULL, NULL)`
  );

  const seedTxn = db.transaction((seedRows) => {
    seedRows.forEach((row) => {
      const piecesPerBox = Number(row.total_boxes) > 0
        ? Math.max(1, Math.round(Number(row.total_pieces) / Number(row.total_boxes)))
        : 1;
      seedGodownStockStmt.run(
        firstGodown.id,
        row.product_id,
        Number(row.rate) || 0,
        Number(row.rate) || 0,
        piecesPerBox,
        Number(row.total_boxes) || 0,
        Number(row.total_pieces) || 0
      );
    });
  });

  seedTxn(rows);
}

db.dbPath = activeDbPath;

module.exports = db;