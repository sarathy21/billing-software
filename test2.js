const { app } = require('electron');
const profitLossService = require('./services/profitLossService.js');

app.whenReady().then(() => {
  try {
    const addRes = profitLossService.addExpense({
      date: '2025-01-01',
      category: 'TEST',
      amount: 100,
      description: 'Test expense'
    });
    console.log('[ADD]', addRes);
    
    if (addRes.success && addRes.id) {
      const getRes1 = profitLossService.getExpenses();
      console.log('[GET BEFORE DELETE]', getRes1.length);
      
      const delRes = profitLossService.deleteExpense(addRes.id);
      console.log('[DELETE]', delRes);
      
      const getRes2 = profitLossService.getExpenses();
      console.log('[GET AFTER DELETE]', getRes2.length);
    }
  } catch(e) {
    console.error('[ERROR]', e);
  }
  app.quit();
});
