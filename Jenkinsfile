pipeline {
    agent any
    environment {
        DOCKER_USER = 'dhruvgothi06'
        IMAGE_NAME = 'dineinnpro-backend'
        RDS_HOSTNAME = 'restaurant-db.cxowmcm285wq.ap-south-1.rds.amazonaws.com'
        DB_NAME = 'postgres'
        VERCEL_URL = 'https://dineinn-pro-backend.onrender.com'
    }
    stages {
        stage('GitHub Repo Check') {
            steps {
                checkout scm
                bat "if not exist server.js (exit 1)"
            }
        }

        stage('Library Check') {
            steps {
                bat "npm install"
            }
        }

        stage('Build & Push Docker') {
            steps {
                script {
                    bat "docker build -t %DOCKER_USER%/%IMAGE_NAME%:latest ."
                    withCredentials([usernamePassword(credentialsId: 'docker-hub-creds', passwordVariable: 'PASS', usernameVariable: 'USER')]) {
                        bat "echo %PASS%| docker login -u %USER% --password-stdin"
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
                bat "curl -s -o /dev/null -I -w %%{http_code} %VERCEL_URL% | findstr 200"
            }
        }

        stage('Deploy to Production') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dineinn-rds-creds', passwordVariable: 'PW', usernameVariable: 'USR')]) {
                    echo "Attempting to clear port 5000 and deploy..."
                    bat """
                        @echo off
                        :: Find PID on port 5000 and kill it if it exists
                        for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000') do (
                            echo Killing process %%a using port 5000...
                            taskkill /f /pid %%a 2>nul
                        )

                        :: Standard Docker cleanup
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