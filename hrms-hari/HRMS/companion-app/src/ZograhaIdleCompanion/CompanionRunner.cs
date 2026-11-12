using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security.Authentication;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace ZograhaIdleCompanion;

public class CompanionRunner
{
    private readonly HttpClient _httpClient;
    private readonly string _token;
    private readonly string _deviceId;
    private readonly string _hostname;

    public CompanionRunner(string token, HttpClient? httpClient = null)
    {
        _token = token;
        _hostname = Environment.MachineName;
        _deviceId = GetOrCreateDeviceId();

        if (httpClient != null)
        {
            _httpClient = httpClient;
        }
        else
        {
            var handler = new SocketsHttpHandler
            {
                SslOptions = new System.Net.Security.SslClientAuthenticationOptions
                {
                    EnabledSslProtocols = SslProtocols.Tls12
                }
            };
            _httpClient = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromSeconds(15)
            };
        }
    }

    private static string GetOrCreateDeviceId()
    {
        try
        {
            string idPath = Path.Combine(CompanionConfig.AppDataDir, "device_id.txt");
            if (File.Exists(idPath))
            {
                string id = File.ReadAllText(idPath).Trim();
                if (!string.IsNullOrEmpty(id)) return id;
            }
            string newId = "dev-" + Guid.NewGuid().ToString("N")[..12];
            Directory.CreateDirectory(CompanionConfig.AppDataDir);
            File.WriteAllText(idPath, newId);
            return newId;
        }
        catch
        {
            return "dev-" + Environment.MachineName.ToLowerInvariant();
        }
    }

    public async Task RunAsync(CancellationToken cancellationToken = default)
    {
        CompanionLogger.Log("Starting Zograha Idle Companion service loop.");

        IdlePolicyResponse? policy = null;
        int pollIntervalSeconds = 60;
        DateTime lastPolicyFetch = DateTime.MinValue;
        bool standbyMode = false;
        DateTime backoffUntil = DateTime.MinValue;
        DateTime policyFetchBackoffUntil = DateTime.MinValue;
        int consecutivePolicyFailures = 0;
        DateTime lastHeartbeatSent = DateTime.MinValue;
        int consecutiveIdleChecks = 0;

        // Clean stale stop.flag from previous runs
        if (File.Exists(CompanionConfig.StopFlagPath))
        {
            try
            {
                File.Delete(CompanionConfig.StopFlagPath);
                CompanionLogger.Log("Stale stop.flag found, removing.");
            }
            catch { }
        }

        // Initialize policy from disk cache or safe default so idle detection is never disabled
        if (policy == null)
        {
            policy = LoadPolicyFromDisk();
            if (policy != null)
            {
                pollIntervalSeconds = policy.GetEffectivePollSeconds();
                CompanionLogger.Log($"Loaded cached idle policy from disk. Enabled: {policy.IsFeatureEnabled()}, Timeout: {policy.GetEffectiveTimeoutMinutes()}m, OfficeHours: {policy.GetEffectiveStartTime()}-{policy.GetEffectiveEndTime()}");
            }
            else
            {
                policy = CreateDefaultFallbackPolicy();
                pollIntervalSeconds = policy.GetEffectivePollSeconds();
                CompanionLogger.Log("Using safe default idle policy (10m timeout, 09:00-18:00) until server policy is reachable.");
            }
        }

        while (!cancellationToken.IsCancellationRequested)
        {
            // Check stop flag
            if (File.Exists(CompanionConfig.StopFlagPath))
            {
                CompanionLogger.Log("Stop flag detected. Companion exiting cleanly.");
                break;
            }

            // Respect backoff (only from clock-out 400/403)
            if (DateTime.UtcNow < backoffUntil)
            {
                await Task.Delay(15000, cancellationToken);
                continue;
            }

            // Policy refresh: every poll interval (if not in backoff)
            double secondsSincePolicy = (DateTime.UtcNow - lastPolicyFetch).TotalSeconds;
            if ((secondsSincePolicy >= pollIntervalSeconds || lastPolicyFetch == DateTime.MinValue) && DateTime.UtcNow >= policyFetchBackoffUntil)
            {
                var fetchResult = await FetchPolicyAsync();
                if (fetchResult.IsRevoked)
                {
                    CompanionLogger.Log("HTTP 401 Unauthorized received: Device token is revoked or invalid. Stopping companion loop.");
                    return;
                }

                if (fetchResult.IsForbidden)
                {
                    consecutivePolicyFailures++;
                    int jitterSec = Random.Shared.Next(0, 60);
                    policyFetchBackoffUntil = DateTime.UtcNow.AddSeconds(270 + jitterSec);
                    CompanionLogger.Log($"HTTP 403 Forbidden: {fetchResult.ErrorMessage}. Account may be deactivated or unregistered. Backing off ~5 minutes.");
                }
                else if (fetchResult.Policy != null)
                {
                    consecutivePolicyFailures = 0;
                    var newPolicy = fetchResult.Policy;
                    pollIntervalSeconds = newPolicy.GetEffectivePollSeconds();

                    LogPolicyChanges(policy, newPolicy);
                    policy = newPolicy;
                    lastPolicyFetch = DateTime.UtcNow;
                }
                else
                {
                    consecutivePolicyFailures++;
                    int backoffSec = Math.Min(300, (int)(15 * Math.Pow(1.8, Math.Min(consecutivePolicyFailures - 1, 5)))) + Random.Shared.Next(0, 15);
                    policyFetchBackoffUntil = DateTime.UtcNow.AddSeconds(backoffSec);
                    CompanionLogger.Log($"Failed to fetch idle policy (HTTP {fetchResult.StatusCode}: {fetchResult.ErrorMessage}). Keeping current policy and backing off {backoffSec}s.");
                }
            }

            if (policy == null)
            {
                await Task.Delay(15000, cancellationToken);
                continue;
            }

            // 1. Measure system idle and active calls/media
            bool inMeeting = UserInputTracker.IsMicrophoneOrCameraActive();
            bool mediaActive = UserInputTracker.IsFullScreenOrMediaActive();
            int rawIdleSeconds = UserInputTracker.GetIdleSeconds();
            int effectiveIdleSeconds = (inMeeting || mediaActive) ? 0 : rawIdleSeconds;

            // 2. Periodic heartbeat every 60s
            double secondsSinceHeartbeat = (DateTime.UtcNow - lastHeartbeatSent).TotalSeconds;
            if (secondsSinceHeartbeat >= 60 || lastHeartbeatSent == DateTime.MinValue)
            {
                await SendHeartbeatAsync(effectiveIdleSeconds, inMeeting, mediaActive);
                lastHeartbeatSent = DateTime.UtcNow;
            }

            // Standby mode handling: resume once user becomes active (idle < 30s)
            if (standbyMode)
            {
                if (effectiveIdleSeconds < 30)
                {
                    CompanionLogger.Log("User activity detected. Exiting standby mode.");
                    standbyMode = false;
                    consecutiveIdleChecks = 0;
                }
                else
                {
                    await Task.Delay(15000, cancellationToken);
                    continue;
                }
            }

            if (inMeeting || mediaActive)
            {
                consecutiveIdleChecks = 0;
            }

            // Check enabled status & exempt status from server policy
            if (!policy.IsFeatureEnabled() || policy.Exempt)
            {
                consecutiveIdleChecks = 0;
                await Task.Delay(15000, cancellationToken);
                continue;
            }

            // Check office hours (IST) from server policy
            string startStr = policy.GetEffectiveStartTime();
            string endStr = policy.GetEffectiveEndTime();
            if (!IdlePolicyEvaluator.IsOfficeHours(DateTime.UtcNow, startStr, endStr))
            {
                consecutiveIdleChecks = 0;
                await Task.Delay(15000, cancellationToken);
                continue;
            }

            // Check running processes against exempt apps
            var exemptApps = policy.GetEffectiveExemptApps();
            if (exemptApps.Count > 0)
            {
                var runningProcesses = GetRunningProcessNames();
                if (IdlePolicyEvaluator.IsAnyExemptAppRunning(runningProcesses, exemptApps))
                {
                    consecutiveIdleChecks = 0;
                    await Task.Delay(15000, cancellationToken);
                    continue;
                }
            }

            // Check idle threshold
            int timeoutMinutes = policy.GetEffectiveTimeoutMinutes();
            int thresholdSeconds = timeoutMinutes * 60;
            int gracePeriodSeconds = policy.GetEffectiveGracePeriodSeconds();

            if (effectiveIdleSeconds >= thresholdSeconds && !inMeeting && !mediaActive)
            {
                consecutiveIdleChecks++;
                if (consecutiveIdleChecks == 1)
                {
                    CompanionLogger.Log($"Idle threshold reached ({effectiveIdleSeconds} s >= {thresholdSeconds} s). Starting {gracePeriodSeconds}s grace period with warning.");
                    ShowInactivityWarningToast(gracePeriodSeconds);

                    // Wait through grace period, checking for user input every 2 seconds
                    DateTime graceEnd = DateTime.UtcNow.AddSeconds(gracePeriodSeconds);
                    bool inputCancelled = false;
                    while (DateTime.UtcNow < graceEnd)
                    {
                        await Task.Delay(2000, cancellationToken);
                        if (UserInputTracker.GetIdleSeconds() < 5 || UserInputTracker.IsMicrophoneOrCameraActive() || UserInputTracker.IsFullScreenOrMediaActive())
                        {
                            CompanionLogger.Log("User resumed activity during grace period. Clock-out cancelled.");
                            consecutiveIdleChecks = 0;
                            inputCancelled = true;
                            break;
                        }
                    }

                    if (inputCancelled)
                    {
                        continue;
                    }
                }

                // Second check confirms idle condition persists
                int confirmedIdle = UserInputTracker.GetIdleSeconds();
                if (confirmedIdle >= thresholdSeconds && !UserInputTracker.IsMicrophoneOrCameraActive() && !UserInputTracker.IsFullScreenOrMediaActive())
                {
                    CompanionLogger.Log($"Confirmed idle condition on 2 consecutive checks ({confirmedIdle}s). Sending auto clock-out.");
                    var clockOutResult = await SendAutoClockOutAsync(confirmedIdle);

                    if (clockOutResult.IsRevoked)
                    {
                        CompanionLogger.Log("HTTP 401 received on clock-out: Token is revoked or invalid. Exiting.");
                        return;
                    }

                    if (clockOutResult.IsCancelled)
                    {
                        CompanionLogger.Log($"Auto clock-out cancelled by server: {clockOutResult.Reason}");
                        consecutiveIdleChecks = 0;
                    }
                    else if (clockOutResult.StatusCode == 200)
                    {
                        CompanionLogger.Log("Auto clock-out successful (HTTP 200). Entering standby until user activity.");
                        standbyMode = true;
                        consecutiveIdleChecks = 0;
                    }
                    else if (clockOutResult.StatusCode == 409)
                    {
                        CompanionLogger.Log("HTTP 409: Session already closed. Entering standby until user activity.");
                        standbyMode = true;
                        consecutiveIdleChecks = 0;
                    }
                    else if (clockOutResult.StatusCode == 400 || clockOutResult.StatusCode == 403)
                    {
                        CompanionLogger.Log($"HTTP {clockOutResult.StatusCode} received on clock-out. Backing off 5 minutes.");
                        backoffUntil = DateTime.UtcNow.AddMinutes(5);
                        consecutiveIdleChecks = 0;
                    }
                    else
                    {
                        CompanionLogger.Log($"Clock-out request result: {clockOutResult.StatusCode}. Retrying at next loop.");
                    }
                }
                else
                {
                    CompanionLogger.Log("Idle condition cleared before second check. Resetting check count.");
                    consecutiveIdleChecks = 0;
                }
            }
            else
            {
                consecutiveIdleChecks = 0;
            }

            await Task.Delay(15000, cancellationToken);
        }
    }

    private async Task<(IdlePolicyResponse? Policy, bool IsRevoked, bool IsForbidden, int StatusCode, string ErrorMessage)> FetchPolicyAsync()
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{CompanionConfig.BackendUrl}/api/attendance/idle-policy");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var res = await _httpClient.SendAsync(req);
            int statusCode = (int)res.StatusCode;
            string rawBody = await res.Content.ReadAsStringAsync();

            string errorMessage = string.Empty;
            if (!string.IsNullOrWhiteSpace(rawBody))
            {
                try
                {
                    using var doc = JsonDocument.Parse(rawBody);
                    if (doc.RootElement.TryGetProperty("message", out var msgProp))
                    {
                        errorMessage = msgProp.GetString() ?? string.Empty;
                    }
                }
                catch
                {
                    errorMessage = rawBody.Length > 120 ? rawBody[..120] + "..." : rawBody;
                }
            }
            if (string.IsNullOrWhiteSpace(errorMessage))
            {
                errorMessage = res.ReasonPhrase ?? $"HTTP {statusCode}";
            }

            if (res.StatusCode == HttpStatusCode.Unauthorized)
            {
                return (null, true, false, statusCode, errorMessage);
            }

            if (res.StatusCode == HttpStatusCode.Forbidden)
            {
                return (null, false, true, statusCode, errorMessage);
            }

            if (!res.IsSuccessStatusCode)
            {
                return (null, false, false, statusCode, errorMessage);
            }

            var parsed = JsonSerializer.Deserialize<IdlePolicyResponse>(rawBody);
            if (parsed != null && parsed.Success)
            {
                // Persist successful policy to local disk cache
                try
                {
                    string dir = Path.GetDirectoryName(CompanionConfig.PolicyCachePath)!;
                    if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);
                    File.WriteAllText(CompanionConfig.PolicyCachePath, rawBody);
                }
                catch { }

                return (parsed, false, false, statusCode, string.Empty);
            }

            return (null, false, false, statusCode, errorMessage);
        }
        catch (Exception ex)
        {
            return (null, false, false, 0, ex.Message);
        }
    }

    private static IdlePolicyResponse? LoadPolicyFromDisk()
    {
        try
        {
            if (File.Exists(CompanionConfig.PolicyCachePath))
            {
                string json = File.ReadAllText(CompanionConfig.PolicyCachePath);
                return JsonSerializer.Deserialize<IdlePolicyResponse>(json);
            }
        }
        catch { }
        return null;
    }

    private static IdlePolicyResponse CreateDefaultFallbackPolicy()
    {
        return new IdlePolicyResponse
        {
            Success = true,
            Enabled = true,
            IdleAutoClockoutEnabled = true,
            TimeoutMinutes = 10,
            IdleTimeoutMinutes = 10,
            Exempt = false,
            OfficeStartTime = "09:00",
            OfficeEndTime = "18:00",
            PollSeconds = 60
        };
    }

    private async Task SendHeartbeatAsync(int idleSeconds, bool inMeeting, bool mediaActive)
    {
        try
        {
            var payload = new HeartbeatPayload
            {
                DeviceId = _deviceId,
                Hostname = _hostname,
                IdleSeconds = idleSeconds,
                InMeeting = inMeeting,
                MediaActive = mediaActive,
                Source = "companion"
            };

            string jsonBody = JsonSerializer.Serialize(payload);
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{CompanionConfig.BackendUrl}/api/attendance/heartbeat")
            {
                Content = new StringContent(jsonBody, Encoding.UTF8, "application/json")
            };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var res = await _httpClient.SendAsync(req);
            if (res.IsSuccessStatusCode)
            {
                string resBody = await res.Content.ReadAsStringAsync();
                var parsed = JsonSerializer.Deserialize<HeartbeatResponse>(resBody);
                if (parsed != null && parsed.Resumed)
                {
                    CompanionLogger.Log("Attendance session was automatically resumed by server due to detected activity.");
                }
            }
        }
        catch (Exception ex)
        {
            CompanionLogger.Log($"Heartbeat send failure: {ex.Message}");
        }
    }

    private static void ShowInactivityWarningToast(int secondsRemaining)
    {
        CompanionLogger.Log($"[WARNING] Inactivity warning displayed: User will be clocked out in {secondsRemaining} seconds unless input is detected.");
        try
        {
            string script = "$template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); " +
                            "$textNodes = $template.GetElementsByTagName('text'); " +
                            "$textNodes.Item(0).AppendChild($template.CreateTextNode('Zograha HRMS - Inactivity Warning')) | Out-Null; " +
                            $"$textNodes.Item(1).AppendChild($template.CreateTextNode('You will be clocked out in {secondsRemaining}s due to inactivity. Move mouse to resume.')) | Out-Null; " +
                            "$toast = [Windows.UI.Notifications.ToastNotification]::new($template); " +
                            "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Zograha HRMS').Show($toast);";

            var psi = new ProcessStartInfo("powershell", $"-WindowStyle Hidden -NoProfile -Command \"{script}\"")
            {
                CreateNoWindow = true,
                UseShellExecute = false
            };
            Process.Start(psi);
        }
        catch { }
    }

    private async Task<(int StatusCode, bool IsRevoked, bool IsCancelled, string? Reason)> SendAutoClockOutAsync(int idleSeconds)
    {
        try
        {
            var payload = new AutoClockOutPayload
            {
                DeviceId = _deviceId,
                Hostname = _hostname,
                IdleSeconds = idleSeconds,
                ReportedAt = DateTime.UtcNow.ToString("o")
            };

            string jsonBody = JsonSerializer.Serialize(payload);

            using var req = new HttpRequestMessage(HttpMethod.Post, $"{CompanionConfig.BackendUrl}/api/attendance/auto-clock-out")
            {
                Content = new StringContent(jsonBody, Encoding.UTF8, "application/json")
            };
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var res = await _httpClient.SendAsync(req);
            int code = (int)res.StatusCode;
            string resBody = await res.Content.ReadAsStringAsync();
            bool isCancelled = false;
            string? reason = null;

            if (!string.IsNullOrWhiteSpace(resBody))
            {
                try
                {
                    var parsed = JsonSerializer.Deserialize<AutoClockOutResponse>(resBody);
                    if (parsed != null)
                    {
                        isCancelled = parsed.Cancelled;
                        reason = parsed.Reason;
                    }
                }
                catch { }
            }

            return (code, code == 401, isCancelled, reason);
        }
        catch (Exception ex)
        {
            CompanionLogger.Log($"Network error during auto clock-out: {ex.Message}");
            return (0, false, false, ex.Message);
        }
    }

    private static void LogPolicyChanges(IdlePolicyResponse oldP, IdlePolicyResponse newP)
    {
        bool oldEn = oldP.IsFeatureEnabled();
        bool newEn = newP.IsFeatureEnabled();
        if (oldEn != newEn)
        {
            CompanionLogger.Log($"Policy change: Enabled changed from {oldEn} to {newEn}");
        }

        int oldTm = oldP.GetEffectiveTimeoutMinutes();
        int newTm = newP.GetEffectiveTimeoutMinutes();
        if (oldTm != newTm)
        {
            CompanionLogger.Log($"Policy change: Timeout changed from {oldTm}m to {newTm}m");
        }

        if (oldP.Exempt != newP.Exempt)
        {
            CompanionLogger.Log($"Policy change: Exempt status changed from {oldP.Exempt} to {newP.Exempt}");
        }

        string oldStart = oldP.GetEffectiveStartTime();
        string newStart = newP.GetEffectiveStartTime();
        string oldEnd = oldP.GetEffectiveEndTime();
        string newEnd = newP.GetEffectiveEndTime();
        if (oldStart != newStart || oldEnd != newEnd)
        {
            CompanionLogger.Log($"Policy change: Office hours changed from {oldStart}-{oldEnd} to {newStart}-{newEnd}");
        }

        string oldApps = string.Join(",", oldP.GetEffectiveExemptApps().OrderBy(x => x));
        string newApps = string.Join(",", newP.GetEffectiveExemptApps().OrderBy(x => x));
        if (!string.Equals(oldApps, newApps, StringComparison.OrdinalIgnoreCase))
        {
            CompanionLogger.Log($"Policy change: Exempt apps changed from [{oldApps}] to [{newApps}]");
        }
    }

    private static string[] GetRunningProcessNames()
    {
        try
        {
            return Process.GetProcesses().Select(p => p.ProcessName).ToArray();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }
}

