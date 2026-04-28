const express = require('express');
const axios = require('axios');
const client = require('prom-client');
client.collectDefaultMetrics();
const app = express();

const USER_URL = process.env.USER_SERVICE_URL || 'http://user-service:3001';
const ORDER_URL = process.env.ORDER_SERVICE_URL || 'http://order-service:3002';

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of requests',
  labelNames: ['method', 'route', 'status']
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.1, 0.3, 0.5, 1, 2, 5]
});
const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of errors',
  labelNames: ['method', 'route']
});
app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const route = req.route?.path || req.path;

    httpRequestsTotal.inc({
      method: req.method,
      route: route,
      status: res.statusCode
    });

    end({
      method: req.method,
      route: route,
      status: res.statusCode
    });

    if (res.statusCode >= 400) {
      httpErrorsTotal.inc({
        method: req.method,
        route: route
      });
    }
  });

  next();
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

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
