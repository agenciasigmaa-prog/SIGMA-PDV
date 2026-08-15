namespace SigmaPrintApp;

internal static class Program
{
    // TROQUE pelo domínio de produção real do restaurante/ assim que ele
    // existir (ver printer-app/README.md) — por enquanto aponta pro servidor
    // de desenvolvimento local, só pra destravar o teste. Pode ser
    // sobrescrito sem recompilar via a variável de ambiente SIGMA_URL.
    private const string DefaultUrl = "http://localhost:5175/pedidos";

    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        var url = Environment.GetEnvironmentVariable("SIGMA_URL") ?? DefaultUrl;
        Application.Run(new MainForm(url));
    }
}
