const request = require('supertest');
const app = require('../app');

test('returns orders list', async () => {
  const res = await request(app).get('/orders');

  expect(res.statusCode).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});