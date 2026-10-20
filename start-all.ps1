# Sobe os 4 processos do mapa sem Docker: Postgres portatil, api, sync-job,
# frontend. Pensado pro Agendador de Tarefas (ver README/handoff), mas
# tambem roda manual: powershell -ExecutionPolicy Bypass -File start-all.ps1
#
# AJUSTE OS 4 CAMINHOS ABAIXO PRA MAQUINA ONDE ESTA RODANDO.

$ProjectRoot = "C:\projects\mapa-ambulancias-aviao"
$PostgresBin = "C:\postgresql\bin"
$PgData = "C:\projects\mapa-ambulancias-aviao\pgdata"
# Raiz do Command Center (motor e tela). Precisa ter start-motor.bat e start-tela.bat
# (branch feat/mapa-ambulancias-led do Command_Center_Total_Care).
$CommandCenterRoot = "C:\projects\Command_Center_Total_Care"

# --- Postgres ---
$pgStatus = & "$PostgresBin\pg_ctl.exe" -D $PgData status
if ($LASTEXITCODE -ne 0) {
    Write-Host "Subindo Postgres..."
    & "$PostgresBin\pg_ctl.exe" -D $PgData -l "$PgData\log.txt" start
    Start-Sleep -Seconds 3
} else {
    Write-Host "Postgres ja estava rodando."
}

# --- api ---
Write-Host "Subindo api..."
Start-Process "$ProjectRoot\api\start.bat" -WindowStyle Minimized

# --- sync-job ---
# Le as credenciais do Power Automate de sync-job\start.ps1 (fora do git,
# nunca commitado -- ver handoff sobre nao subir essas URLs pro GitHub).
Write-Host "Subindo sync-job..."
Start-Process powershell -ArgumentList @(
    "-ExecutionPolicy", "Bypass",
    "-File", "$ProjectRoot\sync-job\start.ps1"
) -WindowStyle Minimized

# --- frontend ---
Write-Host "Subindo frontend..."
Start-Process "$ProjectRoot\frontend\start.bat" -WindowStyle Minimized

# --- Command Center (motor e tela) ---
# Depois do mapa: o motor busca as ambulancias na api (porta 3000) e a tela aponta para o mapa (3010).
if ((Test-Path "$CommandCenterRoot\start-motor.bat") -and (Test-Path "$CommandCenterRoot\start-tela.bat")) {
    Write-Host "Subindo motor do Command Center..."
    Start-Process "$CommandCenterRoot\start-motor.bat" -WindowStyle Minimized

    Write-Host "Subindo tela do Command Center..."
    Start-Process "$CommandCenterRoot\start-tela.bat" -WindowStyle Minimized
} else {
    Write-Host "Command Center nao iniciado: start-motor.bat/start-tela.bat nao encontrados em $CommandCenterRoot (git pull na feat/mapa-ambulancias-led)."
}

Write-Host "Tudo no ar. Mapa em http://localhost:3010"
