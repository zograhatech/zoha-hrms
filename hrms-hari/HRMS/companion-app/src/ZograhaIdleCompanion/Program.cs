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

public class Program
{
    public static async Task<int> Main(string[] args)
    {
        // Enforce TLS 1.2 across the app domain
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

        bool isUninstall = args.Any(a => string.Equals(a, "--uninstall", StringComparison.OrdinalIgnoreCase));
        bool isRun = args.Any(a => string.Equals(a, "--run", StringComparison.OrdinalIgnoreCase));

        if (isUninstall)
        {
            return ExecuteUninstall();
        }

        if (isRun)
        {
            return await ExecuteRunModeAsync();
        }

        // Default / Setup Mode (user executed installer / exe directly)
        return await ExecuteSetupModeAsync();
    }

    private static int ExecuteUninstall()
    {
        Console.WriteLine("Uninstalling Zograha Idle Companion...");
        CompanionLogger.Log("Uninstall requested.");

        // 1. Remove Run registry key
        AutoStartManager.UnregisterAutoStart();

        // 2. Delete stored DPAPI token
        TokenManager.DeleteToken();

        // 3. Signal running companion to stop
        try
        {
            File.WriteAllText(CompanionConfig.StopFlagPath, "stop");
            CompanionLogger.Log("Created stop.flag to signal running companion to stop.");
        }
        catch { }

        // Give any running instance 1 second to exit gracefully, or find and kill
        try
        {
            int currentPid = Process.GetCurrentProcess().Id;
            var runningCompanions = Process.GetProcessesByName("ZograhaIdleSetup")
                .Where(p => p.Id != currentPid);
            foreach (var proc in runningCompanions)
            {
                try
                {
                    proc.Kill();
                    proc.WaitForExit(2000);
                }
                catch { }
            }
        }
        catch { }

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("Zograha Idle Companion has been uninstalled from this computer.");
        Console.ResetColor();
        Console.WriteLine("Note: The server-side device registration must still be revoked by an administrator.");

        return 0;
    }

    private static async Task<int> ExecuteSetupModeAsync()
    {
        Console.Title = "Zograha Idle Companion Setup";
        Console.WriteLine("==================================================");
        Console.WriteLine("       Zograha HRMS - Idle Companion Setup        ");
        Console.WriteLine("==================================================");
        Console.WriteLine();

        // Check if token is already stored
        if (TokenManager.HasToken())
        {
            string? existingToken = TokenManager.LoadToken();
            if (!string.IsNullOrWhiteSpace(existingToken))
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("Zograha Idle Companion is already set up and configured on this PC.");
                Console.ResetColor();
                Console.WriteLine("Registering auto-start and starting companion service...");

                AutoStartManager.RegisterAutoStart();

                // Behave as the companion
                return await ExecuteRunModeAsync();
            }
        }

        // Prompt for setup code
        Console.Write("Enter your setup code: ");
        string? inputCode = Console.ReadLine();

        if (string.IsNullOrWhiteSpace(inputCode))
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("No setup code provided. Exiting.");
            Console.ResetColor();
            return 1;
        }

        inputCode = inputCode.Trim();

        string machineName = Environment.MachineName;
        if (machineName.Length > 60)
        {
            machineName = machineName.Substring(0, 60);
        }

        Console.WriteLine("Enrolling device with HRMS server...");

        var enrollPayload = new EnrollPayload
        {
            Code = inputCode,
            DeviceName = machineName
        };

        var handler = new SocketsHttpHandler
        {
            SslOptions = new System.Net.Security.SslClientAuthenticationOptions
            {
                EnabledSslProtocols = SslProtocols.Tls12
            }
        };

        using var client = new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(20)
        };

        try
        {
            string jsonBody = JsonSerializer.Serialize(enrollPayload);
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{CompanionConfig.BackendUrl}/api/devices/enroll")
            {
                Content = new StringContent(jsonBody, Encoding.UTF8, "application/json")
            };
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

            using var res = await client.SendAsync(req);

            if (res.StatusCode == HttpStatusCode.BadRequest || (int)res.StatusCode == 429)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Code invalid, expired, or already used. Ask your admin for a new one.");
                Console.ResetColor();
                return 1;
            }

            if (!res.IsSuccessStatusCode)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine($"Enrollment failed with HTTP status {(int)res.StatusCode}. Please try again later.");
                Console.ResetColor();
                return 1;
            }

            string responseJson = await res.Content.ReadAsStringAsync();
            var enrollRes = JsonSerializer.Deserialize<EnrollResponse>(responseJson);

            if (enrollRes == null || string.IsNullOrWhiteSpace(enrollRes.Token))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Server returned an invalid response. Please contact your administrator.");
                Console.ResetColor();
                return 1;
            }

            // Save encrypted token with DPAPI CurrentUser scope
            TokenManager.SaveToken(enrollRes.Token);
            AutoStartManager.RegisterAutoStart();

            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("Device successfully enrolled and configured!");
            Console.ResetColor();
            Console.WriteLine("The companion will run silently in the background and auto-start on login.");
            Console.WriteLine("Starting background monitor now...");
            Console.WriteLine();

            // Run companion
            return await ExecuteRunModeAsync();
        }
        catch (Exception ex)
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine($"Network error during enrollment: {ex.Message}");
            Console.ResetColor();
            return 1;
        }
    }

    private static async Task<int> ExecuteRunModeAsync()
    {
        // Enforce single instance via named mutex
        bool createdNew;
        Mutex? mutex = null;
        try
        {
            mutex = new Mutex(true, CompanionConfig.MutexName, out createdNew);
        }
        catch (Exception)
        {
            // Another instance holds the mutex
            return 0;
        }

        if (!createdNew)
        {
            // Second copy exits silently
            mutex?.Dispose();
            return 0;
        }

        try
        {
            string? token = TokenManager.LoadToken();
            if (string.IsNullOrWhiteSpace(token))
            {
                CompanionLogger.Log("No token found or failed to decrypt. Exiting companion mode.");
                return 1;
            }

            var runner = new CompanionRunner(token);
            await runner.RunAsync();
            return 0;
        }
        finally
        {
            try
            {
                mutex.ReleaseMutex();
            }
            catch { }
            mutex.Dispose();
        }
    }
}

