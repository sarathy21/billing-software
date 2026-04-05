let currentParties = [];
let currentPayments = [];
let currentExpenses = [];
let currentMonthlyReportRows = [];
let currentDailyReportRows = [];
let purchaseItemsDraft = [];
let saleItemsDraft = [];
let productCatalog = [];
let selectedSaleDetail = null;
let currentPurchaseRates = [];
let currentSettings = null;
let currentGodowns = [];
let currentGodownStockRows = [];
let selectedGodownId = null;
let purchaseDeliveryTypeDraft = 'Cash';
const LOW_STOCK_QTY_THRESHOLD = 25;
let activeEditorDialogResolve = null;

function showLoading(show) {
  const el = document.getElementById('globalLoading');
  if (!el) {
    return;
  }
  el.classList.toggle('hidden', !show);
}

function showToast(message, isError = false) {
  const toast = document.getElementById('globalToast');
  if (!toast) {
    return;
  }
  toast.textContent = String(message || 'Done');
  toast.classList.remove('hidden', 'bg-green-700', 'bg-red-700');
  toast.classList.add(isError ? 'bg-red-700' : 'bg-green-700');
  window.setTimeout(() => toast.classList.add('hidden'), 2200);
}

function ensureEditorDialog() {
  let overlay = document.getElementById('editorDialogOverlay');
  if (overlay) {
    return overlay;
  }

  overlay = document.createElement('div');
  overlay.id = 'editorDialogOverlay';
  overlay.className = 'hidden fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center p-4';
  overlay.innerHTML = `
    <div class="bg-white rounded shadow-lg w-full max-w-2xl">
      <div class="px-4 py-3 border-b">
        <h3 id="editorDialogTitle" class="text-lg font-semibold">Edit</h3>
      </div>
      <div id="editorDialogFields" class="p-4 grid grid-cols-1 md:grid-cols-2 gap-3"></div>
      <div class="px-4 py-3 border-t text-right">
        <button id="editorDialogCancel" class="bg-gray-500 text-white px-4 py-2 rounded mr-2">Cancel</button>
        <button id="editorDialogSave" class="bg-blue-700 text-white px-4 py-2 rounded">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const cancelBtn = document.getElementById('editorDialogCancel');
  const saveBtn = document.getElementById('editorDialogSave');
  const fieldsWrap = document.getElementById('editorDialogFields');

  cancelBtn.addEventListener('click', () => closeEditorDialog(null));
  saveBtn.addEventListener('click', () => {
    const values = {};
    fieldsWrap.querySelectorAll('[data-editor-key]').forEach((el) => {
      values[el.getAttribute('data-editor-key')] = el.value;
    });
    closeEditorDialog(values);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeEditorDialog(null);
    }
  });

  return overlay;
}

function closeEditorDialog(result) {
  const overlay = document.getElementById('editorDialogOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }

  if (activeEditorDialogResolve) {
    const resolver = activeEditorDialogResolve;
    activeEditorDialogResolve = null;
    resolver(result);
  }
}

function openEditorDialog(title, fields) {
  const overlay = ensureEditorDialog();
  const titleEl = document.getElementById('editorDialogTitle');
  const fieldsWrap = document.getElementById('editorDialogFields');
  titleEl.textContent = String(title || 'Edit');
  fieldsWrap.innerHTML = '';

  (fields || []).forEach((field) => {
    const wrapper = document.createElement('div');
    wrapper.className = field.fullWidth ? 'md:col-span-2' : '';

    const label = document.createElement('label');
    label.className = 'block text-sm text-gray-600 mb-1';
    label.textContent = field.label || field.key;

    let input;
    if (field.type === 'select') {
      input = document.createElement('select');
      (field.options || []).forEach((optionValue) => {
        const option = document.createElement('option');
        option.value = String(optionValue);
        option.textContent = String(optionValue);
        input.appendChild(option);
      });
    } else {
      input = document.createElement('input');
      input.type = field.type || 'text';
      if (field.step) {
        input.step = field.step;
      }
      if (field.min !== undefined) {
        input.min = String(field.min);
      }
    }

    input.className = 'border p-2 w-full';
    input.setAttribute('data-editor-key', field.key);
    input.value = field.value !== undefined && field.value !== null ? String(field.value) : '';

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    fieldsWrap.appendChild(wrapper);
  });

  overlay.classList.remove('hidden');
  const first = fieldsWrap.querySelector('[data-editor-key]');
  if (first) {
    first.focus();
  }

  return new Promise((resolve) => {
    activeEditorDialogResolve = resolve;
  });
}

async function withLoading(task) {
  showLoading(true);
  try {
    return await task();
  } finally {
    showLoading(false);
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function setActiveSidebar(view) {
  const navButtons = document.querySelectorAll('[data-nav-view]');
  navButtons.forEach((button) => {
    const isActive = button.getAttribute('data-nav-view') === view;
    button.classList.remove('bg-blue-900', 'bg-blue-950');
    button.classList.toggle('bg-blue-950', isActive);
    button.classList.toggle('ring-2', isActive);
    button.classList.toggle('ring-blue-200', isActive);
    button.classList.toggle('bg-blue-800', !isActive);
  });
}

function showView(view) {
  const views = {
    party: document.getElementById('partyView'),
    paymentIn: document.getElementById('paymentInView'),
    paymentOut: document.getElementById('paymentOutView'),
    sales: document.getElementById('salesView'),
    crackers: document.getElementById('crackersView'),
    profitLoss: document.getElementById('profitLossView'),
    ledger: document.getElementById('ledgerView'),
    purchase: document.getElementById('purchaseView'),
    stock: document.getElementById('stockView'),
    profile: document.getElementById('profileView')
  };

  Object.values(views).forEach((el) => {
    if (el) {
      el.classList.add('hidden');
    }
  });

  if (!views[view]) {
    return;
  }

  views[view].classList.remove('hidden');
  setActiveSidebar(view);

  if (view !== 'paymentIn' && view !== 'paymentOut') {
    cancelPaymentEdit();
  }

  if (view === 'ledger') {
    loadLedger();
  }
  if (view === 'purchase') {
    refreshPurchases();
  }
  if (view === 'stock') {
    goBackToGodownList();
    refreshGodowns();
    if (selectedGodownId) {
      refreshStock();
    }
  }
  if (view === 'sales') {
    refreshSales();
  }
  if (view === 'profitLoss') {
    refreshProfitLoss();
  }
  if (view === 'crackers') {
    refreshPurchaseRates();
  }
  if (view === 'paymentIn' || view === 'paymentOut') {
    refreshPayments();
  }
  if (view === 'profile') {
    loadProfileSettings();
  }
}

function setDefaultDates() {
  const today = new Date().toISOString().slice(0, 10);
  const setValue = (id, value) => {
    const el = document.getElementById(id);
    if (el) {
      el.value = value;
    }
  };

  setValue('paymentInDate', today);
  setValue('paymentOutDate', today);
  setValue('editPaymentDate', today);
  setValue('expenseDate', today);
  setValue('purchaseDate', today);
  setValue('saleDate', today);
  setValue('saleDeliveryCharges', '0');
  setValue('saleDiscount', '0');
  setValue('purchaseUnitType', 'Pcs');
  setValue('saleUnitType', 'Pcs');
}

function setPartyEditMode(id) {
  document.getElementById('editingPartyId').value = id ? String(id) : '';
  document.getElementById('submitBtn').textContent = id ? 'Update' : 'Add';
}

function clearPartyForm() {
  document.getElementById('name').value = '';
  document.getElementById('city').value = '';
  document.getElementById('state').value = '';
  document.getElementById('phone').value = '';
  document.getElementById('address').value = '';
  document.getElementById('feedback').value = '';
  setPartyEditMode(null);
}

function getPartyFormData() {
  return {
    name: document.getElementById('name').value.trim(),
    city: document.getElementById('city').value.trim(),
    state: document.getElementById('state').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    address: document.getElementById('address').value.trim(),
    notes: document.getElementById('feedback').value.trim()
  };
}

function renderParties(parties) {
  currentParties = parties;
  const table = document.getElementById('partyTable');
  table.innerHTML = '';

  parties.forEach((party) => {
    table.innerHTML += `
      <tr class="border-t">
        <td class="p-2">${escapeHtml(party.name)}</td>
        <td class="p-2">${escapeHtml(party.city)}</td>
        <td class="p-2">${escapeHtml(party.state || '')}</td>
        <td class="p-2">${escapeHtml(party.phone)}</td>
        <td class="p-2 whitespace-pre-line">${escapeHtml(party.address || '')}</td>
        <td class="p-2 whitespace-pre-line">${escapeHtml(party.notes || '')}</td>
        <td class="p-2">
          <button onclick="editParty(${party.id})" class="bg-amber-500 text-white px-3 py-1 rounded mr-2">Edit</button>
          <button onclick="deleteParty(${party.id})" class="bg-red-600 text-white px-3 py-1 rounded">Delete</button>
        </td>
      </tr>
    `;
  });
}

function renderPartyDropdowns(parties) {
  const options = parties
    .map((party) => `<option value="${party.id}">${escapeHtml(party.name)}</option>`)
    .join('');

  const ids = [
    'paymentInPartyId',
    'paymentOutPartyId',
    'editPaymentPartyId',
    'ledgerPartyId',
    'purchasePartyId',
    'salePartyId'
  ];

  ids.forEach((id) => {
    const select = document.getElementById(id);
    if (!select) {
      return;
    }
    const previous = select.value;
    const defaultOption = id === 'ledgerPartyId'
      ? '<option value="">All Parties</option>'
      : '<option value="">Select Party</option>';
    select.innerHTML = defaultOption + options;
    if (previous) {
      select.value = previous;
    }
  });
}

function renderGodownDropdown(godowns) {
  const select = document.getElementById('purchaseGodownId');
  if (!select) {
    return;
  }

  const previous = select.value;
  const options = godowns
    .map((godown) => `<option value="${godown.id}">${escapeHtml(godown.name)}</option>`)
    .join('');
  select.innerHTML = '<option value="">Select Godown</option>' + options;

  if (previous) {
    select.value = previous;
  }
}

async function refreshPartyData() {
  const parties = await window.api.getParties();
  renderParties(parties);
  renderPartyDropdowns(parties);
}

async function addOrUpdateParty() {
  const data = getPartyFormData();
  const id = document.getElementById('editingPartyId').value;

  if (!data.name) {
    window.alert('Party name is required.');
    return;
  }

  const result = id
    ? await window.api.updateParty(Number(id), data)
    : await window.api.addParty(data);

  if (!result || !result.success) {
    window.alert(result?.message || 'Unable to save party.');
    return;
  }

  clearPartyForm();
  await searchParties();
  await refreshPartyData();
  showToast(id ? 'Party updated.' : 'Party added.');
}

function editParty(id) {
  const party = currentParties.find((item) => item.id === id);
  if (!party) {
    return;
  }

  document.getElementById('name').value = party.name || '';
  document.getElementById('city').value = party.city || '';
  document.getElementById('state').value = party.state || '';
  document.getElementById('phone').value = party.phone || '';
  document.getElementById('address').value = party.address || '';
  document.getElementById('feedback').value = party.notes || '';
  setPartyEditMode(id);
}

async function deleteParty(id) {
  if (!window.confirm('Delete this party?')) {
    return;
  }

  const result = await window.api.deleteParty(id);
  if (!result || !result.success) {
    window.alert(result?.message || 'Unable to delete party.');
    return;
  }

  await searchParties();
  await refreshPartyData();
  await loadLedger();
}

async function searchParties() {
  const query = document.getElementById('searchInput').value.trim();
  const parties = query
    ? await window.api.searchParties(query)
    : await window.api.getParties();
  renderParties(parties);
}

function getPaymentData(prefix, type) {
  return {
    date: document.getElementById(`${prefix}Date`).value,
    party_id: Number(document.getElementById(`${prefix}PartyId`).value),
    type,
    amount: Number(document.getElementById(`${prefix}Amount`).value),
    mode: document.getElementById(`${prefix}Mode`).value.trim(),
    description: document.getElementById(`${prefix}Description`).value.trim()
  };
}

function clearPaymentForm(prefix) {
  document.getElementById(`${prefix}Amount`).value = '';
  document.getElementById(`${prefix}Mode`).value = 'Cash';
  document.getElementById(`${prefix}Description`).value = '';
}

async function submitPayment(prefix, type) {
  const data = getPaymentData(prefix, type);
  if (!data.date || !data.party_id || data.amount <= 0 || !data.mode || !data.description) {
    window.alert('Date, party, amount, mode and description are required.');
    return;
  }

  const result = await window.api.addPayment(data);
  if (!result || !result.success) {
    window.alert(result?.message || 'Unable to save payment.');
    return;
  }
  clearPaymentForm(prefix);
  await refreshPayments();
  await loadLedger();
  showToast(`Payment ${type} saved.`);
}

function renderPaymentsTable(tableId, payments) {
  const table = document.getElementById(tableId);
  if (!table) {
    return;
  }

  table.innerHTML = '';
  payments.forEach((payment) => {
    table.innerHTML += `
      <tr class="border-t">
        <td class="p-2">${escapeHtml(payment.date)}</td>
        <td class="p-2">${escapeHtml(payment.party_name)}</td>
        <td class="p-2 text-right">${Number(payment.amount).toFixed(2)}</td>
        <td class="p-2">${escapeHtml(payment.mode)}</td>
        <td class="p-2">${escapeHtml(payment.description)}</td>
        <td class="p-2">
          <button onclick="startEditPayment(${payment.id})" class="bg-amber-500 text-white px-3 py-1 rounded mr-2">Edit</button>
          <button onclick="removePayment(${payment.id})" class="bg-red-600 text-white px-3 py-1 rounded">Delete</button>
        </td>
      </tr>
    `;
  });
}

function renderPayments(payments) {
  currentPayments = payments;
  const inPayments = payments.filter((payment) => payment.type === 'IN');
  const outPayments = payments.filter((payment) => payment.type === 'OUT');
  renderPaymentsTable('paymentsInTableBody', inPayments);
  renderPaymentsTable('paymentsOutTableBody', outPayments);
}

async function refreshPayments() {
  const payments = await window.api.getPayments();
  renderPayments(payments);
}

function startEditPayment(id) {
  const payment = currentPayments.find((item) => item.id === id);
  if (!payment) {
    return;
  }

  document.getElementById('paymentEditCard').classList.remove('hidden');
  document.getElementById('editPaymentId').value = payment.id;
  document.getElementById('editPaymentDate').value = payment.date;
  document.getElementById('editPaymentPartyId').value = String(payment.party_id);
  document.getElementById('editPaymentType').value = payment.type;
  document.getElementById('editPaymentAmount').value = payment.amount;
  document.getElementById('editPaymentMode').value = payment.mode || '';
  document.getElementById('editPaymentDescription').value = payment.description || '';
}

function cancelPaymentEdit() {
  document.getElementById('paymentEditCard').classList.add('hidden');
  document.getElementById('editPaymentId').value = '';
}

async function savePaymentEdit() {
  const id = Number(document.getElementById('editPaymentId').value);
  if (!id) {
    return;
  }

  const data = {
    date: document.getElementById('editPaymentDate').value,
    party_id: Number(document.getElementById('editPaymentPartyId').value),
    type: document.getElementById('editPaymentType').value,
    amount: Number(document.getElementById('editPaymentAmount').value),
    mode: document.getElementById('editPaymentMode').value.trim(),
    description: document.getElementById('editPaymentDescription').value.trim()
  };

  if (!data.date || !data.party_id || data.amount <= 0 || !data.mode || !data.description) {
    window.alert('Date, party, amount, mode and description are required.');
    return;
  }

  const result = await window.api.updatePayment(id, data);
  if (!result || !result.success) {
    window.alert(result?.message || 'Unable to update payment.');
    return;
  }
  cancelPaymentEdit();
  await refreshPayments();
  await loadLedger();
  showToast('Payment updated.');
}

async function removePayment(id) {
  if (!window.confirm('Delete this transaction?')) {
    return;
  }

  const result = await window.api.deletePayment(id);
  if (!result || !result.success) {
    window.alert(result?.message || 'Unable to delete payment.');
    return;
  }
  await refreshPayments();
  await loadLedger();
  showToast('Payment deleted.');
}

function renderLedgerBook(rows) {
  const debitEntries = [];
  const creditEntries = [];
  let runningBalance = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  rows.forEach((entry) => {
    const amount = Number(entry.amount) || 0;
    const particulars = `${entry.account || ''} - ${entry.particulars || entry.description || ''}`;

    if (entry.type === 'debit') {
      runningBalance -= amount;
      totalDebit += amount;
      debitEntries.push({ date: entry.date, particulars, amount, balance: runningBalance });
    } else {
      runningBalance += amount;
      totalCredit += amount;
      creditEntries.push({ date: entry.date, particulars, amount, balance: runningBalance });
    }
  });

  const body = document.getElementById('ledgerTableBody');
  body.innerHTML = '';
  const count = Math.max(debitEntries.length, creditEntries.length);

  for (let i = 0; i < count; i += 1) {
    const dr = debitEntries[i];
    const cr = creditEntries[i];
    const balance = cr ? cr.balance : dr ? dr.balance : runningBalance;

    body.innerHTML += `
      <tr class="border-t align-top">
        <td class="p-2 bg-red-50">${dr ? escapeHtml(dr.date) : ''}</td>
        <td class="p-2 bg-red-50">${dr ? escapeHtml(dr.particulars) : ''}</td>
        <td class="p-2 text-right bg-red-50">${dr ? dr.amount.toFixed(2) : ''}</td>
        <td class="p-2 border-l-8 border-gray-400 bg-green-50">${cr ? escapeHtml(cr.date) : ''}</td>
        <td class="p-2 bg-green-50">${cr ? escapeHtml(cr.particulars) : ''}</td>
        <td class="p-2 text-right bg-green-50">${cr ? cr.amount.toFixed(2) : ''}</td>
        <td class="p-2 text-right font-semibold">${Number(balance).toFixed(2)}</td>
      </tr>
    `;
  }

  document.getElementById('ledgerTotalDebit').textContent = totalDebit.toFixed(2);
  document.getElementById('ledgerTotalCredit').textContent = totalCredit.toFixed(2);
  document.getElementById('ledgerClosingBalance').textContent = runningBalance.toFixed(2);
}

async function loadLedger() {
  const filters = {
    partyId: document.getElementById('ledgerPartyId').value ? Number(document.getElementById('ledgerPartyId').value) : null,
    dateFrom: document.getElementById('ledgerDateFrom').value || null,
    dateTo: document.getElementById('ledgerDateTo').value || null
  };

  const rows = await window.api.getLedger(filters);
  renderLedgerBook(rows);
}

function calculatePurchaseLineTotal() {
  const cases = Number(document.getElementById('purchaseBoxes').value) || 0;
  const qtyPerCase = Number(document.getElementById('purchasePieces').value) || 0;
  const rate = Number(document.getElementById('purchaseRate').value) || 0;
  const packingCharge = Number(document.getElementById('purchasePackingCharge').value) || 0;
  const transportCharge = Number(document.getElementById('purchaseTransportCharge').value) || 0;
  const total = (cases * qtyPerCase * rate) + packingCharge + transportCharge;
  document.getElementById('purchaseLineTotal').value = total ? total.toFixed(2) : '';
}

function clearPurchaseLineForm() {
  document.getElementById('purchaseProductName').value = '';
  document.getElementById('purchaseBoxes').value = '';
  document.getElementById('purchasePieces').value = '';
  document.getElementById('purchaseUnitType').value = 'Pcs';
  document.getElementById('purchaseRate').value = '';
  document.getElementById('purchasePackingCharge').value = '';
  document.getElementById('purchaseTransportCharge').value = '';
  document.getElementById('purchaseAgentName').value = '';
  document.getElementById('purchaseSellingRate').value = '';
  document.getElementById('purchaseLineTotal').value = '';
}

function setPurchaseEditMode(purchaseId) {
  const editingInput = document.getElementById('editingPurchaseId');
  const submitBtn = document.getElementById('purchaseSubmitBtn');
  editingInput.value = purchaseId ? String(purchaseId) : '';
  submitBtn.textContent = purchaseId ? 'Update Purchase' : 'Save Purchase';
}

function resetPurchaseForm() {
  purchaseItemsDraft = [];
  renderPurchaseDraft();
  clearPurchaseLineForm();
  setPurchaseEditMode(null);
  purchaseDeliveryTypeDraft = 'Cash';
  document.getElementById('purchaseUnitType').value = 'Pcs';
}

function renderPurchaseDraft() {
  const table = document.getElementById('purchaseItemsTableBody');
  table.innerHTML = '';

  purchaseItemsDraft.forEach((item, index) => {
    table.innerHTML += `
      <tr class="border-t">
        <td class="p-2">${escapeHtml(item.product_name)}</td>
        <td class="p-2">${item.boxes}</td>
        <td class="p-2">${item.pieces}</td>
        <td class="p-2">${escapeHtml(normalizeUnitType(item.unit_type) || 'Pcs')}</td>
        <td class="p-2 text-right">${item.rate.toFixed(2)}</td>
        <td class="p-2 text-right">${item.packing_charge.toFixed(2)}</td>
        <td class="p-2 text-right">${item.transport_charge.toFixed(2)}</td>
        <td class="p-2">${escapeHtml(item.agent_name)}</td>
        <td class="p-2 text-right">${item.selling_rate.toFixed(2)}</td>
        <td class="p-2 text-right">${item.total.toFixed(2)}</td>
        <td class="p-2"><button onclick="removePurchaseItem(${index})" class="bg-red-600 text-white px-3 py-1 rounded">Delete</button></td>
      </tr>
    `;
  });

  const grandTotal = purchaseItemsDraft.reduce((sum, item) => sum + item.total, 0);
  document.getElementById('purchaseGrandTotal').textContent = grandTotal.toFixed(2);
}

function addPurchaseItem() {
  const productName = document.getElementById('purchaseProductName').value.trim();
  const cases = Number(document.getElementById('purchaseBoxes').value) || 0;
  const qtyPerCase = Number(document.getElementById('purchasePieces').value) || 0;
  const unitType = normalizeUnitType(document.getElementById('purchaseUnitType').value);
  const rate = Number(document.getElementById('purchaseRate').value) || 0;
  const packingCharge = Number(document.getElementById('purchasePackingCharge').value);
  const transportCharge = Number(document.getElementById('purchaseTransportCharge').value);
  const agentName = document.getElementById('purchaseAgentName').value.trim();
  const sellingRate = Number(document.getElementById('purchaseSellingRate').value);

  if (
    !productName
    || cases <= 0
    || qtyPerCase <= 0
    || !unitType
    || rate <= 0
    || !Number.isFinite(packingCharge)
    || packingCharge < 0
    || !Number.isFinite(transportCharge)
    || transportCharge < 0
    || !agentName
    || !Number.isFinite(sellingRate)
    || sellingRate <= 0
  ) {
    window.alert('Fill all item fields with valid values.');
    return;
  }

  const duplicate = purchaseItemsDraft.find((item) => item.product_name.toLowerCase() === productName.toLowerCase());
  if (duplicate) {
    window.alert('Duplicate product in the same purchase is not allowed. Edit existing line instead.');
    return;
  }

  const total = (cases * qtyPerCase * rate) + packingCharge + transportCharge;
  purchaseItemsDraft.push({
    product_name: productName,
    boxes: cases,
    pieces: qtyPerCase,
    unit_type: unitType,
    rate,
    packing_charge: packingCharge,
    transport_charge: transportCharge,
    agent_name: agentName,
    selling_rate: sellingRate,
    total
  });

  renderPurchaseDraft();
  clearPurchaseLineForm();
}

function removePurchaseItem(index) {
  purchaseItemsDraft.splice(index, 1);
  renderPurchaseDraft();
}

async function submitPurchase() {
  const partyId = Number(document.getElementById('purchasePartyId').value);
  const godownId = Number(document.getElementById('purchaseGodownId').value);
  const date = document.getElementById('purchaseDate').value;
  const editingId = Number(document.getElementById('editingPurchaseId').value);
  const deliveryType = purchaseDeliveryTypeDraft || 'Cash';

  if (!date || !partyId || !godownId || purchaseItemsDraft.length === 0) {
    window.alert('Date, party, godown and at least one item are required.');
    return;
  }

  const payload = {
    date,
    party_id: partyId,
    godown_id: godownId,
    delivery_type: deliveryType,
    items: purchaseItemsDraft
  };

  const result = editingId
    ? await window.api.updatePurchase(editingId, payload)
    : await window.api.addPurchase(payload);

  if (!result || !result.success) {
    window.alert(result?.message || 'Failed to save purchase changes.');
    return;
  }

  resetPurchaseForm();
  await refreshPurchases();
  await refreshGodowns();
  await refreshStock();
  await refreshPurchaseRates();
  await loadLedger();
  showToast(editingId ? 'Purchase updated.' : 'Purchase saved.');
}

async function startEditPurchase(id) {
  const details = await window.api.getPurchaseDetails(id);
  if (!details) {
    window.alert('Purchase not found.');
    return;
  }

  document.getElementById('purchaseDate').value = details.date;
  document.getElementById('purchasePartyId').value = String(details.party_id);
  document.getElementById('purchaseGodownId').value = String(details.godown_id || '');
  purchaseDeliveryTypeDraft = details.delivery_type || 'Cash';
  purchaseItemsDraft = (details.items || []).map((item) => ({
    product_name: item.product_name,
    boxes: Number(item.boxes) || 0,
    pieces: Number(item.pieces) || 0,
    unit_type: normalizeUnitType(item.unit_type) || 'Pcs',
    rate: Number(item.rate) || 0,
    packing_charge: Number(item.packing_charge) || 0,
    transport_charge: Number(item.transport_charge) || 0,
    agent_name: item.agent_name || '-',
    selling_rate: Number(item.selling_rate) || Number(item.rate) || 0,
    total: Number(item.total) || 0
  }));
  if (purchaseItemsDraft.length > 0) {
    document.getElementById('purchaseUnitType').value = purchaseItemsDraft[0].unit_type || 'Pcs';
  }
  renderPurchaseDraft();
  setPurchaseEditMode(id);
}

function cancelPurchaseEdit() {
  resetPurchaseForm();
}

async function removePurchase(id) {
  if (!window.confirm('Delete this purchase? Stock and ledger will be adjusted.')) {
    return;
  }

  const result = await window.api.deletePurchase(id);
  if (!result || !result.success) {
    window.alert('Failed to delete purchase.');
    return;
  }

  resetPurchaseForm();
  await refreshPurchases();
  await refreshGodowns();
  await refreshStock();
  await refreshPurchaseRates();
  await loadLedger();
}

function renderPurchases(purchases) {
  const table = document.getElementById('purchasesTableBody');
  table.innerHTML = '';

  purchases.forEach((purchase) => {
    const unitType = normalizeUnitType(purchase.unit_type) || 'Pcs';
    table.innerHTML += `
      <tr class="border-t">
        <td class="p-2">${escapeHtml(purchase.date)}</td>
        <td class="p-2">${escapeHtml(purchase.party_name)}</td>
        <td class="p-2">${escapeHtml(purchase.product_name || '-')}</td>
        <td class="p-2 text-right">${Number(purchase.boxes || 0)}</td>
        <td class="p-2 text-right">${Number(purchase.pieces || 0)}</td>
        <td class="p-2">${escapeHtml(unitType)}</td>
        <td class="p-2 text-right">${Number(purchase.rate || 0).toFixed(2)}</td>
        <td class="p-2 text-right">${Number(purchase.transport_charge || 0).toFixed(2)}</td>
        <td class="p-2 text-right">${Number(purchase.packing_charge || 0).toFixed(2)}</td>
        <td class="p-2">
          <button onclick="startEditPurchase(${purchase.id})" class="bg-amber-500 text-white px-3 py-1 rounded mr-2">Edit</button>
          <button onclick="removePurchase(${purchase.id})" class="bg-red-600 text-white px-3 py-1 rounded">Delete</button>
        </td>
      </tr>
    `;
  });
}

async function refreshPurchases() {
  const purchases = await window.api.getPurchases();
  renderPurchases(purchases);
}

function renderGodownList(godowns) {
  currentGodowns = godowns;
  renderGodownDropdown(godowns);

  const list = document.getElementById('godownList');
  if (!list) {
    return;
  }

  list.innerHTML = '';
  godowns.forEach((godown) => {
    const isSelected = Number(godown.id) === Number(selectedGodownId);
    list.innerHTML += `
      <div class="bg-white p-4 rounded shadow border ${isSelected ? 'border-blue-600 ring-1 ring-blue-300' : 'border-gray-200'}">
        <button onclick="openGodown(${godown.id})" class="w-full text-left flex items-center justify-between gap-3 font-semibold text-blue-900 hover:text-blue-700">
          <span>${escapeHtml(godown.name)}</span>
          <span class="text-xs px-2 py-1 rounded ${isSelected ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}">Open</span>
        </button>
      </div>
    `;
  });
}

function renderGodownDeleteTarget(godowns) {
  const select = document.getElementById('godownDeleteTarget');
  if (!select) {
    return;
  }

  const previous = select.value;
  const options = godowns
    .map((godown) => `<option value="${godown.id}">${escapeHtml(godown.name)}</option>`)
    .join('');

  select.innerHTML = '<option value="">Select Godown</option>' + options;

  if (selectedGodownId && godowns.some((godown) => Number(godown.id) === Number(selectedGodownId))) {
    select.value = String(selectedGodownId);
    return;
  }

  if (previous && godowns.some((godown) => String(godown.id) === previous)) {
    select.value = previous;
  }
}

async function refreshGodowns() {
  const godowns = await window.api.getGodowns();
  renderGodownList(godowns || []);

  if (!selectedGodownId && godowns.length > 0) {
    selectedGodownId = Number(godowns[0].id);
  }

  const selectedExists = godowns.some((godown) => Number(godown.id) === Number(selectedGodownId));
  if (!selectedExists) {
    selectedGodownId = godowns.length > 0 ? Number(godowns[0].id) : null;
  }

  if (selectedGodownId) {
    const selected = godowns.find((godown) => Number(godown.id) === Number(selectedGodownId));
    const title = document.getElementById('selectedGodownTitle');
    if (title && selected) {
      title.textContent = selected.name;
    }
  }

  renderGodownDeleteTarget(godowns || []);
}

async function addGodown() {
  const input = document.getElementById('godownNameInput');
  const name = input ? input.value.trim() : '';
  if (!name) {
    window.alert('Godown name is required.');
    return;
  }

  const result = await window.api.addGodown(name);
  if (!result || !result.success) {
    window.alert(result?.message || 'Unable to add godown.');
    return;
  }

  input.value = '';
  await refreshGodowns();
  showToast('Godown added.');
}

async function deleteGodown(id) {
  if (!window.confirm('Delete this godown?')) {
    return;
  }

  const result = await window.api.deleteGodown(id);
  if (!result || !result.success) {
    window.alert(result?.message || 'Unable to delete godown.');
    return;
  }

  if (Number(selectedGodownId) === Number(id)) {
    selectedGodownId = null;
    goBackToGodownList();
  }

  await refreshGodowns();
  showToast('Godown deleted.');
}

async function deleteGodownFromTop() {
  const select = document.getElementById('godownDeleteTarget');
  const godownId = Number(select?.value || 0);
  if (!godownId) {
    window.alert('Select godown to delete.');
    return;
  }

  await deleteGodown(godownId);
}

function openGodown(id) {
  selectedGodownId = Number(id);
  const selected = currentGodowns.find((godown) => Number(godown.id) === Number(selectedGodownId));
  document.getElementById('godownSelectionCard').classList.add('hidden');
  document.getElementById('godownDetailCard').classList.remove('hidden');
  document.getElementById('selectedGodownTitle').textContent = selected ? selected.name : 'Godown Details';
  refreshStock();
}

function goBackToGodownList() {
  document.getElementById('godownSelectionCard').classList.remove('hidden');
  document.getElementById('godownDetailCard').classList.add('hidden');
}

function renderStock(rows) {
  currentGodownStockRows = Array.isArray(rows) ? rows : [];
  const table = document.getElementById('stockTableBody');
  table.innerHTML = '';

  if (!currentGodownStockRows || currentGodownStockRows.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="13" class="p-4 text-center text-gray-500">No stock found for selected godown.</td>
      </tr>
    `;
    return;
  }

  currentGodownStockRows.forEach((row, index) => {
    const totalQty = Number(row.total_quantity ?? row.total_pieces) || 0;
    const qtyPerCase = Number(row.pieces_per_box) || 0;
    const unitType = normalizeUnitType(row.unit_type) || 'Pcs';
    const stockValue = Number(row.total_value) || 0;
    const addedDate = row.last_purchase_date || '-';
    const lowStock = totalQty <= LOW_STOCK_QTY_THRESHOLD;
    const availableStock = `${totalQty.toFixed(2)} ${unitType}`;
    const rowClass = lowStock
      ? 'bg-red-50'
      : index % 2 === 0
        ? 'bg-white'
        : 'bg-gray-50';

    table.innerHTML += `
      <tr class="${rowClass}">
        <td class="p-2">${escapeHtml(row.product_name)}</td>
        <td class="p-2">${escapeHtml(addedDate)}</td>
        <td class="p-2 text-right">${Number(row.total_boxes) || 0}</td>
        <td class="p-2 text-right">${qtyPerCase}</td>
        <td class="p-2">${escapeHtml(unitType)}</td>
        <td class="p-2 text-right font-medium">${escapeHtml(availableStock)}</td>
        <td class="p-2 text-right">${Number(row.rate).toFixed(2)}</td>
        <td class="p-2 text-right">${Number(row.packing_charge || 0).toFixed(2)}</td>
        <td class="p-2 text-right">${Number(row.transport_charge || 0).toFixed(2)}</td>
        <td class="p-2 text-right">${Number(row.commission || 0).toFixed(2)}</td>
        <td class="p-2 text-right">${Number(row.selling_rate || 0).toFixed(2)}</td>
        <td class="p-2 text-right">${stockValue.toFixed(2)}</td>
        <td class="p-2">
          <button onclick="editGodownStockItem(${Number(row.product_id)})" class="bg-amber-500 text-white px-3 py-1 rounded mr-2">Edit</button>
          <button onclick="removeGodownStockItem(${Number(row.product_id)})" class="bg-red-600 text-white px-3 py-1 rounded">Remove</button>
        </td>
      </tr>
    `;
  });
}

