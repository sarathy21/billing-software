import os
import re

# 1. Update preload.js
preload_path = r'c:\project\Billing\billing-software\preload.js'
with open(preload_path, 'r', encoding='utf-8') as f:
    preload = f.read()

preload = preload.replace(
    "getIndianStates: () => ipcRenderer.invoke('get-indian-states'),",
    "getIndianStates: () => ipcRenderer.invoke('get-indian-states'),\n  showConfirmDialog: (message) => ipcRenderer.invoke('show-confirm-dialog', message),"
)

with open(preload_path, 'w', encoding='utf-8') as f:
    f.write(preload)

# 2. Update main.js
main_path = r'c:\project\Billing\billing-software\main.js'
with open(main_path, 'r', encoding='utf-8') as f:
    main = f.read()

confirm_handler = """
ipcMain.handle('show-confirm-dialog', async (event, message) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Yes', 'No'],
    title: 'Confirm',
    message: message,
    defaultId: 1,
    cancelId: 1
  });
  return result.response === 0;
});
"""

main = main.replace(
  "ipcMain.handle('get-indian-states', async () => {",
  confirm_handler + "\nipcMain.handle('get-indian-states', async () => {"
)

with open(main_path, 'w', encoding='utf-8') as f:
    f.write(main)

print('Updated main.js and preload.js')
