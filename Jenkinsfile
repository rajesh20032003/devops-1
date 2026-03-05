pipeline {
  agent none

  environment {
    DOCKER_REGISTRY = "rajesh00007"
    HARBOR_PROJECT = "micro-dash"
     ECR_REGISTRY    = "760302898980.dkr.ecr.ap-south-1.amazonaws.com"
      HARBOR_REGISTRY = "34.180.10.118"

  }

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
    timeout(time: 45, unit: 'MINUTES')
    timestamps()
  }

  stages {

    stage('Clean') {
      agent any
      steps {
        sh '''
          rm -rf gateway/node_modules
          rm -rf user-service/node_modules
          rm -rf order-service/node_modules
          rm -rf frontend/node_modules
        '''
      }
    }

    stage('Secret Scan - Gitleaks') {
      agent any
      steps {
        sh '''
          gitleaks detect \
            --baseline-path baseline.json \
            --no-git \
            --source . \
            --redact \
            --report-path gitleaks-report.json
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'gitleaks-report.json', allowEmptyArchive: true
        }
        failure {
          echo "CRITICAL: Secrets detected in repo!"
        }
      }
    }

    stage('Dependency Scan (Trivy Repo)') {
      when {
        anyOf {
          changeset "gateway/**"
          changeset "order-service/**"
          changeset "user-service/**"
          changeset "frontend/**"
          buildingTag()
        }
      }
      agent any
      steps {
        sh '''
          trivy fs . \
            --exit-code 1 \
            --no-progress \
            --severity HIGH,CRITICAL \
            --ignore-unfixed \
            --scanners vuln \
            --pkg-types library \
            --format json \
            --output trivy-deps-report.json
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'trivy-deps-report.json', allowEmptyArchive: true
        }
        failure {
          echo "CRITICAL: vulnerabilities founded in dependenicies!"
        }
      }
    }

    stage('Quality Checks-lint,unit test') {
      parallel {

        stage('Gateway') {
          when {
            anyOf {
              changeset "**/gateway/**"
              buildingTag()
            }
          }
          agent {
            docker {
              image 'node:22-alpine'
              args '-v npm-cache-gateway:/home/node/.npm'
            }
          }
          steps {
            dir('gateway') {
              sh 'rm -rf node_modules'
              sh 'npm ci --prefer-offline --no-audit --cache /home/node/.npm'
              sh 'npm run lint -- --fix'
              sh 'npm test -- --coverage --coverageReporters=lcov --ci --reporters=default --reporters=jest-junit'
            }
          }
          post {
            always {
              junit allowEmptyResults: true, testResults: 'gateway/coverage/junit.xml'
              recordCoverage tools: [[parser: 'LCOV', pattern: 'gateway/coverage/lcov.info']]
            }
          }
        }

        stage('User Service') {
          when {
            anyOf {
              changeset "**/user-service/**"
              buildingTag()
            }
          }
          agent {
            docker {
              image 'node:22-alpine'
              args '-v npm-cache-user-service:/home/node/.npm'
            }
          }
          steps {
            dir('user-service') {
              sh 'rm -rf node_modules'
              sh 'npm ci --prefer-offline --no-audit --cache /home/node/.npm'
              sh 'npm run lint -- --fix'
              sh 'npm test -- --coverage --coverageReporters=lcov --ci --reporters=default --reporters=jest-junit'
            }
          }
          post {
            always {
              junit allowEmptyResults: true, testResults: 'user-service/coverage/junit.xml'
              recordCoverage tools: [[parser: 'LCOV', pattern: 'user-service/coverage/lcov.info']]
            }
          }
        }

        stage('Order Service') {
          when {
            anyOf {
              changeset "**/order-service/**"
              buildingTag()
            }
          }
          agent {
            docker {
              image 'node:22-alpine'
              args '-v npm-cache-order-service:/home/node/.npm'
            }
          }
          steps {
            dir('order-service') {
              sh 'rm -rf node_modules'
              sh 'npm ci --prefer-offline --no-audit --cache /home/node/.npm'
              sh 'npm run lint -- --fix'
              sh 'npx jest --clearCache'
              sh 'npm test -- --coverage --coverageReporters=lcov --ci --reporters=default --reporters=jest-junit'
            }
          }
          post {
            always {
              junit allowEmptyResults: true, testResults: 'order-service/coverage/junit.xml'
              recordCoverage tools: [[parser: 'LCOV', pattern: 'order-service/coverage/lcov.info']]
            }
          }
        }

        stage('Frontend') {
          when {
            anyOf {
              changeset "**/frontend/**"
              buildingTag()
            }
          }
          agent {
            docker {
              image 'node:22-alpine'
              args '-v npm-cache-frontend:/home/node/.npm'
            }
          }
          steps {
            dir('frontend') {
              sh 'rm -rf node_modules'
              sh 'npm ci --prefer-offline --no-audit --cache /home/node/.npm'
              sh 'npm run lint:html || true'
            }
          }
        }

      }
    }

    stage('SonarQube Analysis') {
      when {
        anyOf {
          changeset "gateway/**"
          changeset "order-service/**"
          changeset "user-service/**"
          changeset "frontend/**"
          buildingTag()
        }
      }
      agent any
      environment {
        SONAR_TOKEN = credentials('sonar-token')
      }
      steps {
        withSonarQubeEnv('sonarqube') {
          sh '''
            rm -rf $WORKSPACE/.scannerwork
            mkdir -p $WORKSPACE/.scannerwork
            chmod 777 $WORKSPACE/.scannerwork

            docker run --rm \
              -e SONAR_TOKEN=$SONAR_TOKEN \
              -e SONAR_HOST_URL=http://35.200.201.42:9000 \
              --volumes-from $(cat /etc/hostname) \
              sonarsource/sonar-scanner-cli:latest \
              -Dsonar.projectBaseDir=$WORKSPACE \
              -Dsonar.projectKey=micro-dash \
              -Dsonar.projectName="Microservices Dashboard" \
              -Dsonar.sources=gateway,user-service,order-service \
              -Dsonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/**,**/__test__/** \
              -Dsonar.javascript.lcov.reportPaths=gateway/coverage/lcov.info,user-service/coverage/lcov.info,order-service/coverage/lcov.info \
              -Dsonar.scm.disabled=true \
              -Dsonar.working.directory=$WORKSPACE/.scannerwork
          '''
          script {
            def taskFile = readFile("${WORKSPACE}/.scannerwork/report-task.txt")
            def ceTaskId = taskFile.readLines()
              .find { it.startsWith('ceTaskId=') }
              ?.replace('ceTaskId=', '')
              ?.trim()
            env.SONAR_TASK_ID = ceTaskId
            echo "SonarQube Task ID: ${ceTaskId}"
          }
        }
      }
    }

    stage('Quality Gate-sonarqube') {
      when {
        anyOf {
          changeset "gateway/**"
          changeset "order-service/**"
          changeset "user-service/**"
          changeset "frontend/**"
          buildingTag()
        }
      }
      agent any
      steps {
        withSonarQubeEnv('sonarqube') {
          timeout(time: 5, unit: 'MINUTES') {
            waitForQualityGate abortPipeline: true
          }
        }
      }
    }

    stage('Set Image Version') {
      when {
        anyOf {
          changeset "gateway/**"
          changeset "order-service/**"
          changeset "user-service/**"
          changeset "frontend/**"
          branch 'main'
          buildingTag()
        }
      }
      agent any
      steps {
        script {
          if (env.TAG_NAME) {
            env.IMAGE_TAG = env.TAG_NAME
            echo "Release build detected. Version: ${env.IMAGE_TAG}"
          } else {
            env.IMAGE_TAG = "dev-${env.BUILD_NUMBER}"
            echo "Non-release build. Using dev tag: ${env.IMAGE_TAG}"
          }
        }
      }
    }
  stage('Build and Push Images') {
  parallel {

    stage('Build Frontend') {
      when {
        anyOf {
          changeset "frontend/**"
          buildingTag()
          branch 'main'
        }
      }
      agent any
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
  set -x

  IMAGE_TAG=ci-${BUILD_NUMBER}
  SERVICE=frontend
  BUILDER_NAME=ci-builder-${SERVICE}-${BUILD_NUMBER}   # ← unique per build

  echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
    -u "$HARBOR_USER" --password-stdin

  mkdir -p /tmp/buildkit
  cat > /tmp/buildkit/buildkitd-${SERVICE}.toml << 'EOF'
[registry."34.180.10.118"]
  http = true
  insecure = true
EOF

  docker buildx create \
    --name $BUILDER_NAME \
    --driver docker-container \
    --driver-opt network=host \
    --config /tmp/buildkit/buildkitd-${SERVICE}.toml \
    --use

  docker buildx inspect --bootstrap

  docker buildx build \
    --builder $BUILDER_NAME \
    --cache-from=type=registry,ref=$HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:buildcache \
    --cache-to=type=registry,ref=$HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:buildcache,mode=max \
    -t $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
    --push \
    ./$SERVICE
'''
        }
      }
    }

    stage('Build Gateway') {
      when {
        anyOf {
          changeset "gateway/**"
          buildingTag()
          branch 'main'
        }
      }
      agent any
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
         sh '''
  set -x

  IMAGE_TAG=ci-${BUILD_NUMBER}
  SERVICE=gateway
  BUILDER_NAME=ci-builder-${SERVICE}-${BUILD_NUMBER}   # ← unique per build

  echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
    -u "$HARBOR_USER" --password-stdin

  mkdir -p /tmp/buildkit
  cat > /tmp/buildkit/buildkitd-${SERVICE}.toml << 'EOF'
[registry."34.180.10.118"]
  http = true
  insecure = true
EOF

  docker buildx create \
    --name $BUILDER_NAME \
    --driver docker-container \
    --driver-opt network=host \
    --config /tmp/buildkit/buildkitd-${SERVICE}.toml \
    --use

  docker buildx inspect --bootstrap

  docker buildx build \
    --builder $BUILDER_NAME \
    --cache-from=type=registry,ref=$HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:buildcache \
    --cache-to=type=registry,ref=$HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:buildcache,mode=max \
    -t $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
    --push \
    ./$SERVICE
'''
        }
      }
    }

    stage('Build User Service') {
      when {
        anyOf {
          changeset "user-service/**"
          buildingTag()
          branch 'main'
        }
      }
      agent any
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
  set -x

  IMAGE_TAG=ci-${BUILD_NUMBER}
  SERVICE=user-service
  BUILDER_NAME=ci-builder-${SERVICE}-${BUILD_NUMBER}   # ← unique per build

  echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
    -u "$HARBOR_USER" --password-stdin

  mkdir -p /tmp/buildkit
  cat > /tmp/buildkit/buildkitd-${SERVICE}.toml << 'EOF'
[registry."34.180.10.118"]
  http = true
  insecure = true
EOF

  docker buildx create \
    --name $BUILDER_NAME \
    --driver docker-container \
    --driver-opt network=host \
    --config /tmp/buildkit/buildkitd-${SERVICE}.toml \
    --use

  docker buildx inspect --bootstrap

  docker buildx build \
    --builder $BUILDER_NAME \
    --cache-from=type=registry,ref=$HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:buildcache \
    --cache-to=type=registry,ref=$HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:buildcache,mode=max \
    -t $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
    --push \
    ./$SERVICE
'''
        }
      }
    }

    stage('Build Order Service') {
      when {
        anyOf {
          changeset "order-service/**"
          buildingTag()
          branch 'main'
        }
      }
      agent any
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
         sh '''
  set -x

  IMAGE_TAG=ci-${BUILD_NUMBER}
  SERVICE=order-service
  BUILDER_NAME=ci-builder-${SERVICE}-${BUILD_NUMBER}   # ← unique per build

  echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
    -u "$HARBOR_USER" --password-stdin

  mkdir -p /tmp/buildkit
  cat > /tmp/buildkit/buildkitd-${SERVICE}.toml << 'EOF'
[registry."34.180.10.118"]
  http = true
  insecure = true
EOF

  docker buildx create \
    --name $BUILDER_NAME \
    --driver docker-container \
    --driver-opt network=host \
    --config /tmp/buildkit/buildkitd-${SERVICE}.toml \
    --use

  docker buildx inspect --bootstrap

  docker buildx build \
    --builder $BUILDER_NAME \
    --cache-from=type=registry,ref=$HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:buildcache \
    --cache-to=type=registry,ref=$HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:buildcache,mode=max \
    -t $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
    --push \
    ./$SERVICE
'''
        }
      }
    }

  }
}
    
    stage('Trivy Scan') {
  parallel {

    stage('Scan Frontend') {
      when {
        anyOf {
          changeset "frontend/**"
          buildingTag()
          branch 'main'
        }
      }
      agent any
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
            set -x

            SERVICE=frontend
            IMAGE_TAG=ci-${BUILD_NUMBER}

            trivy image \
              --scanners vuln \
              --exit-code 1 \
              --severity CRITICAL \
              --skip-version-check \
              --image-src remote \
              --username $HARBOR_USER \
              --password $HARBOR_PASS \
              $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG
          '''
        }
      }
    }

    stage('Scan Gateway') {
      when {
        anyOf {
          changeset "gateway/**"
          buildingTag()
        }
      }
      agent any
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
            set -x

            SERVICE=gateway
            IMAGE_TAG=ci-${BUILD_NUMBER}

            trivy image \
              --scanners vuln \
              --exit-code 1 \
              --severity CRITICAL \
              --skip-version-check \
              --image-src remote \
              --username $HARBOR_USER \
              --password $HARBOR_PASS \
              $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG
          '''
        }
      }
    }

    stage('Scan User Service') {
      when {
        anyOf {
          changeset "user-service/**"
          buildingTag()
        }
      }
      agent any
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
            set -x

            SERVICE=user-service
            IMAGE_TAG=ci-${BUILD_NUMBER}

            trivy image \
              --scanners vuln \
              --exit-code 1 \
              --severity CRITICAL \
              --skip-version-check \
              --image-src remote \
              --username $HARBOR_USER \
              --password $HARBOR_PASS \
              $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG
          '''
        }
      }
    }

    stage('Scan Order Service') {
      when {
        anyOf {
          changeset "order-service/**"
          buildingTag()
        }
      }
      agent any
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
            set -x

            SERVICE=order-service
            IMAGE_TAG=ci-${BUILD_NUMBER}

            trivy image \
              --scanners vuln \
              --exit-code 1 \
              --severity CRITICAL \
              --skip-version-check \
              --image-src remote \
              --username $HARBOR_USER \
              --password $HARBOR_PASS \
              $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG
          '''
        }
      }
    }

  }
}
    stage('Generate SBOM') {
  parallel {

    stage('SBOM Frontend') {
      when {
        anyOf {
          changeset "frontend/**"
          buildingTag()
          branch 'main'
        }
      }
      agent any
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
            set -x

            SERVICE=frontend
            IMAGE_TAG=ci-${BUILD_NUMBER}

            echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
              -u "$HARBOR_USER" --password-stdin

            syft $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
              -o cyclonedx-json > sbom-${SERVICE}.json
          '''
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'sbom-frontend.json', allowEmptyArchive: true
        }
      }
    }

    stage('SBOM Gateway') {
      when {
        anyOf {
          changeset "gateway/**"
          buildingTag()
        }
      }
      agent any
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
            set -x

            SERVICE=gateway
            IMAGE_TAG=ci-${BUILD_NUMBER}

            echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
              -u "$HARBOR_USER" --password-stdin

            syft $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
              -o cyclonedx-json > sbom-${SERVICE}.json
          '''
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'sbom-gateway.json', allowEmptyArchive: true
        }
      }
    }

    stage('SBOM User Service') {
      when {
        anyOf {
          changeset "user-service/**"
          buildingTag()
        }
      }
      agent any
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
            set -x

            SERVICE=user-service
            IMAGE_TAG=ci-${BUILD_NUMBER}

            echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
              -u "$HARBOR_USER" --password-stdin

            syft $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
              -o cyclonedx-json > sbom-${SERVICE}.json
          '''
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'sbom-user-service.json', allowEmptyArchive: true
        }
      }
    }

    stage('SBOM Order Service') {
      when {
        anyOf {
          changeset "order-service/**"
          buildingTag()
        }
      }
      agent any
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
            set -x

            SERVICE=order-service
            IMAGE_TAG=ci-${BUILD_NUMBER}

            echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
              -u "$HARBOR_USER" --password-stdin

            syft $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
              -o cyclonedx-json > sbom-${SERVICE}.json
          '''
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'sbom-order-service.json', allowEmptyArchive: true
        }
      }
    }

  }
}
stage('Sign Images') {
  parallel {

    stage('Sign Frontend') {
  when {
    anyOf {
      changeset "frontend/**"
      buildingTag()
      branch 'main'
    }
  }
  agent any
  steps {
    withCredentials([
      usernamePassword(
        credentialsId: 'harbor-credential',
        usernameVariable: 'HARBOR_USER',
        passwordVariable: 'HARBOR_PASS'
      ),
      file(credentialsId: 'cosign-private-key', variable: 'COSIGN_KEY'),
      string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')
    ]) {
      sh '''
        set -x

        SERVICE=frontend
        IMAGE_TAG=ci-${BUILD_NUMBER}

        # Login to Harbor so docker inspect can resolve the digest
        echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
          -u "$HARBOR_USER" --password-stdin

        # Pull image first so docker inspect works
        docker pull $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG

        # Get digest
        IMAGE_DIGEST=$(docker inspect \
          --format='{{index .RepoDigests 0}}' \
          $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
          | cut -d'@' -f2)

        echo "Signing digest: $IMAGE_DIGEST"

        COSIGN_PASSWORD=$COSIGN_PASSWORD \
        cosign sign \
          --key $COSIGN_KEY \
          --yes \
          $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE@$IMAGE_DIGEST
      '''
    }
  }
}
    stage('Sign Gateway') {
      when {
        anyOf {
          changeset "gateway/**"
          buildingTag()
        }
      }
      agent any
      steps {
        withCredentials([
      usernamePassword(
        credentialsId: 'harbor-credential',
        usernameVariable: 'HARBOR_USER',
        passwordVariable: 'HARBOR_PASS'
      ),
      file(credentialsId: 'cosign-private-key', variable: 'COSIGN_KEY'),
      string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')
    ]) {
      sh '''
        set -x

        SERVICE=gateway
        IMAGE_TAG=ci-${BUILD_NUMBER}

        # Login to Harbor so docker inspect can resolve the digest
        echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
          -u "$HARBOR_USER" --password-stdin

        # Pull image first so docker inspect works
        docker pull $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG

        # Get digest
        IMAGE_DIGEST=$(docker inspect \
          --format='{{index .RepoDigests 0}}' \
          $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
          | cut -d'@' -f2)

        echo "Signing digest: $IMAGE_DIGEST"

        COSIGN_PASSWORD=$COSIGN_PASSWORD \
        cosign sign \
          --key $COSIGN_KEY \
          --yes \
          $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE@$IMAGE_DIGEST
      '''
    }
      }
    }

    stage('Sign User Service') {
      when {
        anyOf {
          changeset "user-service/**"
          buildingTag()
        }
      }
      agent any
      steps {
        withCredentials([
      usernamePassword(
        credentialsId: 'harbor-credential',
        usernameVariable: 'HARBOR_USER',
        passwordVariable: 'HARBOR_PASS'
      ),
      file(credentialsId: 'cosign-private-key', variable: 'COSIGN_KEY'),
      string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')
    ]) {
      sh '''
        set -x

        SERVICE=order-service
        IMAGE_TAG=ci-${BUILD_NUMBER}

        # Login to Harbor so docker inspect can resolve the digest
        echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
          -u "$HARBOR_USER" --password-stdin

        # Pull image first so docker inspect works
        docker pull $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG

        # Get digest
        IMAGE_DIGEST=$(docker inspect \
          --format='{{index .RepoDigests 0}}' \
          $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
          | cut -d'@' -f2)

        echo "Signing digest: $IMAGE_DIGEST"

        COSIGN_PASSWORD=$COSIGN_PASSWORD \
        cosign sign \
          --key $COSIGN_KEY \
          --yes \
          $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE@$IMAGE_DIGEST
      '''
    }
      }
    }

    stage('Sign Order Service') {
      when {
        anyOf {
          changeset "order-service/**"
          buildingTag()
        }
      }
      agent any
      steps {
         withCredentials([
      usernamePassword(
        credentialsId: 'harbor-credential',
        usernameVariable: 'HARBOR_USER',
        passwordVariable: 'HARBOR_PASS'
      ),
      file(credentialsId: 'cosign-private-key', variable: 'COSIGN_KEY'),
      string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')
    ]) {
      sh '''
        set -x

        SERVICE=order-service
        IMAGE_TAG=ci-${BUILD_NUMBER}

        # Login to Harbor so docker inspect can resolve the digest
        echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
          -u "$HARBOR_USER" --password-stdin

        # Pull image first so docker inspect works
        docker pull $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG

        # Get digest
        IMAGE_DIGEST=$(docker inspect \
          --format='{{index .RepoDigests 0}}' \
          $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
          | cut -d'@' -f2)

        echo "Signing digest: $IMAGE_DIGEST"

        COSIGN_PASSWORD=$COSIGN_PASSWORD \
        cosign sign \
          --key $COSIGN_KEY \
          --yes \
          $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE@$IMAGE_DIGEST
      '''
    }
      }
    }

  }
}


