pipeline {
  agent any

  stages {

    stage('build docker images') {
      steps {
        sh 'docker compose build'
      }
    }
    stage('verify containers'){
      steps {
        sh 'docker compose config'
      }
    }
  }
}