import re
import os

app_js_path = 'renderer/app.js'
index_html_path = 'renderer/index.html'

with open(app_js_path, 'r', encoding='utf-8') as f:
    app_js = f.read()
    
with open(index_html_path, 'r', encoding='utf-8') as f:
    index_html = f.read()

# Replace <th class="p-2 ..."> and <td class="p-2 ...">
# with standardized padding "px-4 py-3 align-middle"
# To avoid messing up other classes, we just replace "p-2" and "p-3" in th and td with "px-4 py-3 align-middle"

def replace_padding(html_str):
    # For td
    html_str = re.sub(r'<td class="([^"]*)\bp-2\b([^"]*)"', r'<td class="\1px-4 py-3 align-middle\2"', html_str)
    html_str = re.sub(r'<td class="([^"]*)\bp-3\b([^"]*)"', r'<td class="\1px-4 py-3 align-middle\2"', html_str)
    # For th
    html_str = re.sub(r'<th class="([^"]*)\bp-2\b([^"]*)"', r'<th class="\1px-4 py-3 align-middle\2"', html_str)
    html_str = re.sub(r'<th class="([^"]*)\bp-3\b([^"]*)"', r'<th class="\1px-4 py-3 align-middle\2"', html_str)
    # Fix instances where there was no space
    html_str = re.sub(r'px-4 py-3 align-middle +', 'px-4 py-3 align-middle ', html_str)
    html_str = re.sub(r' +px-4 py-3 align-middle', ' px-4 py-3 align-middle', html_str)
    
    return html_str

app_js = replace_padding(app_js)
index_html = replace_padding(index_html)

# Fix Cracker Purchase Rate TH in index.html
index_html = index_html.replace('>Purchase Type</th>', '>Purchase Rate</th>')

# Fix Product IN / OUT TH in index.html (Already correct, but let's ensure wrapping class on Product Details)
# "px-3 py-3.5 text-left min-w-[200px] max-w-xs break-words whitespace-normal"
index_html = re.sub(
    r'<th class="px-3 py-3.5 text-left min-w-\[200px\] max-w-xs[^"]*">Product Details</th>',
    r'<th class="px-4 py-3 text-left min-w-[200px] max-w-xs whitespace-normal break-words align-middle">Product Details</th>',
    index_html
)
# Ensure Action columns have a reasonable fixed width
index_html = re.sub(r'<th class="([^"]*)">Action</th>', r'<th class="\1 w-32 text-center whitespace-nowrap">Action</th>', index_html)
# Remove duplicate w-32 text-center if it happened
index_html = index_html.replace('w-32 text-center whitespace-nowrap w-32 text-center whitespace-nowrap', 'w-32 text-center whitespace-nowrap')


# Rewrite renderRawMaterialTransactions in app.js
new_raw_material = """
function renderRawMaterialTransactions(rows) {
    rawMaterialTransactions = Array.isArray(rows) ? rows : [];
    const body = document.getElementById('rawMaterialTxnTableBody');
    if (!body) {
        return;
    }
    body.innerHTML = '';
    if (rawMaterialTransactions.length === 0) {
        body.innerHTML = `
      <tr>
        <td colspan="7" class="px-4 py-3 align-middle text-center text-gray-500">No product in/out entries found.</td>
      </tr>
    `;
        return;
    }
    let html = '';
    rawMaterialTransactions.forEach(row => {
        const isOut = String(row.entry_type || '').toUpperCase() === 'OUT';
        const entryLabel = isOut ? 'Product OUT' : 'Product IN';
        const partyLabel = String(row.party_name || '').trim() || '-';
        const rateLabel = isOut ? '-' : Number(row.rate || 0).toFixed(2);
        const detailsLabel = isOut ? '-' : row.product_details || '-';
        html += `
      <tr class="border-t">
        <td class="px-4 py-3 align-middle text-center whitespace-nowrap">${ escapeHtml(formatDisplayDate(row.date || '-')) }</td>
        <td class="px-4 py-3 align-middle text-left min-w-[200px]">
          <div class="font-medium">${ escapeHtml(row.product_name || '-') }</div>
          <div class="text-xs text-gray-500">${ escapeHtml(`${ entryLabel } | Party: ${ partyLabel }`) }</div>
        </td>
        <td class="px-4 py-3 align-middle text-right font-semibold">${ Number(row.quantity || 0).toFixed(2) }</td>
        <td class="px-4 py-3 align-middle text-left whitespace-nowrap">${ escapeHtml(row.unit_type || 'Pcs') }</td>
        <td class="px-4 py-3 align-middle text-right">${ escapeHtml(rateLabel) }</td>
        <td class="px-4 py-3 align-middle text-left max-w-xs whitespace-normal break-words">${ escapeHtml(detailsLabel) }</td>
        <td class="px-4 py-3 align-middle text-center w-32 whitespace-nowrap">
          <button onclick="startEditRawMaterialTransaction(${ Number(row.id) })" class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded mr-1 transition text-xs font-medium">Edit</button>
          <button onclick="removeRawMaterialTransaction(${ Number(row.id) })" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded transition text-xs font-medium">Delete</button>
        </td>
      </tr>
    `;
    });
    body.innerHTML = html;
}
"""

