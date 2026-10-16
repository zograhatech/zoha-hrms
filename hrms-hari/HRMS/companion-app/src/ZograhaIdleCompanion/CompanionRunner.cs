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

    public CompanionRunner(string token, HttpClient? httpClient = null)
    {
        _token = token;
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

    public async Task RunAsync(CancellationToken cancellationToken = default)
    {
        CompanionLogger.Log("Starting Zograha Idle Companion service loop.");

        IdlePolicyResponse? policy = null;
        int pollIntervalSeconds = 60;
        DateTime lastPolicyFetch = DateTime.MinValue;
        bool standbyMode = false;
        DateTime backoffUntil = DateTime.MinValue;

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

            // Policy refresh: every poll interval (or initial load)
            double secondsSincePolicy = (DateTime.UtcNow - lastPolicyFetch).TotalSeconds;
            if (secondsSincePolicy >= pollIntervalSeconds || policy == null)
            {
                var fetchResult = await FetchPolicyAsync();
                if (fetchResult.IsRevoked)
                {
                    CompanionLogger.Log("HTTP 401 received: Token is revoked or invalid. Stopping companion loop.");
                    return;
                }

                if (fetchResult.Policy != null)
                {
                    var newPolicy = fetchResult.Policy;
                    pollIntervalSeconds = newPolicy.GetEffectivePollSeconds();

                    if (policy == null)
                    {
                        CompanionLogger.Log($"Initial idle policy loaded. Enabled: {newPolicy.IsFeatureEnabled()}, Timeout: {newPolicy.GetEffectiveTimeoutMinutes()}m, Exempt: {newPolicy.Exempt}, OfficeHours: {newPolicy.GetEffectiveStartTime()}-{newPolicy.GetEffectiveEndTime()}, PollInterval: {pollIntervalSeconds}s");
                    }
                    else
                    {
                        LogPolicyChanges(policy, newPolicy);
                    }

                    policy = newPolicy;
                    lastPolicyFetch = DateTime.UtcNow;
                }
                else
                {
                    CompanionLogger.Log("Failed to fetch idle policy. Keeping last good policy and retrying at normal interval.");
                    lastPolicyFetch = DateTime.UtcNow;
                }
            }

            if (policy == null)
            {
                await Task.Delay(15000, cancellationToken);
                continue;
            }

            // Measure system idle seconds
            int idleSeconds = UserInputTracker.GetIdleSeconds();

            // Standby mode handling: resume once user becomes active (idle < 30s)
            if (standbyMode)
            {
                if (idleSeconds < 30)
                {
                    CompanionLogger.Log("User activity detected. Exiting standby mode.");
                    standbyMode = false;
                }
                else
                {
                    await Task.Delay(15000, cancellationToken);
                    continue;
                }
            }

            // Check enabled status & exempt status from server policy
            if (!policy.IsFeatureEnabled() || policy.Exempt)
            {
                await Task.Delay(15000, cancellationToken);
                continue;
            }

            // Check office hours (IST) from server policy
            string startStr = policy.GetEffectiveStartTime();
            string endStr = policy.GetEffectiveEndTime();
            if (!IdlePolicyEvaluator.IsOfficeHours(DateTime.UtcNow, startStr, endStr))
            {
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
                    await Task.Delay(15000, cancellationToken);
                    continue;
                }
            }

            // Check idle threshold
            int timeoutMinutes = policy.GetEffectiveTimeoutMinutes();
            int thresholdSeconds = timeoutMinutes * 60;

            if (idleSeconds >= thresholdSeconds)
            {
                CompanionLogger.Log($"Idle threshold reached ({idleSeconds} s >= {thresholdSeconds} s). Attempting auto clock-out.");

                var clockOutResult = await SendAutoClockOutAsync(idleSeconds);
                if (clockOutResult.IsRevoked)
                {
                    CompanionLogger.Log("HTTP 401 received on clock-out: Token is revoked or invalid. Exiting.");
                    return;
                }

                if (clockOutResult.StatusCode == 200)
                {
                    CompanionLogger.Log("Auto clock-out successful (HTTP 200). Entering standby until user activity.");
                    standbyMode = true;
                }
                else if (clockOutResult.StatusCode == 409)
                {
                    CompanionLogger.Log("HTTP 409: Session already closed. Entering standby until user activity.");
                    standbyMode = true;
                }
                else if (clockOutResult.StatusCode == 400 || clockOutResult.StatusCode == 403)
                {
                    CompanionLogger.Log($"HTTP {clockOutResult.StatusCode} received on clock-out. Backing off 5 minutes.");
                    backoffUntil = DateTime.UtcNow.AddMinutes(5);
                }
                else
                {
                    CompanionLogger.Log($"Clock-out request result: {clockOutResult.StatusCode}. Retrying at next loop.");
                }
            }

            await Task.Delay(15000, cancellationToken);
        }
    }

    private async Task<(IdlePolicyResponse? Policy, bool IsRevoked)> FetchPolicyAsync()
    {
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{CompanionConfig.BackendUrl}/api/attendance/idle-policy");
            req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _token);
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var res = await _httpClient.SendAsync(req);
            if (res.StatusCode == HttpStatusCode.Unauthorized)
            {
                return (null, true);
            }

            if (!res.IsSuccessStatusCode)
            {
                return (null, false);
            }

            string json = await res.Content.ReadAsStringAsync();
            var parsed = JsonSerializer.Deserialize<IdlePolicyResponse>(json);
            return (parsed, false);
        }
        catch (Exception ex)
        {
            CompanionLogger.Log($"Network error fetching policy: {ex.Message}");
            return (null, false);
        }
    }

    private async Task<(int StatusCode, bool IsRevoked)> SendAutoClockOutAsync(int idleSeconds)
    {
        try
        {
            var payload = new AutoClockOutPayload
            {
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
            return (code, code == 401);
        }
        catch (Exception ex)
        {
            CompanionLogger.Log($"Network error during auto clock-out: {ex.Message}");
            return (0, false);
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

