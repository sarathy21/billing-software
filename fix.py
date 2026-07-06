import sys

with open('renderer/app.js', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace(r"\'", "'")

with open('renderer/app.js', 'w', encoding='utf-8') as f:
    f.write(text)
print('Fixed!')