async function editGodownStockItem(productId) {
  if (!selectedGodownId) {
    return;
  }

  const row = currentGodownStockRows.find((item) => Number(item.product_id) === Number(productId));
  if (!row) {
    window.alert('Godown item not found. Refresh and try again.');
    return;
  }

  const values = await openEditorDialog('Edit Godown Item', [
    {
      key: 'last_purchase_date',
      label: 'Added Date',
      type: 'date',
      value: row.last_purchase_date || new Date().toISOString().slice(0, 10)
    },
    { key: 'total_boxes', label: 'Cases', type: 'number', min: 0, value: Number(row.total_boxes) || 0 },
    { key: 'pieces_per_box', label: 'Qty per Case', type: 'number', min: 0, value: Number(row.pieces_per_box) || 0 },
    {
      key: 'unit_type',
      label: 'Quantity Type',
      type: 'select',
      value: normalizeUnitType(row.unit_type) || 'Pcs',
      options: ['Pcs', 'Box', 'Unit', 'Pkt']
    },
    { key: 'purchase_rate', label: 'Purchase Rate', type: 'number', step: '0.01', min: 0, value: Number(row.rate || 0) },
    { key: 'packing_charge', label: 'Packing Charge', type: 'number', step: '0.01', min: 0, value: Number(row.packing_charge || 0) },
    { key: 'transport_charge', label: 'Transport Charge', type: 'number', step: '0.01', min: 0, value: Number(row.transport_charge || 0) },
    { key: 'selling_rate', label: 'Selling Rate', type: 'number', step: '0.01', min: 0, value: Number(row.selling_rate || 0) }
  ]);

  if (!values) {
    return;
  }

  const payload = {
    last_purchase_date: String(values.last_purchase_date || '').trim(),
    total_boxes: Number(values.total_boxes),
    pieces_per_box: Number(values.pieces_per_box),
    unit_type: String(values.unit_type || '').trim(),
    purchase_rate: Number(values.purchase_rate),
    packing_charge: Number(values.packing_charge),
    transport_charge: Number(values.transport_charge),
    selling_rate: Number(values.selling_rate)
  };

  const result = await window.api.updateGodownStockItem(selectedGodownId, productId, payload);
  if (!result || !result.success) {
    window.alert(result?.message || 'Unable to update godown item.');
    return;
  }

  await refreshStock();
  showToast('Godown item updated.');
}

