pipeline {
  agent none

  environment {
    DOCKER_REGISTRY = "rajesh00007"
    IMAGE_TAG = "${BUILD_NUMBER}"
  }

  options {
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10'))
    timeout(time: 45, unit: 'MINUTES')
    timestamps()
  }

  stages {

    stage('Quality Checks') {
      parallel {

        stage('Gateway') {
          agent { 
            docker { 
              image 'node:22-alpine'
              args '-v jenkins-npm-cache:/root/.npm'  // ← npm cache volume
            } 
          }
          steps {
            dir('gateway') {
              sh 'npm ci --prefer-offline --no-audit --cache /root/.npm'
              sh 'npm run lint'
              sh 'npm test -- --coverage --ci --reporters=default --reporters=jest-junit'
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
          agent { 
            docker { 
              image 'node:22-alpine'
              args '-v jenkins-npm-cache:/root/.npm'  // ← shared npm cache
            } 
          }
          steps {
            dir('user-service') {
              sh 'npm ci --prefer-offline --no-audit --cache /root/.npm'
              sh 'npm run lint'
              sh 'npm test -- --coverage --ci --reporters=default --reporters=jest-junit'
            }
          }
          post {
            always {
              junit allowEmptyResults: true, testResults: '**/coverage/junit.xml'
            }
          }
        }

        stage('Order Service') {
          agent { 
            docker { 
              image 'node:22-alpine'
              args '-v jenkins-npm-cache:/root/.npm'  // ← shared npm cache
            } 
          }
          steps {
            dir('order-service') {
              sh 'npm ci --prefer-offline --no-audit --cache /root/.npm'
              sh 'npm run lint'
              sh 'npm test -- --coverage --ci --reporters=default --reporters=jest-junit'
            }
          }
          post {
            always {
              junit allowEmptyResults: true, testResults: '**/coverage/junit.xml'
            }
          }
        }

        stage('Frontend') {
          agent { 
            docker { 
              image 'node:22-alpine'
              args '-v jenkins-npm-cache:/root/.npm'  // ← shared npm cache
            } 
          }
          steps {
            dir('frontend') {
              sh 'npm ci --prefer-offline --no-audit --cache /root/.npm'
              sh 'npm run lint:html || true'
            }
          }
        }

      }
    }

    stage('SonarQube Analysis') {
      agent any
      environment {
        SONAR_TOKEN = credentials('sonar-token')
      }
      steps {
        withSonarQubeEnv('SonarQube') {
          sh '''
            docker run --rm \
              -e SONAR_TOKEN=$SONAR_TOKEN \
              -e SONAR_HOST_URL=http://34.14.148.93:9000 \
              -v $(pwd):/usr/src \
              sonarsource/sonar-scanner-cli:latest \
              -Dsonar.projectKey=micro-dash \
              -Dsonar.sources=. \
              -Dsonar.javascript.lcov.reportPaths=gateway/coverage/lcov.info,user-service/coverage/lcov.info,order-service/coverage/lcov.info,frontend/coverage/lcov.info
          '''
        }
      }
    }

    stage('Build Images') {
      parallel {

        stage('Build Frontend') {
          agent any
          steps {
            // ← BuildKit cache for faster layer reuse
            sh "DOCKER_BUILDKIT=1 docker build --cache-from ${DOCKER_REGISTRY}/frontend:cache -t ${DOCKER_REGISTRY}/frontend:${IMAGE_TAG} ./frontend"
          }
        }

        stage('Build Gateway') {
          agent any
          steps {
            sh "DOCKER_BUILDKIT=1 docker build --cache-from ${DOCKER_REGISTRY}/gateway:cache -t ${DOCKER_REGISTRY}/gateway:${IMAGE_TAG} ./gateway"
          }
        }

        stage('Build User Service') {
          agent any
          steps {
            sh "DOCKER_BUILDKIT=1 docker build --cache-from ${DOCKER_REGISTRY}/user-service:cache -t ${DOCKER_REGISTRY}/user-service:${IMAGE_TAG} ./user-service"
          }
        }

        stage('Build Order Service') {
          agent any
          steps {
            sh "DOCKER_BUILDKIT=1 docker build --cache-from ${DOCKER_REGISTRY}/order-service:cache -t ${DOCKER_REGISTRY}/order-service:${IMAGE_TAG} ./order-service"
          }
        }

      }
    }

    stage('Trivy Scan') {
      agent any
      steps {
        // ← Cache Trivy DB so it doesn't re-download every build
        sh '''
          trivy image --exit-code 1 --no-progress --severity CRITICAL \
            --cache-dir /tmp/trivy-cache \
            ${DOCKER_REGISTRY}/frontend:${IMAGE_TAG}
          trivy image --exit-code 1 --no-progress --severity CRITICAL \
            --cache-dir /tmp/trivy-cache \
            ${DOCKER_REGISTRY}/gateway:${IMAGE_TAG}
          trivy image --exit-code 1 --no-progress --severity CRITICAL \
            --cache-dir /tmp/trivy-cache \
            ${DOCKER_REGISTRY}/user-service:${IMAGE_TAG}
          trivy image --exit-code 1 --no-progress --severity CRITICAL \
            --cache-dir /tmp/trivy-cache \
            ${DOCKER_REGISTRY}/order-service:${IMAGE_TAG}
        '''
      }
    }

    stage('Push Images') {
      when { branch 'main' }
      agent any
      steps {
        script {
          docker.withRegistry('https://index.docker.io/v1/', 'docker-hub-credentials') {
            docker.image("${DOCKER_REGISTRY}/frontend:${IMAGE_TAG}").push()
            docker.image("${DOCKER_REGISTRY}/gateway:${IMAGE_TAG}").push()
            docker.image("${DOCKER_REGISTRY}/user-service:${IMAGE_TAG}").push()
            docker.image("${DOCKER_REGISTRY}/order-service:${IMAGE_TAG}").push()

            // ← Push cache tags for next build's --cache-from
            docker.image("${DOCKER_REGISTRY}/frontend:${IMAGE_TAG}").push('cache')
            docker.image("${DOCKER_REGISTRY}/gateway:${IMAGE_TAG}").push('cache')
            docker.image("${DOCKER_REGISTRY}/user-service:${IMAGE_TAG}").push('cache')
            docker.image("${DOCKER_REGISTRY}/order-service:${IMAGE_TAG}").push('cache')
          }
        }
      }
    }

    stage('Cleanup') {
      agent any
      steps {
        sh 'docker image prune -f || true'
      }
    }

  }

  post {
    success {
      emailext(
        subject: "SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body: "Build succeeded!\nURL: ${env.BUILD_URL}",
        to: "rajeshgovindan777@gmail.com"
      )
    }
    failure {
      emailext(
        subject: "FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body: "Build FAILED!\nURL: ${env.BUILD_URL}\nConsole: ${env.BUILD_URL}console",
        to: "rajeshgovindan777@gmail.com",
        attachLog: true,
        compressLog: true
      )
    }
  }
}