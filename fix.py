import re
import os

files = ['renderer/app.js', 'renderer/index.html']
for filepath in files:
    with open(filepath, 'r', encoding='utf8') as f:
        content = f.read()
    
    def replacer(match):
        full_button = match.group(0)
        cleaned_button = re.sub(r'\s*type="[^"]*"', '', full_button)
        
        onclick_match = re.search(r'onclick="([^"]+)"', cleaned_button)
        if onclick_match:
            onclick_content = onclick_match.group(1)
            new_onclick = onclick_content
            if 'event.preventDefault()' not in new_onclick:
                new_onclick = 'event.preventDefault(); ' + new_onclick
            if 'event.stopPropagation()' not in new_onclick:
                new_onclick = 'event.stopPropagation(); ' + new_onclick
            
            cleaned_button = cleaned_button.replace(onclick_match.group(0), f'type="button" onclick="{new_onclick}"')
            
        return cleaned_button

    new_content = re.sub(r'<button[^>]*>Delete[^<]*</button>', replacer, content, flags=re.IGNORECASE)
    
    with open(filepath, 'w', encoding='utf8') as f:
        f.write(new_content)
    print(f'Processed {filepath}')