async function removeGodownStockItem(productId) {
  if (!selectedGodownId) {
    return;
  }

  if (!window.confirm('Remove this godown item?')) {
    return;
  }

  const result = await window.api.deleteGodownStockItem(selectedGodownId, productId);
  if (!result || !result.success) {
    window.alert(result?.message || 'Unable to remove godown item.');
    return;
  }

  await refreshStock();
  showToast('Godown item removed.');
}

async function refreshStock() {
  if (!selectedGodownId) {
    renderStock([]);
    return;
  }

  const query = String(document.getElementById('stockSearchInput')?.value || '').trim();
  const rows = await window.api.getGodownStock(selectedGodownId, query);
  renderStock(rows);
}

function renderProductDropdown() {
  const select = document.getElementById('saleProductId');
  const options = productCatalog
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join('');
  select.innerHTML = '<option value="">Select Product</option>' + options;
}

async function refreshProductCatalog() {
  productCatalog = await window.api.getProducts();
  renderProductDropdown();
}

function syncSaleRateFromProduct() {
  const productId = Number(document.getElementById('saleProductId').value);
  const product = productCatalog.find((p) => p.id === productId);
  if (!product) {
    return;
  }
  document.getElementById('saleRate').value = Number(product.rate || 0).toFixed(2);
  calculateSaleLineTotal();
}

