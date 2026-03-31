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

        stage('Database Online Check') {
            steps {
                echo "Checking if AWS RDS is reachable..."
                // This attempts to connect to the port 5432 using PowerShell
                bat "powershell Test-NetConnection %RDS_HOSTNAME% -Port 5432"
            }
        }

        stage('Backend Deployment Health Check') {
            steps {
                echo "Verifying Backend Deployment Health..."
                script {
                    /* Explanation:
                       1. %%{http_code} -> Double '%' is required to escape the character in Windows Batch.
                       2. | findstr 200 -> This looks for '200' in the curl output.
                       3. If '200' is not found, findstr returns a non-zero exit code, 
                          which automatically fails the Jenkins stage.
                    */
                    bat "curl -s -o /dev/null -I -w %%{http_code} ${VERCEL_URL} | findstr 200"
                }
            }
        }

        stage('Deploy to Production') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dineinn-rds-creds', passwordVariable: 'PW', usernameVariable: 'USR')]) {
                    echo "Deploying to local container..."
                    bat """
                        @echo off
                        echo Cleaning up old containers...
                        docker stop %IMAGE_NAME% >nul 2>&1 || ver >nul
                        docker rm %IMAGE_NAME% >nul 2>&1 || ver >nul
                        
                        echo Starting new container...
                        docker run -d --name %IMAGE_NAME% -p 5000:5000 ^
                        -e DATABASE_URL=postgresql://%USR%:%PW%@%RDS_HOSTNAME%:5432/%DB_NAME% ^
                        %DOCKER_USER%/%IMAGE_NAME%:latest
                    """
                }
            }
        }
    }
}