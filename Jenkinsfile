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
              --severity CRITICAL --ignore-unfixed \
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
            anyOf { changeset "**/gateway/**"; buildingTag(); }
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
            anyOf { changeset "**/user-service/**"; buildingTag(); }
          }
          steps {
            Nodequalitycheck('user-service')
          }
        }

        stage('Order Service') {
          when {
            beforeAgent true
            anyOf { changeset "**/order-service/**"; buildingTag(); }
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
            anyOf { changeset "**/frontend/**"; buildingTag(); }
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
          changeset "user-service/**"; changeset "frontend/**";
           buildingTag(); 
        }
      }
      agent any
      environment { SONAR_TOKEN = credentials('sonar-token') }
      steps {
        measureStage('SonarQube_Analysis') {
           script {
       try { 
              unstash name: 'coverage-gateway' 
            } catch (e) { 
              echo "No gateway coverage stash found. Skipping." 
            }
            
            try { 
              unstash name: 'coverage-user-service' 
            } catch (e) { 
              echo "No user-service coverage stash found. Skipping." 
            }
            
            try { 
              unstash name: 'coverage-order-service' 
            } catch (e) { 
              echo "No order-service coverage stash found. Skipping." 
            }
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
          buildingTag();
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
          changeset "user-service/**"; changeset "frontend/**";  buildingTag()
        }
      }
      agent any
      steps {
        script {
          def gitSha = sh(script: "git rev-parse --short HEAD", returnStdout: true).trim()
          
          // Use the Git SHA as the image tag!
          env.IMAGE_TAG = gitSha
          
          echo "Building images with tag: ${env.IMAGE_TAG}"
        }
      }
    }

    // ─────────────────────────────────────────────
    // STAGE 8: Build and Push to Harbor
    // ─────────────────────────────────────────────
    stage('Build and Push Images') {
      parallel {

        stage('Frontend') {
          when { beforeAgent true; anyOf { changeset 'frontend/**'; buildingTag() } }
          agent any
          steps {
            measureStage('Build_Push_frontend') {
              BuildAndPush('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
              sh 'echo "frontend" >> built_services.txt'
            }
            
          }
        }

        stage('Gateway') {
          when { beforeAgent true; anyOf { changeset 'gateway/**'; buildingTag() } }
          agent any
          steps {
            measureStage('Build_Push_gateway') {
              BuildAndPush('gateway', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
              sh 'echo "gateway" >> built_services.txt'
            }
          }
        }

        stage('User Service') {
          when { beforeAgent true; anyOf { changeset 'user-service/**'; buildingTag() } }
          agent any
          steps {
            measureStage('Build_Push_user_service') {
              BuildAndPush('user-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
              sh 'echo "user-service" >> built_services.txt'
            }
          }
        }

        stage('Order Service') {
          when { beforeAgent true; anyOf { changeset 'order-service/**'; buildingTag() } }
          agent any
          steps {
            measureStage('Build_Push_order_service') {
              BuildAndPush('order-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
              sh 'echo "order-service" >> built_services.txt'
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
          when { beforeAgent true; anyOf { changeset 'frontend/**'; buildingTag();  } }
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
          when { beforeAgent true; anyOf { changeset 'frontend/**'; buildingTag();  } }
          agent any
          steps {
            measureStage('SBOM_frontend') {
              generateSbom('frontend', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('Gateway') {
          when { beforeAgent true; anyOf { changeset 'gateway/**'; buildingTag(); } }
          agent any
          steps {
            measureStage('SBOM_gateway') {
              generateSbom('gateway', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('User Service') {
          when { beforeAgent true; anyOf { changeset 'user-service/**'; buildingTag();  } }
          agent any
          steps {
            measureStage('SBOM_user_service') {
              generateSbom('user-service', env.HARBOR_REGISTRY, env.HARBOR_PROJECT)
            }
          }
        }

        stage('Order Service') {
          when { beforeAgent true; anyOf { changeset 'order-service/**'; buildingTag();  } }
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
    stage('Promote Images') {
        parallel {
          stage('Promote Frontend') {
            when { beforeAgent true
              anyOf { changeset 'frontend/**'
                      buildingTag()
                       } }
            agent any
            steps {
              measureStage('Promote_frontend') {
                PromoteImage('frontend',
                  env.HARBOR_REGISTRY,
                  env.HARBOR_PROJECT,
                  env.ECR_REGISTRY)
              }
            }
          }
          stage('Promote Gateway') {
            when { beforeAgent true
              anyOf { changeset 'gateway/**'
                      buildingTag() } }
            agent any
            steps {
              measureStage('Promote_gateway') {
                PromoteImage('gateway',
                  env.HARBOR_REGISTRY,
                  env.HARBOR_PROJECT,
                  env.ECR_REGISTRY)
              }
            }
          }
          stage('Promote User Service') {
            when { beforeAgent true
              anyOf { changeset 'user-service/**'
                      buildingTag() } }
            agent any
            steps {
              measureStage('Promote_user_service') {
                PromoteImage('user-service',
                  env.HARBOR_REGISTRY,
                  env.HARBOR_PROJECT,
                  env.ECR_REGISTRY)
              }
            }
          }
            stage('Promote Order Service') {
              when { beforeAgent true
                anyOf { changeset 'order-service/**'
                        buildingTag() } }
              agent any
              steps {
                measureStage('Promote_order_service') {
                  PromoteImage('order-service',
                    env.HARBOR_REGISTRY,
                    env.HARBOR_PROJECT,
                    env.ECR_REGISTRY)
                }
              }
            }
          }
        }

    // ─────────────────────────────────────────────
    // STAGE 13: Promote Harbor → ECR
    // ─────────────────────────────────────────────
   stage('Sign Images') {
      parallel {
        stage('Sign Frontend') {
          when { beforeAgent true
            anyOf { changeset 'frontend/**'
                    buildingTag()
                     } }
          agent any
          steps {
            measureStage('Sign_frontend') {
              SignImage('frontend', env.ECR_REGISTRY)
            }
          }
        }
        stage('Sign Gateway') {
          when { beforeAgent true
            anyOf { changeset 'gateway/**'
                    buildingTag() } }
          agent any
          steps {
            measureStage('Sign_gateway') {
              SignImage('gateway', env.ECR_REGISTRY)
            }
          }
        }
        stage('Sign User Service') {
          when { beforeAgent true
            anyOf { changeset 'user-service/**'
                    buildingTag() } }
          agent any
          steps {
            measureStage('Sign_user_service') {
              SignImage('user-service', env.ECR_REGISTRY)
            }
          }
        }
        stage('Sign Order Service') {
          when { beforeAgent true
            anyOf { changeset 'order-service/**'
                    buildingTag() } }
          agent any
          steps {
            measureStage('Sign_order_service') {
              SignImage('order-service', env.ECR_REGISTRY)
            }
          }
        }
      }
    }
// ─────────────────────────────────────────────
    // STAGE 14: Init Database
    // ─────────────────────────────────────────────
    // stage('Init Database') {
    //   when { buildingTag() }
    //   agent any
    //   steps {
    //     measureStage('Init_Database') {
    //       withCredentials([[
    //         $class: 'AmazonWebServicesCredentialsBinding',
    //         credentialsId: 'aws-ecr-credentials'
    //       ]]) {
    //         script {
    //           def region = "ap-south-1"
    //           def project = "micro-dash"

    //           def instances = sh(
    //             script: """
    //               aws ec2 describe-instances \
    //                 --region ${region} \
    //                 --filters \
    //                   "Name=tag:Role,Values=app-server" \
    //                   "Name=tag:aws:autoscaling:groupName,Values=${project}-dev-asg" \
    //                   "Name=instance-state-name,Values=running" \
    //                 --query 'Reservations[*].Instances[*].InstanceId' \
    //                 --output text
    //             """,
    //             returnStdout: true
    //           ).trim()

    //           if (!instances) { error "No running EC2 instances found!" }

    //           def firstInstance = instances.split('\\s+')[0]
    //           echo "Initializing DB on: ${firstInstance}"

    //           def commandId = sh(
    //             script: """
    //               aws ssm send-command \
    //                 --region ${region} \
    //                 --instance-ids ${firstInstance} \
    //                 --document-name "AWS-RunShellScript" \
    //                 --parameters 'commands=["aws ssm get-parameter --name /micro-dash/scripts/db-init --region ${region} --query Parameter.Value --output text > /tmp/db-init.sh && chmod +x /tmp/db-init.sh && bash /tmp/db-init.sh"]' \
    //                 --query 'Command.CommandId' \
    //                 --output text
    //             """,
    //             returnStdout: true
    //           ).trim()

    //           echo "SSM Command ID: ${commandId}"

    //           sh """
    //             echo "Waiting for DB init..."
    //             sleep 15

    //             STATUS=\$(aws ssm get-command-invocation \
    //               --command-id ${commandId} \
    //               --instance-id ${firstInstance} \
    //               --region ${region} \
    //               --query 'Status' \
    //               --output text)

    //             echo "DB Init status: \$STATUS"

    //             if [ "\$STATUS" != "Success" ]; then
    //               echo "DB Init failed! Error:"
    //               aws ssm get-command-invocation \
    //                 --command-id ${commandId} \
    //                 --instance-id ${firstInstance} \
    //                 --region ${region} \
    //                 --query 'StandardErrorContent' \
    //                 --output text
    //               exit 1
    //             fi
    //             echo "✅ DB initialized!"
    //           """
    //         }
    //       }
    //     }
    //   }
    // }

    // ─────────────────────────────────────────────
    // STAGE 15: Deploy to EC2
    // ─────────────────────────────────────────────
 //  stage('Deploy to EC2') {
    //     when { buildingTag() }
    //     agent any
    //     steps {
    //       measureStage('Deploy_EC2') {
    //         withCredentials([[
    //           $class: 'AmazonWebServicesCredentialsBinding',
    //           credentialsId: 'aws-ecr-credentials'
    //         ]]) {
    //           script {
    //             def imageTag = env.TAG_NAME
    //             def region = "ap-south-1"
    //             def project = "micro-dash"

    //             // get first instance from ASG for status check
    //             def firstInstance = sh(
    //               script: """
    //                 aws autoscaling describe-auto-scaling-groups \
    //                   --auto-scaling-group-names ${project}-dev-asg \
    //                   --region ${region} \
    //                   --query 'AutoScalingGroups[0].Instances[0].InstanceId' \
    //                   --output text
    //               """,
    //               returnStdout: true
    //             ).trim()

    //             if (!firstInstance || firstInstance == 'None') {
    //               error "No running EC2 instances found in ASG!"
    //             }

    //             echo "Deploying ${imageTag} to ASG: ${project}-dev-asg"
    //             echo "Status check instance: ${firstInstance}"

    //             // use --targets to deploy to ALL ASG instances
    //             def commandId = sh(
    //               script: """
    //                 aws ssm send-command \
    //                   --region ${region} \
    //                   --targets "Key=tag:aws:autoscaling:groupName,Values=${project}-dev-asg" \
    //                   --document-name "AWS-RunShellScript" \
    //                   --parameters 'commands=["aws ssm get-parameter --name /micro-dash/scripts/deploy --region ${region} --query Parameter.Value --output text > /tmp/deploy.sh && chmod +x /tmp/deploy.sh && bash /tmp/deploy.sh ${imageTag}"]' \
    //                   --query 'Command.CommandId' \
    //                   --output text
    //               """,
    //               returnStdout: true
    //             ).trim()

    //             echo "SSM Command ID: ${commandId}"

    //             sh """
    //               echo "Waiting for deployment..."
    //               sleep 60

    //               STATUS=\$(aws ssm get-command-invocation \
    //                 --command-id ${commandId} \
    //                 --instance-id ${firstInstance} \
    //                 --region ${region} \
    //                 --query 'Status' \
    //                 --output text)

    //               echo "Deploy status: \$STATUS"

    //               if [ "\$STATUS" != "Success" ]; then
    //                 echo "Deploy failed! Error:"
    //                 aws ssm get-command-invocation \
    //                   --command-id ${commandId} \
    //                   --instance-id ${firstInstance} \
    //                   --region ${region} \
    //                   --query 'StandardErrorContent' \
    //                   --output text
    //                 exit 1
    //               fi
    //               echo "✅ Deployment successful!"
    //             """
    //           }
    //         }
    //       }
    //     }
    //   }

  stage('update gitops manifests') {
      when {
        beforeAgent true 
        anyOf { branch 'main'; buildingTag() }
      }
      agent any 
      steps {
        withCredentials([usernamePassword(credentialsId: 'github-gitops-token', passwordVariable: 'GIT_PASSWORD', usernameVariable: 'GIT_USERNAME')]){
        sh """
          # 1. Safety check: Did we actually build any images?
          if [ ! -f built_services.txt ]; then
            echo "No services built in this run. Skipping GitOps update."
            exit 0
          fi

          git config --global user.email "jenkins@micro-dash.com"
          git config --global user.name "jenkins CI"

          # 2. FIX: Delete the leftover folder from previous failed builds
          rm -rf devops-1-k8-agrocd

          # 3. FIX: Removed > /dev/null so we can read the errors!
          git clone https://\${GIT_USERNAME}:\${GIT_PASSWORD}@github.com/rajesh20032003/devops-1-k8-agrocd.git
          
          cd devops-1-k8-agrocd
          
          for SERVICE in \$(cat ../built_services.txt | sort -u); do
            echo "Updating YAML for \$SERVICE to tag ${env.IMAGE_TAG}..."
            
            docker run --rm \
              --volumes-from \$(cat /etc/hostname) \
              -w \$(pwd) \
              mikefarah/yq -i ".\$SERVICE.Tag = \\"${env.IMAGE_TAG}\\"" values.yaml
          done

          git add values.yaml
          git commit -m "ci: deploy ${env.IMAGE_TAG} for \$(cat ../built_services.txt | tr '\\n' ' ')"
          git push origin HEAD:main 
        """
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
      // ─────────────────────────────────────────
      // Trigger ECS CD pipeline after successful CI!
      // Only triggers on tags or main branch
      // wait: false = CI doesn't wait for CD to finish
      // ─────────────────────────────────────────
      // node('') {
      //   script {
      //     def deployTag = env.TAG_NAME ?: "dev-${env.BUILD_NUMBER}"
      //     echo "CI succeeded! Triggering ECS CD: ${deployTag}"
      //     build(
      //       job: 'micro-dash-ecs-cd',
      //       parameters: [
      //         string(name: 'IMAGE_TAG', value: deployTag),
      //         booleanParam(name: 'INIT_DB', value: false)
      //       ],
      //       wait: false
      //       // wait: false = fire and forget!
      //       // CI pipeline finishes immediately
      //       // CD runs independently! ✅
      //     )
      //     echo "✅ ECS CD triggered!"
      //   }
      // }
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