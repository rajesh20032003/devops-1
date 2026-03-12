#!/bin/bash
set -e
echo "=== DB Init start ==="

USER_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id micro-dash/dev/user-service/db \
  --region ap-south-1 \
  --query SecretString --output text)

USER_HOST=$(echo $USER_SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['host'])")
USER_USER=$(echo $USER_SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['username'])")
USER_PASS=$(echo $USER_SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['password'])")
USER_DB=$(echo $USER_SECRET   | python3 -c "import sys,json; print(json.load(sys.stdin)['dbname'])")

ORDER_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id micro-dash/dev/order-service/db \
  --region ap-south-1 \
  --query SecretString --output text)

ORDER_HOST=$(echo $ORDER_SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['host'])")
ORDER_USER=$(echo $ORDER_SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['username'])")
ORDER_PASS=$(echo $ORDER_SECRET | python3 -c "import sys,json; print(json.load(sys.stdin)['password'])")
ORDER_DB=$(echo $ORDER_SECRET   | python3 -c "import sys,json; print(json.load(sys.stdin)['dbname'])")

echo "Connecting to user DB: $USER_HOST"
PGPASSWORD=$USER_PASS psql "host=$USER_HOST port=5432 dbname=$USER_DB user=$USER_USER sslmode=require" -c "CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name VARCHAR(100), email VARCHAR(100) UNIQUE, created_at TIMESTAMP DEFAULT NOW());"
PGPASSWORD=$USER_PASS psql "host=$USER_HOST port=5432 dbname=$USER_DB user=$USER_USER sslmode=require" -c "INSERT INTO users (name,email) VALUES ('Alice','alice@example.com'),('Bob','bob@example.com'),('Carol','carol@example.com'),('Dave','dave@example.com') ON CONFLICT DO NOTHING;"
echo "Users DB done"

echo "Connecting to order DB: $ORDER_HOST"
PGPASSWORD=$ORDER_PASS psql "host=$ORDER_HOST port=5432 dbname=$ORDER_DB user=$ORDER_USER sslmode=require" -c "CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, item VARCHAR(100), quantity INTEGER DEFAULT 1, user_id INTEGER, created_at TIMESTAMP DEFAULT NOW());"
PGPASSWORD=$ORDER_PASS psql "host=$ORDER_HOST port=5432 dbname=$ORDER_DB user=$ORDER_USER sslmode=require" -c "INSERT INTO orders (item,quantity,user_id) VALUES ('Laptop',1,1),('Phone',2,2),('Tablet',1,3),('Headphones',3,4) ON CONFLICT DO NOTHING;"
echo "Orders DB done"

echo "=== DB Init complete ==="
