const express = require('express');
const axios = require('axios');

const app = express();

const USER_URL = process.env.USER_SERVICE_URL || 'http://user-service:3001';
const ORDER_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:3002';

app.get('/api/dashboard', async (req, res) => {
  try {
    const users = await axios.get(`${USER_URL}/users`);
    const orders = await axios.get(`${ORDER_URL}/orders`);

    res.json({
      users: users.data,
      orders: orders.data,
      userCount: users.data.length,
      orderCount: orders.data.length,
    });
  } catch (err) {
    /* eslint-disable no-console */
    console.error('Service communication failed:', err.message); // ← Log it (now used)

    res.status(500).json({ error: 'Service communication failed' });
  }
});
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// app.listen(3000, () => console.log("Gateway running"));
module.exports = app;