function calculateSaleLineTotal() {
  const cases = Number(document.getElementById('saleBoxes').value) || 0;
  const qtyPerCase = Number(document.getElementById('salePieces').value) || 0;
  const rate = Number(document.getElementById('saleRate').value) || 0;
  const total = cases * qtyPerCase * rate;
  document.getElementById('saleLineTotal').value = total ? total.toFixed(2) : '';
}

function clearSaleLineForm() {
  document.getElementById('saleProductId').value = '';
  document.getElementById('saleBoxes').value = '';
  document.getElementById('salePieces').value = '';
  document.getElementById('saleUnitType').value = 'Pcs';
  document.getElementById('saleRate').value = '';
  document.getElementById('saleLineTotal').value = '';
}

function setSaleEditMode(id) {
  document.getElementById('editingSaleId').value = id ? String(id) : '';
  document.getElementById('saleSubmitBtn').textContent = id ? 'Update Invoice' : 'Save Invoice';
}

function resetSaleForm() {
  saleItemsDraft = [];
  renderSaleDraft();
  clearSaleLineForm();
  setSaleEditMode(null);
  document.getElementById('saleDiscount').value = '0';
  document.getElementById('saleDeliveryCharges').value = '0';
  document.getElementById('saleUnitType').value = 'Pcs';
}

