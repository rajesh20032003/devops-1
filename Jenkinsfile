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
          agent { docker { image 'node:22-alpine' } }
          steps {
            dir('gateway') {
              
              sh 'npm ci --prefer-offline --no-audit'
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
          agent { docker { image 'node:22-alpine' } }
          steps {
            dir('user-service') {
              sh 'npm ci --prefer-offline --no-audit'
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
          agent { docker { image 'node:22-alpine' } }
          steps {
            dir('order-service') {
              sh 'npm ci --prefer-offline --no-audit'
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
          agent { docker { image 'node:22-alpine' } }
          steps {
            dir('frontend') {
              sh 'npm ci --prefer-offline --no-audit'
              sh 'npm run lint:html || true'
            }
          }
        }

      }
    }

    // stage('SonarQube Analysis') {
    //   agent any
    //   environment {
    //     SONAR_TOKEN = credentials('sonar-token')
    //   }
    //   steps {
    //     withSonarQubeEnv('sonarqube') {
    //       sh '''
    //         sonar-scanner \
    //           -Dsonar.projectKey=micro-dash \
    //           -Dsonar.sources=. \
    //           -Dsonar.host.url=http://34.14.148.93:9000 \
    //           -Dsonar.token=$SONAR_TOKEN \
    //           -Dsonar.javascript.lcov.reportPaths=gateway/coverage/lcov.info,user-service/coverage/lcov.info,order-service/coverage/lcov.info
    //       '''
    //     }
    //   }
    // }
  stage('SonarQube Analysis') {
  agent {
    docker {
      image 'sonarsource/sonar-scanner-cli:latest'
      args '--entrypoint=""'
    }
  }
  environment {
    SONAR_TOKEN = credentials('sonar-token')
  }
  steps {
    withSonarQubeEnv('Sonarqube') {
      sh '''
        sonar-scanner \
          -Dsonar.projectKey=micro-dash \
          -Dsonar.sources=. \
          -Dsonar.host.url=http://34.14.148.93:9000 \
          -Dsonar.token=$SONAR_TOKEN \
          -Dsonar.javascript.lcov.reportPaths=gateway/coverage/lcov.info,user-service/coverage/lcov.info,order-service/coverage/lcov.info
      '''
    }
  }
}
    stage('Build Images') {
      parallel {

        stage('Build Frontend') {
          agent any
          steps {
            sh "docker build -t ${DOCKER_REGISTRY}/frontend:${IMAGE_TAG} ./frontend"
          }
        }

        stage('Build Gateway') {
          agent any
          steps {
            sh "docker build -t ${DOCKER_REGISTRY}/gateway:${IMAGE_TAG} ./gateway"
          }
        }

        stage('Build User Service') {
          agent any
          steps {
            sh "docker build -t ${DOCKER_REGISTRY}/user-service:${IMAGE_TAG} ./user-service"
          }
        }

        stage('Build Order Service') {
          agent any
          steps {
            sh "docker build -t ${DOCKER_REGISTRY}/order-service:${IMAGE_TAG} ./order-service"
          }
        }

      }
    }

    stage('Trivy Scan') {
      agent any
      steps {
        sh '''
          trivy image --exit-code 1 --no-progress --severity HIGH,CRITICAL ${DOCKER_REGISTRY}/frontend:${IMAGE_TAG}
          trivy image --exit-code 1 --no-progress --severity HIGH,CRITICAL ${DOCKER_REGISTRY}/gateway:${IMAGE_TAG}
          trivy image --exit-code 1 --no-progress --severity HIGH,CRITICAL ${DOCKER_REGISTRY}/user-service:${IMAGE_TAG}
          trivy image --exit-code 1 --no-progress --severity HIGH,CRITICAL ${DOCKER_REGISTRY}/order-service:${IMAGE_TAG}
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