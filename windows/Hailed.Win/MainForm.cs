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
    private long _lastF11Toggle;

    public MainForm()
    {
        Text = "Hailed";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        ClientSize = new Size(1600, 900);
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

        string userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Hailed", "WebView2");

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

        _view.WebMessageReceived += (_, args) =>
        {
            if (args.TryGetWebMessageAsString() == "quit")
                Close();
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
            "window.chrome.webview.postMessage(m); } };");

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
