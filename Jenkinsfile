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
             //args '-u 1000:1000 -v $HOME/.npm:/home/node/.npm'
           } }
          steps {
            dir('gateway') {
             cache(maxCacheSize: 250, caches: [
              arbitraryFileCache(
                path: 'gateway/node_modules',
                cacheValidityDecidingFile: 'package-lock.json'
              )
            ]){
              
              sh 'npm ci  --prefer-offline --no-audit'
              sh 'npm run lint'
              sh 'npm test -- --coverage --ci --reporters=default --reporters=jest-junit'
            
                }
            
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
                //args '-u 1000:1000 -v $HOME/.npm:/home/node/.npm'
           } }
          steps {
            dir('user-service') {
              cache(maxCacheSize: 250, caches: [
              arbitraryFileCache(
                path: 'user-service/node_modules',
                cacheValidityDecidingFile: 'package-lock.json'
              )
            ]){
              sh 'npm ci  --prefer-offline --no-audit'
              sh 'npm run lint'
              sh 'npm test -- --coverage --ci --reporters=default --reporters=jest-junit'
                }
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
              //args '-u 1000:1000 -v $HOME/.npm:/home/node/.npm'
           } }
          steps {
            dir('order-service') {
              cache(maxCacheSize: 250, caches: [
              arbitraryFileCache(
                path: 'order-service/node_modules',
                cacheValidityDecidingFile: 'package-lock.json'
              )
            ]){
              sh 'npm ci  --prefer-offline --no-audit'
              sh 'npm run lint'
              sh 'npm test -- --coverage --ci --reporters=default --reporters=jest-junit'
                }
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
              //args '-u 1000:1000 -v $HOME/.npm:/home/node/.npm'
           } }
          steps {
            dir('frontend') {
               cache(maxCacheSize: 250, caches: [
              arbitraryFileCache(
                path: 'frontend/node_modules',
                cacheValidityDecidingFile: 'package-lock.json'
              )
            ]){
              sh 'npm ci  --prefer-offline --no-audit'
              sh 'npm run lint:html || true'
                }
            }
          }
        }

      }
    }

 stage('SonarQube Analysis!') {
 
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
          -v $WORKSPACE:/usr/src \
          sonarsource/sonar-scanner-cli:latest \
          -Dsonar.projectBaseDir=/usr/src \
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
            export TRIVY_CACHE_DIR=$HOME/.trivy

            trivy image --download-db-only

            trivy image --exit-code 1 --severity CRITICAL ${DOCKER_REGISTRY}/frontend:${IMAGE_TAG}
            trivy image --exit-code 1 --severity CRITICAL ${DOCKER_REGISTRY}/gateway:${IMAGE_TAG}
            trivy image --exit-code 1 --severity CRITICAL ${DOCKER_REGISTRY}/user-service:${IMAGE_TAG}
            trivy image --exit-code 1 --severity CRITICAL ${DOCKER_REGISTRY}/order-service:${IMAGE_TAG}
            '''
      }
    }

    stage('Push Images') {
      when { branch 'master' }
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