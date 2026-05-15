namespace MiniMaxAIDocx.Core.Commands;

internal static class OutputPathDefaults
{
    private const string DefaultFileName = "output.docx";

    public static string GetDefaultOutputPath(string? fileName = null)
    {
        var resolvedFileName = string.IsNullOrWhiteSpace(fileName) ? DefaultFileName : fileName;
        var homeDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);

        // Windows: prefer D: while preserving the rest of the path under Users\...
        // Example: C:\Users\alice -> D:\Users\alice
        if (homeDirectory.Length >= 3 && homeDirectory[1] == ':' && Directory.Exists(@"D:\"))
        {
            homeDirectory = "D" + homeDirectory.Substring(1); // keeps leading slash/backslash and remainder
        }

        var outputDirectory = Path.Combine(homeDirectory, "Documents", "Bossim", "Word");

        Directory.CreateDirectory(outputDirectory);

        return Path.Combine(outputDirectory, resolvedFileName);
    }
}
