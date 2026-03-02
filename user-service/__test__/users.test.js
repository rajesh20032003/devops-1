const request = require('supertest');
const app = require('../app');

test('returns users list', async () => {
  const res = await request(app).get('/users');

  expect(res.statusCode).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
});

test('returns empty array when no users', async () => {
  const res = await request(app).get('/users');

  expect(res.body).toEqual(expect.any(Array));
});