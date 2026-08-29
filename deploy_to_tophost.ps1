# Script di pubblicazione automatica su Tophost FTP
$ftpUser = "acquariopassopasso.it"
$ftpPass = "oR9ToeJp9d"
$ftpHost = "ftp.acquariopassopasso.it"
$localDir = "C:\Users\NB18\.gemini\antigravity\scratch\aquarium-builder"

Write-Host "Inizio caricamento file su Tophost FTP..." -ForegroundColor Cyan

# Upload index.html
curl.exe --ftp-pasv -T "$localDir\index.html" "ftp://$ftpHost/index.html" --user "$ftpUser`:$ftpPass"
Write-Host "Index.html caricato." -ForegroundColor Green

# Upload assets
curl.exe --ftp-pasv -T "$localDir\assets\mascot_logo.jpg" "ftp://$ftpHost/assets/mascot_logo.jpg" --user "$ftpUser`:$ftpPass"
curl.exe --ftp-pasv -T "$localDir\assets\homepage_hero_timeline.jpg" "ftp://$ftpHost/assets/homepage_hero_timeline.jpg" --user "$ftpUser`:$ftpPass"
Write-Host "Assets caricati." -ForegroundColor Green

Write-Host "Pubblicazione su Tophost completata con successo!" -ForegroundColor Green
