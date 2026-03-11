# micro-dash — Enterprise CI/CD Pipeline Project

A production-grade microservices application with a fully automated CI/CD pipeline built from scratch. This project demonstrates real-world DevOps practices including security scanning, artifact management, GitOps, and cloud infrastructure provisioning.

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (nginx)                      │
│                        Port 100                              │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│                     API Gateway                              │
│                     Port 3000                                │
└──────────────┬────────────────────────┬─────────────────────┘
               │                        │
┌──────────────▼──────────┐  ┌──────────▼──────────────────┐
│     User Service        │  │      Order Service           │
│     Port 3001           │  │      Port 3002               │
│     PostgreSQL (user-db)│  │      PostgreSQL (order-db)   │
└─────────────────────────┘  └──────────────────────────────┘
```

### Microservices
| Service | Description | Port | Database |
|---|---|---|---|
| frontend | Nginx dashboard — polls gateway every 5s | 100 | — |
| gateway | Express API — aggregates user + order data | 3000 | — |
| user-service | CRUD API for users | 3001 | PostgreSQL (usersdb) |
| order-service | CRUD API for orders | 3002 | PostgreSQL (ordersdb) |

Each microservice owns its own database — no shared DB (microservices pattern).

---

## 🔁 CI Pipeline (Jenkins)

```
GitHub Webhook
      ↓
Secret Scan (Gitleaks)
      ↓
Dependency Scan (Trivy FS)
      ↓
Quality Checks — Lint + Unit Tests (Kubernetes agents, parallel)
      ↓
SonarQube Analysis
      ↓
Quality Gate
      ↓
Set Image Version (git tag or dev-BUILD_NUMBER)
      ↓
Docker Buildx Build + Push → Harbor (parallel per service)
      ↓
Trivy Image Scan (parallel)
      ↓
Generate SBOM (parallel)
      ↓
Upload Reports → Harbor
      ↓
Sign Images (Cosign)
      ↓
Promote Harbor → AWS ECR
      ↓
CD continues...
```

### CI Features
- **Jenkins Multi-Branch Pipeline** — separate pipeline per branch
- **Jenkins Shared Library** — reusable functions (`BuildAndPush`, `trivyScan`, `SignImage`, `PromoteImage`, `generateSbom`, `Nodequalitycheck`, `measureStage`, `recordMetrics`)
- **Kubernetes Agents** — dynamic pod-based agents with auto-scaling
- **Docker BuildKit** — layer caching for faster builds
- **Git Tag Based Versioning** — image tags tied to git tags for rollback
- **Pipeline Metrics** — per-stage timing tracked and pushed to Grafana
- **Blue Ocean Dashboard** — visual pipeline view
- **Email Notifications** — success/failure emails with log attachment

### Security Stages
| Tool | Purpose |
|---|---|
| Gitleaks | Secret scanning in source code |
| Trivy FS | Dependency vulnerability scanning |
| SonarQube | Static code analysis + quality gate |
| Trivy Image | Container image vulnerability scanning |
| Cosign | Image signing for supply chain security |
| SBOM (Syft) | Software Bill of Materials generation |

---

## ☁️ CD Pipeline (GitHub Actions + Terraform)

### Infrastructure as Code (Terraform)
```
GitHub Actions (OIDC — no static credentials)
      ↓
Terraform Init (S3 backend + DynamoDB lock)
      ↓
Terraform Format Check
      ↓
Terraform Validate
      ↓
Terraform Plan → posted as PR comment
      ↓
Terraform Apply (main branch only)
      ↓
Outputs saved as artifact
```

### AWS Infrastructure
```
VPC (10.0.0.0/16)
├── Public Subnets  [ap-south-1a, ap-south-1b] → ALB, NAT Gateway
└── Private Subnets [ap-south-1a, ap-south-1b] → EC2, RDS, EKS nodes

