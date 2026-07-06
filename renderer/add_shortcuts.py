with open('e:/project/Billing/billing-software/renderer/app.js', 'a', encoding='utf-8') as f:
    f.write("""
document.addEventListener('keydown', function(event) {
  if (event.ctrlKey) {
    if (event.key.toLowerCase() === 's') {
      event.preventDefault();
    } else if (event.key.toLowerCase() === 'f') {
      event.preventDefault();
    } else if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
    }
  }
});
""")
print('Shortcuts added')
