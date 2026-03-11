// __test__/orders.test.js
const request = require('supertest');
const app = require('../app');

// MOCK the entire db module
// Jest replaces pool.query with a fake function
jest.mock('../db', () => ({
  query: jest.fn(),
}));

const pool = require('../db');

describe('Orders', () => {
  test('returns orders list', async () => {
    // Tell the fake pool.query what to return
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 101, item: 'Cement Bags', quantity: 10 },
        { id: 102, item: 'Steel Rods', quantity: 50 },
      ],
    });

    const res = await request(app).get('/orders');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });
});
