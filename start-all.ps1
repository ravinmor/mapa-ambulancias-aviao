# Sobe os 4 processos do mapa sem Docker: Postgres portatil, api, sync-job,
# frontend. Pensado pro Agendador de Tarefas (ver README/handoff), mas
# tambem roda manual: powershell -ExecutionPolicy Bypass -File start-all.ps1
#
# AJUSTE OS 3 CAMINHOS ABAIXO PRA MAQUINA ONDE ESTA RODANDO.

$ProjectRoot = "C:\projects\mapa-ambulancias-aviao"
$PostgresBin = "C:\postgresql\bin"
$PgData = "C:\projects\mapa-ambulancias-aviao\pgdata"

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

Write-Host "Tudo no ar. Mapa em http://localhost:3010"