app_js = re.sub(
    r'function renderRawMaterialTransactions\(rows\)\s*\{[\s\S]*?body\.innerHTML = html;\s*\}',
    new_raw_material.strip(),
    app_js
)

# Rewrite renderPurchaseRates in app.js
new_purchase_rates = """
function renderPurchaseRates(rows) {
    currentPurchaseRates = rows;
    const body = document.getElementById('rateTableBody');
    body.innerHTML = '';
    const latestByProduct = new Map();
    rows.forEach(row => {
        const key = String(row.product_name || '').toLowerCase();
        if (!latestByProduct.has(key)) {
            latestByProduct.set(key, row.id);
        }
    });
    let html = '';
    rows.forEach(row => {
        const isLatest = latestByProduct.get(String(row.product_name || '').toLowerCase()) === row.id;
        const commission = Number(row.agent_commission || 0);
        html += `
      <tr class="border-t ${ isLatest ? 'bg-amber-50' : '' }">
        <td class="px-4 py-3 align-middle text-center whitespace-nowrap">${ escapeHtml(formatDisplayDate(row.date || '-')) }</td>
        <td class="px-4 py-3 align-middle text-left whitespace-nowrap">${ escapeHtml(row.product_name) }</td>
        <td class="px-4 py-3 align-middle text-center whitespace-nowrap">${ escapeHtml(row.unit_type || 'Pcs') }</td>
        <td class="px-4 py-3 align-middle text-right whitespace-nowrap">${ formatCurrency(row.rate) } ${ isLatest ? '<span class="text-xs text-amber-700 block">(Latest)</span>' : '' }</td>
        <td class="px-4 py-3 align-middle text-right whitespace-nowrap">${ formatCurrency(row.transport_charge || 0) }</td>
        <td class="px-4 py-3 align-middle text-right whitespace-nowrap">${ formatCurrency(commission) }</td>
        <td class="px-4 py-3 align-middle text-right whitespace-nowrap">${ formatCurrency(row.packing_charge || 0) }</td>
        <td class="px-4 py-3 align-middle text-left min-w-[150px] break-words whitespace-normal">${ escapeHtml(row.party_name || '-') }</td>
        <td class="px-4 py-3 align-middle text-right whitespace-nowrap">${ formatCurrency(row.selling_rate || row.rate) }</td>
        <td class="px-4 py-3 align-middle text-center w-32 whitespace-nowrap">
          <button onclick="editPurchaseRate(${ row.id })" class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded mr-1 transition text-xs font-medium">Edit</button>
          <button onclick="removePurchaseRate(${ row.id })" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded transition text-xs font-medium">Delete</button>
        </td>
      </tr>
    `;
    });
    body.innerHTML = html;
}
"""

app_js = re.sub(
    r'function renderPurchaseRates\(rows\)\s*\{[\s\S]*?body\.innerHTML = html;\s*\}',
    new_purchase_rates.strip(),
    app_js
)


with open(app_js_path, 'w', encoding='utf-8') as f:
    f.write(app_js)

with open(index_html_path, 'w', encoding='utf-8') as f:
    f.write(index_html)

print("Tables aligned and patched successfully.")
