pipeline {
  agent any

  stages {
    
    stage('checkout repo') {
      steps {
        git 'https://github.com/rajesh20032003/devops-1'
      }
    }
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