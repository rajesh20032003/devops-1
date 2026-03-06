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

    // ─────────────────────────────────────────────
    // STAGE 1: Clean
    // ─────────────────────────────────────────────
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

    // ─────────────────────────────────────────────
    // STAGE 2: Secret Scan
    // ─────────────────────────────────────────────
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
        failure {
          echo "CRITICAL: Secrets detected in repo!"
        }
      }
    }

    // ─────────────────────────────────────────────
    // STAGE 3: Dependency Scan
    // ─────────────────────────────────────────────
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
          stash name: 'trivy-deps-report', includes: 'trivy-deps-report.json', allowEmpty: true
        }
        failure {
          echo "CRITICAL: Vulnerabilities found in dependencies!"
        }
      }
    }

    // ─────────────────────────────────────────────
    // STAGE 4: Quality Checks
    // ─────────────────────────────────────────────
    stage('Quality Checks - lint, unit test') {
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
              stash name: 'coverage-gateway',
            includes: 'gateway/coverage/**',
            allowEmpty: true
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
              stash name: 'coverage-user-service',
            includes: 'user-service/coverage/**',
            allowEmpty: true
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
              stash name: 'coverage-order-service',
            includes: 'order-service/coverage/**',
            allowEmpty: true
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

    // ─────────────────────────────────────────────
    // STAGE 5: SonarQube Analysis
    // ─────────────────────────────────────────────
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

    // ─────────────────────────────────────────────
    // STAGE 6: Quality Gate
    // ─────────────────────────────────────────────
    stage('Quality Gate - SonarQube') {
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

    // ─────────────────────────────────────────────
    // STAGE 7: Set Image Version
    // ─────────────────────────────────────────────
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
            echo "Release build. Version: ${env.IMAGE_TAG}"
          } else {
            env.IMAGE_TAG = "dev-${env.BUILD_NUMBER}"
            echo "Non-release build. Using dev tag: ${env.IMAGE_TAG}"
          }
        }
      }
    }

    // ─────────────────────────────────────────────
    // STAGE 8: Build and Push to Harbor
    // ─────────────────────────────────────────────
   stage('Build and Push Images') {
      parallel {

        stage('Frontend') {
          when { anyOf { changeset 'frontend/**'; buildingTag(); branch 'main' } }
          agent any
          steps { buildAndPush('frontend', HARBOR, PROJECT) }
        }

        stage('Gateway') {
          when { anyOf { changeset 'gateway/**'; buildingTag(); branch 'main' } }
          agent any
          steps { buildAndPush('gateway', HARBOR, PROJECT) }
        }

        stage('User Service') {
          when { anyOf { changeset 'user-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps { buildAndPush('user-service', HARBOR, PROJECT) }
        }

        stage('Order Service') {
          when { anyOf { changeset 'order-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps { buildAndPush('order-service', HARBOR, PROJECT) }
        }

      }
    }

    // ─────────────────────────────────────────────
    // STAGE 9: Trivy Image Scan (from Harbor)
    // ─────────────────────────────────────────────

 
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
            trivyScan('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
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
            trivyScan('gateway', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
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
            trivyScan('user-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
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
            trivyScan('order-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
          }
        }
      }
    }

    // ─────────────────────────────────────────────
    // STAGE 10: Generate SBOM and push to Harbor
    // ─────────────────────────────────────────────
   stage('Generate SBOM') {
    parallel {

      stage('Frontend') {
        when {
          anyOf {
            changeset "frontend/**"
            buildingTag()
            branch 'main'
          }
        }
        agent any
         steps {
          generateSbom(
            'frontend',
            env.HARBOR_REGISTRY,
            env.HARBOR_PROJECT
          )
        }
      }

      stage('Gateway') {
        when {
          anyOf {
            changeset "gateway/**"
            buildingTag()
            branch 'main'
          }
        }
        agent any
        steps {
          generateSbom(
            'gateway',
            env.HARBOR_REGISTRY,
            env.HARBOR_PROJECT
          )
        }
      }

      stage('User Service') {
        when {
          anyOf {
            changeset "user-service/**"
            buildingTag()
            branch 'main'
          }
        }
        agent any
        steps {
          generateSbom(
            'user-service',
            env.HARBOR_REGISTRY,
            env.HARBOR_PROJECT
          )
        }
      }

      stage('Order Service') {
        when {
          anyOf {
            changeset "order-service/**"
            buildingTag()
            branch 'main'
          }
        }
        agent any
        steps {
          generateSbom(
            'order-service',
            env.HARBOR_REGISTRY,
            env.HARBOR_PROJECT
          )
        }
      }

    }

  }

    // ─────────────────────────────────────────────
    // STAGE 11: Upload Reports to Harbor
    // (gitleaks, trivy-deps, trivy-image, sbom)
    // ─────────────────────────────────────────────
    stage('Upload Reports to Harbor') {
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
          withCredentials([
            usernamePassword(
              credentialsId: 'harbor-credential',
              usernameVariable: 'HARBOR_USER',
              passwordVariable: 'HARBOR_PASS'
            )
          ]) {
            script {
        // Unstash only what exists
                sh 'mkdir -p reports'

                def stashes = [
                  'gitleaks-report',
                  'trivy-deps-report',
                  'sbom-frontend',
                  'sbom-gateway',
                  'sbom-user-service',
                  'sbom-order-service'
                ]

                stashes.each { stashName ->
                  try {
                    unstash stashName
                    echo "Unstashed: ${stashName}"
                  } catch (Exception e) {
                    echo "Skipping ${stashName} - not available (stage was skipped)"
                  }
                }
              }

            sh 'mkdir -p reports'

            // Unstash all reports
            unstash 'gitleaks-report'
            unstash 'trivy-deps-report'
            unstash  'coverage-user-service'
            unstash  'coverage-order-service'
            unstash 'coverage-gateway'
            unstash 'sbom-frontend'
            unstash 'sbom-gateway'
            unstash 'sbom-user-service'
            unstash 'sbom-order-service'

            sh '''
              set -x

              echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
                -u "$HARBOR_USER" --password-stdin

              if [ -f gitleaks-report.json ]; then
                oras push $HARBOR_REGISTRY/$HARBOR_PROJECT/reports:gitleaks-${BUILD_NUMBER} \
                  --plain-http \
                  gitleaks-report.json:application/json
              fi

              if [ -f trivy-deps-report.json ]; then
                oras push $HARBOR_REGISTRY/$HARBOR_PROJECT/reports:trivy-deps-${BUILD_NUMBER} \
                  --plain-http \
                  trivy-deps-report.json:application/json
              fi

              for SERVICE in frontend gateway user-service order-service; do
                if [ -f sbom-${SERVICE}.json ]; then
                  oras push $HARBOR_REGISTRY/$HARBOR_PROJECT/reports:sbom-${SERVICE}-${BUILD_NUMBER} \
                    --plain-http \
                    sbom-${SERVICE}.json:application/json
                fi
              done
            '''
    }
  }
}

    // ─────────────────────────────────────────────
    // STAGE 12: Sign Images in Harbor
    // ─────────────────────────────────────────────
    stage('Sign Images') {
      parallel {

        stage('Sign Frontend') {
          when {
            anyOf {
              changeset "frontend/**"
              buildingTag()
              branch 'main'
            }
          }
          agent any
          steps {
            withCredentials([
              usernamePassword(
                credentialsId: 'harbor-credential',
                usernameVariable: 'HARBOR_USER',
                passwordVariable: 'HARBOR_PASS'
              ),
              file(credentialsId: 'cosign-private-key', variable: 'COSIGN_KEY'),
              string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')
            ]) {
              sh '''
                set -x
                SERVICE=frontend
                IMAGE_TAG=ci-${BUILD_NUMBER}

                echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
                  -u "$HARBOR_USER" --password-stdin

                docker pull $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG

                IMAGE_DIGEST=$(docker inspect \
                  --format='{{index .RepoDigests 0}}' \
                  $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
                  | cut -d'@' -f2)

                echo "Signing digest: $IMAGE_DIGEST"

                COSIGN_PASSWORD=$COSIGN_PASSWORD \
                cosign sign \
                  --key $COSIGN_KEY \
                  --allow-insecure-registry \
                  --allow-http-registry \
                  --yes \
                  $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE@$IMAGE_DIGEST
              '''
            }
          }
        }

        stage('Sign Gateway') {
          when {
            anyOf {
              changeset "gateway/**"
              buildingTag()
              branch 'main'
            }
          }
          agent any
          steps {
            withCredentials([
              usernamePassword(
                credentialsId: 'harbor-credential',
                usernameVariable: 'HARBOR_USER',
                passwordVariable: 'HARBOR_PASS'
              ),
              file(credentialsId: 'cosign-private-key', variable: 'COSIGN_KEY'),
              string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')
            ]) {
              sh '''
                set -x
                SERVICE=gateway
                IMAGE_TAG=ci-${BUILD_NUMBER}

                echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
                  -u "$HARBOR_USER" --password-stdin

                docker pull $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG

                IMAGE_DIGEST=$(docker inspect \
                  --format='{{index .RepoDigests 0}}' \
                  $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
                  | cut -d'@' -f2)

                echo "Signing digest: $IMAGE_DIGEST"

                COSIGN_PASSWORD=$COSIGN_PASSWORD \
                cosign sign \
                  --key $COSIGN_KEY \
                  --allow-insecure-registry \
                  --allow-http-registry \
                  --yes \
                  $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE@$IMAGE_DIGEST
              '''
            }
          }
        }

        stage('Sign User Service') {
          when {
            anyOf {
              changeset "user-service/**"
              buildingTag()
              branch 'main'
            }
          }
          agent any
          steps {
            withCredentials([
              usernamePassword(
                credentialsId: 'harbor-credential',
                usernameVariable: 'HARBOR_USER',
                passwordVariable: 'HARBOR_PASS'
              ),
              file(credentialsId: 'cosign-private-key', variable: 'COSIGN_KEY'),
              string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')
            ]) {
              sh '''
                set -x
                SERVICE=user-service          # ← fixed (was order-service before)
                IMAGE_TAG=ci-${BUILD_NUMBER}

                echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
                  -u "$HARBOR_USER" --password-stdin

                docker pull $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG

                IMAGE_DIGEST=$(docker inspect \
                  --format='{{index .RepoDigests 0}}' \
                  $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
                  | cut -d'@' -f2)

                echo "Signing digest: $IMAGE_DIGEST"

                COSIGN_PASSWORD=$COSIGN_PASSWORD \
                cosign sign \
                  --key $COSIGN_KEY \
                  --allow-insecure-registry \
                  --allow-http-registry \
                  --yes \
                  $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE@$IMAGE_DIGEST
              '''
            }
          }
        }

        stage('Sign Order Service') {
          when {
            anyOf {
              changeset "order-service/**"
              buildingTag()
              branch 'main'
            }
          }
          agent any
          steps {
            withCredentials([
              usernamePassword(
                credentialsId: 'harbor-credential',
                usernameVariable: 'HARBOR_USER',
                passwordVariable: 'HARBOR_PASS'
              ),
              file(credentialsId: 'cosign-private-key', variable: 'COSIGN_KEY'),
              string(credentialsId: 'cosign-password', variable: 'COSIGN_PASSWORD')
            ]) {
              sh '''
                set -x
                SERVICE=order-service
                IMAGE_TAG=ci-${BUILD_NUMBER}

                echo "$HARBOR_PASS" | docker login $HARBOR_REGISTRY \
                  -u "$HARBOR_USER" --password-stdin

                docker pull $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG

                IMAGE_DIGEST=$(docker inspect \
                  --format='{{index .RepoDigests 0}}' \
                  $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE:$IMAGE_TAG \
                  | cut -d'@' -f2)

                echo "Signing digest: $IMAGE_DIGEST"

                COSIGN_PASSWORD=$COSIGN_PASSWORD \
                cosign sign \
                  --key $COSIGN_KEY \
                  --allow-insecure-registry \
                  --allow-http-registry \
                  --yes \
                  $HARBOR_REGISTRY/$HARBOR_PROJECT/$SERVICE@$IMAGE_DIGEST
              '''
            }
          }
        }

      }
    }

    // ─────────────────────────────────────────────
    // STAGE 13: Promote Harbor → ECR (production)
    // ─────────────────────────────────────────────
   stage('Promote Images') {
      parallel {

        stage('Promote Frontend') {
          when { anyOf { changeset 'frontend/**'; buildingTag(); branch 'main' } }
          agent any
          steps { PromoteImage('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT, env.ECR_REGISTRY) }
        }

        stage('Promote Gateway') {
          when { anyOf { changeset 'gateway/**'; buildingTag()  } }
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


    // ─────────────────────────────────────────────
    // STAGE 14: Cleanup
    // ─────────────────────────────────────────────
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