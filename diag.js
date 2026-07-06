const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const html = fs.readFileSync('renderer/index.html', 'utf-8');
const dom = new JSDOM(html, { runScripts: "dangerously" });

// Mock window.api
dom.window.api = {
  getIndianStates: async () => [{name: "State A"}],
  getIndianCities: async () => ["City A"],
  getParties: async () => [],
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
  getPurchaseRates: async () => []
};

// Add error listener
dom.window.addEventListener('error', (event) => {
  console.error("JSDOM ERROR:", event.error);
});
dom.window.addEventListener('unhandledrejection', (event) => {
  console.error("JSDOM UNHANDLED REJECTION:", event.reason);
});

try {
  const code = fs.readFileSync('renderer/app.js', 'utf-8');
  const scriptEl = dom.window.document.createElement('script');
  scriptEl.textContent = code;
  dom.window.document.body.appendChild(scriptEl);
  
  setTimeout(() => {
    // Manually trigger onload if needed
    if (dom.window.onload) {
      console.log('Triggering window.onload...');
      dom.window.onload().catch(e => console.error('ONLOAD REJECTION:', e.stack));
    }
  }, 1000);
} catch (e) {
  console.error("RUNTIME ERROR:", e);
}
