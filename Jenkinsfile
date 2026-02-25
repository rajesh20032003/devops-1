pipeline {
  agent any

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

    stage('Push Images to Registry') {
      // when { branch 'main' }  // only push on main branch
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
    always {
      sh 'docker image prune -f'
    }

    success {
      echo "All images built & pushed successfully!"
    }

    failure {
      echo "Build failed!"
    }
  }
}