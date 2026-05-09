$port = 8787
Write-Host "PowerBuilder docs: http://127.0.0.1:$port/"
Set-Location $PSScriptRoot
node .\server.js $port
