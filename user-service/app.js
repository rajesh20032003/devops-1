const express = require('express');
const app = express();

app.get('/users', (req, res) => {
  res.json([
    { id: 1, name: 'Rajesh' },
    { id: 2, name: 'DevOps Engineer' },
  ]);
});

app.get('/health', (req, res) => {
  res.json({ status: 'UP' });
});
app.get('/test', (req, res) => {
  res.status(200).send('OK');
});

module.exports = app;
