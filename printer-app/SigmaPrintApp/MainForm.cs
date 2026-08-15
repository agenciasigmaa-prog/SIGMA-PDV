using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace SigmaPrintApp;

// Janela única, sem barra de endereço/abas — a app *é* a tela de Pedidos.
// Não existe "modo normal" pra abrir por engano e cair num diálogo de
// impressão: ou é essa janela (impressão silenciosa via PrintAsync), ou não
// tem impressão nenhuma. Sem servidor HTTP local, sem porta escutando, sem
// segredo de pareamento nenhum — só um shell de navegador embutido.
public class MainForm : Form
{
    private readonly WebView2 webView = new();
    private readonly string targetUrl;

    public MainForm(string targetUrl)
    {
        this.targetUrl = targetUrl;

        Text = "Sigma Impressão";
        WindowState = FormWindowState.Maximized;
        Controls.Add(webView);
        webView.Dock = DockStyle.Fill;

        Load += OnLoad;
        FormClosing += OnFormClosing;
    }

    private void OnFormClosing(object? sender, FormClosingEventArgs e)
    {
        // Confirma antes de fechar — fechar por engano no meio do expediente
        // para a impressão automática sem ninguém perceber na hora.
        var result = MessageBox.Show(
            this,
            "Fechar o Sigma Impressão? As comandas vão parar de sair sozinhas até abrir de novo.",
            "Fechar",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning);
        if (result == DialogResult.No) e.Cancel = true;
    }

    private async void OnLoad(object? sender, EventArgs e)
    {
        try
        {
            await webView.EnsureCoreWebView2Async();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(
                this,
                "O Sigma Impressão precisa do WebView2 Runtime (Microsoft Edge) instalado. " +
                "Normalmente já vem no Windows 10/11 — se essa mensagem aparecer, baixe em " +
                "https://developer.microsoft.com/microsoft-edge/webview2/ e abra o app de novo.",
                "WebView2 não encontrado",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
            return;
        }

        webView.CoreWebView2.Navigate(targetUrl);
        webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
    }

    // A página (restaurante/src/lib/printing.tsx) manda
    // window.chrome.webview.postMessage(JSON.stringify({ type: "print-ticket" }))
    // sempre que uma comanda precisa sair — checagem simples de substring em
    // vez de desserializar, já que só existe esse único tipo de mensagem hoje.
    private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string message;
        try
        {
            message = e.TryGetWebMessageAsString();
        }
        catch (InvalidOperationException)
        {
            return; // Mensagem não era uma string simples — ignora.
        }

        if (!message.Contains("print-ticket")) return;

        var settings = webView.CoreWebView2.Environment.CreatePrintSettings();
        settings.MarginTop = 0;
        settings.MarginBottom = 0;
        settings.MarginLeft = 0;
        settings.MarginRight = 0;
        settings.ShouldPrintBackgrounds = true;

        try
        {
            await webView.CoreWebView2.PrintAsync(settings);
        }
        catch (Exception)
        {
            // Impressora padrão do Windows não configurada, desligada ou sem
            // papel — não derruba o app; o board do restaurante continua
            // funcionando normalmente, dá pra reimprimir manual depois.
        }
    }
}
