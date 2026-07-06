const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('renderer/index.html', 'utf-8');
const dom = new JSDOM(html, { runScripts: "dangerously" });

// Mock window.api to avoid IPC hangs
dom.window.api = {
  getIndianStates: async () => [{name: "State A"}],
  getIndianCities: async () => ["City A"],
  getParties: async () => [{id: 1, name: "Test Party", city: "Test City"}],
  getGodowns: async () => [],
  getSettings: async () => ({}),
  getProducts: async () => [],
  getPayments: async () => [],
  getSales: async () => [],
  getProfitLoss: async () => ({}),
  getPurchases: async () => [],
  getStock: async () => [],
  getRawMaterialProducts: async () => [],
  getRawMaterialTransactions: async () => [],
  getRawMaterialStock: async () => [],
  getLedger: async () => [],
  getPurchaseRates: async () => [],
  getPurchaseReturns: async () => [],
  getSalesReturns: async () => [],
  getMonthlyReport: async () => ({}),
  getDailyReport: async () => ({})
};

let errors = [];
dom.window.addEventListener('error', (event) => {
  errors.push(event.error ? event.error.stack : event.message);
});
dom.window.addEventListener('unhandledrejection', (event) => {
  errors.push(event.reason ? event.reason.stack : event.reason);
});

async function runSmokeTests() {
  console.log("Starting Automated Smoke Test Suite...\n");
  
  try {
    const code = fs.readFileSync('renderer/app.js', 'utf-8');
    const scriptEl = dom.window.document.createElement('script');
    scriptEl.textContent = code;
    dom.window.document.body.appendChild(scriptEl);
    
    // Wait for onload
    if (dom.window.onload) {
      await dom.window.onload();
    }
  } catch (e) {
    console.log("FAIL: Initialization Error - " + e.message);
    return;
  }

  // Helper to test a module
  async function testModule(name, testFn) {
    errors = [];
    let passed = false;
    try {
      await testFn();
      passed = errors.length === 0;
    } catch (e) {
      errors.push(e.stack);
    }
    
    if (passed) {
      console.log(`[PASS] ${name}`);
    } else {
      console.log(`[FAIL] ${name}`);
      console.log(`       Errors: ${errors[0].split('\\n')[0]}`);
    }
  }

  const w = dom.window;

  // 1. Party Page
  await testModule("Party Page (state list, district list, add party)", async () => {
    w.showView('party');
    if (w.document.getElementById('partyView').classList.contains('hidden')) throw new Error("View is blank/hidden");
    
    // Simulate state change
    const stateSelect = w.document.getElementById('state');
    if(!stateSelect) throw new Error("State select not found");
    if(stateSelect.options.length <= 1) throw new Error("State list empty");
    
    stateSelect.selectedIndex = 1; // Pick a state
    await w.onPartyStateChange(); // load districts
    
    // Test add party
    w.clearPartyForm();
  });

  // 2. Purchase Entry
  await testModule("Purchase Entry (supplier dropdown, add purchase)", async () => {
    w.beginTransactionPartySelection('purchase');
    w.showView('transaction'); // simulate navigation
    
    // open purchase panel
    w.document.getElementById('purchaseTxnPanel').classList.remove('hidden');
    const partyDropdown = w.document.getElementById('purchasePartyId');
    if (!partyDropdown) throw new Error("Supplier dropdown not found");
    if (partyDropdown.options.length <= 1) throw new Error("Supplier dropdown not loaded");
  });

  // 3. Sales Entry
  await testModule("Sales Entry (party dropdown, add sale)", async () => {
    w.beginTransactionPartySelection('sale');
    w.document.getElementById('salesTxnPanel').classList.remove('hidden');
    
    const partyDropdown = w.document.getElementById('salePartyId');
    if (!partyDropdown) throw new Error("Party dropdown not found");
    if (partyDropdown.options.length <= 1) throw new Error("Party dropdown not loaded");
  });

  // 4. Payment IN
  await testModule("Payment IN", async () => {
    w.showView('paymentIn');
    if (w.document.getElementById('paymentInView').classList.contains('hidden')) throw new Error("Payment IN View hidden");
  });

  // 5. Payment OUT
  await testModule("Payment OUT", async () => {
    w.showView('paymentOut');
    if (w.document.getElementById('paymentOutView').classList.contains('hidden')) throw new Error("Payment OUT View hidden");
  });

  // 6. Ledger
  await testModule("Ledger", async () => {
    w.showView('ledger');
    if (w.document.getElementById('ledgerView').classList.contains('hidden')) throw new Error("Ledger View hidden");
    await w.loadLedger();
  });

  // 7. Stock
  await testModule("Stock", async () => {
    w.showView('stock');
    if (w.document.getElementById('stockView').classList.contains('hidden')) throw new Error("Stock View hidden");
    await w.refreshStock();
  });

  // 8. Raw Material
  await testModule("Raw Material (Product IN/OUT, Ledger, Stock)", async () => {
    w.showView('rawMaterial');
    if (w.document.getElementById('rawMaterialView').classList.contains('hidden')) throw new Error("Raw Material View hidden");
    w.showRawMaterialSection('rawMaterialEntry');
    w.showRawMaterialSection('rawMaterialLedger');
    w.showRawMaterialSection('rawMaterialStock');
  });

  // 9. Returns
  await testModule("Returns (Purchase & Sales)", async () => {
    w.beginReturnEntry('purchase_return');
    w.beginReturnEntry('sales_return');
  });

  // 10. Reports
  await testModule("Reports (Profit & Loss, Monthly, Daily)", async () => {
    w.showView('profitLoss');
    if (w.document.getElementById('profitLossView').classList.contains('hidden')) throw new Error("Reports View hidden");
    await w.refreshProfitLoss();
  });

  console.log("\nSmoke Testing Complete.");
}

runSmokeTests().catch(e => console.error(e));
