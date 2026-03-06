@Library('shared-lib') _

pipeline {
  agent none

  environment {
    HARBOR_REGISTRY = "34.180.10.118"
    HARBOR_PROJECT  = "micro-dash"
    ECR_REGISTRY    = "760302898980.dkr.ecr.ap-south-1.amazonaws.com"
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
          stash name: 'gitleaks-report', includes: 'gitleaks-report.json', allowEmpty: true
        }
        failure { echo "CRITICAL: Secrets detected in repo!" }
      }
    }

    stage('Dependency Scan (Trivy Repo)') {
      when {
        anyOf {
          changeset "gateway/**"; changeset "order-service/**"
          changeset "user-service/**"; changeset "frontend/**"
          buildingTag()
        }
      }
      agent any
      steps {
        sh '''
          trivy fs . \
            --exit-code 1 --no-progress \
            --severity HIGH,CRITICAL --ignore-unfixed \
            --scanners vuln --pkg-types library \
            --format json --output trivy-deps-report.json
        '''
      }
      post {
        always {
          archiveArtifacts artifacts: 'trivy-deps-report.json', allowEmptyArchive: true
          stash name: 'trivy-deps-report', includes: 'trivy-deps-report.json', allowEmpty: true
        }
        failure { echo "CRITICAL: Vulnerabilities found in dependencies!" }
      }
    }

     stage('Quality Checks - lint, unit test') {
      parallel {

        // ── Backend services via shared lib ──────────────────────────────────
        // nodeQualityCheck(service) runs: npm ci → lint → test → coverage stash
        // order-service needs an extra jest cache clear before tests

        stage('Gateway') {
          when  { anyOf { changeset "**/gateway/**"; branch 'main'; buildingTag() } }
          agent { docker { image 'node:22-alpine'; args '-v npm-cache-gateway:/home/node/.npm' } }
          steps { Nodequalitycheck('gateway') }
        }

        stage('User Service') {
          when  { anyOf { changeset "**/user-service/**"; buildingTag() } }
          agent { docker { image 'node:22-alpine'; args '-v npm-cache-user-service:/home/node/.npm' } }
          steps { Nodequalitycheck('user-service') }
        }

        stage('Order Service') {
          when  { anyOf { changeset "**/order-service/**"; buildingTag() } }
          agent { docker { image 'node:22-alpine'; args '-v npm-cache-order-service:/home/node/.npm' } }
          steps {
            Nodequalitycheck('order-service') {
              sh 'npx jest --clearCache'   // runs before npm test inside the shared lib
            }
          }
        }

        // ── Frontend is different: no unit tests, only HTML lint ─────────────
        stage('Frontend') {
          when  { anyOf { changeset "**/frontend/**"; branch 'main'; buildingTag() } }
          agent { docker { image 'node:22-alpine'; args '-v npm-cache-frontend:/home/node/.npm' } }
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
          changeset "gateway/**"; changeset "order-service/**"
          changeset "user-service/**"; changeset "frontend/**"
          buildingTag()
        }
      }
      agent any
      environment { SONAR_TOKEN = credentials('sonar-token') }
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

    stage('Quality Gate - SonarQube') {
      when {
        anyOf {
          changeset "gateway/**"; changeset "order-service/**"
          changeset "user-service/**"; changeset "frontend/**"
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
          changeset "gateway/**"; changeset "order-service/**"
          changeset "user-service/**"; changeset "frontend/**"
          branch 'main'; buildingTag()
        }
      }
      agent any
      steps {
        script {
          env.IMAGE_TAG = env.TAG_NAME ?: "dev-${env.BUILD_NUMBER}"
          echo "Image tag: ${env.IMAGE_TAG}"
        }
      }
    }

    stage('Build and Push Images') {
      parallel {
        stage('Frontend') {
          when { anyOf { changeset 'frontend/**'; buildingTag(); branch 'main' } }
          agent any
          steps { BuildAndPush('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }
        stage('Gateway') {
          when { anyOf { changeset 'gateway/**'; buildingTag(); branch 'main' } }
          agent any
          steps { BuildAndPush('gateway', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }
        stage('User Service') {
          when { anyOf { changeset 'user-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps { BuildAndPush('user-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }
        stage('Order Service') {
          when { anyOf { changeset 'order-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps { BuildAndPush('order-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }
      }
    }

    stage('Trivy Scan') {
      parallel {
        stage('Scan Frontend') {
          when { anyOf { changeset 'frontend/**'; buildingTag(); branch 'main' } }
          agent any
          steps { trivyScan('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }
        stage('Scan Gateway') {
          when { anyOf { changeset 'gateway/**'; buildingTag() } }
          agent any
          steps { trivyScan('gateway', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }
        stage('Scan User Service') {
          when { anyOf { changeset 'user-service/**'; buildingTag() } }
          agent any
          steps { trivyScan('user-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }
        stage('Scan Order Service') {
          when { anyOf { changeset 'order-service/**'; buildingTag() } }
          agent any
          steps { trivyScan('order-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }
      }
    }

    stage('Generate SBOM') {
      parallel {
        stage('Frontend') {
          when { anyOf { changeset 'frontend/**'; buildingTag(); branch 'main' } }
          agent any
          steps { generateSbom('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }
        stage('Gateway') {
          when { anyOf { changeset 'gateway/**'; buildingTag(); branch 'main' } }
          agent any
          steps { generateSbom('gateway', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }
        stage('User Service') {
          when { anyOf { changeset 'user-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps { generateSbom('user-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }
        stage('Order Service') {
          when { anyOf { changeset 'order-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps { generateSbom('order-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }
      }
    }

    stage('Upload Reports to Harbor') {
      when {
        anyOf {
          changeset "gateway/**"; changeset "order-service/**"
          changeset "user-service/**"; changeset "frontend/**"
          buildingTag()
        }
      }
      agent any
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'harbor-credential',
            usernameVariable: 'HARBOR_USER',
            passwordVariable: 'HARBOR_PASS'
          )
        ]) {
          script {
            sh 'mkdir -p reports'
            // FIX: single graceful loop replaces the duplicate hard-unstash block
            ['gitleaks-report', 'trivy-deps-report',
             'coverage-gateway', 'coverage-user-service', 'coverage-order-service',
             'sbom-frontend', 'sbom-gateway', 'sbom-user-service', 'sbom-order-service'
            ].each { stashName ->
              try   { unstash stashName; echo "Unstashed: ${stashName}" }
              catch (e) { echo "Skipping ${stashName} - not available" }
            }
          }
          sh '''
            set -x
            echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
              -u "$HARBOR_USER" --password-stdin

            if [ -f gitleaks-report.json ]; then
              oras push $HARBOR_REGISTRY/$HARBOR_PROJECT/reports:gitleaks-${BUILD_NUMBER} \
                --plain-http gitleaks-report.json:application/json
            fi

            if [ -f trivy-deps-report.json ]; then
              oras push $HARBOR_REGISTRY/$HARBOR_PROJECT/reports:trivy-deps-${BUILD_NUMBER} \
                --plain-http trivy-deps-report.json:application/json
            fi

            for SERVICE in frontend gateway user-service order-service; do
              if [ -f sbom-${SERVICE}.json ]; then
                oras push $HARBOR_REGISTRY/$HARBOR_PROJECT/reports:sbom-${SERVICE}-${BUILD_NUMBER} \
                  --plain-http sbom-${SERVICE}.json:application/json
              fi
            done
          '''
        }
      }
    }

    stage('Sign Images') {
      parallel {

        stage('Sign Frontend') {
          when { anyOf { changeset 'frontend/**'; buildingTag(); branch 'main' } }
          agent any
          steps { SignImage('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }

        stage('Sign Gateway') {
          when { anyOf { changeset 'gateway/**'; buildingTag(); branch 'main' } }
          agent any
          steps { SignImage('gateway', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }

        stage('Sign User Service') {
          when { anyOf { changeset 'user-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps { SignImage('user-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }

        stage('Sign Order Service') {
          when { anyOf { changeset 'order-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps { SignImage('order-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT) }
        }

      }
    }

    stage('Promote Images') {
      parallel {

        stage('Promote Frontend') {
          when { anyOf { changeset 'frontend/**'; buildingTag(); branch 'main' } }
          agent any
          steps { PromoteImage('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT, env.ECR_REGISTRY) }
        }

        stage('Promote Gateway') {
          when { anyOf { changeset 'gateway/**'; buildingTag() } }
          agent any
          steps { PromoteImage('gateway', env.HARBOR_REGISTRY, env.HARBOR_PROJECT, env.ECR_REGISTRY) }
        }

        stage('Promote User Service') {
          when { anyOf { changeset 'user-service/**'; buildingTag() } }
          agent any
          steps { PromoteImage('user-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT, env.ECR_REGISTRY) }
        }

        stage('Promote Order Service') {
          when { anyOf { changeset 'order-service/**'; buildingTag() } }
          agent any
          steps { PromoteImage('order-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT, env.ECR_REGISTRY) }
        }

      }
    }

    stage('Cleanup') {
      agent any
      steps {
        cleanWs()
        sh '''
          docker image prune -f || true
          docker buildx prune -f || true
        '''
      }
    }

  }

  post {
    success {
      emailext(
        subject: "SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body:    "Build succeeded!\nURL: ${env.BUILD_URL}",
        to:      "rajeshgovindan777@gmail.com"
      )
    }
    failure {
      emailext(
        subject:     "FAILED: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body:        "Build FAILED!\nURL: ${env.BUILD_URL}\nConsole: ${env.BUILD_URL}console",
        to:          "rajeshgovindan777@gmail.com",
        attachLog:   true,
        compressLog: true
      )
    }
  }

}