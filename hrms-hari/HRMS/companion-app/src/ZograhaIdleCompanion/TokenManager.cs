using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;

namespace ZograhaIdleCompanion;

public static class TokenManager
{
    public static bool HasToken()
    {
        return File.Exists(CompanionConfig.TokenFilePath) && new FileInfo(CompanionConfig.TokenFilePath).Length > 0;
    }

    public static void SaveToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            throw new ArgumentException("Token cannot be empty.", nameof(token));
        }

        string dir = CompanionConfig.AppDataFolder;
        if (!Directory.Exists(dir))
        {
            Directory.CreateDirectory(dir);
        }

        byte[] plainBytes = Encoding.UTF8.GetBytes(token.Trim());
        byte[] encryptedBytes = ProtectedData.Protect(plainBytes, null, DataProtectionScope.CurrentUser);

        File.WriteAllBytes(CompanionConfig.TokenFilePath, encryptedBytes);
    }

    public static string? LoadToken()
    {
        if (!HasToken())
        {
            return null;
        }

        try
        {
            byte[] encryptedBytes = File.ReadAllBytes(CompanionConfig.TokenFilePath);
            byte[] plainBytes = ProtectedData.Unprotect(encryptedBytes, null, DataProtectionScope.CurrentUser);
            return Encoding.UTF8.GetString(plainBytes).Trim();
        }
        catch (Exception ex)
        {
            CompanionLogger.Log($"Error decrypting token: {ex.Message}");
            return null;
        }
    }

    public static void DeleteToken()
    {
        try
        {
            if (File.Exists(CompanionConfig.TokenFilePath))
            {
                File.Delete(CompanionConfig.TokenFilePath);
            }
        }
        catch (Exception ex)
        {
            CompanionLogger.Log($"Error deleting token file: {ex.Message}");
        }
    }
}