ALB (internet-facing)
├── /api/* → Gateway Target Group (port 3000)
└── /*     → Frontend Target Group (port 100)

EC2 (private subnet)
├── IAM Role → ECR pull (no hardcoded credentials)
├── User Data → installs Docker, pulls images, runs docker-compose
└── SSM Session Manager → no SSH port needed

RDS PostgreSQL (private subnet, Multi-AZ in prod)
├── user-db  → usersdb
└── order-db → ordersdb

AWS Secrets Manager
├── micro-dash/dev/user-service/db
└── micro-dash/dev/order-service/db
```

---

## 🗂️ Project Structure

```
micro-dash/
├── frontend/               # Nginx static dashboard
│   ├── index.html
│   └── Dockerfile
├── gateway/                # Express API gateway
│   ├── app.js
│   ├── server.js
│   └── Dockerfile
├── user-service/           # User CRUD service
│   ├── app.js
│   ├── db.js               # PostgreSQL connection pool
│   ├── server.js
│   ├── init.sql            # DB init + seed data
│   ├── __test__/
│   └── Dockerfile
├── order-service/          # Order CRUD service
│   ├── app.js
│   ├── db.js
│   ├── server.js
│   ├── init.sql
│   ├── __test__/
│   └── Dockerfile
├── terraform/              # AWS infrastructure
│   ├── main.tf             # Provider, backend, VPC
│   ├── private_subnets.tf  # Private subnets + NAT Gateway
│   ├── security_groups.tf  # ALB + EC2 security groups
│   ├── ec2.tf              # EC2 + IAM role
│   ├── alb.tf              # Application Load Balancer
│   ├── rds.tf              # RDS PostgreSQL + Secrets Manager
│   ├── variables.tf
│   ├── terraform.tfvars
│   └── scripts/
│       └── user_data.sh    # EC2 bootstrap script
├── docker-compose.yml      # Local dev environment
├── .env                    # Local env vars (never commit!)
├── Jenkinsfile             # CI pipeline definition
└── .github/
    └── workflows/
        └── terraform.yml   # CD pipeline (GitHub Actions)
```

---

## 🔐 Secrets Management — 3 Stages

### Stage 1: Environment Variables (Local Dev)
```bash
# .env file — never commit to git!
DB_PASSWORD=devpassword123
```
Plain text in `.env` → passed via docker-compose → read by `process.env.DB_PASSWORD`

### Stage 2: Docker Secrets
```bash
# secrets/db_password.txt
devpassword123
```
Docker mounts at `/run/secrets/db_password` → not visible in `docker inspect` → read by `fs.readFileSync('/run/secrets/db_password')`

### Stage 3: AWS Secrets Manager (Production)
```
IAM Role (no hardcoded keys)
    ↓
AWS Secrets Manager API
    ↓
{ username, password, host, port, dbname }
    ↓
pg Pool connects to RDS
```
Password never stored as plain text. Auto-rotation supported.

---

## 🛠️ Tech Stack

### Application
- **Node.js** + Express
- **PostgreSQL** (via `pg` — node-postgres)
- **Nginx** (frontend static serving)

### CI
- **Jenkins** (multi-branch pipeline, shared library)
- **Docker** + **Docker Buildx** (BuildKit caching)
- **Kubernetes** (Jenkins agents — Minikube)
- **Harbor** (private container registry + artifact storage)
- **SonarQube** (code quality)
- **Gitleaks** (secret scanning)
- **Trivy** (vulnerability scanning)
- **Cosign** (image signing)
- **Syft** (SBOM generation)
- **ORAS** (OCI artifact push)
- **Prometheus + Grafana** (pipeline metrics)

### CD / Infrastructure
- **Terraform** (IaC — VPC, EC2, RDS, EKS, ECR)
- **GitHub Actions** (OIDC auth, Terraform pipeline)
- **AWS** (EC2, ECS, EKS, RDS, ECR, ALB, Secrets Manager, S3, DynamoDB)
- **Ansible** (server configuration)
- **ArgoCD** (GitOps — in progress)
- **Helm** (Kubernetes package manager — in progress)

### Deployment Targets (progression)
```
Docker Compose (local) → EC2 → ECS → EKS + ArgoCD (GitOps)
```

---

## 🚀 Local Development

### Prerequisites
- Docker + Docker Compose
- Node.js 22

### Run locally

```bash
# Clone the repo
git clone <repo-url>
cd micro-dash

# Start all services
docker-compose up --build

# App is live at:
# http://localhost:100  → Dashboard
# http://localhost:3000 → Gateway API
```

### Test DB is working
```bash
# Should return users from PostgreSQL
curl http://localhost:3000/api/dashboard

# Insert a new user (count goes from 4 to 5 on dashboard)
curl -X POST http://localhost:3001/users \
  -H "Content-Type: application/json" \
  -d '{"name": "New User", "email": "new@example.com"}'
```

### Run tests locally
```bash
cd user-service && npm run test && npm run lint
cd ../order-service && npm run test && npm run lint
```

---

## 📦 Image Flow

```
Source Code
    ↓ Jenkins builds
Harbor (private registry — 34.180.10.118)
    ↓ Trivy scanned + Cosign signed + SBOM uploaded
AWS ECR (760302898980.dkr.ecr.ap-south-1.amazonaws.com)
    ↓ ArgoCD deploys (GitOps)
EKS Cluster
```

Image tag format:
- Feature branch: `dev-{BUILD_NUMBER}`
- Release: `{GIT_TAG}` (e.g. `v1.0.0`) — used for rollback

---

## 🌍 Infrastructure Setup

### Prerequisites
- AWS account with OIDC provider configured for GitHub Actions
- S3 bucket + DynamoDB table for Terraform state
- GitHub secrets: `AWS_ROLE_ARN`, `AWS_REGION`, `TF_STATE_BUCKET`, `TF_STATE_LOCK_TABLE`

### Deploy infrastructure
```bash
# PR → runs plan only, posts output as PR comment
git push origin feature/my-change

# Merge to main → runs apply automatically
git merge main
```

### Required terraform.tfvars
```hcl
aws_region           = "ap-south-1"
environment          = "dev"
project              = "micro-dash"
vpc_cidr             = "10.0.0.0/16"
availability_zones   = ["ap-south-1a", "ap-south-1b"]
public_subnet_cidrs  = ["10.0.101.0/24", "10.0.102.0/24"]
private_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24"]
ec2_instance_type    = "t3.medium"
ec2_key_name         = "your-key-pair-name"
image_tag            = "latest"
```

---

## 📊 Deployment Roadmap

- [x] Microservice architecture (Node.js + PostgreSQL)
- [x] Jenkins CI pipeline (14 stages)
- [x] Security scanning (Gitleaks, Trivy, SonarQube, Cosign, SBOM)
- [x] Harbor artifact registry
- [x] AWS ECR image promotion
- [x] Jenkins Shared Library
- [x] Kubernetes Jenkins agents with auto-scaling
- [x] Pipeline metrics (Prometheus + Grafana)
- [x] GitHub Actions Terraform pipeline (OIDC)
- [x] AWS VPC, subnets, NAT Gateway
- [ ] EC2 deployment
- [ ] ECS deployment
- [ ] EKS cluster (Terraform)
- [ ] ArgoCD GitOps
- [ ] Blue/Green + Canary deployments
- [ ] Prometheus + Grafana on EKS
- [ ] Loki log aggregation
- [ ] OWASP ZAP DAST
- [ ] OPA Gatekeeper (Policy as Code)

---

## 👤 Author

**Rajesh** — transitioning from L3 IT Support to DevOps Engineering  
Built entirely from scratch as a portfolio project demonstrating enterprise-grade DevOps practices.