using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Hailed;

internal sealed class MainForm : Form
{
    private const int VkF11 = 0x7A;

    private readonly WebView2 _view;
    private readonly string _gameDir;
    private readonly bool _debug;
    private bool _fullscreen;
    private int _crashReloads;
    private static readonly string DataDir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Hailed");

    private static void Log(string msg)
    {
        try
        {
            Directory.CreateDirectory(DataDir);
            File.AppendAllText(Path.Combine(DataDir, "hailed.log"), DateTime.Now.ToString("s") + " " + msg + Environment.NewLine);
        }
        catch { }
    }
    private long _lastF11Toggle;

    public MainForm()
    {
        Text = "Hailed";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        AutoScaleMode = AutoScaleMode.Dpi;
        // 1600x900 doesn't fit smaller or scaled screens; cap at 90% of the work area, keeping 16:9.
        Rectangle wa = Screen.PrimaryScreen?.WorkingArea ?? new Rectangle(0, 0, 1600, 900);
        int w = Math.Min(1600, (int)(wa.Width * 0.9)), h = Math.Min(900, (int)(wa.Height * 0.9));
        w = Math.Min(w, h * 16 / 9); h = Math.Min(h, w * 9 / 16);
        ClientSize = new Size(Math.Max(w, 640), Math.Max(h, 360));
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.Black;
        KeyPreview = true;

        _gameDir = Path.Combine(AppContext.BaseDirectory, "game");
        _debug = Environment.GetEnvironmentVariable("HAILED_DEBUG") == "1";

        _view = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.Black
        };
        Controls.Add(_view);

