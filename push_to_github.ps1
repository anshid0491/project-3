# GitHub Push Script - Fixed
# This script will fix common errors and push your project to the repository.

Write-Host "Configuring Git Identity (Temporary)..." -ForegroundColor Cyan
# Setting a local name/email just for this repo so the commit works
git config user.email "anshid0491@example.com"
git config user.name "anshid0491"

Write-Host "Initializing Git..." -ForegroundColor Cyan
git init

Write-Host "Adding files..." -ForegroundColor Cyan
git add .

Write-Host "Committing changes..." -ForegroundColor Cyan
git commit -m "Initial commit: Premium Habit Tracker"

Write-Host "Setting remote repository URL..." -ForegroundColor Cyan
# This handles the 'already exists' error by forcing the URL to update
git remote remove origin 2>$null
git remote add origin git@github.com:anshid0491/project-3.git

Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
git branch -M main
git push -u origin main --force

Write-Host "Done! Your code should now be on GitHub." -ForegroundColor Green
pause
