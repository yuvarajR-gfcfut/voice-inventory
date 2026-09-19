import express from 'express';
import app from './index.js';

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.redirect('/stocksathi_home_dashboard.html');
});

app.listen(PORT, () => {
  console.log(`Voice Inventory dev server running on http://localhost:${PORT}`);
});