function recalculateSaleFinalTotal() {
  const grand = saleItemsDraft.reduce((sum, item) => sum + item.total, 0);
  const discount = Number(document.getElementById('saleDiscount').value) || 0;
  const delivery = Number(document.getElementById('saleDeliveryCharges').value) || 0;
  const finalTotal = Math.max(0, grand - discount) + delivery;
  document.getElementById('saleGrandTotal').value = grand.toFixed(2);
  document.getElementById('saleFinalTotal').value = finalTotal.toFixed(2);
}

function renderSaleDraft() {
  const table = document.getElementById('saleItemsTableBody');
  table.innerHTML = '';

  saleItemsDraft.forEach((item, index) => {
    table.innerHTML += `
      <tr class="border-t">
        <td class="p-2">${escapeHtml(item.product_name)}</td>
        <td class="p-2">${item.boxes}</td>
        <td class="p-2">${item.pieces}</td>
        <td class="p-2">${escapeHtml(normalizeUnitType(item.unit_type) || 'Pcs')}</td>
        <td class="p-2 text-right">${item.rate.toFixed(2)}</td>
        <td class="p-2 text-right">${item.total.toFixed(2)}</td>
        <td class="p-2"><button onclick="removeSaleItem(${index})" class="bg-red-600 text-white px-3 py-1 rounded">Delete</button></td>
      </tr>
    `;
  });

  recalculateSaleFinalTotal();
}

function addSaleItem() {
  const productId = Number(document.getElementById('saleProductId').value);
  const product = productCatalog.find((p) => p.id === productId);
  const cases = Number(document.getElementById('saleBoxes').value) || 0;
  const qtyPerCase = Number(document.getElementById('salePieces').value) || 0;
  const unitType = normalizeUnitType(document.getElementById('saleUnitType').value);
  const rate = Number(document.getElementById('saleRate').value) || 0;

  if (!product || cases <= 0 || qtyPerCase <= 0 || !unitType || rate < 0) {
    window.alert('Enter valid sales item details.');
    return;
  }

  const duplicate = saleItemsDraft.find((item) => item.product_id === product.id);
  if (duplicate) {
    window.alert('Duplicate product in the same invoice is not allowed.');
    return;
  }

  const total = cases * qtyPerCase * rate;
  saleItemsDraft.push({
    product_id: product.id,
    product_name: product.name,
    boxes: cases,
    pieces: qtyPerCase,
    unit_type: unitType,
    rate,
    total
  });

  renderSaleDraft();
  clearSaleLineForm();
}

function removeSaleItem(index) {
  saleItemsDraft.splice(index, 1);
  renderSaleDraft();
}

async function saveSaleInvoice() {
  const partyId = Number(document.getElementById('salePartyId').value);
  const date = document.getElementById('saleDate').value;
  const saleType = document.getElementById('saleType').value;
  const discount = Number(document.getElementById('saleDiscount').value) || 0;
  const deliveryCharges = Number(document.getElementById('saleDeliveryCharges').value) || 0;
  const editingId = Number(document.getElementById('editingSaleId').value);

  if (!date || !partyId || saleItemsDraft.length === 0) {
    window.alert('Select customer and add at least one sale item.');
    return;
  }

  if (discount < 0 || deliveryCharges < 0) {
    window.alert('Discount and delivery charges cannot be negative.');
    return;
  }

  const payload = {
    date,
    party_id: partyId,
    type: saleType,
    discount,
    delivery_charges: deliveryCharges,
    items: saleItemsDraft
  };

  const result = editingId
    ? await window.api.updateSale(editingId, payload)
    : await window.api.addSale(payload);

  if (!result || !result.success) {
    window.alert(result?.message || 'Failed to save sale invoice.');
    return;
  }

  resetSaleForm();
  await refreshSales();
  await refreshStock();
  await loadLedger();
  await refreshProfitLoss();
  showToast(editingId ? 'Invoice updated.' : 'Invoice saved.');
}

function renderSales(sales) {
  const table = document.getElementById('salesTableBody');
  table.innerHTML = '';

  sales.forEach((sale) => {
    table.innerHTML += `
      <tr class="border-t">
        <td class="p-2">${escapeHtml(sale.date)}</td>
        <td class="p-2">${escapeHtml(sale.party_name)}</td>
        <td class="p-2">${escapeHtml(String(sale.type).toUpperCase())}</td>
        <td class="p-2">${sale.item_count}</td>
        <td class="p-2 text-right">${Number(sale.total).toFixed(2)}</td>
        <td class="p-2">
          <button onclick="viewSaleDetail(${sale.id})" class="bg-blue-600 text-white px-3 py-1 rounded mr-2">View</button>
          <button onclick="startEditSale(${sale.id})" class="bg-amber-500 text-white px-3 py-1 rounded mr-2">Edit</button>
          <button onclick="removeSale(${sale.id})" class="bg-red-600 text-white px-3 py-1 rounded">Delete</button>
        </td>
      </tr>
    `;
  });
}

function renderSaleDetailCard(detail) {
  document.getElementById('saleDetailId').textContent = detail.id;
  document.getElementById('saleDetailDate').textContent = detail.date;
  const party = currentParties.find((p) => p.id === detail.party_id);
  document.getElementById('saleDetailParty').textContent = party ? party.name : '-';
  document.getElementById('saleDetailType').textContent = String(detail.type || '').toUpperCase();

  const body = document.getElementById('saleDetailItemsBody');
  body.innerHTML = '';
  (detail.items || []).forEach((item) => {
    body.innerHTML += `
      <tr class="border-t">
        <td class="p-2">${escapeHtml(item.product_name)}</td>
        <td class="p-2">${item.boxes}</td>
        <td class="p-2">${item.pieces}</td>
        <td class="p-2">${escapeHtml(normalizeUnitType(item.unit_type) || 'Pcs')}</td>
        <td class="p-2 text-right">${formatCurrency(item.rate)}</td>
        <td class="p-2 text-right">${formatCurrency(item.total)}</td>
      </tr>
    `;
  });

  document.getElementById('saleDetailTotal').textContent = formatCurrency(detail.total);
  const detailExtra = document.getElementById('saleDetailExtra');
  if (detailExtra) {
    detailExtra.textContent = `Discount: ${formatCurrency(detail.discount || 0)} | Delivery: ${formatCurrency(detail.delivery_charges || 0)} | Final: ${formatCurrency(detail.total)}`;
  }
  document.getElementById('saleDetailCard').classList.remove('hidden');
}

