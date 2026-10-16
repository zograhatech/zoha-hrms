<#
================================================================================
Zograha HRMS - Idle Auto Clock-Out Companion
================================================================================
Purpose:
  Background helper that monitors system-wide keyboard/mouse idle time via the
  standard Windows GetLastInputInfo API. When keyboard and mouse inactivity
  exceeds the company idle threshold during office hours (IST), it notifies
  the HRMS backend to automatically clock out the employee's active session.

Privacy Guarantee:
  - Transmits strictly two values: idle_seconds (integer) and reported_at (UTC ISO string).
  - DOES NOT capture, inspect, log, or transmit keystrokes, mouse coordinates/clicks,
    window titles, URLs, screen pixels, application data, or clipboard content.
  - Exempt applications are checked locally by comparing Get-Process names against
    the administrator-configured list (no process metadata or process IDs sent).
================================================================================
#>

# Enforce TLS 1.2
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Configuration
$BackendUrl = "https://zoha-hrms.vercel.app"
$AppDataDir = [System.IO.Path]::Combine($env:APPDATA, "ZograhaIdle")
$TokenFile  = [System.IO.Path]::Combine($AppDataDir, "token.txt")
$LogFile    = [System.IO.Path]::Combine($AppDataDir, "companion.log")
$StopFlag   = [System.IO.Path]::Combine($AppDataDir, "stop.flag")

# Ensure AppData directory exists
if (-not (Test-Path $AppDataDir)) {
    New-Item -ItemType Directory -Path $AppDataDir -Force | Out-Null
}

function Write-Log {
    param([string]$Message)
    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$timestamp] $Message"
    try {
        Add-Content -Path $LogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
    } catch { }
}

