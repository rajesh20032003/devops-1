pipeline {
  agent any

  stages {

    stage('build docker images') {
      steps {
        sh 'docker build ./frontend'
      }
    }
    stage('verify containers'){
      steps {
        sh 'docker images'
      }
    }
  }
}