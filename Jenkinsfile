@Library('shared-lib') _

pipeline {
  agent none

  environment {
    HARBOR_REGISTRY = "34.133.110.141"
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
        script { env.PIPELINE_START = System.currentTimeMillis() as String }
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
        measureStage('Secret_Scan') {
          sh '''
            gitleaks detect \
              --baseline-path baseline.json \
              --no-git \
              --source . \
              --redact \
              --report-path gitleaks-report.json
          '''
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'gitleaks-report.json', allowEmptyArchive: true
          stash name: 'gitleaks-report', includes: 'gitleaks-report.json', allowEmpty: true
        }
        failure { echo "CRITICAL: Secrets detected in repo!" }
      }
    }

    // ─────────────────────────────────────────────
    // STAGE 3: Dependency Scan
    // ─────────────────────────────────────────────
    stage('Dependency Scan (Trivy Repo)') {
      when {
        beforeAgent true
        anyOf {
          changeset "gateway/**"; changeset "order-service/**"
          changeset "user-service/**"; changeset "frontend/**"
          buildingTag()
        }
      }
      agent any
      steps {
        measureStage('Dependency_Scan') {
          sh '''
            trivy fs . \
              --exit-code 1 --no-progress \
              --severity HIGH,CRITICAL --ignore-unfixed \
              --scanners vuln --pkg-types library \
              --format json --output trivy-deps-report.json
          '''
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'trivy-deps-report.json', allowEmptyArchive: true
          stash name: 'trivy-deps-report', includes: 'trivy-deps-report.json', allowEmpty: true
        }
        failure { echo "CRITICAL: Vulnerabilities found in dependencies!" }
      }
    }

    // ─────────────────────────────────────────────
    // STAGE 4: Quality Checks
    // Duration tracked inside nodeQualityCheck via measureStage
    // ─────────────────────────────────────────────
   stage('Quality Checks - lint, unit test') {
      parallel {

        stage('Gateway') {
          when {
            beforeAgent true
            anyOf { changeset "**/gateway/**"; branch 'main'; buildingTag() }
          }
          // no agent block — nodeQualityCheck creates K8s pod internally
          steps {
            Nodequalitycheck('gateway')
            // equivalent to: nodeQualityCheck('gateway', null, false)
            // lintOnly defaults to false → runs full lint + tests + coverage
          }
        }

        stage('User Service') {
          when {
            beforeAgent true
            anyOf { changeset "**/user-service/**"; buildingTag(); branch 'main' }
          }
          steps {
            Nodequalitycheck('user-service')
          }
        }

        stage('Order Service') {
          when {
            beforeAgent true
            anyOf { changeset "**/order-service/**"; buildingTag(); branch 'main' }
          }
          steps {
            // passes extraSteps closure to clear jest cache before running
            // jest cache can cause flaky tests — clearing ensures clean run
            Nodequalitycheck('order-service') {
              sh 'npx jest --clearCache'
            }
          }
        }

        stage('Frontend') {
          when {
            beforeAgent true
            anyOf { changeset "**/frontend/**"; branch 'main'; buildingTag() }
          }
          steps {
            // lintOnly = true:
            //   runs npm run lint:html only
            //   skips tests (frontend has none)
            //   skips coverage stash (nothing to stash)
            //   still gets K8s pod isolation ✅
            //   still pushes metrics to Grafana ✅
            Nodequalitycheck('frontend', null, true)
          }
        }

      }
    }
    // ─────────────────────────────────────────────
    // STAGE 5: SonarQube Analysis
    // ─────────────────────────────────────────────
    stage('SonarQube Analysis') {
      when {
        beforeAgent true
        anyOf {
          changeset "gateway/**"; changeset "order-service/**"
          changeset "user-service/**"; changeset "frontend/**"
          buildingTag(); branch 'main'
        }
      }
      agent any
      environment { SONAR_TOKEN = credentials('sonar-token') }
      steps {
        measureStage('SonarQube_Analysis') {
           script {
        unstash name: 'coverage-gateway'
        unstash name: 'coverage-user-service'
        unstash name: 'coverage-order-service'
      }
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
    }

    // ─────────────────────────────────────────────
    // STAGE 6: Quality Gate
    // ─────────────────────────────────────────────
    stage('Quality Gate - SonarQube') {
      when {
        beforeAgent true
        anyOf {
          changeset "gateway/**"; changeset "order-service/**"
          changeset "user-service/**"; changeset "frontend/**"
          buildingTag(); branch 'main'
        }
      }
      agent any
      steps {
        measureStage('Quality_Gate') {
          withSonarQubeEnv('sonarqube') {
            timeout(time: 5, unit: 'MINUTES') {
              waitForQualityGate abortPipeline: true
            }
          }
        }
      }
    }

    // ─────────────────────────────────────────────
    // STAGE 7: Set Image Version
    // ─────────────────────────────────────────────
    stage('Set Image Version') {
      when {
        beforeAgent true
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

    // ─────────────────────────────────────────────
    // STAGE 8: Build and Push to Harbor
    // ─────────────────────────────────────────────
    stage('Build and Push Images') {
      parallel {

        stage('Frontend') {
          when { beforeAgent true; anyOf { changeset 'frontend/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('Build_Push_frontend') {
              BuildAndPush('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('Gateway') {
          when { beforeAgent true; anyOf { changeset 'gateway/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('Build_Push_gateway') {
              BuildAndPush('gateway', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('User Service') {
          when { beforeAgent true; anyOf { changeset 'user-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('Build_Push_user_service') {
              BuildAndPush('user-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('Order Service') {
          when { beforeAgent true; anyOf { changeset 'order-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('Build_Push_order_service') {
              BuildAndPush('order-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

      }
    }

    // ─────────────────────────────────────────────
    // STAGE 9: Trivy Image Scan
    // ─────────────────────────────────────────────
    stage('Trivy Scan') {
      parallel {

        stage('Scan Frontend') {
          when { beforeAgent true; anyOf { changeset 'frontend/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('Trivy_Scan_frontend') {
              trivyScan('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('Scan Gateway') {
          when { beforeAgent true; anyOf { changeset 'gateway/**'; buildingTag() } }
          agent any
          steps {
            measureStage('Trivy_Scan_gateway') {
              trivyScan('gateway', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('Scan User Service') {
          when { beforeAgent true; anyOf { changeset 'user-service/**'; buildingTag() } }
          agent any
          steps {
            measureStage('Trivy_Scan_user_service') {
              trivyScan('user-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('Scan Order Service') {
          when { beforeAgent true; anyOf { changeset 'order-service/**'; buildingTag() } }
          agent any
          steps {
            measureStage('Trivy_Scan_order_service') {
              trivyScan('order-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

      }
    }

    // ─────────────────────────────────────────────
    // STAGE 10: Generate SBOM
    // ─────────────────────────────────────────────
    stage('Generate SBOM') {
      parallel {

        stage('Frontend') {
          when { beforeAgent true; anyOf { changeset 'frontend/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('SBOM_frontend') {
              generateSbom('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('Gateway') {
          when { beforeAgent true; anyOf { changeset 'gateway/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('SBOM_gateway') {
              generateSbom('gateway', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('User Service') {
          when { beforeAgent true; anyOf { changeset 'user-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('SBOM_user_service') {
              generateSbom('user-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('Order Service') {
          when { beforeAgent true; anyOf { changeset 'order-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('SBOM_order_service') {
              generateSbom('order-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

      }
    }

    // ─────────────────────────────────────────────
    // STAGE 11: Upload Reports to Harbor
    // ─────────────────────────────────────────────
    stage('Upload Reports to Harbor') {
      when {
        beforeAgent true
        anyOf {
          changeset "gateway/**"; changeset "order-service/**"
          changeset "user-service/**"; changeset "frontend/**"
          buildingTag()
        }
      }
      agent any
      steps {
        measureStage('Upload_Reports') {
          withCredentials([
            usernamePassword(
              credentialsId: 'harbor-credential',
              usernameVariable: 'HARBOR_USER',
              passwordVariable: 'HARBOR_PASS'
            )
          ]) {
            script {
              sh 'mkdir -p reports'
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
    }

    // ─────────────────────────────────────────────
    // STAGE 12: Sign Images
    // ─────────────────────────────────────────────
    stage('Sign Images') {
      parallel {

        stage('Sign Frontend') {
          when { beforeAgent true; anyOf { changeset 'frontend/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('Sign_frontend') {
              SignImage('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('Sign Gateway') {
          when { beforeAgent true; anyOf { changeset 'gateway/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('Sign_gateway') {
              SignImage('gateway', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('Sign User Service') {
          when { beforeAgent true; anyOf { changeset 'user-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('Sign_user_service') {
              SignImage('user-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('Sign Order Service') {
          when { beforeAgent true; anyOf { changeset 'order-service/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('Sign_order_service') {
              SignImage('order-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

      }
    }

    // ─────────────────────────────────────────────
    // STAGE 13: Promote Harbor → ECR
    // ─────────────────────────────────────────────
    stage('Promote Images') {
      parallel {

        stage('Promote Frontend') {
          when { beforeAgent true; anyOf { changeset 'frontend/**'; buildingTag(); branch 'main' } }
          agent any
          steps {
            measureStage('Promote_frontend') {
              PromoteImage('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT, env.ECR_REGISTRY)
            }
          }
        }

        stage('Promote Gateway') {
          when { beforeAgent true; anyOf { changeset 'gateway/**'; buildingTag() } }
          agent any
          steps {
            measureStage('Promote_gateway') {
              PromoteImage('gateway', env.HARBOR_REGISTRY, env.HARBOR_PROJECT, env.ECR_REGISTRY)
            }
          }
        }

        stage('Promote User Service') {
          when { beforeAgent true; anyOf { changeset 'user-service/**'; buildingTag() } }
          agent any
          steps {
            measureStage('Promote_user_service') {
              PromoteImage('user-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT, env.ECR_REGISTRY)
            }
          }
        }

        stage('Promote Order Service') {
          when { beforeAgent true; anyOf { changeset 'order-service/**'; buildingTag() } }
          agent any
          steps {
            measureStage('Promote_order_service') {
              PromoteImage('order-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT, env.ECR_REGISTRY)
            }
          }
        }

      }
    }
 stage('Init Database') {
  when {
    buildingTag()
  }
  agent any
  steps {
    measureStage('Init_Database') {
      withCredentials([[
        $class: 'AmazonWebServicesCredentialsBinding',
        credentialsId: 'aws-ecr-credentials'
      ]]) {
        script {
          def region = "ap-south-1"
          def project = "micro-dash"
          def instances = sh(
            script: """
              aws ec2 describe-instances \
                --region ${region} \
                --filters \
                  "Name=tag:project,Values=${project}" \
                  "Name=instance-state-name,Values=running" \
                --query 'Reservations[*].Instances[*].InstanceId' \
                --output text
            """,
            returnStdout: true
          ).trim()

          // read init.sql files from workspace
          def userInitSql = readFile('user-service/init.sql')
            .replace("'", "'\\''")  // escape single quotes
          def orderInitSql = readFile('order-service/init.sql')
            .replace("'", "'\\''")

          def commandId = sh(
            script: """
              aws ssm send-command \
                --region ${region} \
                --instance-ids ${instances} \
                --document-name "AWS-RunShellScript" \
                --comment "Init DB" \
                --parameters 'commands=[
                  "set -e",
                  "echo === DB Init start ===",

                  "# Get user-db credentials",
                  "USER_SECRET=\$(aws secretsmanager get-secret-value --secret-id ${project}/dev/user-service/db --region ${region} --query SecretString --output text)",
                  "USER_HOST=\$(echo \$USER_SECRET | python3 -c \\"import sys,json; print(json.load(sys.stdin)[\\x27host\\x27])\\")",
                  "USER_USER=\$(echo \$USER_SECRET | python3 -c \\"import sys,json; print(json.load(sys.stdin)[\\x27username\\x27])\\")",
                  "USER_PASS=\$(echo \$USER_SECRET | python3 -c \\"import sys,json; print(json.load(sys.stdin)[\\x27password\\x27])\\")",
                  "USER_DB=\$(echo \$USER_SECRET | python3 -c \\"import sys,json; print(json.load(sys.stdin)[\\x27dbname\\x27])\\")",

                  "# Get order-db credentials",
                  "ORDER_SECRET=\$(aws secretsmanager get-secret-value --secret-id ${project}/dev/order-service/db --region ${region} --query SecretString --output text)",
                  "ORDER_HOST=\$(echo \$ORDER_SECRET | python3 -c \\"import sys,json; print(json.load(sys.stdin)[\\x27host\\x27])\\")",
                  "ORDER_USER=\$(echo \$ORDER_SECRET | python3 -c \\"import sys,json; print(json.load(sys.stdin)[\\x27username\\x27])\\")",
                  "ORDER_PASS=\$(echo \$ORDER_SECRET | python3 -c \\"import sys,json; print(json.load(sys.stdin)[\\x27password\\x27])\\")",
                  "ORDER_DB=\$(echo \$ORDER_SECRET | python3 -c \\"import sys,json; print(json.load(sys.stdin)[\\x27dbname\\x27])\\")",

                  "# Write init.sql files",
                  "cat > /tmp/user-init.sql << \\'SQLEOF\\'",
                  "${userInitSql}",
                  "SQLEOF",

                  "cat > /tmp/order-init.sql << \\'SQLEOF\\'",
                  "${orderInitSql}",
                  "SQLEOF",

                  "# Run init.sql",
                  "PGPASSWORD=\$USER_PASS psql -h \$USER_HOST -U \$USER_USER -d \$USER_DB -f /tmp/user-init.sql && echo ✅ Users DB initialized",
                  "PGPASSWORD=\$ORDER_PASS psql -h \$ORDER_HOST -U \$ORDER_USER -d \$ORDER_DB -f /tmp/order-init.sql && echo ✅ Orders DB initialized",

                  "echo === DB Init complete ==="
                ]' \
                --query 'Command.CommandId' \
                --output text
            """,
            returnStdout: true
          ).trim()

          // wait for DB init
          sh """
            sleep 20
            STATUS=\$(aws ssm get-command-invocation \
              --command-id ${commandId} \
              --instance-id \$(echo ${instances} | awk '{print \$1}') \
              --region ${region} \
              --query 'Status' \
              --output text)
            echo "DB Init status: \$STATUS"
            if [ "\$STATUS" != "Success" ]; then
              echo "DB Init failed!"
              exit 1
            fi
            echo "✅ DB initialized!"
          """
        }
      }
    }
  }
}
stage('Deploy to EC2') {
  when {
    buildingTag()  // only deploy on git tags!
  }
  agent any
  steps {
    measureStage('Deploy_EC2') {
      withCredentials([[
        $class: 'AmazonWebServicesCredentialsBinding',
        credentialsId: 'aws-ecr-credentials'
      ]]) {
        script {
          def imageTag = env.TAG_NAME
          def ecrRegistry = env.ECR_REGISTRY
          def region = "ap-south-1"
          def project = "micro-dash"
          def userSecret = "${project}/dev/user-service/db"
          def orderSecret = "${project}/dev/order-service/db"

          // Get EC2 instance IDs
          def instances = sh(
            script: """
              aws ec2 describe-instances \
                --region ${region} \
                --filters \
                  "Name=tag:project,Values=${project}" \
                  "Name=instance-state-name,Values=running" \
                --query 'Reservations[*].Instances[*].InstanceId' \
                --output text
            """,
            returnStdout: true
          ).trim()

          if (!instances) {
            error "No running EC2 instances found for project ${project}!"
          }

          echo "Deploying to instances: ${instances}"

          // Send deploy command via SSM
          def commandId = sh(
            script: """
              aws ssm send-command \
                --region ${region} \
                --instance-ids ${instances} \
                --document-name "AWS-RunShellScript" \
                --comment "Deploy ${imageTag}" \
                --parameters 'commands=[
                  "set -e",
                  "echo === Deploy ${imageTag} start \$(date) ===",

                  "# ECR Login",
                  "aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${ecrRegistry}",

                  "# Pull new images",
                  "docker pull ${ecrRegistry}/frontend:${imageTag}",
                  "docker pull ${ecrRegistry}/gateway:${imageTag}",
                  "docker pull ${ecrRegistry}/user-service:${imageTag}",
                  "docker pull ${ecrRegistry}/order-service:${imageTag}",

                  "# Create networks",
                  "docker network create frontend 2>/dev/null || true",
                  "docker network create backend 2>/dev/null || true",

                  "# Stop old containers",
                  "docker stop frontend gateway user-service order-service 2>/dev/null || true",
                  "docker rm frontend gateway user-service order-service 2>/dev/null || true",

                  "# Run user-service",
                  "docker run -d --name user-service --network backend --restart unless-stopped -p 3001:3001 -e DB_SECRET_NAME=${userSecret} -e AWS_REGION=${region} -e PORT=3001 ${ecrRegistry}/user-service:${imageTag}",

                  "# Run order-service",
                  "docker run -d --name order-service --network backend --restart unless-stopped -p 3002:3002 -e DB_SECRET_NAME=${orderSecret} -e AWS_REGION=${region} -e PORT=3002 ${ecrRegistry}/order-service:${imageTag}",

                  "# Run gateway",
                  "docker run -d --name gateway --network backend --restart unless-stopped -p 3000:3000 -e USER_SERVICE_URL=http://user-service:3001 -e ORDER_SERVICE_URL=http://order-service:3002 -e PORT=3000 ${ecrRegistry}/gateway:${imageTag}",
                  "docker network connect frontend gateway",

                  "# Run frontend",
                  "docker run -d --name frontend --network frontend --restart unless-stopped -p 100:80 ${ecrRegistry}/frontend:${imageTag}",

                  "# Health checks",
                  "sleep 15",
                  "curl -f http://localhost:3000/health && echo Gateway OK",
                  "curl -f http://localhost:100 && echo Frontend OK",

                  "echo === Deploy complete \$(date) ==="
                ]' \
                --query 'Command.CommandId' \
                --output text
            """,
            returnStdout: true
          ).trim()

          echo "SSM Command ID: ${commandId}"

          // Wait for command to complete
          sh """
            echo "Waiting for deployment to complete..."
            sleep 30

            STATUS=\$(aws ssm get-command-invocation \
              --command-id ${commandId} \
              --instance-id \$(echo ${instances} | awk '{print \$1}') \
              --region ${region} \
              --query 'Status' \
              --output text)

            echo "Deployment status: \$STATUS"

            if [ "\$STATUS" != "Success" ]; then
              echo "Deployment failed! Check SSM console for details."
              aws ssm get-command-invocation \
                --command-id ${commandId} \
                --instance-id \$(echo ${instances} | awk '{print \$1}') \
                --region ${region} \
                --query 'StandardErrorContent' \
                --output text
              exit 1
            fi

            echo "✅ Deployment successful!"
          """
        }
      }
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

  // ─────────────────────────────────────────────
  // POST: Push final build result + total pipeline duration
  // ─────────────────────────────────────────────
  post {
    success {
      node('') {
        script {
          def totalMs = System.currentTimeMillis() - (env.PIPELINE_START as Long)
          recordMetrics(stage: 'pipeline', result: 'success', durationMs: totalMs)
          echo "Total pipeline duration: ${totalMs / 1000}s"
        }
      }
      emailext(
        subject: "SUCCESS: ${env.JOB_NAME} #${env.BUILD_NUMBER}",
        body:    "Build succeeded!\nURL: ${env.BUILD_URL}",
        to:      "rajeshgovindan777@gmail.com"
      )
    }
    failure {
      node('') {
        script {
          def totalMs = System.currentTimeMillis() - (env.PIPELINE_START as Long)
          recordMetrics(stage: 'pipeline', result: 'failure', durationMs: totalMs)
          echo "Total pipeline duration: ${totalMs / 1000}s"
        }
      }
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