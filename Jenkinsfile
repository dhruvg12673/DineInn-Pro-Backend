pipeline {
    agent any
    environment {
        DOCKER_USER = 'dhruvgothi06'
        IMAGE_NAME = 'dineinnpro-backend'
        RDS_HOSTNAME = 'restaurant-db.cxowmcm285wq.ap-south-1.rds.amazonaws.com'
        DB_NAME = 'postgres'
        VERCEL_URL = 'https://dineinn-pro-backend.onrender.com' // Replace with your actual Vercel link
    }
    stages {
        stage('GitHub Repo Check') {
            steps {
                echo "Verifying Repository Connection..."
                checkout scm
                // Check if server.js exists in the workspace
                bat "if not exist server.js (echo 'Error: server.js not found' && exit 1)"
            }
        }

        stage('Library Check') {
            steps {
                echo "Checking if Node.js and dependencies are valid..."
                bat "node -v"
                bat "npm -v"
                // This checks if package.json exists and installs libs to verify they work
                bat "npm install" 
            }
        }

        stage('Build & Push Docker') {
            steps {
                script {
                    echo "Creating Docker Image..."
                    bat "docker build -t %DOCKER_USER%/%IMAGE_NAME%:latest ."
                    
                    withCredentials([usernamePassword(credentialsId: 'docker-hub-creds', passwordVariable: 'PASS', usernameVariable: 'USER')]) {
                        bat "echo %PASS% | docker login -u %USER% --password-stdin"
                        bat "docker push %DOCKER_USER%/%IMAGE_NAME%:latest"
                    }
                }
            }
        }

        stage('Vercel Health Check') {
            steps {
                echo "Verifying Vercel Deployment Health..."
                // Fix: Use double %% for Windows and remove the redirect to status.txt inside the command
                script {
                    // We run the command and capture the output directly into a variable
                    def status = bat(script: "curl -s -o /dev/null -I -w %%{http_code} ${VERCEL_URL}", returnStdout: true).trim()
                    
                    // Jenkins bat output usually includes the command itself, so we split it to get just the code
                    status = status.split("\r?\n")[-1] 
                    
                    echo "Vercel Response Code: ${status}"
                    
                    if (status == "200" || status == "404" || status == "301" || status == "308") {
                        echo "Vercel/Render is reachable."
                    } else {
                        error "Vercel health check failed with status: ${status}"
                    }
                }
            }
        }

        stage('Deploy to Production') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dineinn-rds-creds', passwordVariable: 'PW', usernameVariable: 'USR')]) {
                    echo "Deploying to local container..."
                    bat """
                        docker pull %DOCKER_USER%/%IMAGE_NAME%:latest
                        docker stop %IMAGE_NAME% || true
                        docker rm %IMAGE_NAME% || true
                        docker run -d --name %IMAGE_NAME% -p 5000:5000 ^
                        -e DATABASE_URL=postgresql://%USR%:%PW%@%RDS_HOSTNAME%:5432/%DB_NAME% ^
                        %DOCKER_USER%/%IMAGE_NAME%:latest
                    """
                }
            }
        }
    }
}