param(
  [string]$ProjectUrl = $env:ENPAL_PROJECT_URL,
  [string]$Message = "EnPal Playwright smoke. Reply only OK.",
  [int]$Port = 9222
)

$ErrorActionPreference = "Stop"

function Test-CdpPort {
  param([int]$Port)

  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $task = $client.ConnectAsync("127.0.0.1", $Port)

    if (-not $task.Wait(750)) {
      $client.Dispose()
      return $false
    }

    $connected = $client.Connected
    $client.Dispose()
    return $connected
  } catch {
    return $false
  }
}

function Resolve-Chrome {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  throw "Google Chrome was not found in the standard Windows install locations."
}

if ([string]::IsNullOrWhiteSpace($ProjectUrl)) {
  throw "Missing Project URL. Set ENPAL_PROJECT_URL or pass -ProjectUrl."
}

if (-not (Test-CdpPort -Port $Port)) {
  $chrome = Resolve-Chrome
  $profile = Join-Path $env:USERPROFILE "EnpalChromeProfile"

  Write-Host "[bootstrap] Starting dedicated EnPal Chrome on port $Port..."

  Start-Process -FilePath $chrome -ArgumentList @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$profile",
    "about:blank"
  )

  $deadline = [DateTime]::UtcNow.AddSeconds(20)

  do {
    Start-Sleep -Milliseconds 250

    if (Test-CdpPort -Port $Port) {
      break
    }
  } while ([DateTime]::UtcNow -lt $deadline)

  if (-not (Test-CdpPort -Port $Port)) {
    throw "Chrome started but CDP port $Port did not become available within 20 seconds."
  }

  Write-Host "[bootstrap] Chrome CDP is ready."
} else {
  Write-Host "[bootstrap] Reusing existing EnPal Chrome on port $Port."
}

$env:ENPAL_CDP_ENDPOINT = "http://127.0.0.1:$Port"
$env:ENPAL_PROJECT_URL = $ProjectUrl

Write-Host "[bootstrap] Starting EnPal live smoke..."
& node "playwright/smoke-start.js" $Message

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
