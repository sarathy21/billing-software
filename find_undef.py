import re

with open('renderer/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

# find functions
functions = re.finditer(r'function\s+(\w+)\s*\([^)]*\)\s*{', content)
funcs = []
for m in functions:
    funcs.append((m.start(), m.group(1)))

funcs.sort()

def get_func(pos):
    last = "unknown"
    for start, name in funcs:
        if start > pos:
            break
        last = name
    return last

lines = content.split('\n')
for i, line in enumerate(lines):
    match = re.search(r'(\w+)\.innerHTML \+=', line)
    if match:
        var_name = match.group(1)
        
        # Search backwards from i for definition
        found = False
        for j in range(i-1, -1, -1):
            if "function " in lines[j] and "{" in lines[j]:
                break
            if var_name in lines[j] and ("const " + var_name in lines[j] or "let " + var_name in lines[j] or "var " + var_name in lines[j] or "document.getElementById" in lines[j]):
                found = True
                break
        
        if not found:
            print(f"Line {i+1}: {line.strip()} in function {get_func(sum(len(l)+1 for l in lines[:i]))} -> {var_name} might be undefined")
