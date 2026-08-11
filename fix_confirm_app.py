import os
import re

app_js_path = r'c:\project\Billing\billing-software\renderer\app.js'
with open(app_js_path, 'r', encoding='utf-8') as f:
    app_js = f.read()

# Replace all occurrences of:
# if (!window.confirm('Delete this party?')) {
# with:
# if (!(await window.api.showConfirmDialog('Delete this party?'))) {

# First, replace the function calls
app_js = re.sub(
    r'window\.confirm\(([^)]+)\)',
    r'(await window.api.showConfirmDialog(\1))',
    app_js
)

# Second, some functions might not be async. We need to make sure they are async.
# We look for "function myFunc(" that contains "(await window.api.showConfirmDialog"
# and change them to "async function myFunc(" if they are not already.

def make_async(match):
    prefix = match.group(1)
    func_name = match.group(2)
    body = match.group(3)
    
    if '(await window.api.showConfirmDialog' in body and 'async ' not in prefix:
        return f'{prefix}async function {func_name}{body}'
    return match.group(0)

# A simple regex to match functions and their bodies is hard, but we can match function headers
# and then replace them. Since we only have a few, we can just look for function definitions that
# are followed by some code before the next function definition.
# Actually, it's easier to just find the function name that contains the await and replace it.

functions_with_confirm = [
    'deleteParty',
    'deleteTransactionParty',
    'removePayment',
    'deleteManualLedgerEntry',
    'deleteLedgerSource',
    'removePurchaseItem',
    'removePurchase',
    'removeRawMaterialStockProduct',
    'removeRawMaterialTransaction',
    'removeSaleItem',
    'removeSale',
    'removePurchaseRate',
    'removePurchaseReturn',
    'removeSalesReturn',
    'removeLabourEntry',
    'removeExpenseEntry',
    'deleteGodownFromTop',
    'deleteGodown'
]

for func in functions_with_confirm:
    app_js = re.sub(
        rf'(?<!async\s)function\s+{func}\b',
        f'async function {func}',
        app_js
    )

with open(app_js_path, 'w', encoding='utf-8') as f:
    f.write(app_js)

print('Updated app.js')
