// __test__/users.test.js
const request = require('supertest');
const app = require('../app');

jest.mock('../db', () => ({
  query: jest.fn(),
}));

const pool = require('../db');

describe('Users', () => {
  test('returns users list', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [
        { id: 1, name: 'Rajesh', email: 'rajesh@example.com' },
        { id: 2, name: 'DevOps Engineer', email: 'devops@example.com' },
      ],
    });

    const res = await request(app).get('/users');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  test('returns empty array when no users', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/users');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([]);
  });
});
