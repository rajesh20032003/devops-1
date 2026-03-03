pipeline {
  agent none

  environment {
    DOCKER_REGISTRY = "rajesh00007"
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
      archiveArtifacts artifacts: 'gitleaks-report/*.json', allowEmptyArchive: true
    }
    failure {
      echo "CRITICAL: Secrets detected in repo!"
    }
  }
}
    stage('Quality Checks') {
      //when {branch 'master'}
      parallel {

        stage('Gateway') {
          // when { changeset "**/gateway/**" }
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
          // when { changeset "**/user-service/**" }
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
          // when { changeset "**/order-service/**" }
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
          // when { changeset "**/frontend/**" }
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
    //when {branch 'master'}
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
          // ✅ Parse without readProperties plugin
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

stage('Quality Gate') {
 // when {branch 'master'}
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
          branch 'main'
          buildingTag()
        }
      }
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
    
   stage('Build & Push Images') {
      when {
        anyOf {
          buildingTag()
          branch 'main'
        }
      }
      agent {
        docker {
          image 'docker:28-cli'
          args '-v /var/run/docker.sock:/var/run/docker.sock -e HOME=/tmp'
        }
      }
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-hub-credentials',
          usernameVariable: 'DOCKER_USER',
          passwordVariable: 'DOCKER_PASS'
        )]) {
          sh '''
            echo "=== Setup Builder ==="
            docker buildx create --name ci-builder --driver docker-container --use || docker buildx use ci-builder
            docker buildx inspect --bootstrap

            echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin

            SERVICES="frontend gateway user-service order-service"

            for SERVICE in $SERVICES; do
              echo "=== Building $SERVICE ==="
              CI_TAG="ci-${BUILD_NUMBER}"
              docker buildx build \
                --builder ci-builder \
                --cache-from=type=registry,ref=$DOCKER_USER/$SERVICE:cache \
                --cache-to=type=registry,ref=$DOCKER_USER/$SERVICE:cache,mode=max \
                -t $DOCKER_USER/$SERVICE:${CI_TAG} \
                --push \
                ./$SERVICE
            done
          '''
    }
  }
}
stage('Trivy Scan') {
  agent any
  steps {
    withCredentials([
      usernamePassword(
        credentialsId: 'docker-hub-credentials',
        usernameVariable: 'DOCKER_USER',
        passwordVariable: 'DOCKER_PASS'
      )
    ]) {
      sh '''
        CI_TAG="ci-${BUILD_NUMBER}"

        trivy image --download-db-only --cache-dir $HOME/.trivy

        SERVICES="frontend gateway user-service order-service"

        for SERVICE in $SERVICES; do
          echo "Scanning $DOCKER_USER/$SERVICE:$CI_TAG"

          trivy image \
            --scanners vuln \
            --exit-code 1 \
            --severity CRITICAL \
            $DOCKER_USER/$SERVICE:$CI_TAG
        done
      '''
    }
  }
}
stage('Promote Images') {
  when {
    anyOf {
      buildingTag()
      branch 'main'
    }
  }
  agent {
    docker {
      image 'docker:28-cli'
      args '-v /var/run/docker.sock:/var/run/docker.sock -e HOME=/tmp'
    }
  }
  steps {
    withCredentials([usernamePassword(
      credentialsId: 'docker-hub-credentials',
      usernameVariable: 'DOCKER_USER',
      passwordVariable: 'DOCKER_PASS'
    )]) {
      sh '''
        echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin

        SERVICES="frontend gateway user-service order-service"

        for SERVICE in $SERVICES; do
          docker pull $DOCKER_USER/$SERVICE:ci-${BUILD_NUMBER}

          docker tag \
            $DOCKER_USER/$SERVICE:ci-${BUILD_NUMBER} \
            $DOCKER_USER/$SERVICE:${IMAGE_TAG}

          docker push $DOCKER_USER/$SERVICE:${IMAGE_TAG}
        done
      '''
    }
  }
}
    
    stage('Cleanup!') {
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
