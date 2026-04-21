namespace MiniMaxAIDocx.Core.Commands;

internal static class OutputPathDefaults
{
    private const string DefaultFileName = "output.docx";

    public static string GetDefaultOutputPath(string? fileName = null)
    {
        var resolvedFileName = string.IsNullOrWhiteSpace(fileName) ? DefaultFileName : fileName;
        var homeDirectory = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        var outputDirectory = Path.Combine(homeDirectory, "Documents", "Bossim", "Word");

        Directory.CreateDirectory(outputDirectory);

        return Path.Combine(outputDirectory, resolvedFileName);
    }
}
