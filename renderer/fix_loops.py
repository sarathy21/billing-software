import re

file_path = 'e:/project/Billing/billing-software/renderer/app.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Find all blocks of code that look like:
# function xxx() { ...
#   let table = document.getElementById(...)
#   table.innerHTML = ''
#   ...
#   rows.forEach(row => {
#     table.innerHTML += `...`
#   })
# }

def replacer(match):
    prefix = match.group(1)
    setup = match.group(2)
    loopStart = match.group(3)
    loopBodyPre = match.group(4)
    templateString = match.group(5)
    loopBodyPost = match.group(6)

    # find target name
    targetMatch = re.search(r'(const|let)\s+(body|table|list|select)\s*=\s*document', setup)
    if not targetMatch:
        return match.group(0)
    targetName = targetMatch.group(2)

    newMatch = prefix + setup + "  let html = '';\n  " + loopStart + loopBodyPre
    
    # replace innerHTML += with html +=
    newMatch += templateString.replace(targetName + '.innerHTML +=', 'html +=')
    newMatch += loopBodyPost
    
    # add html assignment at the end of loop
    newMatch = newMatch.replace('});', '});\n  ' + targetName + '.innerHTML = html;')
    
    # remove target.innerHTML = ''; if it exists right before the loop
    # Wait, the innerHTML = '' might be inside the setup. Let's just let it be, it's harmless
    return newMatch

# We will match the loop itself
loop_regex = re.compile(r'([a-zA-Z0-9_]+\.forEach\s*\([^)]*\)\s*=>\s*\{)([\s\S]*?)(?:body|table|list|select)\.innerHTML\s*\+=\s*(`[^`]*`);([\s\S]*?\}\);)')

count = 0
def loop_replacer(match):
    global count
    count += 1
    loopStart = match.group(1)
    loopBodyPre = match.group(2)
    templateString = match.group(3)
    loopBodyPost = match.group(4)

    # Determine targetName from templateString assignment
    # wait, the regex was: (?:body|table|list|select)\.innerHTML \+=
    # let's just find what the target was
    target = 'body'
    if 'table.innerHTML' in match.group(0): target = 'table'
    if 'list.innerHTML' in match.group(0): target = 'list'
    if 'select.innerHTML' in match.group(0): target = 'select'

    newMatch = "let html = '';\n  " + loopStart + loopBodyPre
    newMatch += f"html += {templateString};"
    newMatch += loopBodyPost.replace('});', f'}});\n  {target}.innerHTML = html;')
    return newMatch

new_content = loop_regex.sub(loop_replacer, content)

print(f"Modified {count} places.")
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)