# Win32 GetLastInputInfo Definition
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class Win32Input {
    [StructLayout(LayoutKind.Sequential)]
    public struct LASTINPUTINFO {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

    public static uint GetIdleTimeMs() {
        LASTINPUTINFO lii = new LASTINPUTINFO();
        lii.cbSize = (uint)Marshal.SizeOf(lii);
        if (GetLastInputInfo(ref lii)) {
            uint tickCount = (uint)Environment.TickCount;
            return tickCount - lii.dwTime;
        }
        return 0;
    }
}
'@

function Get-IdleSeconds {
    $idleMs = [Win32Input]::GetIdleTimeMs()
    return [Math]::Floor($idleMs / 1000)
}

function Get-CurrentISTDateTime {
    # IST is UTC + 5:30
    return [DateTime]::UtcNow.AddMinutes(330)
}

function Test-IsOfficeHours {
    param([string]$StartTimeStr, [string]$EndTimeStr)
    if ([string]::IsNullOrWhiteSpace($StartTimeStr) -or [string]::IsNullOrWhiteSpace($EndTimeStr)) {
        return $false
    }
    $ist = Get-CurrentISTDateTime
    $curMinutes = ($ist.Hour * 60) + $ist.Minute

    $startParts = $StartTimeStr.Split(':')
    $endParts = $EndTimeStr.Split(':')
    $startMinutes = ([int]$startParts[0] * 60) + [int]$startParts[1]
    $endMinutes = ([int]$endParts[0] * 60) + [int]$endParts[1]

    return ($curMinutes -ge $startMinutes -and $curMinutes -le $endMinutes)
}

# Read device token from disk
if (-not (Test-Path $TokenFile)) {
    Write-Log "Token file not found at $TokenFile. Exiting."
    exit 1
}

$Token = (Get-Content -Path $TokenFile -Raw -ErrorAction SilentlyContinue)
if (-not $Token) {
    Write-Log "Token file is empty. Exiting."
    exit 1
}
$Token = $Token.Trim()

# Single-instance guard via named mutex
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Global\ZograhaIdleCompanion", [ref]$createdNew)
if (-not $createdNew) {
    Write-Log "Another instance is running. Exiting."
    exit 0
}

# Clean stale stop.flag from previous runs
if (Test-Path $StopFlag) {
    Write-Log "Stale stop.flag found, removing."
    Remove-Item -Path $StopFlag -Force -ErrorAction SilentlyContinue
}

try {
    # State variables
    $Policy = $null
    $PollIntervalSeconds = 60
    $LastPolicyFetch = [DateTime]::MinValue
    $StandbyMode = $false
    $BackoffUntil = [DateTime]::MinValue

    while ($true) {
        # Check stop mechanism
        if (Test-Path $StopFlag) {
            Write-Log "Stop flag detected. Companion exiting cleanly."
            break
        }

        # Respect backoff if set (only from clock-out 400/403)
        if ([DateTime]::UtcNow -lt $BackoffUntil) {
            Start-Sleep -Seconds 15
            continue
        }

        # Policy refresh: every poll interval (default 60s, or poll_seconds from server policy)
        $secondsSincePolicy = [DateTime]::UtcNow.Subtract($LastPolicyFetch).TotalSeconds
        if ($secondsSincePolicy -ge $PollIntervalSeconds -or $null -eq $Policy) {
            try {
                $headers = @{
                    "Authorization" = "Bearer $Token"
                    "Accept"        = "application/json"
                }
                $policyRes = Invoke-RestMethod -Uri "$BackendUrl/api/attendance/idle-policy" -Method Get -Headers $headers -TimeoutSec 15
                if ($policyRes.success) {
                    if ($policyRes.poll_seconds) {
                        $PollIntervalSeconds = [int]$policyRes.poll_seconds
                    }

                    $newEnabled = if ($null -ne $policyRes.idle_auto_clockout_enabled) { [bool]$policyRes.idle_auto_clockout_enabled } else { [bool]$policyRes.enabled }
                    $newTimeout = if ($null -ne $policyRes.idle_timeout_minutes) { [int]$policyRes.idle_timeout_minutes } else { [int]$policyRes.timeout_minutes }
                    $newExempt  = [bool]$policyRes.exempt
                    $newStart   = [string]$policyRes.office_start_time
                    $newEnd     = [string]$policyRes.office_end_time
                    $newApps    = @(if ($null -ne $policyRes.idle_exempt_app_names) { $policyRes.idle_exempt_app_names } else { $policyRes.exempt_app_names })

                    if ($null -eq $Policy) {
                        Write-Log "Initial idle policy loaded. Enabled: $newEnabled, Timeout: ${newTimeout}m, Exempt: $newExempt, OfficeHours: $newStart-$newEnd, PollInterval: ${PollIntervalSeconds}s"
                    } else {
                        $oldEnabled = if ($null -ne $Policy.idle_auto_clockout_enabled) { [bool]$Policy.idle_auto_clockout_enabled } else { [bool]$Policy.enabled }
                        $oldTimeout = if ($null -ne $Policy.idle_timeout_minutes) { [int]$Policy.idle_timeout_minutes } else { [int]$Policy.timeout_minutes }
                        $oldExempt  = [bool]$Policy.exempt
                        $oldStart   = [string]$Policy.office_start_time
                        $oldEnd     = [string]$Policy.office_end_time
                        $oldApps    = @(if ($null -ne $Policy.idle_exempt_app_names) { $Policy.idle_exempt_app_names } else { $Policy.exempt_app_names })

                        if ($newEnabled -ne $oldEnabled) {
                            Write-Log "Policy change: Enabled changed from $oldEnabled to $newEnabled"
                        }
                        if ($newTimeout -ne $oldTimeout) {
                            Write-Log "Policy change: Timeout changed from ${oldTimeout}m to ${newTimeout}m"
                        }
                        if ($newExempt -ne $oldExempt) {
                            Write-Log "Policy change: Exempt status changed from $oldExempt to $newExempt"
                        }
                        if ($newStart -ne $oldStart -or $newEnd -ne $oldEnd) {
                            Write-Log "Policy change: Office hours changed from $oldStart-$oldEnd to $newStart-$newEnd"
                        }
                        $oldAppsStr = ($oldApps | Sort-Object) -join ","
                        $newAppsStr = ($newApps | Sort-Object) -join ","
                        if ($oldAppsStr -ne $newAppsStr) {
                            Write-Log "Policy change: Exempt apps changed from [$oldAppsStr] to [$newAppsStr]"
                        }
                    }

                    $Policy = $policyRes
                    $LastPolicyFetch = [DateTime]::UtcNow
                }
            } catch {
                Write-Log "Failed to fetch idle policy: $($_.Exception.Message). Keeping last good policy and retrying at next poll interval."
                $LastPolicyFetch = [DateTime]::UtcNow
            }
        }

        # If policy could not be loaded yet, wait and retry
        if ($null -eq $Policy) {
            Start-Sleep -Seconds 15
            continue
        }

        # Measure system idle seconds
        $idleSeconds = Get-IdleSeconds

        # If in standby, wait until user is active again (idle drops below 30s)
        if ($StandbyMode) {
            if ($idleSeconds -lt 30) {
                Write-Log "User activity detected. Exiting standby mode."
                $StandbyMode = $false
            } else {
                Start-Sleep -Seconds 15
                continue
            }
        }

        # Check feature toggle & employee exemption using server policy
        $isPolicyEnabled = if ($null -ne $Policy.idle_auto_clockout_enabled) { [bool]$Policy.idle_auto_clockout_enabled } else { [bool]$Policy.enabled }
        if (-not $isPolicyEnabled) {
            Start-Sleep -Seconds 15
            continue
        }

        if ([bool]$Policy.exempt) {
            Start-Sleep -Seconds 15
            continue
        }

        # Check office hours (IST) directly from server policy (no fallback)
        $officeStart = [string]$Policy.office_start_time
        $officeEnd   = [string]$Policy.office_end_time

        if (-not (Test-IsOfficeHours -StartTimeStr $officeStart -EndTimeStr $officeEnd)) {
            Start-Sleep -Seconds 15
            continue
        }

        # Check running processes against exempt application names
        $exemptApps = @(if ($null -ne $Policy.idle_exempt_app_names) { $Policy.idle_exempt_app_names } else { $Policy.exempt_app_names })
        if ($exemptApps.Count -gt 0) {
            $runningProcesses = Get-Process | Select-Object -ExpandProperty ProcessName -ErrorAction SilentlyContinue
            $matchedApp = $false

            foreach ($app in $exemptApps) {
                # Strip trailing .exe if provided
                $cleanName = if ($app.EndsWith(".exe", [System.StringComparison]::OrdinalIgnoreCase)) {
                    $app.Substring(0, $app.Length - 4)
                } else {
                    $app
                }

                if ($runningProcesses -contains $cleanName) {
                    $matchedApp = $true
                    break
                }
            }

            if ($matchedApp) {
                Start-Sleep -Seconds 15
                continue
            }
        }

        # Check idle threshold directly from server policy (no fallback)
        $timeoutMinutes = if ($null -ne $Policy.idle_timeout_minutes) { [int]$Policy.idle_timeout_minutes } else { [int]$Policy.timeout_minutes }
        $thresholdSeconds = $timeoutMinutes * 60

        if ($idleSeconds -ge $thresholdSeconds) {
            Write-Log "Idle threshold reached ($idleSeconds s >= $thresholdSeconds s). Attempting auto clock-out."

            $body = @{
                idle_seconds = $idleSeconds
                reported_at  = [DateTime]::UtcNow.ToString("o")
            } | ConvertTo-Json

            $headers = @{
                "Authorization" = "Bearer $Token"
                "Content-Type"  = "application/json"
                "Accept"        = "application/json"
            }

            try {
                $clockOutRes = Invoke-RestMethod -Uri "$BackendUrl/api/attendance/auto-clock-out" -Method Post -Headers $headers -Body $body -TimeoutSec 15
                Write-Log "Auto clock-out successful (HTTP 200). Entering standby until user activity."
                $StandbyMode = $true
            } catch {
                $statusCode = $_.Exception.Response.StatusCode.value__
                if ($statusCode -eq 409) {
                    Write-Log "HTTP 409: Session already closed. Entering standby until user activity."
                    $StandbyMode = $true
                } elseif ($statusCode -eq 400 -or $statusCode -eq 403) {
                    Write-Log "HTTP $statusCode received. Backing off 5 minutes."
                    $BackoffUntil = [DateTime]::UtcNow.AddMinutes(5)
                } else {
                    Write-Log "Request error: $($_.Exception.Message). Will retry at next loop."
                }
            }
        }

        Start-Sleep -Seconds 15
    }
} finally {
    if ($createdNew -and $null -ne $mutex) {
        try {
            $mutex.ReleaseMutex()
        } catch { }
        $mutex.Dispose()
    }
    Write-Log "Zograha Idle Companion stopped."
}

