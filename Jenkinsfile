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

    // ✅ Add this as the FIRST stage
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

    stage('Quality Checks') {
      parallel {

        stage('Gateway') {
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
              sh 'npm run lint'
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
              sh 'npm run lint'
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
              sh 'npm run lint'
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
      agent any
      environment {
        SONAR_TOKEN = credentials('sonar-token')
      }
      steps {
        withSonarQubeEnv('sonarqube') {
          sh '''
            docker run --rm \
              -e SONAR_TOKEN=$SONAR_TOKEN \
              -e SONAR_HOST_URL=http://35.200.201.42:9000 \
              --volumes-from $(cat /etc/hostname) \
              sonarsource/sonar-scanner-cli:latest \
              -Dsonar.projectBaseDir=$WORKSPACE \
              -Dsonar.projectKey=micro-dash \
              -Dsonar.projectName="Microservices Dashboard" \
              -Dsonar.sources=gateway,user-service,order-service,frontend \
              -Dsonar.exclusions=**/node_modules/**,**/coverage/**,**/dist/** \
              -Dsonar.javascript.lcov.reportPaths=gateway/coverage/lcov.info,user-service/coverage/lcov.info,order-service/coverage/lcov.info,frontend/coverage/lcov.info \
              -Dsonar.scm.disabled=true
          '''
        }
      }
    }

    stage('Build Images') {
      parallel {

        stage('Build Frontend') {
          agent any
          steps {
            sh """
              docker pull ${DOCKER_REGISTRY}/frontend:latest || true
              docker build \
                --cache-from ${DOCKER_REGISTRY}/frontend:latest \
                -t ${DOCKER_REGISTRY}/frontend:${IMAGE_TAG} \
                -t ${DOCKER_REGISTRY}/frontend:latest \
                ./frontend
            """
          }
        }

        stage('Build Gateway') {
          agent any
          steps {
            sh """
              docker pull ${DOCKER_REGISTRY}/gateway:latest || true
              docker build \
                --cache-from ${DOCKER_REGISTRY}/gateway:latest \
                -t ${DOCKER_REGISTRY}/gateway:${IMAGE_TAG} \
                -t ${DOCKER_REGISTRY}/gateway:latest \
                ./gateway
            """
          }
        }

        stage('Build User Service') {
          agent any
          steps {
            sh """
              docker pull ${DOCKER_REGISTRY}/user-service:latest || true
              docker build \
                --cache-from ${DOCKER_REGISTRY}/user-service:latest \
                -t ${DOCKER_REGISTRY}/user-service:${IMAGE_TAG} \
                -t ${DOCKER_REGISTRY}/user-service:latest \
                ./user-service
            """
          }
        }

        stage('Build Order Service') {
          agent any
          steps {
            sh """
              docker pull ${DOCKER_REGISTRY}/order-service:latest || true
              docker build \
                --cache-from ${DOCKER_REGISTRY}/order-service:latest \
                -t ${DOCKER_REGISTRY}/order-service:${IMAGE_TAG} \
                -t ${DOCKER_REGISTRY}/order-service:latest \
                ./order-service
            """
          }
        }

      }
    }

    stage('Trivy Scan') {
      agent any
      steps {
        sh '''
          trivy image --download-db-only --cache-dir $HOME/.trivy
          trivy image --exit-code 1 --severity CRITICAL --cache-dir $HOME/.trivy ${DOCKER_REGISTRY}/frontend:${IMAGE_TAG}
          trivy image --exit-code 1 --severity CRITICAL --cache-dir $HOME/.trivy ${DOCKER_REGISTRY}/gateway:${IMAGE_TAG}
          trivy image --exit-code 1 --severity CRITICAL --cache-dir $HOME/.trivy ${DOCKER_REGISTRY}/user-service:${IMAGE_TAG}
          trivy image --exit-code 1 --severity CRITICAL --cache-dir $HOME/.trivy ${DOCKER_REGISTRY}/order-service:${IMAGE_TAG}
        '''
      }
    }

    stage('Push Images') {
      when { branch 'main' }   // still conditional on main/master branch
      parallel {
        stage('Push Frontend') {
          steps {
            script {
              docker.withRegistry('https://index.docker.io/v1/', 'docker-hub-credentials') {
                docker.image("${DOCKER_REGISTRY}/frontend:${IMAGE_TAG}").push()
                // docker.image("${DOCKER_REGISTRY}/frontend:${IMAGE_TAG}").push('latest')  // optional latest tag
              }
            }
      }
    }

    stage('Push Gateway') {
      steps {
        script {
          docker.withRegistry('https://index.docker.io/v1/', 'docker-hub-credentials') {
            docker.image("${DOCKER_REGISTRY}/gateway:${IMAGE_TAG}").push()
            // docker.image("${DOCKER_REGISTRY}/gateway:${IMAGE_TAG}").push('latest')
          }
        }
      }
    }

    stage('Push User Service') {
      steps {
        script {
          docker.withRegistry('https://index.docker.io/v1/', 'docker-hub-credentials') {
            docker.image("${DOCKER_REGISTRY}/user-service:${IMAGE_TAG}").push()
            // docker.image("${DOCKER_REGISTRY}/user-service:${IMAGE_TAG}").push('latest')
          }
        }
      }
    }

    stage('Push Order Service') {
      steps {
        script {
          docker.withRegistry('https://index.docker.io/v1/', 'docker-hub-credentials') {
            docker.image("${DOCKER_REGISTRY}/order-service:${IMAGE_TAG}").push()
            // docker.image("${DOCKER_REGISTRY}/order-service:${IMAGE_TAG}").push('latest')
          }
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
