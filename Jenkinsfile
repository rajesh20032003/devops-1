pipeline {
  agent none

  environment {
    DOCKER_REGISTRY = "rajesh00007"  
    IMAGE_TAG       = "${env.BUILD_NUMBER}"   
  }

  options {
    // Stop pipeline if previous build is still running
    disableConcurrentBuilds()
    // Keep last 10 builds
    buildDiscarder(logRotator(numToKeepStr: '10'))
    // Timeout whole pipeline after 30 minutes
    timeout(time: 30, unit: 'MINUTES')
  }

  stages {
     stage('quality checks') {
        parallel{
          stage('gateway tests') {
            agent { docker { image 'node:22'}}
            steps {
              dir('gateway') {
                sh 'npm ci'
                sh 'npm run lint'
                sh 'npm test'
              }
            }
          }
          stage('user service tests') {
            agent { docker {image 'node:22'}}
            steps {
              dir('user-service') {
                sh 'npm ci'
                sh 'npm run lint'
                sh 'npm test'
              }
            }
          }
          stage('order service tests') {
            agent { docker {image 'node:22'}}
            steps {
              dir('order-service') {
                sh 'npm ci'
                sh 'npm run lint'
                sh 'npm test'
              }
            }
          }
          stage('frontend service tests') {
            agent { docker {image 'node:22'}}
            steps {
              dir('user-service') {
                sh 'npm ci'
                sh 'npm run lint:html || true'
                sh 'npm test || true'
              }
            }
          }
        }
      }
//sonarqube
    stage('sonarqube analysis') {
      agent {
        docker { image 'sonarsource/sonar-scanner-cli:latest'}
      }
      environment {
        SONAR_TOKEN = credentials('sonar-token')
      }
      steps{
        withSonarQubeEnv('sonarqube') {
          sh '''
            sonar-scanner \
             -Dsonar.projectKey=micro-dash \
             -Dsonar.sources=. \
             -Dsonar.host.url=http://sonarqube:9000 \
             -Dsonar.login=$SONAR_TOKEN
             '''
        }
      }
    }
    
    stage('Build All Services in Parallel') {
      parallel {
        stage('Build Frontend') {
          steps {
            script {
              docker.build("${DOCKER_REGISTRY}/frontend:${IMAGE_TAG}", "./frontend")
            }
          }
        }

        stage('Build Gateway') {
          steps {
            script {
              docker.build("${DOCKER_REGISTRY}/gateway:${IMAGE_TAG}", "./gateway")
            }
          }
        }

        stage('Build User Service') {
          steps {
            script {
              docker.build("${DOCKER_REGISTRY}/user-service:${IMAGE_TAG}", "./user-service")
            }
          }
        }

        stage('Build Order Service') {
          steps {
            script {
              docker.build("${DOCKER_REGISTRY}/order-service:${IMAGE_TAG}", "./order-service")
            }
          }
        }
      }
    }

//trivy scan
    stage('trivy scan images'){
      steps{
        sh '''
        trivy image --severity CRITICAL --exit-code 1 ${DOCKER_REGISTRY}/frontend:${IMAGE_TAG}
        trivy image --severity CRITICAL --exit-code 1 ${DOCKER_REGISTRY}/gateway:${IMAGE_TAG}
        trivy image --severity CRITICAL --exit-code 1 ${DOCKER_REGISTRY}/user-service:${IMAGE_TAG}
        trivy image --severity CRITICAL --exit-code 1 ${DOCKER_REGISTRY}/order-service:${IMAGE_TAG}
        '''
      }
    }

    stage('Push Images to Registry') {
       when { branch 'main' }  // only push on main branch
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
  }

  post {
  

    success {
      echo "All images built & pushed successfully!"
    }

    failure {
      echo "Build failed!"
    }
  }
}