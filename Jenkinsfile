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
          archiveArtifacts artifacts: 'gitleaks-report.json', allowEmptyArchive: true
        }
        failure {
          echo "CRITICAL: Secrets detected in repo!"
        }
      }
    }

    stage('Dependency Scan (Trivy Repo)') {
      when {
        anyOf {
          changeset "gateway/**"
          changeset "order-service/**"
          changeset "user-service/**"
          changeset "frontend/**"
          buildingTag()
        }
      }
      agent any
      steps {
        sh '''
          trivy fs . \
            --exit-code 1 \
            --no-progress \
            --severity HIGH,CRITICAL \
            --ignore-unfixed \
            --scanners vuln \
            --pkg-types library \
            --format json \
            --output trivy-deps-report.json
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'trivy-deps-report.json', allowEmptyArchive: true
        }
        failure {
          echo "CRITICAL: vulnerabilities founded in dependenicies!"
        }
      }
    }

    stage('Quality Checks-lint,unit test') {
      parallel {

        stage('Gateway') {
          when {
            anyOf {
              changeset "**/gateway/**"
              buildingTag()
            }
          }
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
          when {
            anyOf {
              changeset "**/user-service/**"
              buildingTag()
            }
          }
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
          when {
            anyOf {
              changeset "**/order-service/**"
              buildingTag()
            }
          }
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
          when {
            anyOf {
              changeset "**/frontend/**"
              buildingTag()
            }
          }
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
      when {
        anyOf {
          changeset "gateway/**"
          changeset "order-service/**"
          changeset "user-service/**"
          changeset "frontend/**"
          buildingTag()
        }
      }
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

    stage('Quality Gate-sonarqube') {
      when {
        anyOf {
          changeset "gateway/**"
          changeset "order-service/**"
          changeset "user-service/**"
          changeset "frontend/**"
          buildingTag()
        }
      }
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
          changeset "gateway/**"
          changeset "order-service/**"
          changeset "user-service/**"
          changeset "frontend/**"
          branch 'main'
          buildingTag()
        }
      }
      agent any
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

    stage('Build and Push Images') {
      parallel {

        stage('Build Frontend') {
          when {
            anyOf {
              changeset "frontend/**"
              buildingTag()
              branch 'main'
            }
          }
          agent any
          steps {
            withCredentials([[
              $class: 'AmazonWebServicesCredentialsBinding',
              credentialsId: 'aws-ecr-credentials'
            ]]) {
              sh '''
                set -x

                ECR_REGISTRY=760302898980.dkr.ecr.ap-south-1.amazonaws.com
                REPO_NAME=frontend
                IMAGE_TAG=ci-${BUILD_NUMBER}

                aws ecr get-login-password --region ap-south-1 \
                  | docker login --username AWS --password-stdin $ECR_REGISTRY

                docker buildx create --name ci-builder --driver docker-container --use || docker buildx use ci-builder
                docker buildx inspect --bootstrap

                docker buildx build \
                  --builder ci-builder \
                  --cache-from=type=registry,ref=$ECR_REGISTRY/$REPO_NAME:buildcache \
                  --cache-to=type=registry,ref=$ECR_REGISTRY/$REPO_NAME:buildcache,mode=max \
                  -t $ECR_REGISTRY/$REPO_NAME:$IMAGE_TAG \
                  --push \
                  ./frontend
              '''
            }
          }
        }

        stage('Build Gateway') {
          when {
            anyOf {
              changeset "gateway/**"
              buildingTag()
            }
          }
          agent any
          steps {
            withCredentials([[
              $class: 'AmazonWebServicesCredentialsBinding',
              credentialsId: 'aws-ecr-credentials'
            ]]) {
              sh '''
                set -x

                ECR_REGISTRY=760302898980.dkr.ecr.ap-south-1.amazonaws.com
                REPO_NAME=gateway
                IMAGE_TAG=ci-${BUILD_NUMBER}

                aws ecr get-login-password --region ap-south-1 \
                  | docker login --username AWS --password-stdin $ECR_REGISTRY

                docker buildx create --name ci-builder --driver docker-container --use || docker buildx use ci-builder
                docker buildx inspect --bootstrap

                docker buildx build \
                  --builder ci-builder \
                  --cache-from=type=registry,ref=$ECR_REGISTRY/$REPO_NAME:buildcache \
                  --cache-to=type=registry,ref=$ECR_REGISTRY/$REPO_NAME:buildcache,mode=max \
                  -t $ECR_REGISTRY/$REPO_NAME:$IMAGE_TAG \
                  --push \
                  ./gateway
              '''
            }
          }
        }

        stage('Build User Service') {
          when {
            anyOf {
              changeset "user-service/**"
              buildingTag()
            }
          }
          agent any
          steps {
            withCredentials([[
              $class: 'AmazonWebServicesCredentialsBinding',
              credentialsId: 'aws-ecr-credentials'
            ]]) {
              sh '''
                set -x

                ECR_REGISTRY=760302898980.dkr.ecr.ap-south-1.amazonaws.com
                REPO_NAME=user-service
                IMAGE_TAG=ci-${BUILD_NUMBER}

                aws ecr get-login-password --region ap-south-1 \
                  | docker login --username AWS --password-stdin $ECR_REGISTRY

                docker buildx create --name ci-builder --driver docker-container --use || docker buildx use ci-builder
                docker buildx inspect --bootstrap

                docker buildx build \
                  --builder ci-builder \
                  --cache-from=type=registry,ref=$ECR_REGISTRY/$REPO_NAME:buildcache \
                  --cache-to=type=registry,ref=$ECR_REGISTRY/$REPO_NAME:buildcache,mode=max \
                  -t $ECR_REGISTRY/$REPO_NAME:$IMAGE_TAG \
                  --push \
                  ./user-service
              '''
            }
          }
        }

        stage('Build Order Service') {
          when {
            anyOf {
              changeset "order-service/**"
              buildingTag()
            }
          }
          agent any
          steps {
            withCredentials([[
              $class: 'AmazonWebServicesCredentialsBinding',
              credentialsId: 'aws-ecr-credentials'
            ]]) {
              sh '''
                set -x

                ECR_REGISTRY=760302898980.dkr.ecr.ap-south-1.amazonaws.com
                REPO_NAME=order-service
                IMAGE_TAG=ci-${BUILD_NUMBER}

                aws ecr get-login-password --region ap-south-1 \
                  | docker login --username AWS --password-stdin $ECR_REGISTRY

                docker buildx create --name ci-builder --driver docker-container --use || docker buildx use ci-builder
                docker buildx inspect --bootstrap

                docker buildx build \
                  --builder ci-builder \
                  --cache-from=type=registry,ref=$ECR_REGISTRY/$REPO_NAME:buildcache \
                  --cache-to=type=registry,ref=$ECR_REGISTRY/$REPO_NAME:buildcache,mode=max \
                  -t $ECR_REGISTRY/$REPO_NAME:$IMAGE_TAG \
                  --push \
                  ./order-service
              '''
            }
          }
        }

      }
    }

    stage('Trivy Scan') {
      parallel {

        stage('Scan Frontend') {
          when {
            anyOf {
              changeset "frontend/**"
              buildingTag()
              branch 'main'
            }
          }
          agent any
          steps {
            withCredentials([[
              $class: 'AmazonWebServicesCredentialsBinding',
              credentialsId: 'aws-ecr-credentials'
            ]]) {
              sh '''
                set -x

                ECR_REGISTRY=760302898980.dkr.ecr.ap-south-1.amazonaws.com
                REPO_NAME=frontend
                IMAGE_TAG=ci-${BUILD_NUMBER}

                ECR_PASSWORD=$(aws ecr get-login-password --region ap-south-1)

                trivy image \
                  --scanners vuln \
                  --exit-code 1 \
                  --severity HIGH,CRITICAL \
                  --skip-version-check \
                  --image-src remote \
                  --username AWS \
                  --password $ECR_PASSWORD \
                  $ECR_REGISTRY/$REPO_NAME:$IMAGE_TAG
              '''
            }
          }
        }

        stage('Scan Gateway') {
          when {
            anyOf {
              changeset "gateway/**"
              buildingTag()
            }
          }
          agent any
          steps {
            withCredentials([[
              $class: 'AmazonWebServicesCredentialsBinding',
              credentialsId: 'aws-ecr-credentials'
            ]]) {
              sh '''
                set -x

                ECR_REGISTRY=760302898980.dkr.ecr.ap-south-1.amazonaws.com
                REPO_NAME=gateway
                IMAGE_TAG=ci-${BUILD_NUMBER}

                ECR_PASSWORD=$(aws ecr get-login-password --region ap-south-1)

                trivy image \
                  --scanners vuln \
                  --exit-code 1 \
                  --severity HIGH,CRITICAL \
                  --skip-version-check \
                  --image-src remote \
                  --username AWS \
                  --password $ECR_PASSWORD \
                  $ECR_REGISTRY/$REPO_NAME:$IMAGE_TAG
              '''
            }
          }
        }

        stage('Scan User Service') {
          when {
            anyOf {
              changeset "user-service/**"
              buildingTag()
            }
          }
          agent any
          steps {
            withCredentials([[
              $class: 'AmazonWebServicesCredentialsBinding',
              credentialsId: 'aws-ecr-credentials'
            ]]) {
              sh '''
                set -x

                ECR_REGISTRY=760302898980.dkr.ecr.ap-south-1.amazonaws.com
                REPO_NAME=user-service
                IMAGE_TAG=ci-${BUILD_NUMBER}

                ECR_PASSWORD=$(aws ecr get-login-password --region ap-south-1)

                trivy image \
                  --scanners vuln \
                  --exit-code 1 \
                  --severity HIGH,CRITICAL \
                  --skip-version-check \
                  --image-src remote \
                  --username AWS \
                  --password $ECR_PASSWORD \
                  $ECR_REGISTRY/$REPO_NAME:$IMAGE_TAG
              '''
            }
          }
        }

        stage('Scan Order Service') {
          when {
            anyOf {
              changeset "order-service/**"
              buildingTag()
            }
          }
          agent any
          steps {
            withCredentials([[
              $class: 'AmazonWebServicesCredentialsBinding',
              credentialsId: 'aws-ecr-credentials'
            ]]) {
              sh '''
                set -x

                ECR_REGISTRY=760302898980.dkr.ecr.ap-south-1.amazonaws.com
                REPO_NAME=order-service
                IMAGE_TAG=ci-${BUILD_NUMBER}

                ECR_PASSWORD=$(aws ecr get-login-password --region ap-south-1)

                trivy image \
                  --scanners vuln \
                  --exit-code 1 \
                  --severity HIGH,CRITICAL \
                  --skip-version-check \
                  --image-src remote \
                  --username AWS \
                  --password $ECR_PASSWORD \
                  $ECR_REGISTRY/$REPO_NAME:$IMAGE_TAG
              '''
            }
          }
        }

      }
    }

    stage('Promote Images') {
      parallel {

        stage('Promote Frontend') {
          when {
            anyOf {
              changeset "frontend/**"
              buildingTag()
            }
          }
          agent any
          steps {
            withCredentials([[
              $class: 'AmazonWebServicesCredentialsBinding',
              credentialsId: 'aws-ecr-credentials'
            ]]) {
              sh '''
                set -x

                ECR_REGISTRY=760302898980.dkr.ecr.ap-south-1.amazonaws.com
                REPO_NAME=frontend
                CI_TAG=ci-${BUILD_NUMBER}

                if [ -n "$TAG_NAME" ]; then
                  FINAL_TAG=$TAG_NAME
                else
                  FINAL_TAG=dev-${BUILD_NUMBER}
                fi

                aws ecr get-login-password --region ap-south-1 \
                  | docker login --username AWS --password-stdin $ECR_REGISTRY

                docker pull $ECR_REGISTRY/$REPO_NAME:$CI_TAG
                docker tag $ECR_REGISTRY/$REPO_NAME:$CI_TAG $ECR_REGISTRY/$REPO_NAME:$FINAL_TAG
                docker push $ECR_REGISTRY/$REPO_NAME:$FINAL_TAG
                echo "Promoted $CI_TAG → $FINAL_TAG"
              '''
            }
          }
        }

        stage('Promote Gateway') {
          when {
            anyOf {
              changeset "gateway/**"
              buildingTag()
            }
          }
          agent any
          steps {
            withCredentials([[
              $class: 'AmazonWebServicesCredentialsBinding',
              credentialsId: 'aws-ecr-credentials'
            ]]) {
              sh '''
                set -x

                ECR_REGISTRY=760302898980.dkr.ecr.ap-south-1.amazonaws.com
                REPO_NAME=gateway
                CI_TAG=ci-${BUILD_NUMBER}

                if [ -n "$TAG_NAME" ]; then
                  FINAL_TAG=$TAG_NAME
                else
                  FINAL_TAG=dev-${BUILD_NUMBER}
                fi

                aws ecr get-login-password --region ap-south-1 \
                  | docker login --username AWS --password-stdin $ECR_REGISTRY

                docker pull $ECR_REGISTRY/$REPO_NAME:$CI_TAG
                docker tag $ECR_REGISTRY/$REPO_NAME:$CI_TAG $ECR_REGISTRY/$REPO_NAME:$FINAL_TAG
                docker push $ECR_REGISTRY/$REPO_NAME:$FINAL_TAG
                echo "Promoted $CI_TAG → $FINAL_TAG"
              '''
            }
          }
        }

        stage('Promote User Service') {
          when {
            anyOf {
              changeset "user-service/**"
              buildingTag()
            }
          }
          agent any
          steps {
            withCredentials([[
              $class: 'AmazonWebServicesCredentialsBinding',
              credentialsId: 'aws-ecr-credentials'
            ]]) {
              sh '''
                set -x

                ECR_REGISTRY=760302898980.dkr.ecr.ap-south-1.amazonaws.com
                REPO_NAME=user-service
                CI_TAG=ci-${BUILD_NUMBER}

                if [ -n "$TAG_NAME" ]; then
                  FINAL_TAG=$TAG_NAME
                else
                  FINAL_TAG=dev-${BUILD_NUMBER}
                fi

                aws ecr get-login-password --region ap-south-1 \
                  | docker login --username AWS --password-stdin $ECR_REGISTRY

                docker pull $ECR_REGISTRY/$REPO_NAME:$CI_TAG
                docker tag $ECR_REGISTRY/$REPO_NAME:$CI_TAG $ECR_REGISTRY/$REPO_NAME:$FINAL_TAG
                docker push $ECR_REGISTRY/$REPO_NAME:$FINAL_TAG
                echo "Promoted $CI_TAG → $FINAL_TAG"
              '''
            }
          }
        }

        stage('Promote Order Service') {
          when {
            anyOf {
              changeset "order-service/**"
              buildingTag()
            }
          }
          agent any
          steps {
            withCredentials([[
              $class: 'AmazonWebServicesCredentialsBinding',
              credentialsId: 'aws-ecr-credentials'
            ]]) {
              sh '''
                set -x

                ECR_REGISTRY=760302898980.dkr.ecr.ap-south-1.amazonaws.com
                REPO_NAME=order-service
                CI_TAG=ci-${BUILD_NUMBER}

                if [ -n "$TAG_NAME" ]; then
                  FINAL_TAG=$TAG_NAME
                else
                  FINAL_TAG=dev-${BUILD_NUMBER}
                fi

                aws ecr get-login-password --region ap-south-1 \
                  | docker login --username AWS --password-stdin $ECR_REGISTRY

                docker pull $ECR_REGISTRY/$REPO_NAME:$CI_TAG
                docker tag $ECR_REGISTRY/$REPO_NAME:$CI_TAG $ECR_REGISTRY/$REPO_NAME:$FINAL_TAG
                docker push $ECR_REGISTRY/$REPO_NAME:$FINAL_TAG
                echo "Promoted $CI_TAG → $FINAL_TAG"
              '''
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