// ## Pipeline order with Cosign
// ```
// Build → Trivy Scan → SBOM → Sign Images → Promote

    stage('Promote Images') {
      parallel {

        stage('Promote Frontend') {
          when {
            anyOf {
              changeset "frontend/**"
              buildingTag()
            }
          }
          agent any
          steps {
            withCredentials([
          [$class: 'AmazonWebServicesCredentialsBinding', credentialsId: 'aws-ecr-credentials'],
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
            set -x

            SERVICE=frontend
            CI_TAG=ci-${BUILD_NUMBER}

            # Login to both
            echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
              -u "$HARBOR_USER" --password-stdin

            aws ecr get-login-password --region ap-south-1 \
              | docker login --username AWS --password-stdin $ECR_REGISTRY

            # Pull from Harbor
            docker pull $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$CI_TAG

            # Tag and push to ECR
            docker tag \
              $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$CI_TAG \
              $ECR_REGISTRY/$SERVICE:$IMAGE_TAG

            docker push $ECR_REGISTRY/$SERVICE:$IMAGE_TAG
            echo "Promoted $CI_TAG → $IMAGE_TAG"
          '''
        }
          }
        }

        stage('Promote Gateway') {
          when {
            anyOf {
              changeset "gateway/**"
              buildingTag()
            }
          }
          agent any
          steps {
            withCredentials([
          [$class: 'AmazonWebServicesCredentialsBinding', credentialsId: 'aws-ecr-credentials'],
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
            set -x

            SERVICE=frontend
            CI_TAG=ci-${BUILD_NUMBER}

            # Login to both
            echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
              -u "$HARBOR_USER" --password-stdin

            aws ecr get-login-password --region ap-south-1 \
              | docker login --username AWS --password-stdin $ECR_REGISTRY

            # Pull from Harbor
            docker pull $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$CI_TAG

            # Tag and push to ECR
            docker tag \
              $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$CI_TAG \
              $ECR_REGISTRY/$SERVICE:$IMAGE_TAG

            docker push $ECR_REGISTRY/$SERVICE:$IMAGE_TAG
            echo "Promoted $CI_TAG → $IMAGE_TAG"
          '''
        }
          }
        }

        stage('Promote User Service') {
          when {
            anyOf {
              changeset "user-service/**"
              buildingTag()
            }
          }
          agent any
          steps {
           withCredentials([
          [$class: 'AmazonWebServicesCredentialsBinding', credentialsId: 'aws-ecr-credentials'],
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
            set -x

            SERVICE=frontend
            CI_TAG=ci-${BUILD_NUMBER}

            # Login to both
            echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
              -u "$HARBOR_USER" --password-stdin

            aws ecr get-login-password --region ap-south-1 \
              | docker login --username AWS --password-stdin $ECR_REGISTRY

            # Pull from Harbor
            docker pull $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$CI_TAG

            # Tag and push to ECR
            docker tag \
              $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$CI_TAG \
              $ECR_REGISTRY/$SERVICE:$IMAGE_TAG

            docker push $ECR_REGISTRY/$SERVICE:$IMAGE_TAG
            echo "Promoted $CI_TAG → $IMAGE_TAG"
          '''
        }
          }
        }

        stage('Promote Order Service') {
          when {
            anyOf {
              changeset "order-service/**"
              buildingTag()
            }
          }
          agent any
          steps {
            withCredentials([
          [$class: 'AmazonWebServicesCredentialsBinding', credentialsId: 'aws-ecr-credentials'],
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          sh '''
            set -x

            SERVICE=frontend
            CI_TAG=ci-${BUILD_NUMBER}

            # Login to both
            echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
              -u "$HARBOR_USER" --password-stdin

            aws ecr get-login-password --region ap-south-1 \
              | docker login --username AWS --password-stdin $ECR_REGISTRY

            # Pull from Harbor
            docker pull $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$CI_TAG

            # Tag and push to ECR
            docker tag \
              $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$CI_TAG \
              $ECR_REGISTRY/$SERVICE:$IMAGE_TAG

            docker push $ECR_REGISTRY/$SERVICE:$IMAGE_TAG
            echo "Promoted $CI_TAG → $IMAGE_TAG"
          '''
        }
          }
        }

      }
    }

    stage('Cleanup') {
      agent any
      steps {
        cleanWs()
        sh 'docker image prune -f || true'
      }
    }

  }

  post {
    success {
      emailext(
        subject: "SUCCESS!: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body: "Build succeeded!\nURL: ${env.BUILD_URL}",
        to: "rajeshgovindan777@gmail.com"
      )
    }
    failure {
      emailext(
        subject: "FAILED!: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body: "Build FAILED!\nURL: ${env.BUILD_URL}\nConsole: ${env.BUILD_URL}console",
        to: "rajeshgovindan777@gmail.com",
        attachLog: true,
        compressLog: true
      )
    }
  }
}