async function viewSaleDetail(id) {
  const detail = await window.api.getSaleDetails(id);
  if (!detail) {
    window.alert('Unable to load invoice detail.');
    return;
  }
  selectedSaleDetail = detail;
  renderSaleDetailCard(detail);
}

function closeSaleDetail() {
  document.getElementById('saleDetailCard').classList.add('hidden');
  selectedSaleDetail = null;
}

function printSaleDetail() {
  printSaleDetailInternal();
}

async function printSaleDetailInternal() {
  if (!selectedSaleDetail) {
    window.alert('Open an invoice detail first.');
    return;
  }

  const settings = await window.api.getSettings();
  const party = currentParties.find((p) => p.id === selectedSaleDetail.party_id);
  const rows = (selectedSaleDetail.items || []).map((item) => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.product_name)}</td>
      <td style="padding:8px;border:1px solid #ddd;">${item.boxes}</td>
      <td style="padding:8px;border:1px solid #ddd;">${item.pieces}</td>
      <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(normalizeUnitType(item.unit_type) || 'Pcs')}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.rate)}</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatCurrency(item.total)}</td>
    </tr>
  `).join('');

  const html = `
    <html>
      <head>
        <title>Invoice #${selectedSaleDetail.id}</title>
        <style>
          @page { size: A4; margin: 14mm; }
          body { font-family: Arial, sans-serif; color: #111; }
          .row { display: flex; justify-content: space-between; align-items: flex-start; }
          .small { font-size: 12px; }
          table { border-collapse: collapse; width: 100%; margin-top: 10px; }
          th, td { border: 1px solid #666; padding: 8px; font-size: 12px; }
          th { background: #f2f2f2; text-align: left; }
        </style>
      </head>
      <body>
        <div class="row">
          <div>
            <div style="display:flex;align-items:center;gap:10px;">
              ${settings?.logo ? `<img src="${escapeHtml(settings.logo)}" alt="Logo" style="height:48px;width:48px;object-fit:contain;">` : ''}
              <h2 style="margin:0;">${escapeHtml(settings?.shop_name || 'Billing Software')}</h2>
            </div>
            <div class="small">${escapeHtml(settings?.address || '')}</div>
            <div class="small">Phone: ${escapeHtml(settings?.phone || '-')} | GST: ${escapeHtml(settings?.gst || '-')}</div>
            <div class="small">Email: ${escapeHtml(settings?.email || '-')}</div>
          </div>
          <div class="small" style="text-align:right;">
            <div><strong>Invoice #:</strong> ${selectedSaleDetail.id}</div>
            <div><strong>Date:</strong> ${escapeHtml(selectedSaleDetail.date)}</div>
            <div><strong>Type:</strong> ${escapeHtml(String(selectedSaleDetail.type || '').toUpperCase())}</div>
          </div>
        </div>

        <hr style="margin:12px 0;">
        <div class="small"><strong>Bill To:</strong> ${escapeHtml(party ? party.name : '-')}</div>

        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>Cases</th>
              <th>Qty/Case</th>
              <th>Quantity Type</th>
              <th style="text-align:right;">Rate</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div style="margin-top:14px; display:flex; justify-content:flex-end;">
          <table style="width:280px; margin-top:0;">
            <tr>
              <td>Discount</td>
              <td style="text-align:right;">${formatCurrency(selectedSaleDetail.discount || 0)}</td>
            </tr>
            <tr>
              <td>Delivery</td>
              <td style="text-align:right;">${formatCurrency(selectedSaleDetail.delivery_charges || 0)}</td>
            </tr>
            <tr>
              <td><strong>Final Amount</strong></td>
              <td style="text-align:right;"><strong>${formatCurrency(selectedSaleDetail.total)}</strong></td>
            </tr>
          </table>
        </div>

        <div class="small" style="margin-top:24px;">Authorized Signatory</div>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function renderPurchaseRates(rows) {
  currentPurchaseRates = rows;
  const body = document.getElementById('rateTableBody');
  body.innerHTML = '';

  const latestByProduct = new Map();
  rows.forEach((row) => {
    const key = String(row.product_name || '').toLowerCase();
    if (!latestByProduct.has(key)) {
      latestByProduct.set(key, row.id);
    }
  });

  rows.forEach((row) => {
    const isLatest = latestByProduct.get(String(row.product_name || '').toLowerCase()) === row.id;
    const chargesLabel = `${formatCurrency(row.packing_charge || 0)} / ${formatCurrency(row.transport_charge || 0)}`;
    const unitType = normalizeUnitType(row.unit_type) || 'Pcs';
    const commission = Number(row.selling_rate || 0) - Number(row.rate || 0) - Number(row.packing_charge || 0) - Number(row.transport_charge || 0);
    body.innerHTML += `
      <tr class="border-t ${isLatest ? 'bg-amber-50' : ''}">
        <td class="p-2">${escapeHtml(row.date)}</td>
        <td class="p-2">${escapeHtml(row.product_name)}</td>
        <td class="p-2">${escapeHtml(unitType)}</td>
        <td class="p-2">${escapeHtml(row.party_name)}</td>
        <td class="p-2 text-right">${formatCurrency(row.rate)} ${isLatest ? '<span class="text-xs text-amber-700">(Latest)</span>' : ''}</td>
        <td class="p-2 text-right">${formatCurrency(row.selling_rate || 0)}</td>
        <td class="p-2 text-right">${escapeHtml(chargesLabel)}</td>
        <td class="p-2">${escapeHtml(row.agent_name || '-')}</td>
        <td class="p-2 text-right">${formatCurrency(commission)}</td>
        <td class="p-2">
          <button onclick="editPurchaseRate(${row.id})" class="bg-amber-500 text-white px-3 py-1 rounded mr-2">Edit</button>
          <button onclick="removePurchaseRate(${row.id})" class="bg-red-600 text-white px-3 py-1 rounded">Delete</button>
        </td>
      </tr>
    `;
  });
}

async function refreshPurchaseRates() {
  const queryEl = document.getElementById('rateSearchQuery');
  const query = queryEl ? queryEl.value.trim() : '';
  const rows = await window.api.getPurchaseRates(query);
  renderPurchaseRates(rows || []);
}

async function editPurchaseRate(id) {
  const row = currentPurchaseRates.find((item) => item.id === id);
  if (!row) {
    return;
  }

  const values = await openEditorDialog('Edit Purchase Rate', [
    { key: 'rate', label: 'Rate', type: 'number', step: '0.01', min: 0, value: row.rate },
    {
      key: 'unit_type',
      label: 'Quantity Type',
      type: 'select',
      value: normalizeUnitType(row.unit_type) || 'Pcs',
      options: ['Pcs', 'Box', 'Unit', 'Pkt']
    },
    { key: 'selling_rate', label: 'Selling Rate', type: 'number', step: '0.01', min: 0, value: row.selling_rate || row.rate },
    { key: 'packing_charge', label: 'Packing Charge', type: 'number', step: '0.01', min: 0, value: row.packing_charge || 0 },
    { key: 'transport_charge', label: 'Transport Charge', type: 'number', step: '0.01', min: 0, value: row.transport_charge || 0 },
    { key: 'agent_name', label: 'Agent Name', type: 'text', value: row.agent_name || '' }
  ]);

  if (!values) {
    return;
  }

  const result = await window.api.updatePurchaseRate(id, {
    rate: Number(values.rate),
    unit_type: String(values.unit_type || '').trim(),
    selling_rate: Number(values.selling_rate),
    packing_charge: Number(values.packing_charge),
    transport_charge: Number(values.transport_charge),
    agent_name: String(values.agent_name || '').trim()
  });

  if (!result || !result.success) {
    window.alert(result?.message || 'Failed to update rate.');
    return;
  }

  await refreshPurchaseRates();
  await refreshPurchases();
  await refreshStock();
  await loadLedger();
}

async function removePurchaseRate(id) {
  if (!window.confirm('Delete this rate entry? Stock and ledger will be adjusted.')) {
    return;
  }
  const result = await window.api.deletePurchaseRate(id);
  if (!result || !result.success) {
    window.alert(result?.message || 'Failed to delete rate entry.');
    return;
  }

  await refreshPurchaseRates();
  await refreshPurchases();
  await refreshStock();
  await loadLedger();
}

function applyProfileSettings(settings) {
  currentSettings = settings || {};
  const effectiveName = currentSettings.shop_name || 'Billing Software';
  document.getElementById('profShopName').value = currentSettings.shop_name || '';
  document.getElementById('profLogo').value = currentSettings.logo || '';
  document.getElementById('profAddress').value = currentSettings.address || '';
  document.getElementById('profPhone').value = currentSettings.phone || '';
  document.getElementById('profGst').value = currentSettings.gst || '';
  document.getElementById('profEmail').value = currentSettings.email || '';

  const appTitle = document.getElementById('appTitle');
  const sidebarProfileName = document.getElementById('sidebarProfileName');
  if (appTitle) {
    appTitle.textContent = effectiveName;
  }
  if (sidebarProfileName) {
    sidebarProfileName.textContent = effectiveName;
  }
  document.title = effectiveName;
}

async function loadProfileSettings() {
  const settings = await window.api.getSettings();
  applyProfileSettings(settings || {});
}

async function saveProfileSettings() {
  const payload = {
    shop_name: document.getElementById('profShopName').value.trim(),
    logo: document.getElementById('profLogo').value.trim(),
    address: document.getElementById('profAddress').value.trim(),
    phone: document.getElementById('profPhone').value.trim(),
    gst: document.getElementById('profGst').value.trim(),
    email: document.getElementById('profEmail').value.trim()
  };

  const result = await window.api.saveSettings(payload);
  if (!result || !result.success) {
    window.alert('Unable to save profile settings.');
    return;
  }

  applyProfileSettings(result.settings || payload);
  showToast('Profile saved successfully.');
}

async function createBackup() {
  const result = await withLoading(() => window.api.createBackup());
  if (!result || !result.success) {
    window.alert(result?.message || 'Backup failed.');
    return;
  }
  showToast(result.message || 'Backup created.');
}

async function restoreBackup() {
  if (!window.confirm('This will overwrite current data. Continue restore?')) {
    return;
  }
  const result = await withLoading(() => window.api.restoreBackup());
  if (!result || !result.success) {
    window.alert(result?.message || 'Restore failed.');
  }
}

async function exportLedgerCsv() {
  const result = await withLoading(() => window.api.exportLedgerCsv());
  if (!result || !result.success) {
    window.alert(result?.message || 'Ledger export failed.');
    return;
  }
  showToast(result.message || 'Ledger exported.');
}

async function exportSalesCsv() {
  const result = await withLoading(() => window.api.exportSalesCsv());
  if (!result || !result.success) {
    window.alert(result?.message || 'Sales export failed.');
    return;
  }
  showToast(result.message || 'Sales exported.');
}

async function exportPurchasesCsv() {
  const result = await withLoading(() => window.api.exportPurchasesCsv());
  if (!result || !result.success) {
    window.alert(result?.message || 'Purchase export failed.');
    return;
  }
  showToast(result.message || 'Purchase exported.');
}

async function importPartiesCsv() {
  const result = await withLoading(() => window.api.importPartiesCsv());
  if (!result || !result.success) {
    window.alert(result?.message || 'Import failed.');
    return;
  }
  await refreshPartyData();
  showToast(result.message || 'Parties imported.');
}

async function startEditSale(id) {
  const details = await window.api.getSaleDetails(id);
  if (!details) {
    window.alert('Sale not found.');
    return;
  }

  document.getElementById('saleDate').value = details.date;
  document.getElementById('salePartyId').value = String(details.party_id);
  document.getElementById('saleType').value = details.type;
  document.getElementById('saleDiscount').value = String(Number(details.discount) || 0);
  document.getElementById('saleDeliveryCharges').value = String(Number(details.delivery_charges) || 0);
  saleItemsDraft = (details.items || []).map((item) => ({
    product_id: item.product_id,
    product_name: item.product_name,
    boxes: Number(item.boxes) || 0,
    pieces: Number(item.pieces) || 0,
    unit_type: normalizeUnitType(item.unit_type) || 'Pcs',
    rate: Number(item.rate) || 0,
    total: Number(item.total) || 0
  }));
  if (saleItemsDraft.length > 0) {
    document.getElementById('saleUnitType').value = saleItemsDraft[0].unit_type || 'Pcs';
  }
  renderSaleDraft();
  setSaleEditMode(id);
}

function cancelSaleEdit() {
  resetSaleForm();
}

async function removeSale(id) {
  if (!window.confirm('Delete this sale? Stock and ledger will be adjusted.')) {
    return;
  }

  const result = await window.api.deleteSale(id);
  if (!result || !result.success) {
    window.alert(result?.message || 'Failed to delete sale.');
    return;
  }

  resetSaleForm();
  await refreshSales();
  await refreshStock();
  await loadLedger();
  await refreshProfitLoss();
}

async function refreshSales() {
  const sales = await window.api.getSales();
  renderSales(sales);
}

function formatCurrency(value) {
  return Number(value || 0).toFixed(2);
}

function formatMonthLabel(monthValue) {
  const source = String(monthValue || '').trim();
  const parts = source.split('-');
  if (parts.length !== 2) {
    return source;
  }

  const year = Number(parts[0]);
  const monthIndex = Number(parts[1]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return source;
  }

  const date = new Date(year, monthIndex, 1);
  return date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function renderProfitLossSummary(data) {
  const totalSales = Number(data?.totalSales || 0);
  const totalPurchase = Number(data?.totalPurchase || 0);
  const netProfit = Number(data?.netProfit || 0);
  const itemBasedProfit = Number(data?.itemBasedProfit || 0);
  const adjustment = Number(data?.adjustment || 0);

  document.getElementById('plTotalSales').textContent = formatCurrency(totalSales);
  document.getElementById('plTotalPurchase').textContent = formatCurrency(totalPurchase);
  const netEl = document.getElementById('plNetProfit');
  netEl.textContent = formatCurrency(netProfit);
  netEl.classList.remove('text-green-700', 'text-red-700');
  netEl.classList.add(netProfit >= 0 ? 'text-green-700' : 'text-red-700');
  document.getElementById('plItemProfit').textContent = formatCurrency(itemBasedProfit);

  const adjustmentEl = document.getElementById('plAdjustment');
  if (adjustmentEl) {
    adjustmentEl.textContent = formatCurrency(adjustment);
    adjustmentEl.classList.remove('text-green-700', 'text-red-700');
    adjustmentEl.classList.add(adjustment >= 0 ? 'text-green-700' : 'text-red-700');
  }
}

function setExpenseEditMode(id) {
  const editingInput = document.getElementById('editingExpenseId');
  const submitBtn = document.getElementById('expenseSubmitBtn');
  if (editingInput) {
    editingInput.value = id ? String(id) : '';
  }
  if (submitBtn) {
    submitBtn.textContent = id ? 'Update Entry' : 'Add Entry';
  }
}

function clearExpenseForm(keepDate = true) {
  if (!keepDate) {
    const expenseDate = document.getElementById('expenseDate');
    if (expenseDate) {
      expenseDate.value = new Date().toISOString().slice(0, 10);
    }
  }
  document.getElementById('expenseReason').value = '';
  document.getElementById('expenseType').value = 'LOSS';
  document.getElementById('expenseAmount').value = '';
  setExpenseEditMode(null);
}

function renderExpenseEntries(rows) {
  currentExpenses = rows || [];
  const body = document.getElementById('expenseTableBody');
  if (!body) {
    return;
  }

  body.innerHTML = '';
  if (currentExpenses.length === 0) {
    body.innerHTML = `
      <tr class="border-t">
        <td colspan="5" class="p-3 text-center text-gray-500">No entries found.</td>
      </tr>
    `;
    return;
  }

  currentExpenses.forEach((entry) => {
    const isProfit = String(entry.type || '').toUpperCase() === 'PROFIT';
    body.innerHTML += `
      <tr class="border-t">
        <td class="p-2">${escapeHtml(entry.date)}</td>
        <td class="p-2">${escapeHtml(entry.reason)}</td>
        <td class="p-2 ${isProfit ? 'text-green-700' : 'text-red-700'} font-medium">${isProfit ? 'PROFIT' : 'LOSS'}</td>
        <td class="p-2 text-right ${isProfit ? 'text-green-700' : 'text-red-700'}">${formatCurrency(entry.amount)}</td>
        <td class="p-2">
          <button onclick="editExpenseEntry(${entry.id})" class="bg-amber-500 text-white px-3 py-1 rounded mr-2">Edit</button>
          <button onclick="removeExpenseEntry(${entry.id})" class="bg-red-600 text-white px-3 py-1 rounded">Delete</button>
        </td>
      </tr>
    `;
  });
}

async function saveExpenseEntry() {
  const editingId = Number(document.getElementById('editingExpenseId').value || 0);
  const payload = {
    date: document.getElementById('expenseDate').value,
    reason: document.getElementById('expenseReason').value.trim(),
    type: document.getElementById('expenseType').value,
    amount: Number(document.getElementById('expenseAmount').value)
  };

  if (!payload.date || !payload.reason || !Number.isFinite(payload.amount) || payload.amount <= 0) {
    window.alert('Date, reason and valid amount are required.');
    return;
  }

  const result = editingId
    ? await window.api.updateExpense(editingId, payload)
    : await window.api.addExpense(payload);

  if (!result || !result.success) {
    window.alert(result?.message || 'Unable to save expense entry.');
    return;
  }

  clearExpenseForm(true);
  await refreshProfitLoss();
  showToast(editingId ? 'Entry updated.' : 'Entry added.');
}

function editExpenseEntry(id) {
  const entry = currentExpenses.find((item) => Number(item.id) === Number(id));
  if (!entry) {
    return;
  }

  document.getElementById('expenseDate').value = entry.date || '';
  document.getElementById('expenseReason').value = entry.reason || '';
  document.getElementById('expenseType').value = String(entry.type || '').toUpperCase() === 'PROFIT' ? 'PROFIT' : 'LOSS';
  document.getElementById('expenseAmount').value = Number(entry.amount || 0).toFixed(2);
  setExpenseEditMode(id);
}

function cancelExpenseEdit() {
  clearExpenseForm(false);
}

async function removeExpenseEntry(id) {
  if (!window.confirm('Delete this entry?')) {
    return;
  }

  const result = await window.api.deleteExpense(id);
  if (!result || !result.success) {
    window.alert(result?.message || 'Unable to delete entry.');
    return;
  }

  clearExpenseForm(true);
  await refreshProfitLoss();
  showToast('Entry deleted.');
}

function renderMonthlyReport(rows) {
  const body = document.getElementById('monthlyReportBody');
  currentMonthlyReportRows = Array.isArray(rows) ? rows : [];
  body.innerHTML = '';
  if (!currentMonthlyReportRows || currentMonthlyReportRows.length === 0) {
    body.innerHTML = `
      <tr class="border-t">
        <td colspan="5" class="p-3 text-center text-gray-500">No monthly data found.</td>
      </tr>
    `;
    return;
  }

  let grandProfit = 0;
  let grandLoss = 0;

  currentMonthlyReportRows.forEach((row, index) => {
    const rowProfit = Number(row.profit || 0);
    const rowLoss = Number(row.loss || 0);
    const netValue = Number(row.net_value || 0);
    grandProfit += rowProfit;
    grandLoss += rowLoss;

    body.innerHTML += `
      <tr class="border-t">
        <td class="p-2">${escapeHtml(formatMonthLabel(row.month))}</td>
        <td class="p-2 text-right">${formatCurrency(rowProfit)}</td>
        <td class="p-2 text-right">${formatCurrency(rowLoss)}</td>
        <td class="p-2 text-right ${netValue >= 0 ? 'text-green-700' : 'text-red-700'} font-semibold">${formatCurrency(netValue)}</td>
        <td class="p-2">
          <button onclick="editMonthlyReportRow(${index})" class="bg-amber-500 text-white px-3 py-1 rounded">Edit</button>
        </td>
      </tr>
    `;
  });

  const grandNet = grandProfit - grandLoss;
  body.innerHTML += `
    <tr class="border-t bg-gray-100 font-semibold">
      <td class="p-2">Grand Total</td>
      <td class="p-2 text-right text-green-700">${formatCurrency(grandProfit)}</td>
      <td class="p-2 text-right text-red-700">${formatCurrency(grandLoss)}</td>
      <td class="p-2 text-right ${grandNet >= 0 ? 'text-green-700' : 'text-red-700'}">${formatCurrency(grandNet)}</td>
      <td class="p-2"></td>
    </tr>
  `;
}

function renderDailyReport(rows) {
  const body = document.getElementById('dailyReportBody');
  if (!body) {
    return;
  }

  currentDailyReportRows = Array.isArray(rows) ? rows : [];
  body.innerHTML = '';
  if (!currentDailyReportRows || currentDailyReportRows.length === 0) {
    body.innerHTML = `
      <tr class="border-t">
        <td colspan="7" class="p-3 text-center text-gray-500">No daily data found.</td>
      </tr>
    `;
    return;
  }

  currentDailyReportRows.forEach((row, index) => {
    body.innerHTML += `
      <tr class="border-t">
        <td class="p-2">${escapeHtml(row.date)}</td>
        <td class="p-2">${escapeHtml(row.name)}</td>
        <td class="p-2 text-right">${formatCurrency(row.purchase)}</td>
        <td class="p-2 text-right">${formatCurrency(row.sales)}</td>
        <td class="p-2 text-right">${formatCurrency(row.profit)}</td>
        <td class="p-2 text-right">${formatCurrency(row.loss)}</td>
        <td class="p-2">
          <button onclick="editDailyReportRow(${index})" class="bg-amber-500 text-white px-3 py-1 rounded">Edit</button>
        </td>
      </tr>
    `;
  });
}

async function editDailyReportRow(index) {
  const row = currentDailyReportRows[index];
  if (!row) {
    return;
  }

  const values = await openEditorDialog('Edit Daily Report', [
    { key: 'purchase', label: 'Purchase Value', type: 'number', step: '0.01', min: 0, value: Number(row.purchase || 0) },
    { key: 'sales', label: 'Sale Value', type: 'number', step: '0.01', min: 0, value: Number(row.sales || 0) }
  ]);

  if (!values) {
    return;
  }

  const payload = {
    date: String(row.date || '').trim(),
    name: String(row.name || '').trim(),
    purchase: Number(values.purchase),
    sales: Number(values.sales)
  };

  if (!payload.date || !payload.name || !Number.isFinite(payload.purchase) || payload.purchase < 0 || !Number.isFinite(payload.sales) || payload.sales < 0) {
    window.alert('Enter valid sale and purchase values.');
    return;
  }

  const result = await window.api.setDailyReportValues(payload);
  if (!result || !result.success) {
    window.alert(result?.message || 'Unable to update daily report row.');
    return;
  }

  await refreshProfitLoss();
  showToast('Daily report row updated.');
}

async function editMonthlyReportRow(index) {
  const row = currentMonthlyReportRows[index];
  if (!row) {
    return;
  }

  const values = await openEditorDialog('Edit Monthly Report', [
    { key: 'purchase', label: 'Monthly Purchase Value', type: 'number', step: '0.01', min: 0, value: Number(row.purchase || 0) },
    { key: 'sales', label: 'Monthly Sale Value', type: 'number', step: '0.01', min: 0, value: Number(row.sales || 0) }
  ]);

  if (!values) {
    return;
  }

  const payload = {
    month: String(row.month || '').trim(),
    purchase: Number(values.purchase),
    sales: Number(values.sales)
  };

  if (!payload.month || !Number.isFinite(payload.purchase) || payload.purchase < 0 || !Number.isFinite(payload.sales) || payload.sales < 0) {
    window.alert('Enter valid monthly sale and purchase values.');
    return;
  }

  const result = await window.api.setMonthlyReportValues(payload);
  if (!result || !result.success) {
    window.alert(result?.message || 'Unable to update monthly report row.');
    return;
  }

  await refreshProfitLoss();
  showToast('Monthly report row updated.');
}

async function refreshProfitLoss() {
  const summary = await window.api.getProfitLoss();
  const monthly = await window.api.getMonthlyReport();
  const daily = await window.api.getDailyReport();
  const expenses = await window.api.getExpenses();

  renderProfitLossSummary(summary);
  renderExpenseEntries(expenses);
  renderMonthlyReport(monthly);
  renderDailyReport(daily);
}

function printSalesView() {
  window.print();
}

window.showView = showView;
window.addOrUpdateParty = addOrUpdateParty;
window.editParty = editParty;
window.deleteParty = deleteParty;
window.searchParties = searchParties;
window.addPaymentIn = async () => submitPayment('paymentIn', 'IN');
window.addPaymentOut = async () => submitPayment('paymentOut', 'OUT');
window.startEditPayment = startEditPayment;
window.cancelPaymentEdit = cancelPaymentEdit;
window.savePaymentEdit = savePaymentEdit;
window.removePayment = removePayment;
window.loadLedger = loadLedger;
window.calculatePurchaseLineTotal = calculatePurchaseLineTotal;
window.addPurchaseItem = addPurchaseItem;
window.removePurchaseItem = removePurchaseItem;
window.submitPurchase = submitPurchase;
window.startEditPurchase = startEditPurchase;
window.cancelPurchaseEdit = cancelPurchaseEdit;
window.removePurchase = removePurchase;
window.addGodown = addGodown;
window.deleteGodown = deleteGodown;
window.deleteGodownFromTop = deleteGodownFromTop;
window.openGodown = openGodown;
window.goBackToGodownList = goBackToGodownList;
window.editGodownStockItem = editGodownStockItem;
window.removeGodownStockItem = removeGodownStockItem;
window.syncSaleRateFromProduct = syncSaleRateFromProduct;
window.calculateSaleLineTotal = calculateSaleLineTotal;
window.recalculateSaleFinalTotal = recalculateSaleFinalTotal;
window.addSaleItem = addSaleItem;
window.removeSaleItem = removeSaleItem;
window.saveSaleInvoice = saveSaleInvoice;
window.printSalesView = printSalesView;
window.startEditSale = startEditSale;
window.cancelSaleEdit = cancelSaleEdit;
window.removeSale = removeSale;
window.viewSaleDetail = viewSaleDetail;
window.closeSaleDetail = closeSaleDetail;
window.printSaleDetail = printSaleDetail;
window.refreshPurchaseRates = refreshPurchaseRates;
window.editPurchaseRate = editPurchaseRate;
window.removePurchaseRate = removePurchaseRate;
window.editDailyReportRow = editDailyReportRow;
window.editMonthlyReportRow = editMonthlyReportRow;
window.saveExpenseEntry = saveExpenseEntry;
window.editExpenseEntry = editExpenseEntry;
window.cancelExpenseEdit = cancelExpenseEdit;
window.removeExpenseEntry = removeExpenseEntry;
window.saveProfileSettings = saveProfileSettings;
window.createBackup = createBackup;
window.restoreBackup = restoreBackup;
window.exportLedgerCsv = exportLedgerCsv;
window.exportSalesCsv = exportSalesCsv;
window.exportPurchasesCsv = exportPurchasesCsv;
window.importPartiesCsv = importPartiesCsv;

window.onload = async () => {
  await withLoading(async () => {
    setDefaultDates();
    clearPartyForm();
    resetPurchaseForm();
    resetSaleForm();

    await refreshPartyData();
    await refreshGodowns();
    await loadProfileSettings();
    await refreshProductCatalog();
    await refreshPayments();
    await refreshSales();
    await refreshProfitLoss();
    await refreshPurchases();
    await refreshStock();
    await refreshPurchaseRates();
    await loadLedger();

    showView('sales');
  });
};