        KeyDown += MainForm_KeyDown;
        Load += MainForm_Load;
    }

    private async void MainForm_Load(object sender, EventArgs e)
    {
        if (!Directory.Exists(_gameDir))
        {
            MessageBox.Show("Game folder not found: " + _gameDir, "Hailed",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            BeginInvoke(new Action(Close));
            return;
        }

        try { await InitializeAsync(); }
        catch (Exception ex)
        {
            Log("init failed: " + ex);
            MessageBox.Show("Hailed could not start its window:\n\n" + ex.Message +
                "\n\nDetails were written to " + Path.Combine(DataDir, "hailed.log"),
                "Hailed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            BeginInvoke(new Action(Close));
        }
    }

    private async System.Threading.Tasks.Task InitializeAsync()
    {
        string userDataFolder = Path.Combine(DataDir, "WebView2");
        try { if (File.Exists(Path.Combine(DataDir, "hailed.log")) && new FileInfo(Path.Combine(DataDir, "hailed.log")).Length > 512 * 1024) File.Delete(Path.Combine(DataDir, "hailed.log")); } catch { }
        Log("start " + Application.ProductVersion + " on " + Environment.OSVersion);

        try
        {
            CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
            await _view.EnsureCoreWebView2Async(env);
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(
                "The Microsoft Edge WebView2 Runtime is required to run Hailed " +
                "(it is built into Windows 11).\n\nDownload it from:\n" +
                "https://go.microsoft.com/fwlink/p/?LinkId=2124703",
                "Hailed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            BeginInvoke(new Action(Close));
            return;
        }

        CoreWebView2Settings settings = _view.CoreWebView2.Settings;
        settings.AreDevToolsEnabled = _debug;
        settings.AreDefaultContextMenusEnabled = false;
        settings.IsStatusBarEnabled = false;
        settings.AreBrowserAcceleratorKeysEnabled = _debug;

        Log("webview2 runtime " + _view.CoreWebView2.Environment.BrowserVersionString);
        _view.WebMessageReceived += (_, args) =>
        {
            string m = args.TryGetWebMessageAsString();
            if (m == "quit")
                Close();
            else if (m != null && m.StartsWith("log:"))
                Log("page " + m.Substring(4));
        };
        _view.CoreWebView2.NavigationCompleted += (_, args) =>
        {
            if (!args.IsSuccess) Log("navigation failed: " + args.WebErrorStatus);
        };
        // A crashed renderer or GPU process leaves a black window; reload a few times before giving up.
        _view.CoreWebView2.ProcessFailed += (_, args) =>
        {
            Log("process failed: " + args.ProcessFailedKind + " " + args.Reason + " exit " + args.ExitCode);
            if (args.ProcessFailedKind == CoreWebView2ProcessFailedKind.BrowserProcessExited) return;
            if (_crashReloads++ < 3)
                BeginInvoke(new Action(() => { try { _view.CoreWebView2.Reload(); } catch (Exception ex) { Log("reload failed: " + ex.Message); } }));
        };
        // The WinForms WebView2 control keeps its CoreWebView2Controller internal, so hook
        // its accelerator event reflectively; the WebView otherwise swallows F11.
        FieldInfo controllerField = typeof(WebView2).GetField("_coreWebView2Controller",
            BindingFlags.Instance | BindingFlags.NonPublic);
        object controller = controllerField?.GetValue(_view);
        EventInfo accelerator = controller?.GetType().GetEvent("AcceleratorKeyPressed");
        if (accelerator != null)
        {
            EventHandler<CoreWebView2AcceleratorKeyPressedEventArgs> onAccelerator = (_, args) =>
            {
                if (args.KeyEventKind == CoreWebView2KeyEventKind.KeyDown && args.VirtualKey == VkF11)
                {
                    args.Handled = true;
                    ToggleFullscreen();
                }
            };
            accelerator.AddEventHandler(controller, onAccelerator);
        }

        // The game posts "quit" through the WebKit message handler; forward it to WebView2.
        await _view.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(
            "window.webkit = window.webkit || {};" +
            "window.webkit.messageHandlers = window.webkit.messageHandlers || {};" +
            "window.webkit.messageHandlers.hailed = { postMessage: function (m) {" +
            "window.chrome.webview.postMessage(m); } };" +
            // forward page errors to hailed.log so problems on players' machines can be diagnosed
            "(function(){var n=0;function s(t){if(n++<50)try{window.chrome.webview.postMessage('log:'+String(t).slice(0,600));}catch(e){}}" +
            "addEventListener('error',function(e){s('error '+e.message+' @'+e.filename+':'+e.lineno);});" +
            "addEventListener('unhandledrejection',function(e){s('rejection '+(e.reason&&e.reason.stack||e.reason));});" +
            "var ce=console.error;console.error=function(){s('console '+[].slice.call(arguments).join(' '));return ce.apply(console,arguments);};})();");

        _view.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "hailed.app", _gameDir, CoreWebView2HostResourceAccessKind.Allow);

        string query = string.Join("&", Environment.GetCommandLineArgs()
            .Skip(1)
            .Where(a => a.Contains('='))
            .Select(a =>
            {
                int i = a.IndexOf('=');
                return Uri.EscapeDataString(a.Substring(0, i)) + "=" +
                       Uri.EscapeDataString(a.Substring(i + 1));
            }));

        string url = "https://hailed.app/index.html" + (query.Length > 0 ? "?" + query : "");
        _view.CoreWebView2.Navigate(url);
    }

    private void MainForm_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.F11)
        {
            ToggleFullscreen();
            e.Handled = true;
            e.SuppressKeyPress = true;
        }
    }

    private void ToggleFullscreen()
    {
        // The form (KeyPreview) and the WebView accelerator can both report one F11 press.
        long now = Environment.TickCount64;
        if (now - _lastF11Toggle < 300)
            return;
        _lastF11Toggle = now;

        _fullscreen = !_fullscreen;
        if (_fullscreen)
        {
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Maximized;
        }
        else
        {
            WindowState = FormWindowState.Normal;
            FormBorderStyle = FormBorderStyle.Sizable;
        }
    }
}
