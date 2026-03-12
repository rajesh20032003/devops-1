#!/bin/bash
set -e
IMAGE_TAG=$1
ECR_REGISTRY="760302898980.dkr.ecr.ap-south-1.amazonaws.com"
REGION="ap-south-1"
USER_SECRET="micro-dash/dev/user-service/db"
ORDER_SECRET="micro-dash/dev/order-service/db"

echo "=== Deploy $IMAGE_TAG start ==="

aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ECR_REGISTRY

docker pull $ECR_REGISTRY/frontend:$IMAGE_TAG
docker pull $ECR_REGISTRY/gateway:$IMAGE_TAG
docker pull $ECR_REGISTRY/user-service:$IMAGE_TAG
docker pull $ECR_REGISTRY/order-service:$IMAGE_TAG

docker network create frontend 2>/dev/null || true
docker network create backend 2>/dev/null || true

docker stop frontend gateway user-service order-service 2>/dev/null || true
docker rm frontend gateway user-service order-service 2>/dev/null || true

docker run -d --name user-service \
  --network backend --restart unless-stopped \
  -p 3001:3001 \
  -e DB_SECRET_NAME=$USER_SECRET \
  -e AWS_REGION=$REGION \
  -e PORT=3001 -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  $ECR_REGISTRY/user-service:$IMAGE_TAG

docker run -d --name order-service \
  --network backend --restart unless-stopped \
  -p 3002:3002 \
  -e DB_SECRET_NAME=$ORDER_SECRET \
  -e AWS_REGION=$REGION \
  -e PORT=3002 -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  $ECR_REGISTRY/order-service:$IMAGE_TAG

docker run -d --name gateway \
  --network backend --restart unless-stopped \
  -p 3000:3000 \
  -e USER_SERVICE_URL=http://user-service:3001 \
  -e ORDER_SERVICE_URL=http://order-service:3002 \
  -e PORT=3000 \
  $ECR_REGISTRY/gateway:$IMAGE_TAG

docker network connect frontend gateway

docker run -d --name frontend \
  --network frontend --restart unless-stopped \
  -p 100:80 \
  $ECR_REGISTRY/frontend:$IMAGE_TAG

sleep 15
curl -f http://localhost:3000/health && echo "Gateway OK"
curl -f http://localhost:100 && echo "Frontend OK"

echo "=== Deploy $IMAGE_TAG complete ==="
