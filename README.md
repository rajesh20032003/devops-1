# 🚀 Microservices Dashboard — DevOps Project

A containerized microservices dashboard demonstrating modern DevOps architecture using Docker, API Gateway aggregation, and multi-network service isolation.

This project reflects real-world production design patterns including reverse proxying, secure service communication, and container networking segmentation.

---

## 🧱 Architecture Overview

The system consists of:

* **Frontend (Nginx)** → Dashboard UI
* **API Gateway (Node.js)** → routes & aggregates data
* **User Service (Node.js)** → provides user data
* **Order Service (Node.js)** → provides order data
* **Docker Networks** → isolate public and internal traffic

---

## 🔐 Network Architecture (Production Style)

Two Docker networks are used:

### 🌐 Frontend Network (Public Access)

Connected services:

* frontend
* gateway

👉 Handles external traffic from the browser.

---

### 🔒 Backend Network (Internal Services)

Connected services:

* gateway
* user-service
* order-service

👉 Internal service-to-service communication.
👉 Not exposed to the outside world.

---

### 🔁 Request Flow

Browser
→ Frontend (Nginx)
→ API Gateway
→ Internal Services
→ Gateway aggregates response
→ Frontend displays data

---

## 🖥️ Dashboard Features

✔ Displays users & orders
✔ Aggregated API response
✔ Real-time data refresh
✔ Microservice communication visualization
✔ Service availability display

---

## 🧰 Tech Stack

### Application

* Node.js
* Express.js
* Nginx

### DevOps & Infrastructure

* Docker
* Docker Compose
* Multi-network container architecture
* Reverse Proxy (Nginx)

---

## 📂 Project Structure

```
app01/
│
├── frontend/          # Nginx dashboard UI
├── gateway/           # API gateway service
├── user-service/      # User microservice
├── order-service/     # Order microservice
├── docker-compose.yml
└── .dockerignore
```

---

## ⚙️ How It Works

### 🔹 Frontend

* Serves dashboard UI
* Sends requests to API Gateway

### 🔹 API Gateway

* Aggregates responses from backend services
* Routes traffic between networks
* Handles failures & timeouts

### 🔹 User Service

Returns user data.

### 🔹 Order Service

Returns order data.

---

## 🐳 Running the Application

### 1️⃣ Build & start containers

```bash
docker compose up --build
```

---

### 2️⃣ Open dashboard

👉 http://localhost:100

---

## 🔎 Verify API Gateway

```bash
curl http://localhost:3000/api/dashboard
```

---

## 🌐 Docker Networking Explained

### Frontend Network

Handles external access:

```
Browser → frontend → gateway
```

### Backend Network

Handles secure internal communication:

```
gateway → user-service
gateway → order-service
```

Services communicate using Docker DNS:

```
http://user-service:3001
http://order-service:3002
```

No IP configuration required.

---

## 🛡️ Production Design Benefits

✔ Network segmentation improves security
✔ Internal services are not publicly exposed
✔ Gateway controls service access
✔ Scalable microservices structure
✔ Follows real-world architecture patterns

---

## 📈 Why This Project Matters

This project demonstrates:

* Microservices architecture
* API Gateway pattern
* Docker multi-network segmentation
* Secure service-to-service communication
* Reverse proxy usage
* Production-style deployment design

---

## 🚀 Future Enhancements

* Jenkins CI/CD automation
* Kubernetes deployment
* Prometheus & Grafana monitoring
* Health & readiness probes
* Load balancing & scaling
* Authentication & security
* Distributed tracing

---

## 👨‍💻 Author

**Rajesh G**

DevOps Engineer in transition — focused on cloud, automation, and scalable infrastructure.

---

## ⭐ If you like this project

Give it a star and share!

---
