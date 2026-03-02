const request = require('supertest');
const axios = require('axios');
const app = require('../app');

jest.mock('axios');

test('dashboard returns combined data', async () => {
  axios.get.mockResolvedValueOnce({
    data: [{ id: 1 }, { id: 2 }]
  });

  axios.get.mockResolvedValueOnce({
    data: [{ id: 101 }]
  });

  const res = await request(app).get('/api/dashboard');

  expect(res.statusCode).toBe(200);
  expect(res.body.userCount).toBe(2);
  expect(res.body.orderCount).toBe(1);
});

test('dashboard handles service failure', async () => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  axios.get.mockRejectedValue(new Error('Service down'));

  const res = await request(app).get('/api/dashboard');

  expect(res.statusCode).toBe(500);
});