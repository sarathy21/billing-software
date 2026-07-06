import re

file_path = 'e:/project/Billing/billing-software/renderer/app.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Remove let html = '';
content = content.replace("let html = '';\n  ", "")
content = content.replace("let html = '';\n", "")

# 2. Find target for each html +=
while 'html +=' in content:
    idx = content.find('html +=')
    match = re.search(r'(body|table|list|select)\.innerHTML = html;', content[idx:])
    if match:
        target = match.group(1)
        content = content[:idx] + f"{target}.innerHTML +=" + content[idx+7:]
        
        # Remove the exact line \n  target.innerHTML = html;
        target_str = f"  {target}.innerHTML = html;"
        if target_str in content:
            content = content.replace(target_str, "", 1)
        else:
            content = content.replace(f"{target}.innerHTML = html;", "", 1)
    else:
        print("Warning: no target found for html +=")
        break

# Remove trailing } added manually
content = content.rstrip()
if content.endswith('}'):
    content = content[:-1]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("Done reversing app.js")
