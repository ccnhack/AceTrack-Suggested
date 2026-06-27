(async () => {
  try {
    await import('./backend/promotion_logic.mjs');
  } catch (err) {
    console.error("Error importing promotion_logic.mjs:", err);
  }
})();
