pipeline {
    agent any
    environment {
        DOCKER_USER = 'dhruvgothi06'
        IMAGE_NAME = 'dineinnpro-backend'
        // GET THIS FROM AWS RDS CONSOLE
        RDS_HOSTNAME = 'restaurant-db.cxowmcm285wq.ap-south-1.rds.amazonaws.com'
        DB_NAME = 'postgres' 
    }
    stages {
        stage('Build & Push') {
            steps {
                script {
                    // '.' means it looks for the Dockerfile in the repo root
                    sh "docker build -t ${DOCKER_USER}/${IMAGE_NAME}:latest ."
                    withCredentials([usernamePassword(credentialsId: 'docker-hub-creds', passwordVariable: 'PASS', usernameVariable: 'USER')]) {
                        sh "echo $PASS | docker login -u $USER --password-stdin"
                        sh "docker push ${DOCKER_USER}/${IMAGE_NAME}:latest"
                    }
                }
            }
        }
        stage('Deploy') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dineinn-rds-creds', passwordVariable: 'PW', usernameVariable: 'USR')]) {
                    sh """
                        docker pull ${DOCKER_USER}/${IMAGE_NAME}:latest
                        docker stop ${IMAGE_NAME} || true
                        docker rm ${IMAGE_NAME} || true
                        docker run -d --name ${IMAGE_NAME} \
                        -p 5000:5000 \
                        -e DATABASE_URL=postgresql://${USR}:${PW}@${RDS_HOSTNAME}:5432/${DB_NAME} \
                        -e PORT=5000 \
                        ${DOCKER_USER}/${IMAGE_NAME}:latest
                    """
                }
            }
        }
    }
}