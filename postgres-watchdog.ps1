# Confere o Postgres portatil a cada 60s e sobe de novo sozinho se cair.
# Nao resolve a causa raiz (log do Postgres apontou interferencia de
# antivirus/backup no I/O -- pedir exceção de antivirus pra pasta pgdata
# pro TI e o fix de verdade) -- isso aqui so limita o tempo fora do ar.
#
# AJUSTE os 2 caminhos abaixo pra maquina onde esta rodando.
$PostgresBin = "C:\postgresql\bin"
$PgData = "C:\projects\mapa-ambulancias-aviao\pgdata"

$CheckIntervalSeconds = 60
$WatchdogLog = Join-Path $PgData "watchdog.log"

function Write-WatchdogLog($message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $message"
    Add-Content -Path $WatchdogLog -Value $line
    Write-Host $line
}

Write-WatchdogLog "watchdog iniciado (verificando a cada ${CheckIntervalSeconds}s)"

while ($true) {
    & "$PostgresBin\pg_ctl.exe" -D $PgData status | Out-Null
    $isDown = ($LASTEXITCODE -ne 0)

    if ($isDown) {
        Write-WatchdogLog "Postgres fora do ar -- subindo de novo"
        & "$PostgresBin\pg_ctl.exe" -D $PgData -l (Join-Path $PgData "log.txt") start | Out-Null
        Start-Sleep -Seconds 5
        & "$PostgresBin\pg_ctl.exe" -D $PgData status | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-WatchdogLog "Postgres voltou ao ar"
        } else {
            Write-WatchdogLog "Falha ao subir o Postgres -- tentando de novo no proximo ciclo"
        }
    }

    Start-Sleep -Seconds $CheckIntervalSeconds
}
