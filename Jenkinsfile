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
                // This uses curl to check if the Vercel URL returns a 200 OK status
                // Note: Windows 10/11 includes curl by default
                bat "curl -s -o /dev/null -I -w \"%%{http_code}\" %VERCEL_URL% > status.txt"
                script {
                    def status = readFile('status.txt').trim()
                    if (status == "200" || status == "404") { // 404 is okay if you don't have a '/' route
                        echo "Vercel is reachable. Status: ${status}"
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