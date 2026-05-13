# Seeds sensors into the OAM service.
#
# Default targets the dev port published by docker-compose.override.yaml
# (oam-service on host:8084). Override via -OamBaseUrl for staging/prod:
#   .\scripts\seed-sensors.ps1 -OamBaseUrl https://oam.voltguard.pt
#
# Pass -BearerToken <jwt> if OAM has auth enabled.
# Pass -SensorsFile <path.json> to use a custom list (top-level array of {name, district}).

param(
  [string]$OamBaseUrl  = "http://localhost:8084",
  [string]$BearerToken = "",
  [string]$SensorsFile = ""
)

$ErrorActionPreference = "Stop"

# Built-in defaults — covers all 16 mainland districts the PortugalMap renders,
# with 2-4 sensors per district weighted toward urban centres. Edit this list
# or override with -SensorsFile.
$DefaultSensors = @(
  @{ name = "Lisboa-01";    district = "Lisboa"           }
  @{ name = "Lisboa-02";    district = "Lisboa"           }
  @{ name = "Lisboa-03";    district = "Lisboa"           }
  @{ name = "Lisboa-04";    district = "Lisboa"           }
  @{ name = "Porto-01";     district = "Porto"            }
  @{ name = "Porto-02";     district = "Porto"            }
  @{ name = "Porto-03";     district = "Porto"            }
  @{ name = "Porto-04";     district = "Porto"            }
  @{ name = "Setubal-01";   district = "Setúbal"          }
  @{ name = "Setubal-02";   district = "Setúbal"          }
  @{ name = "Setubal-03";   district = "Setúbal"          }
  @{ name = "Faro-01";      district = "Faro"             }
  @{ name = "Faro-02";      district = "Faro"             }
  @{ name = "Faro-03";      district = "Faro"             }
  @{ name = "Coimbra-01";   district = "Coimbra"          }
  @{ name = "Coimbra-02";   district = "Coimbra"          }
  @{ name = "Coimbra-03";   district = "Coimbra"          }
  @{ name = "Aveiro-01";    district = "Aveiro"           }
  @{ name = "Aveiro-02";    district = "Aveiro"           }
  @{ name = "Aveiro-03";    district = "Aveiro"           }
  @{ name = "Braga-01";     district = "Braga"            }
  @{ name = "Braga-02";     district = "Braga"            }
  @{ name = "Braga-03";     district = "Braga"            }
  @{ name = "Leiria-01";    district = "Leiria"           }
  @{ name = "Leiria-02";    district = "Leiria"           }
  @{ name = "Leiria-03";    district = "Leiria"           }
  @{ name = "Beja-01";      district = "Beja"             }
  @{ name = "Beja-02";      district = "Beja"             }
  @{ name = "Braganca-01";  district = "Bragança"         }
  @{ name = "Braganca-02";  district = "Bragança"         }
  @{ name = "Evora-01";     district = "Évora"            }
  @{ name = "Evora-02";     district = "Évora"            }
  @{ name = "Guarda-01";    district = "Guarda"           }
  @{ name = "Guarda-02";    district = "Guarda"           }
  @{ name = "Portalegre-01"; district = "Portalegre"      }
  @{ name = "Portalegre-02"; district = "Portalegre"      }
  @{ name = "Santarem-01";  district = "Santarém"         }
  @{ name = "Santarem-02";  district = "Santarém"         }
  @{ name = "Viana-01";     district = "Viana do Castelo" }
  @{ name = "Viana-02";     district = "Viana do Castelo" }
  @{ name = "Viseu-01";     district = "Viseu"            }
  @{ name = "Viseu-02";     district = "Viseu"            }
)

if ($SensorsFile -and (Test-Path $SensorsFile)) {
  $Sensors = Get-Content -Raw $SensorsFile | ConvertFrom-Json
} else {
  $Sensors = $DefaultSensors
}

Write-Host "Seeding $($Sensors.Count) sensor(s) into $OamBaseUrl ..." -ForegroundColor Cyan

$Headers = @{ "Content-Type" = "application/json" }
if ($BearerToken) { $Headers["Authorization"] = "Bearer $BearerToken" }

# Fetch existing sensor names for idempotent skip.
$ExistingNames = @()
try {
  $resp = Invoke-RestMethod -Method Get -Uri "$OamBaseUrl/sensors" -Headers $Headers
  if ($resp -is [array])      { $items = $resp }
  elseif ($resp.items)        { $items = $resp.items }
  elseif ($resp.data)         { $items = $resp.data }
  else                        { $items = @() }
  $ExistingNames = $items | ForEach-Object { $_.name }
} catch {
  Write-Warning "Could not list existing sensors: $($_.Exception.Message)"
}

$Created = 0
$Skipped = 0
$Failed  = 0

foreach ($s in $Sensors) {
  if ($ExistingNames -contains $s.name) {
    Write-Host "  skip: $($s.name) (already exists)" -ForegroundColor DarkGray
    $Skipped++
    continue
  }

  $body = $s | ConvertTo-Json -Compress
  try {
    $resp = Invoke-RestMethod -Method Post -Uri "$OamBaseUrl/sensors" -Headers $Headers -Body $body
    Write-Host "  ✓ $($s.name)  →  id=$($resp.id)" -ForegroundColor Green
    $Created++
  } catch {
    $detail = $_.ErrorDetails.Message
    Write-Host "  ✗ $($s.name)  →  $($_.Exception.Message) $detail" -ForegroundColor Red
    $Failed++
  }
}

Write-Host ""
Write-Host "Done — created: $Created, skipped: $Skipped, failed: $Failed"
if ($Failed -gt 0) { exit 1 }
