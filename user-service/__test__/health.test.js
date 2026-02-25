const request = require("supertest");
const app = require("../app");

test("health endpoint works", async () => {
  const res = await request(app).get("/test");
  expect(res.statusCode).toBe(200);
  expect(res.text).toBe("OK");
});