$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$destination = Join-Path $repoRoot 'public/asl-samples/studio-galt'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$repository = 'StudioGalt/Sign-Language-Mocap-Archive'
function Read-Json($url) {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 45
  $content = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { $response.Content }
  return ($content | ConvertFrom-Json)
}
$commit = (Read-Json "https://api.github.com/repos/$repository/commits/main").sha
$raw = "https://raw.githubusercontent.com/$repository/$commit"
$catalog = Read-Json "$raw/catalog/catalog.json"
$selection = @('Hello', 'Please', 'Bye', 'Book 2', 'Apple 1', 'Baby', 'Bad', 'Blue Color')
$manifest = @()
foreach ($name in $selection) {
  $entry = @($catalog | Where-Object { $_.name -eq $name -and $_.status -eq 'current' })[0]
  if (!$entry) { throw "Missing catalog entry: $name" }
  $folder = $entry.folder
  $animationFolder = switch ($entry.layout) {
    'v1' { $folder }
    'v2' { "$folder/FBX Files" }
    'v3' { "$folder/FBX Files/Game Ready" }
    default { "$folder/FBX Files/Mixamo" }
  }
  $apiPath = [uri]::EscapeUriString($animationFolder)
  $files = Read-Json "https://api.github.com/repos/$repository/contents/${apiPath}?ref=$commit"
  $file = @($files | Where-Object { $_.name -match '(No Mesh Mixamo|Mixamo TPose)\.fbx$' })[0]
  if (!$file) { throw "No Mixamo FBX found for $name" }
  if ($file.size -gt 20MB) { throw "Unexpected sample size: $($file.size)" }
  $slug = ($name.ToLower() -replace '[^a-z0-9]+','-')
  $target = Join-Path $destination "$slug.fbx"
  if (!(Test-Path -LiteralPath $target)) {
    Invoke-WebRequest -UseBasicParsing -Uri $file.download_url -OutFile $target -TimeoutSec 90
  }
  $bytes = [IO.File]::ReadAllBytes($target)
  if ($bytes.Length -ne $file.size -or [Text.Encoding]::ASCII.GetString($bytes,0,[Math]::Min(20,$bytes.Length)) -notlike 'Kaydara FBX Binary*') {
    throw "Invalid FBX payload: $target"
  }
  $manifest += [pscustomobject]@{
    name = $name; language = 'asl'; file = "$slug.fbx"; bytes = $bytes.Length
    sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLower()
    source = $file.download_url; sourceFolder = $folder; sourceCommit = $commit
    license = 'CC0-1.0'; author = 'Studio Galt'; sourceDate = $entry.date
    facialAnimation = $entry.facial_animation; locallyReviewed = $false
  }
  Write-Output "Downloaded $name ($($bytes.Length) bytes)"
}
foreach ($name in @('LICENSE','README.md')) {
  $target = Join-Path $destination "UPSTREAM-$name"
  if (!(Test-Path -LiteralPath $target)) { Invoke-WebRequest -UseBasicParsing -Uri "$raw/$name" -OutFile $target -TimeoutSec 30 }
}
$json = ConvertTo-Json -InputObject $manifest -Depth 6
[IO.File]::WriteAllText((Join-Path $destination 'manifest.json'), $json, [Text.UTF8Encoding]::new($false))
Write-Output "Saved $($manifest.Count) samples to $destination"
