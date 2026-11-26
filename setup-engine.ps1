param([switch]$Netlify)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$cache = Join-Path $root '.downloads'
$engine = Join-Path $root 'engine'

function Verify-Hash($path, $sha256) {
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $sha256) {
        throw "SHA-256 mismatch: $path"
    }
}

if (-not (Test-Path -LiteralPath (Join-Path $engine 'Pikafish-Windows-x86-64-universal.exe')) -or
    -not (Test-Path -LiteralPath (Join-Path $engine 'pikafish.nnue')) -or
    ($Netlify -and -not (Test-Path -LiteralPath (Join-Path $engine 'Pikafish-Linux-x86-64-universal')))) {
    New-Item -ItemType Directory -Force -Path $cache,$engine | Out-Null
    $archive = Join-Path $root 'Pikafish.7z'
    if (-not (Test-Path -LiteralPath $archive)) {
        $archive = Join-Path $cache 'Pikafish-2026-09-06.7z'
        if (-not (Test-Path -LiteralPath $archive)) {
            $source = 'https://github.com/official-pikafish/Pikafish/releases/download/Pikafish-2026-09-06/Pikafish.2026-09-06.7z'
            Invoke-WebRequest -Uri $source -OutFile "$archive.part"
            Verify-Hash "$archive.part" '41952BBFE2520FACEB5902C69E6AB4845CC999841D2B49A95CC1BE7867A25E5B'
            Move-Item -LiteralPath "$archive.part" -Destination $archive
        }
    }
    Verify-Hash $archive '41952BBFE2520FACEB5902C69E6AB4845CC999841D2B49A95CC1BE7867A25E5B'
    $entries = @('Pikafish-Windows-x86-64-universal.exe','Pikafish-Linux-x86-64-universal','pikafish.nnue','Copying.txt','NNUE-License.md','AUTHORS')
    tar -xf $archive -C $engine @entries
    if ($LASTEXITCODE -ne 0) { throw 'Pikafish archive extraction failed.' }
}

if ($Netlify) {
    $runtime = Join-Path $root 'deploy-netlify/runtime/libc6.deb'
    $hash = 'D821B41FC59CB4978ECD53BC83E5C964AC15D305C8D2AC4C8A35AEBE55010FB9'
    if (-not (Test-Path -LiteralPath $runtime)) {
        $file = 'pool/main/g/glibc/libc6_2.39-0ubuntu8.12_amd64.deb'
        $mirrors = @('https://old-releases.ubuntu.com/ubuntu/', 'https://archive.ubuntu.com/ubuntu/', 'https://mirrors.aliyun.com/ubuntu/')
        foreach ($mirror in $mirrors) {
            try {
                Invoke-WebRequest -Uri ($mirror + $file) -OutFile "$runtime.part" -TimeoutSec 20
                Verify-Hash "$runtime.part" $hash
                Move-Item -LiteralPath "$runtime.part" -Destination $runtime
                break
            } catch {
                Write-Warning "Runtime could not be retrieved from $mirror"
            }
        }
    }
    Verify-Hash $runtime $hash
}
Write-Output 'Pikafish is ready.'
